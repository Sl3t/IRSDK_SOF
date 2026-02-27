/**
 * IRSDK Reader
 * =============
 * Connects to iRacing via node-irsdk, reads telemetry and session data,
 * parses them through dedicated parsers, and emits structured session_update
 * messages.
 *
 * Responsibilities:
 *   - Initialise node-irsdk and listen for Connected / Disconnected events
 *   - Re-read data whenever the session or telemetry changes
 *   - Compose the final session_update payload from all parsers
 *   - Compute SOF statistics from the parsed driver list
 */

'use strict';

const EventEmitter = require('events');
const irsdk = require('node-irsdk-2023');

const parseSession = require('./parsers/session-parser');
const parseDrivers = require('./parsers/driver-parser');
const parseConditions = require('./parsers/conditions-parser');

// ---------------------------------------------------------------------------
// Logging helper (mirrors server.js style)
// ---------------------------------------------------------------------------
function log(level, ...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [READER] [${level}]`, ...args);
}

// ---------------------------------------------------------------------------
// IRSDKReader class
// ---------------------------------------------------------------------------
class IRSDKReader extends EventEmitter {
  constructor() {
    super();

    /** @type {boolean} Whether iRacing process is detected */
    this._iracingRunning = false;

    /** @type {boolean} Whether the sim is actively in a session */
    this._inSession = false;

    /** @type {object|null} Last raw SessionInfo YAML (parsed to JS object by node-irsdk) */
    this._sessionInfo = null;

    /** @type {object|null} Last raw telemetry values */
    this._telemetry = null;

    /** @type {object|null} Most recently assembled session_update message */
    this._latestMessage = null;

    this._init();
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Set up node-irsdk and bind all event listeners.
   * node-irsdk.init() starts polling shared memory; it emits events when
   * iRacing connects, disconnects, or data updates.
   */
  _init() {
    log('INFO', 'Initialising node-irsdk...');

    // node-irsdk options: update interval 1000ms (we throttle on broadcast side)
    const iracing = irsdk.init({
      telemetryUpdateInterval: 1000,
      sessionInfoUpdateInterval: 2000,
    });

    // -- Connection lifecycle events ----------------------------------------

    iracing.on('Connected', () => {
      log('INFO', 'iRacing CONNECTED (shared memory detected)');
      this._iracingRunning = true;
      this._inSession = true;
      this._emitStatusChange();
    });

    iracing.on('Disconnected', () => {
      log('WARN', 'iRacing DISCONNECTED');
      this._iracingRunning = false;
      this._inSession = false;
      this._sessionInfo = null;
      this._telemetry = null;
      this._emitStatusChange();

      // Emit a final update so clients know the connection dropped
      this._buildAndEmit();
    });

    // -- Data update events -------------------------------------------------

    iracing.on('SessionInfo', (sessionInfo) => {
      this._sessionInfo = sessionInfo;
      this._inSession = true;
      log('INFO', 'SessionInfo updated');
      this._buildAndEmit();
    });

    iracing.on('Telemetry', (telemetry) => {
      this._telemetry = telemetry;
      this._buildAndEmit();
    });

    this._iracing = iracing;
    log('INFO', 'Waiting for iRacing to start...');
  }

  // -------------------------------------------------------------------------
  // Payload assembly
  // -------------------------------------------------------------------------

  /**
   * Build the full session_update message from the latest raw data,
   * cache it, and emit it.
   */
  _buildAndEmit() {
    const message = this._buildMessage();
    this._latestMessage = message;
    this.emit('session_update', message);
  }

  /**
   * Assemble the canonical session_update JSON structure.
   * Each section is produced by its dedicated parser; SOF stats are computed
   * locally from the filtered driver list.
   * @returns {object} The session_update message
   */
  _buildMessage() {
    const sessionData = this._sessionInfo ? this._sessionInfo.data : null;
    const telemetryValues = this._telemetry ? this._telemetry.values : null;

    // Parse individual sections
    const session = parseSession(sessionData);
    const drivers = parseDrivers(sessionData);
    const conditions = parseConditions(telemetryValues, sessionData);
    const sof = this._computeSOF(drivers);

    return {
      type: 'session_update',
      timestamp: new Date().toISOString(),
      connection: {
        iracing_running: this._iracingRunning,
        in_session: this._inSession,
      },
      session,
      track_conditions: conditions,
      drivers,
      sof,
    };
  }

  // -------------------------------------------------------------------------
  // SOF computation
  // -------------------------------------------------------------------------

  /**
   * Compute Strength of Field statistics from the filtered driver list.
   * Only drivers who are NOT spectators and NOT AI are included.
   * @param {Array} drivers - Parsed driver objects from driver-parser
   * @returns {object} SOF statistics
   */
  _computeSOF(drivers) {
    // Filter to real, active drivers with valid iRating
    const eligible = drivers.filter(
      (d) => !d.is_spectator && !d.is_ai && d.irating > 0
    );

    if (eligible.length === 0) {
      return {
        value: 0,
        driver_count: 0,
        min_irating: 0,
        max_irating: 0,
        median_irating: 0,
      };
    }

    const ratings = eligible.map((d) => d.irating).sort((a, b) => a - b);
    const sum = ratings.reduce((acc, val) => acc + val, 0);
    const count = ratings.length;
    const avg = Math.round(sum / count);
    const min = ratings[0];
    const max = ratings[count - 1];

    // Median: middle value, or average of two middle values
    let median;
    const mid = Math.floor(count / 2);
    if (count % 2 === 0) {
      median = Math.round((ratings[mid - 1] + ratings[mid]) / 2);
    } else {
      median = ratings[mid];
    }

    return {
      value: avg,
      driver_count: count,
      min_irating: min,
      max_irating: max,
      median_irating: median,
    };
  }

  // -------------------------------------------------------------------------
  // Status helpers
  // -------------------------------------------------------------------------

  /** Emit a status_change event with the current connection flags. */
  _emitStatusChange() {
    this.emit('status_change', this.getConnectionStatus());
  }

  /**
   * Return the current connection status object.
   * @returns {{ iracing_running: boolean, in_session: boolean }}
   */
  getConnectionStatus() {
    return {
      iracing_running: this._iracingRunning,
      in_session: this._inSession,
    };
  }

  /**
   * Return the most recently built session_update message, or null if none.
   * Used by the server to send an immediate snapshot to newly connected clients.
   * @returns {object|null}
   */
  getLatestMessage() {
    return this._latestMessage;
  }

  /**
   * Stop listening to iRacing.  Called during graceful shutdown.
   */
  stop() {
    log('INFO', 'Stopping IRSDK reader...');
    if (this._iracing) {
      this._iracing.removeAllListeners();
    }
  }
}

module.exports = IRSDKReader;
