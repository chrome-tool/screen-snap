let mediaRecorder = null;
let stream = null;
let recordedChunks = [];
let startTime = null;
let currentMimeType = 'video/webm';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start-recording') {
    startRecording().then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
  }

  if (message.action === 'stop-recording') {
    stopRecording().then((duration) => sendResponse({ success: true, duration })).catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
  }
});

function getMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return 'video/webm';
}

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

  stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, cursor: 'always' },
    audio: true
  });

  recordedChunks = [];
  currentMimeType = getMimeType();
  mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error);
  };

  mediaRecorder.onstop = () => {
    void finalizeRecording();
  };

  mediaRecorder.start(1000);
  startTime = Date.now();
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(0);
      return;
    }

    mediaRecorder.onstop = () => {
      void finalizeRecording().finally(() => {
        const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        resolve(duration);
      });
    };

    try {
      mediaRecorder.requestData();
      mediaRecorder.stop();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      cleanupRecorder();
      resolve(0);
    }
  });
}

async function finalizeRecording() {
  try {
    await saveVideo();
  } catch (error) {
    console.error('Finalize recording failed:', error);
  } finally {
    cleanupRecorder();
  }
}

function cleanupRecorder() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  mediaRecorder = null;
}

async function saveVideo() {
  if (recordedChunks.length === 0) {
    console.warn('No recorded chunks were captured.');
    return false;
  }

  const blob = new Blob(recordedChunks, { type: currentMimeType });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extension = currentMimeType.includes('mp4') ? 'mp4' : 'webm';
  const filename = `recording-${timestamp}.${extension}`;

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    console.log('Video save requested:', filename);
    return true;
  } catch (error) {
    console.error('Download error:', error);
    return false;
  }
}
