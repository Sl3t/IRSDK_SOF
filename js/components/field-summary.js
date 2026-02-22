/**
 * FieldSummary Component
 * =======================
 * Renders a summary panel analysing the composition and quality of the field.
 *
 * Data grid showing:
 *   - % experienced on track, % novices
 *   - Average danger score, average quali pace
 *   - Alert badges: count of tagged "dangereux" (red), "ami" (cyan)
 *   - Overall field quality indicator (text + color)
 *
 * Usage:
 *   container.innerHTML = FieldSummary.render(drivers, fieldAnalysis);
 */

'use strict';

const FieldSummary = (() => {

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Determine the field quality level from average iRating.
   * @param {number} avgIR
   * @returns {{ label: string, color: string }}
   */
  function _fieldQuality(avgIR) {
    if (avgIR >= 3000) return { label: 'Elite',    color: 'var(--accent-purple)' };
    if (avgIR >= 2500) return { label: 'Strong',   color: 'var(--accent-green)' };
    if (avgIR >= 2000) return { label: 'Good',     color: 'var(--accent-cyan)' };
    if (avgIR >= 1500) return { label: 'Average',  color: 'var(--accent-yellow)' };
    if (avgIR >= 1000) return { label: 'Below Average', color: 'var(--accent-orange)' };
    return { label: 'Weak', color: 'var(--accent-red)' };
  }

  /**
   * Count drivers with a specific tag in localStorage.
   * @param {Array} drivers - Driver list
   * @param {string} tag - Tag value to match (e.g. "dangereux", "ami")
   * @returns {number} Count of matching drivers
   */
  function _countTagged(drivers, tag) {
    if (!Array.isArray(drivers)) return 0;
    let count = 0;
    drivers.forEach((d) => {
      const id = d.user_id || d.id || 0;
      const saved = storage.get(`driver_tag_${id}`, 'neutre');
      if (saved === tag) count++;
    });
    return count;
  }

  /**
   * Render a stat box for the data grid.
   * @param {string} label
   * @param {string|number} value
   * @param {string} [color='var(--text-primary)']
   * @returns {string} HTML
   */
  function _statBox(label, value, color) {
    const c = color || 'var(--text-primary)';
    return `
      <div style="background:var(--bg-input); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-sm);
                  text-align:center; min-width:100px;">
        <span style="font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted); text-transform:uppercase;
                     display:block; margin-bottom:2px;">
          ${label}
        </span>
        <span style="font-family:var(--font-data); font-size:var(--text-lg);
                     color:${c}; font-weight:var(--weight-bold);">
          ${value}
        </span>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the field summary panel as an HTML string.
   *
   * @param {Array} drivers - Array of driver objects in the session
   * @param {object|null} fieldAnalysis - Optional pre-computed analysis object
   *   { pct_experienced, pct_novices, avg_danger_score, avg_quali_pace }
   * @returns {string} HTML markup
   */
  function render(drivers, fieldAnalysis) {
    const drvs = Array.isArray(drivers) ? drivers : [];
    const fa = fieldAnalysis || {};

    // Extract iRatings for calculations
    const iratings = drvs
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    const total = iratings.length;
    const avgIR = total > 0 ? Math.round(iratings.reduce((s, v) => s + v, 0) / total) : 0;

    // Experienced: iRating >= 2000 (or from fieldAnalysis)
    const experiencedCount = fa.pct_experienced != null
      ? Math.round(fa.pct_experienced * total / 100)
      : iratings.filter((ir) => ir >= 2000).length;
    const pctExperienced = total > 0 ? Math.round((experiencedCount / total) * 100) : 0;

    // Novices: iRating < 1200 (or from fieldAnalysis)
    const noviceCount = fa.pct_novices != null
      ? Math.round(fa.pct_novices * total / 100)
      : iratings.filter((ir) => ir < 1200).length;
    const pctNovices = total > 0 ? Math.round((noviceCount / total) * 100) : 0;

    // Average danger score (from drivers or analysis)
    const dangerScores = drvs
      .map((d) => d.danger_score)
      .filter((s) => s != null);
    const avgDanger = fa.avg_danger_score != null
      ? Math.round(fa.avg_danger_score)
      : (dangerScores.length > 0
        ? Math.round(dangerScores.reduce((s, v) => s + v, 0) / dangerScores.length)
        : null);

    // Average quali pace (from analysis)
    const avgQualiPace = fa.avg_quali_pace
      ? (typeof formatters !== 'undefined' ? formatters.formatLapTime(fa.avg_quali_pace) : fa.avg_quali_pace.toFixed(3))
      : '--';

    // Tagged driver counts
    const dangerCount = _countTagged(drvs, 'dangereux');
    const amiCount = _countTagged(drvs, 'ami');

    // Field quality label
    const quality = _fieldQuality(avgIR);

    // Danger color
    const dangerColor = avgDanger != null
      ? (avgDanger > 60 ? 'var(--accent-red)' : avgDanger > 35 ? 'var(--accent-yellow)' : 'var(--accent-green)')
      : 'var(--text-muted)';

    return `
      <div class="card field-summary"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);">

        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Field Summary
        </h4>

        <!-- Data grid -->
        <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                    margin-bottom:var(--spacing-md);">
          ${_statBox('Experienced', pctExperienced + '%', 'var(--accent-green)')}
          ${_statBox('Novices', pctNovices + '%', 'var(--accent-orange)')}
          ${_statBox('Avg Danger', avgDanger != null ? avgDanger : '--', dangerColor)}
          ${_statBox('Avg Quali', avgQualiPace, 'var(--accent-cyan)')}
        </div>

        <!-- Alert badges and quality indicator -->
        <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                    align-items:center;">

          <!-- Tagged dangerous drivers -->
          ${dangerCount > 0 ? `
          <span style="background:var(--accent-red-dim); color:var(--accent-red);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:3px 10px; border-radius:var(--radius-full);
                       border:1px solid var(--accent-red);
                       font-weight:var(--weight-bold);">
            ${dangerCount} dangereux
          </span>` : ''}

          <!-- Tagged ami drivers -->
          ${amiCount > 0 ? `
          <span style="background:var(--accent-cyan-dim); color:var(--accent-cyan);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:3px 10px; border-radius:var(--radius-full);
                       border:1px solid var(--accent-cyan);
                       font-weight:var(--weight-bold);">
            ${amiCount} ami
          </span>` : ''}

          <!-- Spacer -->
          <span style="flex:1;"></span>

          <!-- Field quality indicator -->
          <span style="font-family:var(--font-display); font-size:var(--text-sm);
                       color:${quality.color}; font-weight:var(--weight-bold);
                       text-transform:uppercase; letter-spacing:0.06em;">
            ${quality.label} Field
          </span>
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-secondary);">
            (avg ${avgIR > 0 ? avgIR.toLocaleString() : '--'} iR)
          </span>
        </div>
      </div>`;
  }

  return {
    render,
  };
})();
