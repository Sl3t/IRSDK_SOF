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

    /** @type {boolean} Whether we've logged CarIdxTrackSurface diagnostics */
    this._loggedTrackSurface = false;

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

      // Diagnostic: dump ALL WeekendInfo fields to find series data
      const data = sessionInfo ? sessionInfo.data : null;
      if (data && data.WeekendInfo) {
        const wi = data.WeekendInfo;
        log('INFO', '=== SessionInfo updated — FULL WeekendInfo dump ===');
        for (const [key, value] of Object.entries(wi)) {
          // Skip WeekendOptions (nested object, log separately)
          if (key === 'WeekendOptions' || key === 'TelemetryOptions') continue;
          log('INFO', `  ${key}: ${JSON.stringify(value)}`);
        }
        // Also dump WeekendOptions if present
        if (wi.WeekendOptions) {
          log('INFO', '  --- WeekendOptions ---');
          for (const [key, value] of Object.entries(wi.WeekendOptions)) {
            log('INFO', `    ${key}: ${JSON.stringify(value)}`);
          }
        }
      } else {
        log('INFO', 'SessionInfo updated (no WeekendInfo)');
      }

      // Log sessions array
      if (data && data.SessionInfo && data.SessionInfo.Sessions) {
        data.SessionInfo.Sessions.forEach((s, i) => {
          log('INFO', `  Session[${i}]: num=${s.SessionNum} type=${s.SessionType} name=${s.SessionName} time=${s.SessionTime} laps=${s.SessionLaps}`);
        });
      }

      // Log DriverInfo summary
      if (data && data.DriverInfo) {
        const di = data.DriverInfo;
        log('INFO', `  DriverInfo: DriverCarIdx=${di.DriverCarIdx} DriverUserID=${di.DriverUserID}`);
        if (di.Drivers) {
          log('INFO', `  Drivers count: ${di.Drivers.length}`);
        }
      }

      // Diagnostic: log driver count and in_world stats
      this._buildAndEmit();
    });

    iracing.on('Telemetry', (telemetry) => {
      this._telemetry = telemetry;

      // Log telemetry diagnostics on first few updates to debug in_world detection
      if (!this._loggedTrackSurface && telemetry && telemetry.values) {
        const vals = telemetry.values;
        const surface = vals.CarIdxTrackSurface;

        // Dump available telemetry keys once (helps identify what node-irsdk exposes)
        const allKeys = Object.keys(vals);
        const carIdxKeys = allKeys.filter((k) => k.startsWith('CarIdx'));
        log('INFO', `Telemetry has ${allKeys.length} variables, CarIdx* variables: ${carIdxKeys.join(', ') || '(none)'}`);

        // Session state info
        log('INFO', `  SessionNum=${vals.SessionNum} SessionState=${vals.SessionState} IsOnTrack=${vals.IsOnTrack} IsReplayPlaying=${vals.IsReplayPlaying}`);

        if (surface) {
          // Detect value types — iRacing SDK uses integers (-1=NotInWorld,
          // 0=OffTrack, 1=InPitStall, 2=AproachingPits, 3=OnTrack).
          // Some node-irsdk versions may convert to strings.
          const active = surface.filter((v) =>
            (typeof v === 'string' && v !== 'NotInWorld') ||
            (typeof v === 'number' && v >= 0)
          ).length;
          const total = surface.length;
          log('INFO', `CarIdxTrackSurface: ${active} in-world out of ${total} slots (type: ${typeof surface[0]}, sample[0..5]: ${JSON.stringify(surface.slice(0, 6))})`);
          // Show entries that are in-world
          const nonEmpty = [];
          surface.forEach((v, i) => {
            if ((typeof v === 'string' && v !== 'NotInWorld') || (typeof v === 'number' && v >= 0)) {
              nonEmpty.push(`[${i}]=${v}`);
            }
          });
          log('INFO', `  Active slots: ${nonEmpty.length > 0 ? nonEmpty.join(', ') : '(none)'}`);
        } else {
          log('WARN', 'CarIdxTrackSurface NOT available in telemetry');
        }

        // Log fallback signals availability
        const lapComp = vals.CarIdxLapCompleted;
        const lapDist = vals.CarIdxLapDistPct;
        if (lapComp) {
          const withLaps = lapComp.filter((v) => typeof v === 'number' && v > 0).length;
          log('INFO', `  CarIdxLapCompleted: ${withLaps} cars with laps > 0`);
        }
        if (lapDist) {
          const onTrack = lapDist.filter((v) => typeof v === 'number' && v > 0 && v <= 1).length;
          log('INFO', `  CarIdxLapDistPct: ${onTrack} cars with valid position`);
        }

        this._loggedTrackSurface = true;
      }

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
    const drivers = parseDrivers(sessionData, telemetryValues);
    const conditions = parseConditions(telemetryValues, sessionData);
    const sof = this._computeSOF(drivers);

    // Augment session with telemetry timing data
    if (telemetryValues) {
      session.session_time = telemetryValues.SessionTime != null
        ? telemetryValues.SessionTime : null;
      session.session_time_remain = telemetryValues.SessionTimeRemain != null
        ? telemetryValues.SessionTimeRemain : null;
      // Use telemetry SessionNum for accurate active session detection
      if (telemetryValues.SessionNum != null) {
        session.session_num = telemetryValues.SessionNum;
      }
    }

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
    // Filter to real, active, in-world drivers with valid iRating
    const humans = drivers.filter(
      (d) => !d.is_spectator && !d.is_ai && d.irating > 0
    );
    let eligible = humans.filter((d) => d.in_world !== false);

    // Fallback: if in_world filter removes ALL human drivers but we have
    // registered humans with valid iRating, CarIdxTrackSurface is likely
    // unreliable (stale data, bridge started mid-session, replay quirk).
    // Use the full human list so SOF is never stuck at 0 during a live session.
    if (eligible.length === 0 && humans.length > 0) {
      log('WARN', `in_world filter removed all ${humans.length} drivers from SOF — using fallback (all registered humans)`);
      eligible = humans;
    }

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
