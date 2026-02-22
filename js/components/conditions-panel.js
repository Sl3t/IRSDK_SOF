/**
 * ConditionsPanel Component
 * ==========================
 * Renders a grid of color-coded condition chips showing live track and weather
 * data from the IRSDK bridge.
 *
 * Chips: Track Temp, Air Temp, Grip State, Wetness, Weather, Wind, Humidity.
 *
 * Color coding:
 *   green  = optimal conditions
 *   yellow = marginal / caution
 *   red    = bad / dangerous
 *
 * Data contract (conditions object — matches bridge message track_conditions):
 *   {
 *     track_surface_temp_c,  air_temp_c,  track_wetness,
 *     weather_declared_wet,  dynamic_track, skies,
 *     weather_type, relative_humidity_pct, wind_speed_ms,
 *     wind_direction_rad, fog_level_pct
 *   }
 *
 * Usage:
 *   container.innerHTML = ConditionsPanel.render(conditions);
 *   ConditionsPanel.update(newConditions);   // live update without full re-render
 */

'use strict';

const ConditionsPanel = (() => {

  /** @type {string|null} DOM id of the conditions panel wrapper */
  const PANEL_ID = 'conditions-panel';

  // -------------------------------------------------------------------------
  // Evaluation logic — maps raw values to { display, level }
  // level: "good" | "warn" | "bad"
  // -------------------------------------------------------------------------

  /**
   * Evaluate track surface temperature.
   * Optimal: 20-35 C. Cold <15 = bad. Hot >40 = bad. In-between = warn.
   */
  function _evalTrackTemp(tempC) {
    if (tempC == null) return { display: '-- C', level: 'neutral' };
    const v = parseFloat(tempC);
    const display = v.toFixed(1) + ' C';
    if (v >= 20 && v <= 35)  return { display, level: 'good' };
    if (v < 15 || v > 40)    return { display, level: 'bad' };
    return { display, level: 'warn' };
  }

  /** Evaluate air temperature. Optimal: 15-30 C. */
  function _evalAirTemp(tempC) {
    if (tempC == null) return { display: '-- C', level: 'neutral' };
    const v = parseFloat(tempC);
    const display = v.toFixed(1) + ' C';
    if (v >= 15 && v <= 30) return { display, level: 'good' };
    if (v < 5 || v > 38)   return { display, level: 'bad' };
    return { display, level: 'warn' };
  }

  /** Evaluate grip / dynamic track state. */
  function _evalGrip(state) {
    if (!state) return { display: '--', level: 'neutral' };
    const s = state.toLowerCase().replace(/_/g, ' ');
    const display = s.charAt(0).toUpperCase() + s.slice(1);
    if (s.includes('heavily') || s.includes('high') || s.includes('optimal')) return { display, level: 'good' };
    if (s.includes('green') || s.includes('low'))    return { display, level: 'bad' };
    if (s.includes('moderate'))                        return { display, level: 'good' };
    return { display, level: 'warn' };
  }

  /** Evaluate wetness. dry = good, anything else is bad. */
  function _evalWetness(wetness, declaredWet) {
    if (!wetness) return { display: '--', level: 'neutral' };
    const s = wetness.toLowerCase();
    const display = s.charAt(0).toUpperCase() + s.slice(1);
    if (declaredWet) return { display: 'WET', level: 'bad' };
    if (s === 'dry') return { display, level: 'good' };
    if (s.includes('damp') || s.includes('slight')) return { display, level: 'warn' };
    return { display, level: 'bad' };
  }

  /** Evaluate sky / weather conditions. */
  function _evalWeather(skies, weatherType) {
    if (!skies) return { display: '--', level: 'neutral' };
    const s = skies.toLowerCase().replace(/_/g, ' ');
    const display = s.charAt(0).toUpperCase() + s.slice(1);
    if (s.includes('clear'))   return { display, level: 'good' };
    if (s.includes('partly'))  return { display, level: 'good' };
    if (s.includes('overcast')) return { display, level: 'warn' };
    if (s.includes('rain') || s.includes('storm')) return { display, level: 'bad' };
    return { display, level: 'warn' };
  }

  /** Evaluate wind speed (m/s). <3 = good, 3-8 = warn, >8 = bad. */
  function _evalWind(speedMs) {
    if (speedMs == null) return { display: '-- m/s', level: 'neutral' };
    const v = parseFloat(speedMs);
    const display = v.toFixed(1) + ' m/s';
    if (v < 3)  return { display, level: 'good' };
    if (v <= 8) return { display, level: 'warn' };
    return { display, level: 'bad' };
  }

  /** Evaluate humidity. 30-60% = good, else warn/bad. */
  function _evalHumidity(pct) {
    if (pct == null) return { display: '--%', level: 'neutral' };
    const v = parseFloat(pct);
    const display = Math.round(v) + '%';
    if (v >= 30 && v <= 60) return { display, level: 'good' };
    if (v > 80)             return { display, level: 'bad' };
    return { display, level: 'warn' };
  }

  // -------------------------------------------------------------------------
  // Chip rendering
  // -------------------------------------------------------------------------

  /** Map level to CSS color using design system tokens. */
  function _levelColor(level) {
    switch (level) {
      case 'good': return 'var(--accent-green)';
      case 'warn': return 'var(--accent-yellow)';
      case 'bad':  return 'var(--accent-red)';
      default:     return 'var(--text-muted)';
    }
  }

  /** Map level to background dim color. */
  function _levelBg(level) {
    switch (level) {
      case 'good': return 'var(--accent-green-dim)';
      case 'warn': return 'var(--accent-yellow-dim)';
      case 'bad':  return 'var(--accent-red-dim)';
      default:     return 'transparent';
    }
  }

  /**
   * Render a single condition chip.
   * @param {string} label - Chip label
   * @param {{ display: string, level: string }} evaluation
   * @param {string} dataKey - DOM data attribute for targeted updates
   * @returns {string} HTML
   */
  function _renderChip(label, evaluation, dataKey) {
    const color = _levelColor(evaluation.level);
    const bg    = _levelBg(evaluation.level);

    return `
      <div class="condition-chip" data-condition="${dataKey}"
           style="background:${bg}; border:1px solid ${color};
                  border-radius:var(--radius-md); padding:var(--spacing-xs) var(--spacing-sm);
                  display:flex; flex-direction:column; align-items:center;
                  gap:2px; min-width:90px;">
        <span style="font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-secondary); text-transform:uppercase;
                     letter-spacing:0.04em;">
          ${label}
        </span>
        <span class="data-value" style="font-family:var(--font-data);
                     font-size:var(--text-sm); font-weight:var(--weight-bold);
                     color:${color};">
          ${evaluation.display}
        </span>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Render the complete conditions panel as an HTML string.
   *
   * @param {object} conditions - Track conditions data from IRSDK bridge
   * @returns {string} HTML markup
   */
  function render(conditions) {
    const c = conditions || {};

    const trackTemp = _evalTrackTemp(c.track_surface_temp_c);
    const airTemp   = _evalAirTemp(c.air_temp_c);
    const grip      = _evalGrip(c.dynamic_track);
    const wetness   = _evalWetness(c.track_wetness, c.weather_declared_wet);
    const weather   = _evalWeather(c.skies, c.weather_type);
    const wind      = _evalWind(c.wind_speed_ms);
    const humidity  = _evalHumidity(c.relative_humidity_pct);

    return `
      <div id="${PANEL_ID}" class="card conditions-panel"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);">
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Track Conditions
        </h4>
        <div class="data-grid"
             style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);">
          ${_renderChip('Track Temp', trackTemp, 'track_temp')}
          ${_renderChip('Air Temp',   airTemp,   'air_temp')}
          ${_renderChip('Grip',       grip,      'grip')}
          ${_renderChip('Wetness',    wetness,   'wetness')}
          ${_renderChip('Weather',    weather,   'weather')}
          ${_renderChip('Wind',       wind,      'wind')}
          ${_renderChip('Humidity',   humidity,  'humidity')}
        </div>
      </div>
    `;
  }

  /**
   * Live-update the conditions panel without full re-render.
   * Finds existing chip elements by data-condition attribute and updates
   * their display text, color, and background.
   *
   * @param {object} conditions - Updated track conditions from IRSDK bridge
   */
  function update(conditions) {
    const c = conditions || {};

    const mapping = {
      track_temp: _evalTrackTemp(c.track_surface_temp_c),
      air_temp:   _evalAirTemp(c.air_temp_c),
      grip:       _evalGrip(c.dynamic_track),
      wetness:    _evalWetness(c.track_wetness, c.weather_declared_wet),
      weather:    _evalWeather(c.skies, c.weather_type),
      wind:       _evalWind(c.wind_speed_ms),
      humidity:   _evalHumidity(c.relative_humidity_pct),
    };

    for (const [key, eval_] of Object.entries(mapping)) {
      const chip = document.querySelector(`.condition-chip[data-condition="${key}"]`);
      if (!chip) continue;

      const color = _levelColor(eval_.level);
      const bg    = _levelBg(eval_.level);

      chip.style.background  = bg;
      chip.style.borderColor = color;

      const valueEl = chip.querySelector('.data-value');
      if (valueEl) {
        valueEl.textContent = eval_.display;
        valueEl.style.color = color;
      }
    }
  }

  return {
    render,
    update,
  };
})();
