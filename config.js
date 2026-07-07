// Global configuration for Screen Snap extension
export const CONFIG = {
  // Storage and state management
  STORAGE_KEY: "screenRecorderState",
  PREFERENCES_KEY: "userPreferences",

  // Timing constants (milliseconds)
  DELAY_MS: 200,
  TIMER_INTERVAL: 1000,
  THROTTLE_MS: 16, // ~60fps
  MESSAGE_TIMEOUT_MS: 15000,
  STATUS_DISPLAY_DURATION_MS: 5000,
  URL_REVOKE_DELAY_MS: 0, // Immediate revoke after download

  // Window dimensions
  WINDOW_WIDTH: 700,
  WINDOW_HEIGHT: 460,

  // Recording parameters
  CHUNK_INTERVAL: 1000,
  SAMPLE_RATE: 48000,
  ECHO_CANCELLATION: false,
  NOISE_SUPPRESSION: false,

  // Duration limits (seconds)
  MAX_DURATION_SECONDS: 7200, // 2 hours
  WARNING_DURATION_SECONDS: 3600, // 1 hour

  // File size limit (bytes)
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024 * 1024, // 5GB

  // Quality presets
  QUALITY_PRESETS: {
    low: { width: 1280, height: 720 },
    medium: { width: 1600, height: 900 },
    high: { width: 1920, height: 1080 },
  },

  // Default values
  DEFAULT_FORMAT: "webm",
  DEFAULT_QUALITY: "medium",
  DEFAULT_FPS: 30,

  // MIME types
  MIME_TYPES: {
    mp4: "video/mp4",
    webm_vp9: "video/webm;codecs=vp9,opus",
    webm_vp8: "video/webm;codecs=vp8,opus",
    webm: "video/webm",
  },

  // Display surface options
  DISPLAY_SURFACE: "monitor",
  CURSOR_MODE: "always",

  // Feature flags
  ENABLE_PAUSE_RESUME: true,
  ENABLE_STATISTICS: true,
  ENABLE_KEYBOARD_SHORTCUTS: true,

  // Error messages
  ERRORS: {
    ALREADY_RECORDING: "Already recording",
    FAILED_START: "Failed to start recording",
    FAILED_STOP: "Failed to stop recording",
    NO_CHUNKS: "No recorded chunks",
    EMPTY_BLOB: "Empty blob - recording failed",
    FILE_TOO_LARGE: "File too large",
    PERMISSION_DENIED: "Permission denied - screen capture not allowed",
    OFFSCREEN_UNAVAILABLE: "Offscreen document unavailable",
    MESSAGE_TIMEOUT: "Message timeout",
    NETWORK_OFFLINE: "Network offline - recording may be at risk",
  },
};

// Runtime configuration cache
export const RUNTIME = {
  isRecording: false,
  recordingStartedAt: null,
  userPreferences: null,
};
