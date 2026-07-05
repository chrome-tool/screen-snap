let isRecording = false;
let recordingStartedAt = null;
const STORAGE_KEY = 'screenRecorderState';

console.log('Background service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void restoreState();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreState();
});

chrome.action.onClicked.addListener(() => {
  void openRecorderWindow();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.action);

  if (message.action === 'start-recording') {
    void startRecording(sendResponse);
    return true;
  }

  if (message.action === 'stop-recording') {
    void stopRecording(sendResponse);
    return true;
  }

  if (message.action === 'get-status') {
    sendResponse({ isRecording, startedAt: recordingStartedAt });
    return true;
  }

  if (message.action === 'reset-state') {
    void resetState(sendResponse);
    return true;
  }

  if (message.action === 'recording-started') {
    void setRecordingState(true);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'recording-stopped') {
    void setRecordingState(false);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'recording-error') {
    void setRecordingState(false);
    sendResponse({ success: false, error: message.error || 'Recorder error' });
    return true;
  }
});

async function restoreState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  isRecording = Boolean(result[STORAGE_KEY]?.isRecording);
  recordingStartedAt = result[STORAGE_KEY]?.recordingStartedAt || null;
  await updateBadge();
}

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
      width: 320,
      height: 460,
      focused: true,
      state: 'normal'
    });
  } catch (error) {
    console.error('Failed to open recorder window:', error);
  }
}

async function setRecordingState(value, startedAt = null) {
  isRecording = Boolean(value);
  recordingStartedAt = value ? (startedAt ?? recordingStartedAt ?? Date.now()) : null;
  await chrome.storage.local.set({ [STORAGE_KEY]: { isRecording, recordingStartedAt } });
  await updateBadge();
}

async function updateBadge() {
  if (isRecording) {
    await chrome.action.setBadgeText({ text: '●' });
    await chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function ensureOffscreen() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Record the screen while the popup is closed.'
    });
  }
}

async function startRecording(sendResponse) {
  if (isRecording) {
    sendResponse({ success: false, error: 'Already recording' });
    return;
  }

  try {
    await ensureOffscreen();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await chrome.runtime.sendMessage({ action: 'start-recording', source: 'background' });
    if (response && response.success) {
      await setRecordingState(true, Date.now());
      sendResponse({ success: true });
    } else {
      await setRecordingState(false);
      sendResponse({ success: false, error: response?.error || 'Failed to start recording' });
    }
  } catch (error) {
    console.error('Start recording failed:', error);
    await setRecordingState(false);
    sendResponse({ success: false, error: error.message || 'Failed to start recording' });
  }
}

async function stopRecording(sendResponse) {
  if (!isRecording) {
    await setRecordingState(false);
    sendResponse({ success: true, duration: 0 });
    return;
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await chrome.runtime.sendMessage({ action: 'stop-recording', source: 'background' });
    if (response && response.success) {
      await setRecordingState(false);
      sendResponse({ success: true, duration: response.duration || 0 });
    } else {
      await setRecordingState(false);
      sendResponse({ success: false, error: response?.error || 'Failed to stop recording' });
    }
  } catch (error) {
    console.error('Stop recording failed:', error);
    await setRecordingState(false);
    sendResponse({ success: true, duration: 0 });
  }
}

async function resetState(sendResponse) {
  try {
    await chrome.runtime.sendMessage({ action: 'stop-recording', source: 'background' });
  } catch (error) {
    console.warn('Reset stop message failed:', error);
  }
  await setRecordingState(false);
  sendResponse({ success: true });
}

void restoreState();