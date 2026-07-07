import { CONFIG } from './config.js';
import { sendMessageWithTimeout } from './utils.js';

let isRecording = false;
let timerInterval = null;
let seconds = 0;
let lastDisplayedTime = null;
let userPreferences = {};

// DOM elements
const recordBtn = document.getElementById('record-btn');
const btnIcon = document.getElementById('btn-icon');
const btnText = document.getElementById('btn-text');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const timer = document.getElementById('timer');
const settingsBtn = document.getElementById('settings-btn');
const helpBtn = document.getElementById('help-btn');
const aboutLink = document.getElementById('about-link');
const keyboardLink = document.getElementById('keyboard-link');

/**
 * Initialize launcher on load
 */
window.addEventListener('load', async () => {
  await loadPreferences();
  await refreshStatus();
  setupEventListeners();
  
  // Auto-refresh status every 500ms
  setInterval(() => {
    if (!isRecording) {
      void refreshStatus();
    }
  }, 500);
});

/**
 * Load user preferences from storage
 */
async function loadPreferences() {
  try {
    const result = await chrome.storage.local.get(CONFIG.PREFERENCES_KEY);
    userPreferences = result[CONFIG.PREFERENCES_KEY] || {
      format: CONFIG.DEFAULT_FORMAT,
      quality: CONFIG.DEFAULT_QUALITY,
      fps: CONFIG.DEFAULT_FPS
    };
    console.log('Loaded preferences:', userPreferences);
  } catch (error) {
    console.warn('Failed to load preferences:', error);
    // Use defaults if load fails
    userPreferences = {
      format: CONFIG.DEFAULT_FORMAT,
      quality: CONFIG.DEFAULT_QUALITY,
      fps: CONFIG.DEFAULT_FPS
    };
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  recordBtn.addEventListener('click', handleRecordToggle);
  settingsBtn.addEventListener('click', openSettings);
  helpBtn.addEventListener('click', openHelp);
  aboutLink.addEventListener('click', openAbout);
  keyboardLink.addEventListener('click', openKeyboardShortcuts);
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
      updateUI();
      statusIndicator.classList.add('recording');
      statusText.textContent = '🔴 Recording...';
    } else {
      isRecording = false;
      stopTimer();
      seconds = 0;
      timer.textContent = '00:00';
      updateUI();
      statusIndicator.classList.remove('recording');
      statusText.textContent = 'Ready to record';
    }
  } catch (error) {
    console.warn('Failed to refresh status:', error);
  }
}

/**
 * Handle record button toggle
 */
async function handleRecordToggle() {
  recordBtn.disabled = true;
  
  try {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  } catch (error) {
    console.error('Toggle error:', error);
  } finally {
    recordBtn.disabled = false;
  }
}

/**
 * Start recording
 */
async function startRecording() {
  recordBtn.disabled = true;
  btnText.textContent = 'Starting...';
  
  try {
    const response = await sendMessageWithTimeout(
      {
        action: 'start-recording',
        format: userPreferences.format || CONFIG.DEFAULT_FORMAT,
        quality: userPreferences.quality || CONFIG.DEFAULT_QUALITY,
        fps: userPreferences.fps || CONFIG.DEFAULT_FPS
      },
      CONFIG.MESSAGE_TIMEOUT_MS
    );

    if (response && response.success) {
      isRecording = true;
      startTimer(Date.now());
      updateUI();
      statusIndicator.classList.add('recording');
      statusText.textContent = '🔴 Recording...';
    } else {
      statusText.textContent = '❌ ' + (response?.error || 'Failed to start');
      setTimeout(() => {
        statusText.textContent = 'Ready to record';
      }, 2000);
    }
  } catch (error) {
    console.error('Start recording error:', error);
    statusText.textContent = '❌ ' + (error.message || 'Failed to start');
    setTimeout(() => {
      statusText.textContent = 'Ready to record';
    }, 2000);
  } finally {
    recordBtn.disabled = false;
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  recordBtn.disabled = true;
  btnText.textContent = 'Stopping...';
  
  try {
    const response = await sendMessageWithTimeout(
      { action: 'stop-recording' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );

    if (response && response.success) {
      isRecording = false;
      stopTimer();
      seconds = 0;
      timer.textContent = '00:00';
      updateUI();
      statusIndicator.classList.remove('recording');
      statusText.textContent = '✅ Saved successfully';
      
      setTimeout(() => {
        statusText.textContent = 'Ready to record';
      }, 2000);
    } else {
      statusText.textContent = '❌ ' + (response?.error || 'Failed to stop');
    }
  } catch (error) {
    console.error('Stop recording error:', error);
    statusText.textContent = '❌ ' + (error.message || 'Failed to stop');
  } finally {
    recordBtn.disabled = false;
  }
}

/**
 * Update UI based on recording state
 */
function updateUI() {
  if (isRecording) {
    btnIcon.textContent = '⏹';
    btnText.textContent = 'Stop Recording';
    recordBtn.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%)';
  } else {
    btnIcon.textContent = '⏺';
    btnText.textContent = 'Start Recording';
    recordBtn.style.background = 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)';
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
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    seconds++;
    updateTimerDisplay();
  }, 1000);
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
 * Update timer display
 */
function updateTimerDisplay() {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const displayTime = `${mins}:${secs}`;
  
  if (displayTime !== lastDisplayedTime) {
    timer.textContent = displayTime;
    lastDisplayedTime = displayTime;
  }
}

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Show help dialog
 */
function openHelp() {
  const helpText = `
ScreenSnap - Screen Recording Helper

Features:
• Record your entire screen with audio
• Multiple quality presets (High, Medium, Low)
• Supports WebM and MP4 formats
• Adjustable frame rate (30, 60, 120 FPS)
• Auto-saves to Downloads folder

Keyboard Shortcuts:
• Ctrl+Shift+V: Start/Stop recording (global)
• Available from any app

Tips:
• You can close the popup while recording
• Recording continues in the background
• Right-click menu for quick access
• Check Settings for more options
  `;
  alert(helpText);
}

/**
 * Show about dialog
 */
function openAbout() {
  const aboutText = `
ScreenSnap v1.0.0

A lightweight, high-quality screen recorder for Chrome.

Built with modern web technologies for simplicity and performance.

© 2026 - All rights reserved.
  `;
  alert(aboutText);
}

/**
 * Show keyboard shortcuts
 */
function openKeyboardShortcuts() {
  const shortcutsText = `
Keyboard Shortcuts

Global Shortcuts (work anywhere):
• Ctrl+Shift+V: Start/Stop recording
• Ctrl+Shift+V (Mac): Command+Shift+V

In-App Shortcuts:
• Ctrl+Shift+V: Toggle recording (when launcher open)

Menu Shortcuts:
• Right-click: Show context menu
• Select "Start Recording" to begin
  `;
  alert(shortcutsText);
}

/**
 * Listen for background state changes
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'recording-started') {
    isRecording = true;
    startTimer(Date.now());
    updateUI();
    statusIndicator.classList.add('recording');
    statusText.textContent = '🔴 Recording...';
  } else if (message.action === 'recording-stopped') {
    isRecording = false;
    stopTimer();
    seconds = 0;
    timer.textContent = '00:00';
    updateUI();
    statusIndicator.classList.remove('recording');
    statusText.textContent = '✅ Saved successfully';
    
    setTimeout(() => {
      if (!isRecording) {
        statusText.textContent = 'Ready to record';
      }
    }, 2000);
  }
});
