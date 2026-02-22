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
 * Output per driver:
 *   {
 *     car_idx, user_id, user_name, irating, license,
 *     lic_level, lic_sub_level, car_number, car_name,
 *     car_class_id, is_spectator, is_ai, club_name,
 *     division, incidents
 *   }
 */

'use strict';

/**
 * Parse the DriverInfo section of IRSDK SessionInfo data.
 *
 * @param {object|null} data - The parsed SessionInfo object (sessionInfo.data)
 * @returns {Array<object>} Array of normalised driver objects
 */
function parseDrivers(data) {
  if (!data || !data.DriverInfo || !data.DriverInfo.Drivers) {
    return [];
  }

  const rawDrivers = data.DriverInfo.Drivers;
  const results = [];

  for (const d of rawDrivers) {
    // ------------------------------------------------------------------
    // Filter: skip the pace car
    // The pace car is identifiable by several heuristics:
    //   - CarIsPaceCar === 1
    //   - UserName === "Pace Car"
    //   - UserID < 0  (typically -1)
    // ------------------------------------------------------------------
    if (isPaceCar(d)) {
      continue;
    }

    results.push({
      car_idx: toInt(d.CarIdx, -1),
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
