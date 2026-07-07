import { CONFIG } from './config.js';
import {
  sendMessageWithTimeout,
  formatTime,
  formatFileSize,
  throttle,
  debounce
} from './utils.js';

let isRecording = false;
let timerInterval = null;
let seconds = 0;
let lastDisplayedTime = null;

// DOM elements - initialized in DOMContentLoaded
let btn, statusEl, timerEl, resetBtn, formatSelect, qualitySelect, fpsSelect, dragHandle, permissionWarning, statsEl;

/**
 * Initialize the popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize DOM elements
    btn = document.getElementById('btn');
    statusEl = document.getElementById('status');
    timerEl = document.getElementById('timer');
    resetBtn = document.getElementById('reset-btn');
    formatSelect = document.getElementById('format-select');
    qualitySelect = document.getElementById('quality-select');
    fpsSelect = document.getElementById('fps-select');
    dragHandle = document.getElementById('drag-handle');
    permissionWarning = document.getElementById('permission-warning');
    statsEl = document.getElementById('stats');
    
    await checkPermissions();
    await loadUserPreferences();
    await refreshStatus();
    updateUI();
    if (!isRecording) {
      timerEl.textContent = '00:00';
    }
    setupEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
    if (statusEl) showError('Failed to initialize');
  }
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  if (!btn) {
    console.error('Start button not found');
    return;
  }
  
  btn.addEventListener('click', handleStartStop);
  
  if (resetBtn) {
    resetBtn.addEventListener('click', handleReset);
  }

  // Auto-save preferences on change
  const saveSettings = debounce(saveUserPreferences, 500);
  if (formatSelect) formatSelect.addEventListener('change', saveSettings);
  if (qualitySelect) qualitySelect.addEventListener('change', saveSettings);
  if (fpsSelect) fpsSelect.addEventListener('change', saveSettings);

  setupDrag();
  setupKeyboardShortcuts();
  setupNetworkMonitoring();

  // Listen for background recording state changes (from hotkey/menu)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'recording-started') {
      isRecording = true;
      startTimer(Date.now());
      updateUI();
      if (statusEl) statusEl.textContent = '🔴 Recording';
      if (statusEl) statusEl.className = 'recording';
      disableSettings(true);
    } else if (message.action === 'recording-stopped') {
      isRecording = false;
      stopTimer();
      seconds = 0;
      if (timerEl) timerEl.textContent = '00:00';
      if (statusEl) statusEl.textContent = '✅ Saved';
      if (statusEl) statusEl.className = '';
      updateUI();
      disableSettings(false);
      
      setTimeout(() => {
        if (!isRecording && statusEl) {
          statusEl.textContent = 'Ready';
        }
      }, 2000);
    }
  });

  // Cleanup on window close
  window.addEventListener('beforeunload', () => {
    stopTimer();
  });
}

/**
 * Check if extension has required permissions
 */
async function checkPermissions() {
  try {
    const hasPermissions = await chrome.permissions.contains({
      permissions: ['desktopCapture', 'tabCapture']
    });
    
    if (!hasPermissions && permissionWarning) {
      permissionWarning.classList.add('show');
      btn.disabled = true;
      console.warn('Missing desktopCapture permissions');
    }
  } catch (error) {
    console.warn('Permission check error:', error);
  }
}

/**
 * Load user preferences from storage
 */
async function loadUserPreferences() {
  try {
    const response = await sendMessageWithTimeout(
      { action: 'get-preferences' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    
    if (response) {
      if (formatSelect) formatSelect.value = response.format || CONFIG.DEFAULT_FORMAT;
      if (qualitySelect) qualitySelect.value = response.quality || CONFIG.DEFAULT_QUALITY;
      if (fpsSelect) fpsSelect.value = response.fps || CONFIG.DEFAULT_FPS;
    }
  } catch (error) {
    console.warn('Failed to load preferences:', error);
  }
}

/**
 * Save user preferences to storage
 */
async function saveUserPreferences() {
  try {
    if (!formatSelect || !qualitySelect || !fpsSelect) {
      console.warn('Settings elements not available');
      return;
    }
    
    await sendMessageWithTimeout(
      {
        action: 'save-preferences',
        format: formatSelect.value,
        quality: qualitySelect.value,
        fps: fpsSelect.value
      },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    console.log('Preferences saved');
  } catch (error) {
    console.warn('Failed to save preferences:', error);
  }
}

/**
 * Refresh recording status from background
 */
async function refreshStatus() {
  try {
    const response = await sendMessageWithTimeout(
      { action: 'get-status' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    
    if (response && response.isRecording) {
      isRecording = true;
      startTimer(response.startedAt || Date.now());
      statusEl.textContent = '?? Recording';
      statusEl.className = 'recording';
    } else {
      isRecording = false;
      stopTimer();
      seconds = 0;
      statusEl.textContent = 'Ready';
      timerEl.textContent = '00:00';
      statusEl.className = '';
    }
  } catch (error) {
    console.warn('Failed to refresh status:', error);
  }
}

/**
 * Handle start/stop recording button click
 */
async function handleStartStop() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

/**
 * Start recording
 */
async function startRecording() {
  if (!btn || !statusEl || !statsEl) {
    showError('UI not ready');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Starting...';
  statusEl.textContent = 'Requesting screen...';
  statsEl.classList.remove('show');

  try {
    if (!formatSelect || !qualitySelect || !fpsSelect) {
      showError('Settings not available');
      return;
    }
    
    const response = await sendMessageWithTimeout(
      {
        action: 'start-recording',
        format: formatSelect.value,
        quality: qualitySelect.value,
        fps: Number(fpsSelect.value)
      },
      CONFIG.MESSAGE_TIMEOUT_MS
    );

    if (response && response.success) {
      isRecording = true;
      startTimer(Date.now());
      updateUI();
      statusEl.textContent = '🔴 Recording';
      statusEl.className = 'recording';
      disableSettings(true);
    } else {
      showError(response?.error || 'Unknown error');
      updateUI();
    }
  } catch (error) {
    console.error('Start recording error:', error);
    showError(error.message || 'Failed to start recording');
    updateUI();
  } finally {
    btn.disabled = false;
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  if (!btn || !statusEl || !timerEl) {
    showError('UI not ready');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Stopping...';
  statusEl.textContent = 'Stopping recording...';

  try {
    const response = await sendMessageWithTimeout(
      { action: 'stop-recording' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );

    if (response && response.success) {
      isRecording = false;
      stopTimer();
      seconds = 0;
      timerEl.textContent = '00:00';
      statusEl.textContent = '✅ Saved';
      statusEl.className = '';
      updateUI();
      disableSettings(false);
      
      // Clear status after delay
      setTimeout(() => {
        if (!isRecording) {
          statusEl.textContent = 'Ready';
        }
      }, 2000);
    } else {
      showError(response?.error || 'Unknown error');
      updateUI();
    }
  } catch (error) {
    console.error('Stop recording error:', error);
    showError(error.message || 'Failed to stop recording');
    updateUI();
  } finally {
    btn.disabled = false;
  }
}

/**
 * Handle reset button click
 */
async function handleReset() {
  if (!resetBtn || !timerEl || !statusEl) {
    showError('UI not ready');
    return;
  }
  
  resetBtn.disabled = true;
  
  try {
    await sendMessageWithTimeout(
      { action: 'reset-state' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    
    isRecording = false;
    stopTimer();
    seconds = 0;
    timerEl.textContent = '00:00';
    statusEl.textContent = '🔄 Reset';
    disableSettings(false);
    
    setTimeout(() => {
      if (!isRecording && statusEl) {
        statusEl.textContent = 'Ready';
        statusEl.className = '';
      }
    }, 2000);
  } catch (error) {
    console.error('Reset error:', error);
    showError('Reset failed: ' + error.message);
  } finally {
    resetBtn.disabled = false;
    updateUI();
  }
}

/**
 * Update UI state based on recording status
 */
function updateUI() {
  if (!btn || !statusEl) return;
  
  if (isRecording) {
    btn.textContent = '⏹ Stop Recording';
    btn.className = 'recording';
    statusEl.className = 'recording';
  } else {
    btn.textContent = '⏺ Start Recording';
    btn.className = '';
    statusEl.className = '';
  }
}

/**
 * Enable/disable settings controls
 */
function disableSettings(disabled) {
  if (formatSelect) formatSelect.disabled = disabled;
  if (qualitySelect) qualitySelect.disabled = disabled;
  if (fpsSelect) fpsSelect.disabled = disabled;
}

/**
 * Show error message
 */
function showError(message, duration = CONFIG.STATUS_DISPLAY_DURATION_MS) {
  if (!statusEl) return;
  
  statusEl.textContent = '❌ ' + message;
  statusEl.className = 'error';
  
  setTimeout(() => {
    if (!isRecording && statusEl) {
      statusEl.textContent = 'Ready';
      statusEl.className = '';
    }
  }, duration);
}

/**
 * Check recording duration and warn/stop if needed
 */
function checkRecordingDuration() {
  if (seconds >= CONFIG.MAX_DURATION_SECONDS) {
    stopRecording();
    showError('Max duration reached - recording stopped');
  } else if (seconds >= CONFIG.WARNING_DURATION_SECONDS) {
    statusEl.textContent = '?? Long recording - high memory';
    statusEl.className = 'warning';
  }
}

/**
 * Start the timer
 */
function startTimer(startedAt = null) {
  stopTimer();
  
  if (startedAt) {
    seconds = Math.floor((Date.now() - startedAt) / 1000);
  } else {
    seconds = 0;
  }
  
  lastDisplayedTime = null;
  timerEl.textContent = formatTime(seconds);
  
  timerInterval = setInterval(() => {
    seconds++;
    const newDisplayTime = formatTime(seconds);
    
    if (newDisplayTime !== lastDisplayedTime) {
      timerEl.textContent = newDisplayTime;
      lastDisplayedTime = newDisplayTime;
      checkRecordingDuration();
    }
  }, CONFIG.TIMER_INTERVAL);
}

/**
 * Stop the timer
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Setup window dragging functionality
 */
function setupDrag() {
  if (!dragHandle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;

  const throttledDragMove = throttle((dx, dy) => {
    chrome.windows.getCurrent((win) => {
      if (win?.id) {
        chrome.windows.update(win.id, {
          left: win.left + dx,
          top: win.top + dy
        });
      }
    });
  }, CONFIG.THROTTLE_MS);

  dragHandle.addEventListener('mousedown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (event) => {
    if (!dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    startX = event.clientX;
    startY = event.clientY;

    throttledDragMove(dx, dy);
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });
}

/**
 * Setup keyboard shortcuts
 * Note: This is for popup-local shortcuts. Global shortcuts are handled in background.js
 */
function setupKeyboardShortcuts() {
  if (!CONFIG.ENABLE_KEYBOARD_SHORTCUTS) return;

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      
      // Provide visual feedback
      if (btn) {
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => (btn.style.transform = ''), 100);
      }
      
      // Toggle recording (start or stop)
      void handleStartStop();
    }
  });
}

/**
 * Monitor network status
 */
function setupNetworkMonitoring() {
  window.addEventListener('offline', () => {
    if (isRecording) {
      showError(CONFIG.ERRORS.NETWORK_OFFLINE, 10000);
    }
  });

  window.addEventListener('online', () => {
    console.log('Network back online');
  });
}

/**
 * Listen for statistics from offscreen.js
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'recording-saved' && CONFIG.ENABLE_STATISTICS) {
    const fileSize = formatFileSize(message.fileSize);
    const duration = formatTime(message.duration);
    
    statsEl.textContent = `📊 Saved: ${fileSize} | Duration: ${duration}`;
    statsEl.classList.add('show');
    
    setTimeout(() => statsEl.classList.remove('show'), 5000);
  }
});
