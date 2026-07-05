console.log('Recorder page loaded');

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let stream = null;
let startTime = null;
let isProcessingStop = false;

const statusIcon = document.getElementById('icon');
const statusText = document.getElementById('text');

function updateStatus(icon, text, isRecordingStatus) {
  if (statusIcon) statusIcon.textContent = icon;
  if (statusText) {
    statusText.textContent = text;
    if (isRecordingStatus) {
      statusText.className = 'recording';
    } else {
      statusText.className = '';
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Recorder received:', message.action);
  
  if (message.action === 'start-recording') {
    if (isProcessingStop) {
      sendResponse({ success: false, error: 'Busy processing previous stop' });
      return true;
    }
    startRecording(sendResponse, message.streamId);
    return true;
  }
  
  if (message.action === 'stop-recording') {
    if (isProcessingStop) {
      sendResponse({ success: false, error: 'Already stopping' });
      return true;
    }
    stopRecording(sendResponse);
    return true;
  }
  
  if (message.action === 'reset-state') {
    resetState();
    sendResponse({ success: true });
    return false;
  }
});

function resetState() {
  console.log('Resetting recorder state');
  
  isRecording = false;
  isProcessingStop = false;
  
  if (mediaRecorder) {
    try {
      if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
        mediaRecorder.stop();
      }
    } catch (e) {
      console.warn('Error stopping mediaRecorder during reset:', e);
    }
    mediaRecorder = null;
  }
  
  if (stream) {
    try {
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.warn('Error stopping stream during reset:', e);
    }
    stream = null;
  }
  
  recordedChunks = [];
  updateStatus('⏺', 'Ready', false);
}

async function startRecording(sendResponse, streamId) {
  console.log('startRecording called');

  resetState();

  if (isRecording) {
    sendResponse({ success: false, error: 'Already recording' });
    return;
  }

  updateStatus('⏳', 'Requesting screen...', false);

  try {
    console.log('startRecording streamId:', streamId);

    const hasDisplayMedia = typeof navigator.mediaDevices?.getDisplayMedia === 'function';

    try {
      try {
        window.focus();
      } catch (focusError) {
        console.warn('Window focus failed:', focusError);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));

      if (hasDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: 30,
              cursor: 'always'
            },
            audio: true
          });
          console.log('getDisplayMedia returned, tracks:', stream.getTracks().length);
        } catch (displayErr) {
          console.warn('getDisplayMedia with audio failed, retrying video-only:', displayErr.name, displayErr.message);
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: 30,
              cursor: 'always'
            },
            audio: false
          });
          console.log('getDisplayMedia video-only returned, tracks:', stream.getTracks().length);
        }
      } else {
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        };

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints
        });
        console.log('getUserMedia fallback returned, tracks:', stream.getTracks().length);
      }
    } catch (err) {
      console.error('Screen capture failed:', err.name, err.message, err);
      updateStatus('❌', 'Error: ' + err.name + ' - ' + err.message, false);
      resetState();
      sendResponse({ success: false, error: err.name + ': ' + err.message });
      return;
    }

    if (!stream) {
      updateStatus('❌', 'No stream', false);
      resetState();
      sendResponse({ success: false, error: 'Failed to get stream' });
      return;
    }

    recordedChunks = [];

    let mimeType = 'video/mp4;codecs=avc1';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=mp4v')) {
        mimeType = 'video/mp4;codecs=mp4v';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else {
        mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
        }
      }
    }
    console.log('Using mimeType:', mimeType);

    try {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000,
        videoBitsPerSecond: 2500000
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, saving...');
        updateStatus('💾', 'Saving...', false);
        saveVideo();
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        isRecording = false;
        isProcessingStop = false;
        chrome.runtime.sendMessage({ action: 'recording-stopped' }).catch(() => {});
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        updateStatus('❌', 'Recorder error', false);
        isRecording = false;
        isProcessingStop = false;
        resetState();
      };

      mediaRecorder.start(1000);
      isRecording = true;
      startTime = Date.now();

      console.log('Recording started successfully');
      const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
      updateStatus('🔴', hasAudio ? 'Recording with audio' : 'Recording (no audio)', true);
      sendResponse({ success: true, hasAudio: hasAudio });
    } catch (error) {
      console.error('MediaRecorder creation error:', error);
      updateStatus('❌', 'Error: ' + error.message, false);
      resetState();
      sendResponse({ success: false, error: error.message });
    }
  } catch (error) {
    console.error('Start recording error:', error);
    updateStatus('❌', 'Error: ' + error.message, false);
    resetState();
    sendResponse({ success: false, error: error.message });
  }
}

function stopRecording(sendResponse) {
  console.log('stopRecording called, isRecording:', isRecording);
  
  if (!isRecording || !mediaRecorder) {
    console.warn('Not recording or no mediaRecorder, resetting state');
    resetState();
    sendResponse({ success: false, error: 'Not recording - state reset' });
    return;
  }

  if (mediaRecorder.state === 'inactive') {
    console.warn('MediaRecorder already inactive');
    isRecording = false;
    resetState();
    sendResponse({ success: false, error: 'Recorder already stopped' });
    return;
  }

  isProcessingStop = true;
  const duration = Math.floor((Date.now() - startTime) / 1000);
  
  try {
    updateStatus('⏹', 'Stopping...', false);
    mediaRecorder.stop();
    sendResponse({ success: true, duration });
  } catch (error) {
    console.error('Stop error:', error);
    isProcessingStop = false;
    isRecording = false;
    updateStatus('❌', 'Stop error', false);
    resetState();
    sendResponse({ success: false, error: error.message });
  }
}

function saveVideo() {
  if (recordedChunks.length === 0) {
    console.error('No data recorded');
    updateStatus('❌', 'No data', false);
    resetState();
    return;
  }

  console.log('Saving video, chunks:', recordedChunks.length);
  
  try {
    const blob = new Blob(recordedChunks, {
      type: 'video/mp4'
    });
    
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    let extension = 'mp4';
    if (blob.type.includes('webm')) {
      extension = 'webm';
    }
    
    const filename = `recording-${timestamp}.${extension}`;
    
    console.log('Downloading:', filename, 'size:', blob.size);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        updateStatus('❌', 'Download error', false);
      } else {
        console.log('Download started:', downloadId);
        updateStatus('✅', 'Saved!', false);
      }
      // 重置状态
      setTimeout(() => {
        resetState();
        updateStatus('⏺', 'Ready', false);
      }, 3000);
    });
    
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (error) {
    console.error('Save error:', error);
    updateStatus('❌', 'Save error', false);
    resetState();
  }
}

// 页面加载完成后重置状态
resetState();
console.log('Recorder ready - waiting for start command');