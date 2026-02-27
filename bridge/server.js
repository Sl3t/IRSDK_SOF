/**
 * IRSDK SOF Bridge — WebSocket Server
 * ====================================
 * Main entry point. Starts a WebSocket server on port 8182 (LAN-accessible)
 * and pushes iRacing session data to all connected clients.
 *
 * Features:
 *   - Auto-detect when iRacing is running
 *   - Auto-reconnect when iRacing restarts or session changes
 *   - Throttled session_update messages (max every 2 seconds)
 *   - Heartbeat every 5 seconds
 *   - Timestamped console logging
 */

'use strict';

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const IRSDKReader = require('./irsdk-reader');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WS_PORT = 8182;
const WS_HOST = '0.0.0.0'; // Listen on all interfaces (LAN-accessible)
const HEARTBEAT_INTERVAL_MS = 5000;
const THROTTLE_INTERVAL_MS = 2000;
const LIVE_DATA_FILE = path.join(__dirname, 'live-data.json');

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/**
 * Log a message to the console with an ISO-8601 timestamp prefix.
 * @param {string} level - 'INFO', 'WARN', 'ERROR'
 * @param  {...any} args - Message parts
 */
function log(level, ...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}]`, ...args);
}

// ---------------------------------------------------------------------------
// WebSocket Server
// ---------------------------------------------------------------------------
const wss = new WebSocket.Server({ host: WS_HOST, port: WS_PORT }, () => {
  log('INFO', `WebSocket server listening on ws://${WS_HOST}:${WS_PORT}`);
});

/**
 * Broadcast a JSON message to every connected client whose socket is OPEN.
 * @param {object} data - The payload to serialise and send
 */
function broadcast(data) {
  const payload = JSON.stringify(data);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });
  return sent;
}

// Track connected clients for logging
wss.on('connection', (ws, req) => {
  const remoteAddr = req.socket.remoteAddress || 'unknown';
  log('INFO', `Client connected from ${remoteAddr} (total: ${wss.clients.size})`);

  // Send the latest state immediately so the new client does not have to wait
  const snapshot = reader.getLatestMessage();
  if (snapshot) {
    ws.send(JSON.stringify(snapshot));
  }

  ws.on('close', () => {
    log('INFO', `Client disconnected (remaining: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    log('ERROR', `Client WebSocket error: ${err.message}`);
  });
});

wss.on('error', (err) => {
  log('ERROR', `WebSocket server error: ${err.message}`);
});

// ---------------------------------------------------------------------------
// IRSDK Reader
// ---------------------------------------------------------------------------
const reader = new IRSDKReader();

// ---------------------------------------------------------------------------
// Throttled broadcast of session_update
// ---------------------------------------------------------------------------
let lastBroadcastTime = 0;
let pendingBroadcast = null;
let throttleTimer = null;

/**
 * Schedule a throttled broadcast. If called more often than THROTTLE_INTERVAL_MS,
 * the latest payload is queued and sent when the interval elapses.
 * @param {object} message - The session_update message
 */
function throttledBroadcast(message) {
  const now = Date.now();
  const elapsed = now - lastBroadcastTime;

  if (elapsed >= THROTTLE_INTERVAL_MS) {
    // Enough time has passed — send immediately
    lastBroadcastTime = now;
    const count = broadcast(message);
    if (count > 0) {
      log('INFO', `Broadcast session_update to ${count} client(s)`);
    }
    // Clear any pending timer since we just sent
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    pendingBroadcast = null;
  } else {
    // Too soon — queue the latest payload
    pendingBroadcast = message;
    if (!throttleTimer) {
      const delay = THROTTLE_INTERVAL_MS - elapsed;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pendingBroadcast) {
          lastBroadcastTime = Date.now();
          const count = broadcast(pendingBroadcast);
          if (count > 0) {
            log('INFO', `Broadcast session_update (throttled) to ${count} client(s)`);
          }
          pendingBroadcast = null;
        }
      }, delay);
    }
  }
}

// ---------------------------------------------------------------------------
// Write live-data.json for PHP backend consumption
// ---------------------------------------------------------------------------
/**
 * Write the latest session data to live-data.json so the PHP endpoints
 * (session/live, conditions/live) can serve it via REST API.
 * Uses atomic write (write to temp file, then rename) to prevent partial reads.
 * @param {object} data - The session_update message
 */
function writeLiveData(data) {
  const tmp = LIVE_DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, LIVE_DATA_FILE);
  } catch (err) {
    log('ERROR', `Failed to write live-data.json: ${err.message}`);
  }
}

// Listen for parsed data from the reader
reader.on('session_update', (message) => {
  throttledBroadcast(message);
  writeLiveData(message);
});

reader.on('status_change', (status) => {
  log('INFO', `iRacing status — running: ${status.iracing_running}, in_session: ${status.in_session}`);
});

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------
setInterval(() => {
  const heartbeat = {
    type: 'heartbeat',
    timestamp: new Date().toISOString(),
    connection: reader.getConnectionStatus(),
    clients: wss.clients.size,
  };
  broadcast(heartbeat);
}, HEARTBEAT_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal) {
  log('INFO', `Received ${signal}, shutting down...`);
  reader.stop();

  // Remove live-data.json so PHP endpoints know the bridge is stopped
  try {
    if (fs.existsSync(LIVE_DATA_FILE)) {
      fs.unlinkSync(LIVE_DATA_FILE);
      log('INFO', 'Removed live-data.json');
    }
  } catch (err) {
    log('WARN', `Could not remove live-data.json: ${err.message}`);
  }

  wss.close(() => {
    log('INFO', 'WebSocket server closed');
    process.exit(0);
  });
  // Force exit after 3 seconds if graceful close hangs
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('INFO', 'IRSDK SOF Bridge started');
log('INFO', `Throttle: ${THROTTLE_INTERVAL_MS}ms | Heartbeat: ${HEARTBEAT_INTERVAL_MS}ms`);
