/**
 * Driver Parser
 * ==============
 * Extracts and normalises the driver list from IRSDK DriverInfo.
 * Filters out the pace car and produces a clean array of driver objects
 * ready for SOF calculation and client consumption.
 *
 * IRSDK DriverInfo.Drivers[] typically contains one entry per car_idx,
 * including pace car (UserID = -1 or CarIdx = 0 with CarIsPaceCar = 1)
 * and spectators (IsSpectator = 1).  We keep spectators and AI in the
 * output (flagged) but exclude the pace car entirely.
 *
 * Uses telemetry CarIdxTrackSurface (when available) to flag which
 * drivers are actually connected and in the world vs. just registered.
 * This is critical for Practice sessions where DriverInfo lists ALL
 * registered drivers for the time slot, not just those on track.
 *
 * CarIdxTrackSurface values (iRacing SDK irsdk_TrkLoc enum):
 *   -1 / "NotInWorld"     = registered but not connected / not loaded
 *    0 / "OffTrack"       = off the racing surface
 *    1 / "InPitStall"     = in pit stall
 *    2 / "AproachingPits" = approaching pits
 *    3 / "OnTrack"        = on the racing surface
 * node-irsdk-2023 may return raw integers OR strings depending on version.
 *
 * Fallback signals (when CarIdxTrackSurface is unreliable):
 *   CarIdxLapCompleted > 0  = car has driven laps → definitely in world
 *   CarIdxLapDistPct > 0    = car is somewhere on track → in world
 *   CarIdxEstTime > 0       = car has estimated time → in world
 *
 * Output per driver:
 *   {
 *     car_idx, user_id, user_name, irating, license,
 *     lic_level, lic_sub_level, car_number, car_name,
 *     car_class_id, is_spectator, is_ai, in_world,
 *     club_name, division, incidents
 *   }
 */

'use strict';

/**
 * Parse the DriverInfo section of IRSDK SessionInfo data.
 *
 * @param {object|null} data - The parsed SessionInfo object (sessionInfo.data)
 * @param {object|null} telemetry - telemetry.values from node-irsdk (optional)
 * @returns {Array<object>} Array of normalised driver objects
 */
function parseDrivers(data, telemetry) {
  if (!data || !data.DriverInfo || !data.DriverInfo.Drivers) {
    return [];
  }

  const rawDrivers = data.DriverInfo.Drivers;

  // CarIdxTrackSurface: array indexed by car_idx
  // iRacing SDK returns integers: -1=NotInWorld, 0=OffTrack, 1=InPitStall,
  // 2=AproachingPits, 3=OnTrack.  Some node-irsdk versions may convert these
  // to strings ("NotInWorld", "OnTrack", etc.) — we handle both.
  const trackSurface = (telemetry && telemetry.CarIdxTrackSurface)
    ? telemetry.CarIdxTrackSurface : null;

  // Fallback signals: if CarIdxTrackSurface is unreliable (all -1 despite
  // being in an active session), use secondary telemetry arrays to detect
  // drivers who are clearly in the world.
  const lapCompleted = (telemetry && telemetry.CarIdxLapCompleted)
    ? telemetry.CarIdxLapCompleted : null;
  const lapDistPct = (telemetry && telemetry.CarIdxLapDistPct)
    ? telemetry.CarIdxLapDistPct : null;
  const estTime = (telemetry && telemetry.CarIdxEstTime)
    ? telemetry.CarIdxEstTime : null;

  const results = [];

  for (const d of rawDrivers) {
    // ------------------------------------------------------------------
    // Filter: skip the pace car
    // ------------------------------------------------------------------
    if (isPaceCar(d)) {
      continue;
    }

    const carIdx = toInt(d.CarIdx, -1);

    // Determine if driver is actually in the world (connected & loaded).
    // Primary: CarIdxTrackSurface (most reliable when available)
    // Fallback: CarIdxLapCompleted > 0 or CarIdxLapDistPct > 0 means
    // the car HAS driven — it's definitely in the world even if
    // CarIdxTrackSurface says otherwise.
    let inWorld = true; // default true if no telemetry available yet
    if (trackSurface && carIdx >= 0 && carIdx < trackSurface.length) {
      const surface = trackSurface[carIdx];
      if (typeof surface === 'string') {
        inWorld = surface !== 'NotInWorld';
      } else if (typeof surface === 'number') {
        inWorld = surface >= 0; // -1 = NotInWorld, 0+ = in world
      }

      // Fallback: override NotInWorld if other telemetry proves the car
      // is active (has completed laps or is somewhere on the track).
      // This handles edge cases where CarIdxTrackSurface is stale or
      // unreliable (e.g. bridge started mid-session, replay mode quirks).
      if (!inWorld && carIdx >= 0) {
        if (lapCompleted && carIdx < lapCompleted.length && lapCompleted[carIdx] > 0) {
          inWorld = true;
        } else if (lapDistPct && carIdx < lapDistPct.length &&
                   lapDistPct[carIdx] > 0 && lapDistPct[carIdx] <= 1) {
          inWorld = true;
        } else if (estTime && carIdx < estTime.length && estTime[carIdx] > 0) {
          inWorld = true;
        }
      }
    }

    results.push({
      car_idx: carIdx,
      user_id: toInt(d.UserID, 0),
      user_name: d.UserName || d.AbbrevName || 'Unknown',
      irating: toInt(d.IRating, 0),
      license: buildLicenseString(d),
      lic_level: toInt(d.LicLevel, 0),
      lic_sub_level: toInt(d.LicSubLevel, 0),
      car_number: String(d.CarNumber !== undefined ? d.CarNumber : d.CarNumberRaw || ''),
      car_name: d.CarScreenName || d.CarScreenNameShort || d.CarPath || '',
      car_class_id: toInt(d.CarClassID, 0),
      is_spectator: toBool(d.IsSpectator),
      is_ai: toBool(d.CarIsAI),
      in_world: inWorld,
      club_name: d.ClubName || '',
      division: d.DivisionName || d.Division || '',
      incidents: toInt(d.CurDriverIncidentCount, 0),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a raw driver entry represents the pace car.
 * @param {object} d - Raw IRSDK driver entry
 * @returns {boolean}
 */
function isPaceCar(d) {
  // Explicit flag
  if (toBool(d.CarIsPaceCar)) return true;
  // UserID of -1 is the pace car in most IRSDK versions
  if (toInt(d.UserID, 0) < 0) return true;
  // Name-based fallback
  if (typeof d.UserName === 'string' && d.UserName.toLowerCase() === 'pace car') return true;
  return false;
}

/**
 * Build a human-readable license string (e.g. "B 3.45") from IRSDK fields.
 *
 * IRSDK provides LicString directly in some versions.  When absent we
 * reconstruct it from LicLevel and LicSubLevel.
 *
 * License level mapping (iRacing convention):
 *   1-4   = Rookie (R)
 *   5-8   = D
 *   9-12  = C
 *   13-16 = B
 *   17-20 = A
 *   21+   = Pro / Pro+
 *
 * LicSubLevel is an integer where, e.g., 345 means 3.45.
 *
 * @param {object} d - Raw IRSDK driver entry
 * @returns {string} e.g. "B 3.45"
 */
function buildLicenseString(d) {
  // Prefer the pre-built string when available
  if (d.LicString && typeof d.LicString === 'string' && d.LicString.trim()) {
    return d.LicString.trim();
  }

  const level = toInt(d.LicLevel, 0);
  const subLevel = toInt(d.LicSubLevel, 0);
  const classLetter = licLevelToClass(level);
  const srFormatted = (subLevel / 100).toFixed(2);

  return `${classLetter} ${srFormatted}`;
}

/**
 * Map a numeric license level to its class letter.
 * @param {number} level
 * @returns {string}
 */
function licLevelToClass(level) {
  if (level >= 21) return 'Pro';
  if (level >= 17) return 'A';
  if (level >= 13) return 'B';
  if (level >= 9) return 'C';
  if (level >= 5) return 'D';
  return 'R';
}

/**
 * Safely convert a value to an integer.
 * @param {*} val
 * @param {number} fallback
 * @returns {number}
 */
function toInt(val, fallback) {
  if (val === undefined || val === null) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Coerce a value to boolean.
 * @param {*} val
 * @returns {boolean}
 */
function toBool(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val === '1' || val.toLowerCase() === 'true';
  return false;
}

module.exports = parseDrivers;
