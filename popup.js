let isRecording = false;
let timerInterval = null;
let seconds = 0;

const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const resetBtn = document.getElementById('reset-btn');

document.addEventListener('DOMContentLoaded', async () => {
  await refreshStatus();
  updateUI();
  if (!isRecording) {
    timerEl.textContent = '00:00';
  }
});

btn.addEventListener('click', async () => {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
});

if (resetBtn) {
  resetBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'reset-state' });
    isRecording = false;
    stopTimer();
    seconds = 0;
    timerEl.textContent = '00:00';
    statusEl.textContent = '🔄 Reset';
    setTimeout(() => {
      if (!isRecording) statusEl.textContent = 'Ready';
    }, 2000);
    updateUI();
  });
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get-status' });
    if (response && response.isRecording) {
      isRecording = true;
      startTimer(response.startedAt || Date.now());
      statusEl.textContent = '🔴 Recording';
    } else {
      isRecording = false;
      stopTimer();
      seconds = 0;
      statusEl.textContent = 'Ready';
      timerEl.textContent = '00:00';
    }
  } catch (error) {
    console.warn('Failed to refresh recording status:', error);
  }
}

async function startRecording() {
  btn.disabled = true;
  btn.textContent = 'Starting...';
  statusEl.textContent = 'Requesting screen...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'start-recording' });
    if (response && response.success) {
      isRecording = true;
      startTimer(Date.now());
      updateUI();
      statusEl.textContent = '🔴 Recording';
    } else {
      statusEl.textContent = '❌ ' + (response?.error || 'Unknown error');
      updateUI();
    }
  } catch (error) {
    console.error('Start recording error:', error);
    statusEl.textContent = '❌ ' + (error.message || error);
  } finally {
    btn.disabled = false;
  }
}

async function stopRecording() {
  btn.disabled = true;
  btn.textContent = 'Stopping...';
  statusEl.textContent = 'Stopping recording...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'stop-recording' });
    if (response && response.success) {
      isRecording = false;
      stopTimer();
      seconds = 0;
      timerEl.textContent = '00:00';
      statusEl.textContent = '✅ Saved';
      setTimeout(() => {
        if (!isRecording) statusEl.textContent = 'Ready';
      }, 2000);
      updateUI();
    } else {
      statusEl.textContent = '❌ ' + (response?.error || 'Unknown error');
      updateUI();
    }
  } catch (error) {
    console.error('Stop recording error:', error);
    statusEl.textContent = '❌ ' + (error.message || error);
  } finally {
    btn.disabled = false;
  }
}

function updateUI() {
  if (isRecording) {
    btn.textContent = '⏹ Stop Recording';
    btn.className = 'recording secondary';
    statusEl.className = 'recording';
  } else {
    btn.textContent = '⏺ Start Recording';
    btn.className = '';
    statusEl.className = '';
  }
}

function startTimer(startedAt = null) {
  stopTimer();
  if (startedAt) {
    seconds = Math.floor((Date.now() - startedAt) / 1000);
  } else {
    seconds = 0;
  }
  timerEl.textContent = formatTime(seconds);
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