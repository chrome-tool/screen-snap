let isRecording = false;

console.log('Background service worker started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.action);

  if (message.action === 'start-recording') {
    isRecording = true;
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'stop-recording') {
    isRecording = false;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ success: true, duration: 0 });
    return true;
  }

  if (message.action === 'get-status') {
    sendResponse({ isRecording });
    return false;
  }

  if (message.action === 'reset-state') {
    isRecording = false;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ success: true });
    return false;
  }
});