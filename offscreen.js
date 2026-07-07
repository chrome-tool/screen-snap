import { CONFIG } from "./config.js";
import {
  isValidMimeType,
  formatFileSize,
  generateFilename,
  isValidBlob,
  getBestSupportedMimeType,
} from "./utils.js";

let mediaRecorder = null;
let stream = null;
let recordedChunks = [];
let startTime = null;
let currentMimeType = "video/webm";
let isStartingRecording = false; // Prevent concurrent startRecording calls
const MIME_TYPE_CACHE = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start-recording") {
    startRecording(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Start recording error:", error);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true;
  }

  if (message.action === "stop-recording") {
    stopRecording()
      .then((duration) => sendResponse({ success: true, duration }))
      .catch((error) => {
        console.error("Stop recording error:", error);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true;
  }
});

/**
 * Gets the best supported MIME type for recording
 * Uses caching to avoid repeated browser API calls
 * @param {string} format - Video format (webm|mp4)
 * @returns {string} Best supported MIME type
 */
function getMimeType(format = CONFIG.DEFAULT_FORMAT) {
  const cacheKey = `mime-${format}`;
  if (MIME_TYPE_CACHE.has(cacheKey)) {
    return MIME_TYPE_CACHE.get(cacheKey);
  }

  let result;
  if (format === "mp4") {
    result = CONFIG.MIME_TYPES.mp4;
  } else {
    const candidates = [
      CONFIG.MIME_TYPES.webm_vp9,
      CONFIG.MIME_TYPES.webm_vp8,
      CONFIG.MIME_TYPES.webm,
    ];
    result = getBestSupportedMimeType(candidates);
  }

  MIME_TYPE_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Gets video constraints based on quality setting
 * @param {string} quality - Quality level (low|medium|high)
 * @param {number} fps - Frames per second
 * @returns {Object} Video constraints
 */
function getVideoConstraints(
  quality = CONFIG.DEFAULT_QUALITY,
  fps = CONFIG.DEFAULT_FPS,
) {
  const presets =
    CONFIG.QUALITY_PRESETS[quality] ||
    CONFIG.QUALITY_PRESETS[CONFIG.DEFAULT_QUALITY];
  return {
    frameRate: fps,
    cursor: CONFIG.CURSOR_MODE,
    width: presets.width,
    height: presets.height,
    displaySurface: CONFIG.DISPLAY_SURFACE,
    logicalSurface: true,
  };
}

/**
 * Starts recording the screen
 * @param {Object} message - Message containing recording options
 * @returns {Promise<void>}
 * @throws {Error} If recording cannot start
 */
async function startRecording(message = {}) {
  // Prevent concurrent startRecording calls
  if (
    isStartingRecording ||
    (mediaRecorder && mediaRecorder.state !== "inactive")
  ) {
    throw new Error(CONFIG.ERRORS.ALREADY_RECORDING);
  }

  isStartingRecording = true;

  const format = message.format || CONFIG.DEFAULT_FORMAT;
  const quality = message.quality || CONFIG.DEFAULT_QUALITY;
  const fps = Number(message.fps || CONFIG.DEFAULT_FPS);

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: getVideoConstraints(quality, fps),
      audio: {
        echoCancellation: CONFIG.ECHO_CANCELLATION,
        noiseSuppression: CONFIG.NOISE_SUPPRESSION,
        sampleRate: CONFIG.SAMPLE_RATE,
      },
      preferCurrentTab: false,
    });

    recordedChunks = [];
    currentMimeType = getMimeType(format);

    if (!isValidMimeType(currentMimeType)) {
      throw new Error(`Unsupported MIME type: ${currentMimeType}`);
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event.error);
      cleanupRecorder();
    };

    mediaRecorder.onstop = () => {
      void finalizeRecording();
    };

    mediaRecorder.start(CONFIG.CHUNK_INTERVAL);
    startTime = Date.now();

    // Detect when user clicks "Stop share" - automatically stop recording
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        console.log("Stream track ended by user (Stop share clicked)");
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      };
    });

    console.log("Recording started with", {
      format,
      quality,
      fps,
      mimeType: currentMimeType,
    });
  } catch (error) {
    isStartingRecording = false;
    cleanupRecorder();
    throw error;
  } finally {
    // Mark completion only after mediaRecorder is fully initialized
    if (mediaRecorder && mediaRecorder.state === "recording") {
      isStartingRecording = false;
    }
  }
}

/**
 * Stops the recording
 * @returns {Promise<number>} Duration in seconds
 */
function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve(0);
      return;
    }

    mediaRecorder.onstop = () => {
      void finalizeRecording().finally(() => {
        const duration = startTime
          ? Math.floor((Date.now() - startTime) / 1000)
          : 0;
        resolve(duration);
      });
    };

    try {
      mediaRecorder.requestData();
      mediaRecorder.stop();
    } catch (error) {
      console.error("Failed to stop recording:", error);
      cleanupRecorder();
      resolve(0);
    }
  });
}

/**
 * Finalizes the recording and saves the video
 * @returns {Promise<void>}
 */
async function finalizeRecording() {
  try {
    await saveVideo();
  } catch (error) {
    console.error("Finalize recording failed:", error);
  } finally {
    cleanupRecorder();

    // Notify background that recording has ended
    // (could be due to user clicking "Stop share", reaching time limit, or error)
    try {
      chrome.runtime
        .sendMessage({
          action: "recording-completed",
          timestamp: Date.now(),
        })
        .catch(() => {
          // Background might not be listening, that's ok
        });
    } catch (e) {
      console.warn("Failed to notify background of recording completion:", e);
    }
  }
}

/**
 * Cleans up recorder resources
 */
function cleanupRecorder() {
  isStartingRecording = false;
  if (stream) {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {
        console.warn("Error stopping track:", e);
      }
    });
    stream = null;
  }
  mediaRecorder = null;
}

/**
 * Saves the recorded video to downloads
 * @returns {Promise<boolean>} True if save was successful
 * @throws {Error} If blob is invalid
 */
async function saveVideo() {
  if (recordedChunks.length === 0) {
    throw new Error(CONFIG.ERRORS.NO_CHUNKS);
  }

  const blob = new Blob(recordedChunks, { type: currentMimeType });

  // Validate blob
  if (!isValidBlob(blob)) {
    if (blob.size === 0) {
      throw new Error(CONFIG.ERRORS.EMPTY_BLOB);
    }
    if (blob.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(CONFIG.ERRORS.FILE_TOO_LARGE);
    }
    throw new Error("Invalid blob");
  }

  const extension = currentMimeType.includes("mp4") ? "mp4" : "webm";
  const filename = generateFilename(extension);
  const fileSize = formatFileSize(blob.size);

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    try {
      document.body.appendChild(link);
      link.click();
      console.log(`Video saved: ${filename} (${fileSize})`);

      // Send statistics to popup
      await chrome.runtime
        .sendMessage({
          action: "recording-saved",
          fileSize: blob.size,
          filename,
          duration: Math.floor((Date.now() - startTime) / 1000),
        })
        .catch(() => {
          // Popup might not be open, silently ignore
          console.log("Could not send statistics (popup not open)");
        });

      return true;
    } finally {
      document.body.removeChild(link);
      // Immediately revoke after clicking (browser has initiated download)
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error("Download error:", error);
    throw error;
  }
}
