import { CONFIG, RUNTIME } from './config.js';
import { sendMessageWithTimeout } from './utils.js';

console.log('Background service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void restoreState();
  void setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreState();
});

chrome.action.onClicked.addListener(() => {
  void openRecorderWindow();
});

/**
 * Setup context menu for quick recording control
 * @returns {Promise<void>}
 */
async function setupContextMenu() {
  try {
    await chrome.contextMenus.removeAll();
    
    chrome.contextMenus.create({
      id: 'toggle-recording',
      title: '🎬 Start Recording',
      contexts: ['all']
    });
  } catch (error) {
    console.error('Failed to setup context menu:', error);
  }
}

/**
 * Handle keyboard shortcuts
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-recording') {
    void toggleRecording();
  }
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-recording') {
    void toggleRecording();
  }
});

/**
 * Toggle recording on/off without popup
 * Triggered by keyboard shortcut or context menu
 * @returns {Promise<void>}
 */
async function toggleRecording() {
  try {
    if (RUNTIME.isRecording) {
      const result = await stopRecording();
      const duration = result?.duration || 0;
      console.log(`Recording stopped (duration: ${duration}s)`);
      
      // Notify popup if it's open
      try {
        await chrome.runtime.sendMessage({ 
          action: 'recording-stopped', 
          duration 
        }).catch(() => {
          // Popup not open, that's ok
        });
      } catch (e) {
        // Ignore - popup might not be open
      }
    } else {
      const result = await startRecording({
        format: CONFIG.DEFAULT_FORMAT,
        quality: CONFIG.DEFAULT_QUALITY,
        fps: CONFIG.DEFAULT_FPS
      });
      if (result?.success) {
        console.log('Recording started by hotkey/menu');
        
        // Notify popup if it's open
        try {
          await chrome.runtime.sendMessage({ 
            action: 'recording-started' 
          }).catch(() => {});
        } catch (e) {
          // Ignore - popup might not be open
        }
      } else {
        console.warn('Failed to start recording:', result?.error);
      }
    }
  } catch (error) {
    console.error('Toggle recording error:', error);
  }
}

/**
 * Message handler for recording control actions
 * @typedef {Object} MessageHandler
 * @property {Function} handler - Handler function
 * @property {boolean} requiresResponse - Whether handler needs response
 */

/** @type {Object<string, MessageHandler>} */
const messageHandlers = {
  'start-recording': {
    handler: startRecording,
    requiresResponse: true
  },
  'stop-recording': {
    handler: stopRecording,
    requiresResponse: true
  },
  'get-status': {
    handler: getStatus,
    requiresResponse: true
  },
  'reset-state': {
    handler: resetState,
    requiresResponse: true
  },
  'recording-started': {
    handler: handleRecordingStarted,
    requiresResponse: true
  },
  'recording-stopped': {
    handler: handleRecordingStopped,
    requiresResponse: true
  },
  'recording-error': {
    handler: handleRecordingError,
    requiresResponse: true
  },
  'get-preferences': {
    handler: getPreferences,
    requiresResponse: true
  },
  'save-preferences': {
    handler: savePreferences,
    requiresResponse: true
  }
};

/**
 * Listen for special messages from offscreen document
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle recording completion from offscreen (e.g., user clicked "Stop share")
  if (message.action === 'recording-completed') {
    console.log('Recording completed (stream ended or finalized)');
    
    // Ensure recording state is marked as false
    if (RUNTIME.isRecording) {
      void setRecordingState(false);
    }
    
    // Notify popup to stop timer
    try {
      chrome.runtime.sendMessage({ 
        action: 'recording-stopped',
        duration: RUNTIME.recordingStartedAt 
          ? Math.floor((Date.now() - RUNTIME.recordingStartedAt) / 1000)
          : 0
      }).catch(() => {});
    } catch (e) {
      // Popup might not be open
    }
    
    return false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.action);

  const handler = messageHandlers[message.action];
  if (!handler) {
    console.warn('Unknown message action:', message.action);
    return false;
  }

  if (handler.requiresResponse) {
    Promise.resolve(handler.handler(message))
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Handler error:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Handler error' 
        });
      });
    return true;
  }
  return true;
});

/**
 * Restores the recording state from storage
 * @returns {Promise<void>}
 */
async function restoreState() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEY);
  RUNTIME.isRecording = Boolean(result[CONFIG.STORAGE_KEY]?.isRecording);
  RUNTIME.recordingStartedAt = result[CONFIG.STORAGE_KEY]?.recordingStartedAt || null;
  await updateBadge();
}

/**
 * Opens or focuses the recorder window
 * @returns {Promise<void>}
 */
async function openRecorderWindow() {
  try {
    const existingWindows = await chrome.windows.getAll({ populate: true });
    const existingWindow = existingWindows.find((win) => {
      return win.type === 'popup' && win.tabs?.some((tab) => tab.url?.includes('popup.html'));
    });

    if (existingWindow) {
      await chrome.windows.update(existingWindow.id, { focused: true });
      return;
    }

    await chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: CONFIG.WINDOW_WIDTH,
      height: CONFIG.WINDOW_HEIGHT,
      focused: true,
      state: 'normal'
    });
  } catch (error) {
    console.error('Failed to open recorder window:', error);
  }
}

/**
 * Sets the recording state in memory and storage
 * @param {boolean} value - Recording state
 * @param {number} startedAt - Recording start timestamp
 * @returns {Promise<void>}
 */
async function setRecordingState(value, startedAt = null) {
  RUNTIME.isRecording = Boolean(value);
  RUNTIME.recordingStartedAt = value ? (startedAt ?? RUNTIME.recordingStartedAt ?? Date.now()) : null;
  await chrome.storage.local.set({ 
    [CONFIG.STORAGE_KEY]: { 
      isRecording: RUNTIME.isRecording, 
      recordingStartedAt: RUNTIME.recordingStartedAt 
    } 
  });
  await updateBadge();
}

/**
 * Updates the extension icon badge
 * @returns {Promise<void>}
 */
async function updateBadge() {
  if (RUNTIME.isRecording) {
    await chrome.action.setBadgeText({ text: '●' });
    await chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Ensures offscreen document is available
 * @returns {Promise<void>}
 * @throws {Error} If offscreen document cannot be created
 */
async function ensureOffscreen() {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (!hasDocument) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Record the screen while the popup is closed.'
      });
    }
  } catch (error) {
    console.error('Failed to ensure offscreen document:', error);
    throw new Error(CONFIG.ERRORS.OFFSCREEN_UNAVAILABLE);
  }
}

/**
 * Starts recording
 * @param {Object} message - Message object
 * @returns {Promise<Object>} Result object
 */
async function startRecording(message = {}) {
  if (RUNTIME.isRecording) {
    return { success: false, error: CONFIG.ERRORS.ALREADY_RECORDING };
  }

  try {
    await ensureOffscreen();
    await new Promise((resolve) => setTimeout(resolve, CONFIG.DELAY_MS));
    
    const response = await sendMessageWithTimeout(
      { 
        action: 'start-recording', 
        source: 'background',
        format: message.format,
        quality: message.quality,
        fps: message.fps
      },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    
    if (response && response.success) {
      await setRecordingState(true, Date.now());
      return { success: true };
    } else {
      await setRecordingState(false);
      return { success: false, error: response?.error || CONFIG.ERRORS.FAILED_START };
    }
  } catch (error) {
    console.error('Start recording failed:', error);
    await setRecordingState(false);
    return { success: false, error: error.message || CONFIG.ERRORS.FAILED_START };
  }
}

/**
 * Stops recording
 * @param {Object} message - Message object
 * @returns {Promise<Object>} Result object
 */
async function stopRecording(message = {}) {
  if (!RUNTIME.isRecording) {
    await setRecordingState(false);
    return { success: true, duration: 0 };
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, CONFIG.DELAY_MS));
    
    const response = await sendMessageWithTimeout(
      { action: 'stop-recording', source: 'background' },
      CONFIG.MESSAGE_TIMEOUT_MS
    );
    
    if (response && response.success) {
      await setRecordingState(false);
      return { success: true, duration: response.duration || 0 };
    } else {
      await setRecordingState(false);
      return { success: false, error: response?.error || CONFIG.ERRORS.FAILED_STOP };
    }
  } catch (error) {
    console.error('Stop recording failed:', error);
    await setRecordingState(false);
    return { success: true, duration: 0 };
  }
}

/**
 * Gets current recording status
 * @returns {Promise<Object>} Status object
 */
async function getStatus() {
  return {
    isRecording: RUNTIME.isRecording,
    startedAt: RUNTIME.recordingStartedAt
  };
}

/**
 * Resets recording state
 * @returns {Promise<Object>} Result object
 */
async function resetState() {
  try {
    await sendMessageWithTimeout(
      { action: 'stop-recording', source: 'background' },
      CONFIG.MESSAGE_TIMEOUT_MS
    ).catch(() => {
      console.warn('Reset stop message failed');
    });
  } catch (error) {
    console.warn('Reset error:', error);
  }
  await setRecordingState(false);
  return { success: true };
}

/**
 * Handles recording started event
 * @returns {Promise<Object>} Result object
 */
async function handleRecordingStarted() {
  await setRecordingState(true);
  return { success: true };
}

/**
 * Handles recording stopped event
 * @returns {Promise<Object>} Result object
 */
async function handleRecordingStopped() {
  await setRecordingState(false);
  return { success: true };
}

/**
 * Handles recording error event
 * @param {Object} message - Error message object
 * @returns {Promise<Object>} Result object
 */
async function handleRecordingError(message = {}) {
  await setRecordingState(false);
  return { success: false, error: message.error || 'Recorder error' };
}

/**
 * Gets user preferences
 * @returns {Promise<Object>} Preferences object
 */
async function getPreferences() {
  const result = await chrome.storage.local.get(CONFIG.PREFERENCES_KEY);
  return result[CONFIG.PREFERENCES_KEY] || {
    format: CONFIG.DEFAULT_FORMAT,
    quality: CONFIG.DEFAULT_QUALITY,
    fps: CONFIG.DEFAULT_FPS
  };
}

/**
 * Saves user preferences
 * @param {Object} message - Message containing preferences
 * @returns {Promise<Object>} Result object
 */
async function savePreferences(message = {}) {
  const prefs = {
    format: message.format || CONFIG.DEFAULT_FORMAT,
    quality: message.quality || CONFIG.DEFAULT_QUALITY,
    fps: message.fps || CONFIG.DEFAULT_FPS
  };
  await chrome.storage.local.set({ [CONFIG.PREFERENCES_KEY]: prefs });
  RUNTIME.userPreferences = prefs;
  return { success: true };
}

void restoreState();