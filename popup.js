let isRecording = false;
let timerInterval = null;
let seconds = 0;
let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let startTime = null;
let isProcessingStop = false;

const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const resetBtn = document.getElementById('reset-btn');

document.addEventListener('DOMContentLoaded', () => {
  updateUI();
  timerEl.textContent = '00:00';
});

btn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    resetState();
    statusEl.textContent = '🔄 Reset';
    setTimeout(() => {
      if (!isRecording) statusEl.textContent = 'Ready';
    }, 2000);
  });
}

function resetState() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (e) {
      console.warn('Stop recorder during reset failed:', e);
    }
  }

  if (stream) {
    try {
      stream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.warn('Stop stream during reset failed:', e);
    }
    stream = null;
  }

  stopTimer();
  isRecording = false;
  isProcessingStop = false;
  mediaRecorder = null;
  recordedChunks = [];
  startTime = null;
  seconds = 0;
  timerEl.textContent = '00:00';
  btn.disabled = false;
  btn.textContent = '⏺ Start Recording';
  btn.className = '';
  statusEl.className = '';
  statusEl.textContent = 'Ready';
}

function getMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];

  for (const candidate of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return 'video/webm';
}

async function startRecording() {
  if (isRecording || isProcessingStop) return;

  btn.disabled = true;
  btn.textContent = 'Starting...';
  statusEl.textContent = 'Requesting screen...';

  try {
    let audioConstraint = true;
    let micStream = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          cursor: 'always'
        },
        audio: audioConstraint
      });
      console.log('Display media stream obtained with audio support');
    } catch (displayError) {
      console.warn('System audio capture failed, trying microphone fallback:', displayError);
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          cursor: 'always'
        },
        audio: false
      });

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }
    }

    recordedChunks = [];
    const mimeType = getMimeType();
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      saveVideo();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      isRecording = false;
      isProcessingStop = false;
      mediaRecorder = null;
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      statusEl.textContent = '❌ Recorder error';
      resetState();
    };

    mediaRecorder.start(1000);
    isRecording = true;
    isProcessingStop = false;
    startTime = Date.now();
    updateUI();
    startTimer();
    statusEl.textContent = '🔴 Recording';
  } catch (error) {
    console.error('Start recording error:', error);
    btn.disabled = false;
    btn.textContent = '⏺ Start Recording';
    statusEl.textContent = '❌ Error: ' + (error.message || error);
    resetState();
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    resetState();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Stopping...';
  statusEl.textContent = 'Stopping recording...';
  isProcessingStop = true;

  try {
    mediaRecorder.stop();
  } catch (error) {
    console.error('Stop error:', error);
    resetState();
  }
}

function saveVideo() {
  if (recordedChunks.length === 0) {
    statusEl.textContent = '❌ No data';
    resetState();
    return;
  }

  const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const filename = `recording-${timestamp}.${extension}`;

  chrome.downloads.download({
    url,
    filename,
    saveAs: true
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Download error:', chrome.runtime.lastError);
      statusEl.textContent = '❌ Download error';
    } else {
      statusEl.textContent = '✅ Saved!';
    }

    setTimeout(() => {
      resetState();
    }, 3000);
  });

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function updateUI() {
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

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    seconds++;
    timerEl.textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatTime(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    if (isRecording) {
      btn.click();
    }
  }
});

window.addEventListener('unload', () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  stopTimer();
});