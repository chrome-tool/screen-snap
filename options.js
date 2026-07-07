import { CONFIG } from './config.js';
import { sendMessageWithTimeout } from './utils.js';

/**
 * Initialize settings page
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
  
  // Add change listeners for live preview (optional)
  const inputs = document.querySelectorAll('select, input[type="checkbox"]');
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      // Could add live preview here if needed
    });
  });
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(CONFIG.PREFERENCES_KEY);
    const prefs = result[CONFIG.PREFERENCES_KEY] || {};
    
    // Recording settings
    if (prefs.format) {
      document.getElementById('format-select').value = prefs.format;
    }
    if (prefs.quality) {
      document.getElementById('quality-select').value = prefs.quality;
    }
    if (prefs.fps) {
      document.getElementById('fps-select').value = prefs.fps;
    }
    
    // Audio settings
    if (typeof prefs.echoCancellation !== 'undefined') {
      document.getElementById('echo-cancellation').checked = prefs.echoCancellation;
    }
    if (typeof prefs.noiseSuppression !== 'undefined') {
      document.getElementById('noise-suppression').checked = prefs.noiseSuppression;
    }
    if (prefs.sampleRate) {
      document.getElementById('sample-rate-select').value = prefs.sampleRate;
    }
    
    // Feature settings
    if (typeof prefs.enableStatistics !== 'undefined') {
      document.getElementById('enable-stats').checked = prefs.enableStatistics;
    }
    if (typeof prefs.enableKeyboardShortcuts !== 'undefined') {
      document.getElementById('enable-keyboard').checked = prefs.enableKeyboardShortcuts;
    }
    if (typeof prefs.enablePauseResume !== 'undefined') {
      document.getElementById('enable-pause').checked = prefs.enablePauseResume;
    }
    
    // Limits
    if (prefs.maxDuration) {
      document.getElementById('max-duration').value = prefs.maxDuration;
    }
    if (prefs.maxFileSize) {
      document.getElementById('max-filesize').value = prefs.maxFileSize;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const preferences = {
      // Recording settings
      format: document.getElementById('format-select').value,
      quality: document.getElementById('quality-select').value,
      fps: document.getElementById('fps-select').value,
      
      // Audio settings
      echoCancellation: document.getElementById('echo-cancellation').checked,
      noiseSuppression: document.getElementById('noise-suppression').checked,
      sampleRate: document.getElementById('sample-rate-select').value,
      
      // Feature settings
      enableStatistics: document.getElementById('enable-stats').checked,
      enableKeyboardShortcuts: document.getElementById('enable-keyboard').checked,
      enablePauseResume: document.getElementById('enable-pause').checked,
      
      // Limits
      maxDuration: document.getElementById('max-duration').value,
      maxFileSize: document.getElementById('max-filesize').value,
      
      // Timestamp
      savedAt: Date.now()
    };
    
    await chrome.storage.local.set({
      [CONFIG.PREFERENCES_KEY]: preferences
    });
    
    // Also notify background to update runtime preferences
    try {
      await sendMessageWithTimeout(
        { action: 'update-preferences', preferences },
        CONFIG.MESSAGE_TIMEOUT_MS
      );
    } catch (e) {
      console.warn('Failed to notify background of preference changes:', e);
    }
    
    showMessage('✅ Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showMessage('Failed to save settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }
  
  try {
    const defaultPrefs = {
      format: CONFIG.DEFAULT_FORMAT,
      quality: CONFIG.DEFAULT_QUALITY,
      fps: CONFIG.DEFAULT_FPS,
      echoCancellation: CONFIG.ECHO_CANCELLATION,
      noiseSuppression: CONFIG.NOISE_SUPPRESSION,
      sampleRate: CONFIG.SAMPLE_RATE,
      enableStatistics: CONFIG.ENABLE_STATISTICS,
      enableKeyboardShortcuts: CONFIG.ENABLE_KEYBOARD_SHORTCUTS,
      enablePauseResume: CONFIG.ENABLE_PAUSE_RESUME,
      maxDuration: CONFIG.MAX_DURATION_SECONDS,
      maxFileSize: '5gb'
    };
    
    await chrome.storage.local.set({
      [CONFIG.PREFERENCES_KEY]: defaultPrefs
    });
    
    // Reload UI
    await loadSettings();
    showMessage('✅ Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showMessage('Failed to reset settings', 'error');
  }
}

/**
 * Show status message
 */
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('status-message');
  messageEl.textContent = text;
  messageEl.className = `status-message show ${type}`;
  
  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 3000);
}
