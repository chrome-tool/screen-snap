// Utility functions for Screen Snap extension
import { CONFIG } from './config.js';

/**
 * Validates if a MIME type is supported by the browser
 * @param {string} mimeType - The MIME type to validate
 * @returns {boolean} True if supported, false otherwise
 */
export function isValidMimeType(mimeType) {
  return MediaRecorder.isTypeSupported(mimeType);
}

/**
 * Validates quality setting
 * @param {string} quality - Quality level (low|medium|high)
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidQuality(quality) {
  return Object.keys(CONFIG.QUALITY_PRESETS).includes(quality);
}

/**
 * Validates format setting
 * @param {string} format - Video format (webm|mp4)
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidFormat(format) {
  return ['webm', 'mp4'].includes(format);
}

/**
 * Validates FPS setting
 * @param {number} fps - Frames per second
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidFPS(fps) {
  return [30, 60, 120].includes(Number(fps));
}

/**
 * Sends a message with timeout support
 * @param {Object} message - The message to send
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} The response from the receiver
 */
export function sendMessageWithTimeout(message, timeout = CONFIG.MESSAGE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(CONFIG.ERRORS.MESSAGE_TIMEOUT));
    }, timeout);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Formats seconds into MM:SS format
 * @param {number} totalSeconds - Total seconds to format
 * @returns {string} Formatted time string
 */
export function formatTime(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * Formats bytes into human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generates filename with timestamp
 * @param {string} extension - File extension
 * @returns {string} Generated filename
 */
export function generateFilename(extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `recording-${timestamp}.${extension}`;
}

/**
 * Validates blob size constraints
 * @param {Blob} blob - Blob to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidBlob(blob) {
  if (!blob || blob.size === 0) return false;
  if (blob.size > CONFIG.MAX_FILE_SIZE_BYTES) return false;
  return true;
}

/**
 * Throttles function execution
 * @param {Function} func - Function to throttle
 * @param {number} interval - Throttle interval in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, interval) {
  let lastRun = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastRun >= interval) {
      lastRun = now;
      return func.apply(this, args);
    }
  };
}

/**
 * Debounces function execution
 * @param {Function} func - Function to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Gets the best supported MIME type from candidates
 * @param {string[]} candidates - Array of MIME types to check
 * @returns {string} Best supported MIME type
 */
export function getBestSupportedMimeType(candidates) {
  for (const candidate of candidates) {
    if (isValidMimeType(candidate)) {
      return candidate;
    }
  }
  return CONFIG.MIME_TYPES.webm; // fallback
}

/**
 * Cleans up resources
 * @param {Object} options - Cleanup options
 */
export function cleanupResources(options = {}) {
  // Remove event listeners if needed
  if (options.listeners) {
    // Listers cleanup handled by component
  }
  
  // Clear timers if needed
  if (options.timers) {
    // Timers cleanup handled by component
  }
}

/**
 * Safe JSON parse with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON parse error:', error);
    return fallback;
  }
}
