/**
 * IRSDK SOF — WebSocket Client
 * ==============================
 * Connects to the IRSDK Bridge WebSocket server (default ws://localhost:8182)
 * and provides an event-driven interface for receiving real-time session data.
 *
 * Features:
 *   - Auto-reconnect with exponential backoff (2s, 4s, 8s, 16s max)
 *   - JSON message parsing with error handling
 *   - Event callbacks: onSessionUpdate, onConnectionChange, onHeartbeat
 *   - Connection state tracking and status dot updates in the nav bar
 *   - Stores last received data for synchronous access
 */

'use strict';

const wsClient = (() => {

  // =========================================================================
  // Configuration
  // =========================================================================
  const DEFAULT_URL = 'ws://localhost:8182';
  const RECONNECT_BASE_MS = 2000;   // Initial reconnect delay
  const RECONNECT_MAX_MS  = 16000;  // Maximum reconnect delay
  const RECONNECT_MULTIPLIER = 2;   // Exponential backoff factor

  // =========================================================================
  // Internal state
  // =========================================================================
  let _ws = null;                    // WebSocket instance
  let _url = DEFAULT_URL;           // WebSocket server URL
  let _connected = false;            // Current connection state
  let _reconnectDelay = RECONNECT_BASE_MS;
  let _reconnectTimer = null;        // Timeout handle for reconnect
  let _lastData = null;              // Last received session_update data
  let _intentionalClose = false;     // True if disconnect() was called manually

  // Event callback registries
  const _sessionUpdateCallbacks = [];
  const _connectionChangeCallbacks = [];
  const _heartbeatCallbacks = [];

  // =========================================================================
  // Status dot updater
  // Updates the IRSDK status indicator in the sidebar navigation
  // =========================================================================

  /**
   * Update the IRSDK status dot in the sidebar.
   * @param {boolean} connected - Whether the WebSocket is connected
   */
  const _updateStatusDot = (connected) => {
    const dot = document.getElementById('dot-irsdk');
    if (!dot) return;

    if (connected) {
      dot.classList.remove('status-dot--disconnected');
      dot.classList.add('status-dot--connected');
      dot.title = 'IRSDK Bridge: connected';
    } else {
      dot.classList.remove('status-dot--connected');
      dot.classList.add('status-dot--disconnected');
      dot.title = 'IRSDK Bridge: disconnected';
    }
  };

  // =========================================================================
  // Connection management
  // =========================================================================

  /**
   * Establish a WebSocket connection to the bridge server.
   * @param {string} [url] - Override the default WebSocket URL
   */
  const connect = (url) => {
    if (url) _url = url;
    _intentionalClose = false;

    // Prevent duplicate connections
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      console.log('[wsClient] Already connected or connecting, skipping.');
      return;
    }

    console.log(`[wsClient] Connecting to ${_url}...`);

    try {
      _ws = new WebSocket(_url);
    } catch (err) {
      console.error('[wsClient] Failed to create WebSocket:', err.message);
      _scheduleReconnect();
      return;
    }

    // -- onopen --
    _ws.onopen = () => {
      console.log('[wsClient] Connected to IRSDK Bridge');
      _connected = true;
      _reconnectDelay = RECONNECT_BASE_MS; // Reset backoff on successful connect
      _updateStatusDot(true);
      _fireConnectionChange(true);
    };

    // -- onmessage --
    _ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        console.warn('[wsClient] Failed to parse message:', err.message);
        return;
      }

      // Route the message to the appropriate callback set
      switch (message.type) {
        case 'session_update':
          _lastData = message;
          _fireSessionUpdate(message);
          break;

        case 'heartbeat':
          _fireHeartbeat(message);
          break;

        default:
          // Unknown message types are stored as session data if they have drivers
          if (message.drivers || message.entries) {
            _lastData = message;
            _fireSessionUpdate(message);
          }
          break;
      }
    };

    // -- onclose --
    _ws.onclose = (event) => {
      console.log(`[wsClient] Connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
      _connected = false;
      _updateStatusDot(false);
      _fireConnectionChange(false);

      // Auto-reconnect unless the close was intentional
      if (!_intentionalClose) {
        _scheduleReconnect();
      }
    };

    // -- onerror --
    _ws.onerror = (err) => {
      console.error('[wsClient] WebSocket error:', err);
      // onclose will fire after onerror, triggering reconnect
    };
  };

  /**
   * Intentionally disconnect from the bridge server.
   * Prevents auto-reconnect.
   */
  const disconnect = () => {
    _intentionalClose = true;
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    if (_ws) {
      _ws.close(1000, 'Client disconnect');
      _ws = null;
    }
    _connected = false;
    _updateStatusDot(false);
    _fireConnectionChange(false);
    console.log('[wsClient] Disconnected intentionally');
  };

  /**
   * Schedule a reconnect attempt with exponential backoff.
   * Delays: 2s, 4s, 8s, 16s (capped).
   */
  const _scheduleReconnect = () => {
    if (_reconnectTimer) return; // Already scheduled

    console.log(`[wsClient] Reconnecting in ${_reconnectDelay / 1000}s...`);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      connect();
    }, _reconnectDelay);

    // Increase delay for next attempt (exponential backoff with cap)
    _reconnectDelay = Math.min(_reconnectDelay * RECONNECT_MULTIPLIER, RECONNECT_MAX_MS);
  };

  // =========================================================================
  // Event system
  // =========================================================================

  /**
   * Register a callback for session_update messages.
   * @param {function} callback - Called with the parsed message object
   */
  const onSessionUpdate = (callback) => {
    if (typeof callback === 'function') {
      _sessionUpdateCallbacks.push(callback);
    }
  };

  /**
   * Register a callback for connection state changes.
   * @param {function} callback - Called with a boolean (true = connected)
   */
  const onConnectionChange = (callback) => {
    if (typeof callback === 'function') {
      _connectionChangeCallbacks.push(callback);
    }
  };

  /**
   * Register a callback for heartbeat messages.
   * @param {function} callback - Called with the heartbeat message object
   */
  const onHeartbeat = (callback) => {
    if (typeof callback === 'function') {
      _heartbeatCallbacks.push(callback);
    }
  };

  /** Fire all session update callbacks */
  const _fireSessionUpdate = (data) => {
    _sessionUpdateCallbacks.forEach((cb) => {
      try { cb(data); } catch (e) { console.error('[wsClient] Session callback error:', e); }
    });
  };

  /** Fire all connection change callbacks */
  const _fireConnectionChange = (connected) => {
    _connectionChangeCallbacks.forEach((cb) => {
      try { cb(connected); } catch (e) { console.error('[wsClient] Connection callback error:', e); }
    });
  };

  /** Fire all heartbeat callbacks */
  const _fireHeartbeat = (data) => {
    _heartbeatCallbacks.forEach((cb) => {
      try { cb(data); } catch (e) { console.error('[wsClient] Heartbeat callback error:', e); }
    });
  };

  // =========================================================================
  // State accessors
  // =========================================================================

  /**
   * Return the last received session data (synchronous access).
   * @returns {object|null}
   */
  const getLastData = () => _lastData;

  /**
   * Check whether the WebSocket is currently connected.
   * @returns {boolean}
   */
  const isConnected = () => _connected;

  /**
   * Get the current WebSocket URL.
   * @returns {string}
   */
  const getUrl = () => _url;

  /**
   * Update the WebSocket URL and reconnect.
   * @param {string} newUrl - The new WebSocket URL
   */
  const setUrl = (newUrl) => {
    if (newUrl && newUrl !== _url) {
      _url = newUrl;
      disconnect();
      connect();
    }
  };

  // Public API
  return {
    connect,
    disconnect,
    onSessionUpdate,
    onConnectionChange,
    onHeartbeat,
    getLastData,
    isConnected,
    getUrl,
    setUrl,
  };

})();
