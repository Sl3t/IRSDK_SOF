/**
 * Conditions Parser
 * ==================
 * Extracts live track conditions and weather data from IRSDK telemetry
 * and session info.
 *
 * Some values come from telemetry (real-time floats updated every tick),
 * while others come from SessionInfo YAML (updated less frequently).
 * We merge both sources to produce a complete conditions snapshot.
 *
 * Output:
 *   {
 *     track_surface_temp_c, air_temp_c, track_wetness,
 *     weather_declared_wet, dynamic_track, skies, weather_type,
 *     air_density_kgm3, air_pressure_hg, relative_humidity_pct,
 *     fog_level_pct, wind_speed_ms, wind_direction_rad
 *   }
 */

'use strict';

/**
 * Parse track conditions from IRSDK telemetry values and session info.
 *
 * @param {object|null} telemetry - telemetry.values from node-irsdk
 * @param {object|null} sessionData - sessionInfo.data from node-irsdk
 * @returns {object} Normalised track conditions
 */
function parseConditions(telemetry, sessionData) {
  const empty = {
    track_surface_temp_c: null,
    air_temp_c: null,
    track_wetness: null,
    weather_declared_wet: false,
    dynamic_track: null,
    skies: null,
    weather_type: null,
    air_density_kgm3: null,
    air_pressure_hg: null,
    relative_humidity_pct: null,
    fog_level_pct: null,
    wind_speed_ms: null,
    wind_direction_rad: null,
  };

  if (!telemetry && !sessionData) {
    return empty;
  }

  // Telemetry values (real-time, high-frequency)
  const t = telemetry || {};

  // Session-level weather info (from YAML, updated less often)
  const weekend = (sessionData && sessionData.WeekendInfo) || {};
  const weekendOptions = weekend.WeekendOptions || {};

  return {
    // -- Primary conditions (telemetry) -----------------------------------
    track_surface_temp_c: toFloat(t.TrackTempCrew, t.TrackSurfaceTemp, null),
    air_temp_c: toFloat(t.AirTemp, null),
    track_wetness: parseTrackWetness(t.TrackWetness, sessionData),
    weather_declared_wet: toBool(t.WeatherDeclaredWet),

    // -- Dynamic track state ----------------------------------------------
    // DynamicTrack info may be in WeekendOptions or telemetry
    dynamic_track: parseDynamicTrack(t, weekendOptions),

    // -- Sky and weather type ---------------------------------------------
    skies: parseSkies(t.Skies, weekendOptions),
    weather_type: parseWeatherType(t.WeatherType, weekendOptions),

    // -- Atmospheric data -------------------------------------------------
    air_density_kgm3: toFloat(t.AirDensity, null),
    air_pressure_hg: toFloat(t.AirPressure, null),
    relative_humidity_pct: toFloat(t.RelativeHumidity, null),
    fog_level_pct: toFloat(t.FogLevel, null),

    // -- Wind -------------------------------------------------------------
    wind_speed_ms: toFloat(t.WindVel, null),
    wind_direction_rad: toFloat(t.WindDir, null),
  };
}

// ---------------------------------------------------------------------------
// Enum / label parsers
// ---------------------------------------------------------------------------

/**
 * Parse TrackWetness enum to a human-readable string.
 *
 * IRSDK TrackWetness values:
 *   0 = unknown, 1 = dry, 2 = mostly_dry, 3 = very_lightly_wet,
 *   4 = lightly_wet, 5 = moderately_wet, 6 = very_wet,
 *   7 = extremely_wet
 *
 * @param {*} raw - The telemetry value
 * @param {object|null} sessionData - Fallback from session info
 * @returns {string|null}
 */
function parseTrackWetness(raw, sessionData) {
  const map = {
    0: 'unknown',
    1: 'dry',
    2: 'mostly_dry',
    3: 'very_lightly_wet',
    4: 'lightly_wet',
    5: 'moderately_wet',
    6: 'very_wet',
    7: 'extremely_wet',
  };

  if (raw !== undefined && raw !== null) {
    return map[raw] || `unknown_${raw}`;
  }

  // Fallback: check session info
  if (sessionData && sessionData.WeekendInfo) {
    const w = sessionData.WeekendInfo.TrackWetness;
    if (w !== undefined && w !== null) {
      return map[w] || `unknown_${w}`;
    }
  }

  return null;
}

/**
 * Parse Skies enum to a human-readable string.
 *
 * IRSDK Skies values:
 *   0 = clear, 1 = partly_cloudy, 2 = mostly_cloudy, 3 = overcast
 *
 * @param {*} raw - Telemetry value
 * @param {object} weekendOptions - WeekendOptions from session info
 * @returns {string|null}
 */
function parseSkies(raw, weekendOptions) {
  const map = {
    0: 'clear',
    1: 'partly_cloudy',
    2: 'mostly_cloudy',
    3: 'overcast',
  };

  if (raw !== undefined && raw !== null) {
    return map[raw] || `unknown_${raw}`;
  }

  // Fallback from WeekendOptions.Skies (sometimes a string like "Partly Cloudy")
  if (weekendOptions && weekendOptions.Skies) {
    const s = String(weekendOptions.Skies).toLowerCase().replace(/\s+/g, '_');
    return s;
  }

  return null;
}

/**
 * Parse WeatherType enum.
 *   0 = constant, 1 = dynamic
 *
 * @param {*} raw
 * @param {object} weekendOptions
 * @returns {string|null}
 */
function parseWeatherType(raw, weekendOptions) {
  const map = {
    0: 'constant',
    1: 'dynamic',
  };

  if (raw !== undefined && raw !== null) {
    return map[raw] || `unknown_${raw}`;
  }

  if (weekendOptions && weekendOptions.WeatherType !== undefined) {
    const w = weekendOptions.WeatherType;
    return map[w] || String(w);
  }

  return null;
}

/**
 * Parse DynamicTrack information into a descriptive string.
 *
 * The WeekendOptions typically includes a "DynamicTrack" sub-object or string
 * with properties describing rubber buildup, marble cleanup, etc.
 * We normalise it to a simple descriptive string.
 *
 * @param {object} telemetry - Telemetry values
 * @param {object} weekendOptions - WeekendOptions from session info
 * @returns {string|null}
 */
function parseDynamicTrack(telemetry, weekendOptions) {
  // Telemetry may have TrackCleanup or TrackRubberState
  if (telemetry.TrackRubberState !== undefined) {
    return String(telemetry.TrackRubberState);
  }

  // Check WeekendOptions for DynamicTrack or related fields
  if (weekendOptions) {
    if (weekendOptions.DynamicTrack) {
      // Could be an object or a string
      if (typeof weekendOptions.DynamicTrack === 'string') {
        return weekendOptions.DynamicTrack;
      }
      // If it is an object, try to extract a meaningful summary
      const dt = weekendOptions.DynamicTrack;
      if (dt.DynamicTrackState !== undefined) {
        return String(dt.DynamicTrackState);
      }
    }
    // Some IRSDK versions put it in WeekendOptions directly
    if (weekendOptions.TrackCleanup !== undefined) {
      return `cleanup_${weekendOptions.TrackCleanup}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Return the first defined, non-null argument as a float, or the fallback.
 * Accepts a variable number of candidate values; the last argument is the
 * fallback if none of the candidates are valid.
 *
 * @param  {...*} args - Candidate values followed by fallback
 * @returns {number|null}
 */
function toFloat(...args) {
  const fallback = args[args.length - 1] === null ? null : args[args.length - 1];
  for (let i = 0; i < args.length - 1; i++) {
    const v = args[i];
    if (v !== undefined && v !== null) {
      const n = parseFloat(v);
      if (!isNaN(n)) return Math.round(n * 1000) / 1000; // 3 decimal places
    }
  }
  return fallback;
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

module.exports = parseConditions;
