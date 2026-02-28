/**
 * Session Parser
 * ===============
 * Extracts session metadata from the IRSDK SessionInfo + WeekendInfo YAML
 * (already parsed to a JS object by node-irsdk).
 *
 * Produces the "session" section of the session_update message:
 *   {
 *     session_type, session_name, session_num,
 *     session_id, subsession_id,
 *     is_official, series_name, track_name,
 *     track_config, car_class, category, event_type
 *   }
 */

'use strict';

/**
 * Parse session and weekend information from raw IRSDK data.
 *
 * node-irsdk delivers SessionInfo as a nested JS object that mirrors
 * the YAML structure.  The relevant top-level keys are:
 *   - data.WeekendInfo   (track, series, weekend metadata)
 *   - data.SessionInfo   (array of sessions with types and states)
 *
 * @param {object|null} data - The parsed SessionInfo object (sessionInfo.data)
 * @returns {object} Normalised session object
 */
function parseSession(data) {
  // Default / empty state when iRacing is not connected or data is missing
  const empty = {
    session_type: null,
    session_name: null,
    session_num: null,
    session_id: null,
    subsession_id: null,
    is_official: false,
    series_name: null,
    track_name: null,
    track_config: null,
    car_class: null,
    category: null,
    event_type: null,
  };

  if (!data) {
    return empty;
  }

  // ---------------------------------------------------------------------------
  // WeekendInfo
  // ---------------------------------------------------------------------------
  const weekend = data.WeekendInfo || {};

  const trackName = weekend.TrackDisplayName
    || weekend.TrackName
    || null;

  const trackConfig = weekend.TrackConfigName || null;

  // Series name with intelligent fallback chain
  // In official series: SeriesDisplayName is present
  // In free practice / test drive: absent — build from Category + EventType
  let seriesName = weekend.SeriesDisplayName
    || weekend.SeriesShortName
    || weekend.SeasonDisplayName
    || null;

  // Fallback: build a descriptive label from what we have
  if (!seriesName) {
    const parts = [];
    if (weekend.Category) parts.push(weekend.Category);
    if (weekend.EventType) parts.push(weekend.EventType);
    seriesName = parts.length > 0 ? parts.join(' — ') : null;
  }

  // Official session flag — node-irsdk exposes this as a numeric 0/1 or string
  const isOfficial = toBoolean(weekend.Official);

  // Additional identification fields
  const sessionID = weekend.SessionID || weekend.SessionId || null;
  const subsessionID = weekend.SubSessionID || weekend.SubSessionId || null;
  const category = weekend.Category || null;
  const eventType = weekend.EventType || null;

  // ---------------------------------------------------------------------------
  // Active session (SessionInfo.Sessions[])
  // ---------------------------------------------------------------------------
  // The Sessions array holds Practice, Qualifying, Race etc.  We pick the one
  // that is currently active.  node-irsdk usually exposes the current session
  // number in telemetry (SessionNum), but in SessionInfo we can look for the
  // session whose ResultsPositions are being populated, or simply use the last
  // entry whose SessionType is set.  A reliable approach: find the session
  // whose index matches the WeekendInfo-based SessionNum, or fall back to the
  // last session in the array.
  const sessions = (data.SessionInfo && data.SessionInfo.Sessions) || [];
  let activeSession = null;

  if (sessions.length > 0) {
    // Try to match using WeekendInfo.SessionID or fall back to last
    // The convention in node-irsdk is that the last session in the array
    // is the one currently in progress during practice/qual phases, while
    // during a race it's always the Race entry.  We pick the highest-index
    // session that has a SessionType (safest heuristic without telemetry
    // SessionNum at parse time).
    activeSession = sessions[sessions.length - 1];

    // If WeekendInfo contains a "SessionID" field matching a session, prefer it
    for (const s of sessions) {
      if (s.SessionNum !== undefined && data.WeekendInfo &&
          s.SessionNum === data.WeekendInfo.SessionID) {
        activeSession = s;
        break;
      }
    }
  }

  const sessionType = activeSession ? (activeSession.SessionType || null) : null;
  const sessionName = activeSession ? (activeSession.SessionName || activeSession.SessionType || null) : null;
  const sessionNum = activeSession ? (activeSession.SessionNum !== undefined ? activeSession.SessionNum : null) : null;

  // Session duration from the YAML (e.g. "7200.0000 sec" or "unlimited")
  const sessionTimeStr = activeSession ? (activeSession.SessionTime || null) : null;
  const sessionLaps = activeSession ? (activeSession.SessionLaps || null) : null;

  // Parse the duration string to get total seconds (for display fallback)
  const sessionDurationSec = parseSessionDuration(sessionTimeStr);

  // ---------------------------------------------------------------------------
  // Car class — typically found in WeekendInfo.WeekendOptions or DriverInfo
  // ---------------------------------------------------------------------------
  const weekendOptions = weekend.WeekendOptions || {};
  const carClass = weekendOptions.CarClassGroupName
    || weekendOptions.CarClassName
    || extractCarClassFromDriverInfo(data)
    || null;

  return {
    session_type: sessionType,
    session_name: sessionName,
    session_num: sessionNum,
    session_id: sessionID,
    subsession_id: subsessionID,
    is_official: isOfficial,
    series_name: seriesName,
    track_name: trackName,
    track_config: trackConfig,
    car_class: carClass,
    category: category,
    event_type: eventType,
    session_duration: sessionTimeStr,
    session_duration_sec: sessionDurationSec,
    session_laps: sessionLaps,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a representative car class name from DriverInfo when WeekendInfo
 * does not provide it directly.
 * @param {object} data - Full IRSDK SessionInfo data
 * @returns {string|null}
 */
function extractCarClassFromDriverInfo(data) {
  if (!data || !data.DriverInfo || !data.DriverInfo.Drivers) {
    return null;
  }
  // Use the first non-spectator driver's car class as representative
  for (const driver of data.DriverInfo.Drivers) {
    if (driver.IsSpectator === 0 || driver.IsSpectator === false) {
      return driver.CarClassShortName || driver.CarClassGroupName || null;
    }
  }
  return null;
}

/**
 * Parse an IRSDK session duration string like "7200.0000 sec" to seconds.
 * Returns null for "unlimited" or unparseable values.
 * @param {string|null} timeStr
 * @returns {number|null} Duration in seconds, or null
 */
function parseSessionDuration(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  if (timeStr.toLowerCase().includes('unlimited')) return null;
  const match = timeStr.match(/([\d.]+)/);
  if (match) {
    const seconds = parseFloat(match[1]);
    return isFinite(seconds) ? Math.round(seconds) : null;
  }
  return null;
}

/**
 * Coerce a value to boolean.  Handles 0/1, "0"/"1", true/false.
 * @param {*} val
 * @returns {boolean}
 */
function toBoolean(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val === '1' || val.toLowerCase() === 'true';
  return false;
}

module.exports = parseSession;
