/**
 * DriverProfile Component
 * ========================
 * Full driver profile display component showing iRating, license,
 * track experience, danger score, recent race results, and tagging controls.
 *
 * Features:
 *   - Header with name, iRating (large Orbitron), colored license badge
 *   - Track experience section: best quali, avg pace, consistency, incidents
 *   - Experience score gauge (0-100) + danger score gauge (0-100)
 *   - Recent races table with iRating change color-coded green/red
 *   - Tag dropdown (propre/dangereux/ami/neutre) + notes textarea
 *   - Save tag/notes button
 *
 * Usage:
 *   container.innerHTML = DriverProfile.render(driver, trackStats, recentRaces);
 */

'use strict';

const DriverProfile = (() => {

  // -------------------------------------------------------------------------
  // License color mapping
  // -------------------------------------------------------------------------

  const LICENSE_COLORS = {
    'A': '#3B82F6',
    'B': '#00FF00',
    'C': '#FFFF00',
    'D': '#FF8C00',
    'R': '#B45309',
    'P': '#A855F7',
  };

  /**
   * Get the CSS color for a license class letter.
   * @param {string} lic - License string (e.g. "B 3.54")
   * @returns {string} CSS color
   */
  function _licColor(lic) {
    if (!lic) return 'var(--text-secondary)';
    const cls = lic.charAt(0).toUpperCase();
    return LICENSE_COLORS[cls] || 'var(--text-secondary)';
  }

  /**
   * Color-code a gauge score (0-100).
   * @param {number} score
   * @param {boolean} invert - If true, high = red (for danger)
   * @returns {string} CSS color
   */
  function _gaugeColor(score, invert) {
    if (score == null) return 'var(--text-muted)';
    if (invert) {
      if (score > 70) return 'var(--accent-red)';
      if (score >= 40) return 'var(--accent-yellow)';
      return 'var(--accent-green)';
    }
    if (score > 70) return 'var(--accent-green)';
    if (score >= 40) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  }

  /**
   * Render a mini horizontal gauge bar (0-100).
   * @param {string} label
   * @param {number|null} score
   * @param {boolean} invert
   * @returns {string} HTML
   */
  function _renderGauge(label, score, invert) {
    const val = score != null ? Math.round(score) : 0;
    const color = _gaugeColor(val, invert);
    const width = score != null ? val : 0;

    return `
      <div style="margin-bottom:var(--spacing-sm);">
        <div style="display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:4px;">
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-secondary); text-transform:uppercase;">
            ${label}
          </span>
          <span style="font-family:var(--font-data); font-size:var(--text-sm);
                       color:${color}; font-weight:var(--weight-bold);">
            ${score != null ? val : '--'}
          </span>
        </div>
        <div style="height:8px; background:var(--bg-input); border-radius:var(--radius-full);
                    overflow:hidden; border:1px solid var(--border);">
          <div style="height:100%; width:${width}%; background:${color};
                      border-radius:var(--radius-full); box-shadow:0 0 6px ${color};
                      transition:width 300ms ease;"></div>
        </div>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the full driver profile as an HTML string.
   *
   * @param {object} driver - Driver data object
   *   { user_id, user_name, irating, license, club, division,
   *     track_experience_score, danger_score }
   * @param {object|null} trackStats - Track-specific statistics
   *   { best_quali_time, avg_pace, consistency, avg_incidents,
   *     best_finish, avg_finish, total_races, dnf_count }
   * @param {Array|null} recentRaces - Array of recent race objects
   *   [{ date, series, track, position, irating_change, incidents }]
   * @returns {string} HTML markup
   */
  function render(driver, trackStats, recentRaces) {
    const d = driver || {};
    const ts = trackStats || null;
    const races = Array.isArray(recentRaces) ? recentRaces : [];

    const irating = d.irating || d.iRating || 0;
    const license = d.license || '--';
    const licClr = _licColor(license);
    const name = d.user_name || d.name || 'Unknown Driver';
    const club = d.club || '--';
    const division = d.division || '--';
    const xpScore = d.track_experience_score != null ? Math.round(d.track_experience_score) : null;
    const dangerScore = d.danger_score != null ? Math.round(d.danger_score) : null;

    // Saved tag and notes from localStorage
    const savedTag = storage.get(`driver_tag_${d.user_id}`, 'neutre');
    const savedNotes = storage.get(`driver_notes_${d.user_id}`, '');

    // ----- Header -----
    let html = `
      <div class="card driver-profile animate-fade-in"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-lg); padding:var(--spacing-xl);">

        <!-- Profile Header -->
        <div style="display:flex; flex-wrap:wrap; align-items:flex-start;
                    gap:var(--spacing-lg); margin-bottom:var(--spacing-lg);
                    padding-bottom:var(--spacing-lg); border-bottom:1px solid var(--border);">

          <!-- Name and metadata -->
          <div style="flex:1; min-width:200px;">
            <h2 style="font-family:var(--font-body); font-size:var(--text-xl);
                       color:var(--text-primary); margin:0 0 var(--spacing-xs) 0;
                       font-weight:var(--weight-bold);">
              ${name}
            </h2>
            <div style="display:flex; gap:var(--spacing-sm); flex-wrap:wrap;
                        align-items:center;">
              <span style="background:rgba(${_licColorRgb(licClr)}, 0.15);
                           color:${licClr}; font-family:var(--font-data);
                           font-size:var(--text-xs); padding:2px 10px;
                           border-radius:var(--radius-full);
                           font-weight:var(--weight-bold);">
                ${license}
              </span>
              <span style="color:var(--text-secondary); font-family:var(--font-data);
                           font-size:var(--text-xs);">
                Club: ${club}
              </span>
              <span style="color:var(--text-secondary); font-family:var(--font-data);
                           font-size:var(--text-xs);">
                Division: ${division}
              </span>
            </div>
          </div>

          <!-- Big iRating display -->
          <div style="text-align:center; min-width:120px;">
            <span style="font-family:var(--font-display); font-size:var(--text-4xl);
                         color:var(--accent-cyan); font-weight:var(--weight-bold);
                         text-shadow:0 0 16px rgba(0,191,255,0.4);
                         line-height:var(--leading-tight); display:block;">
              ${irating > 0 ? irating.toLocaleString() : '--'}
            </span>
            <span style="font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase;">
              iRating
            </span>
          </div>
        </div>`;

    // ----- Gauges Row -----
    html += `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-lg);
                    margin-bottom:var(--spacing-lg);">
          <div>${_renderGauge('Experience Score', xpScore, false)}</div>
          <div>${_renderGauge('Danger Score', dangerScore, true)}</div>
        </div>`;

    // ----- Track Experience Section -----
    if (ts) {
      const bestQuali = ts.best_quali_time
        ? (typeof formatters !== 'undefined' ? formatters.formatLapTime(ts.best_quali_time) : ts.best_quali_time.toFixed(3))
        : '--';
      const avgPace = ts.avg_pace
        ? (typeof formatters !== 'undefined' ? formatters.formatLapTime(ts.avg_pace) : ts.avg_pace.toFixed(3))
        : '--';
      const consistency = ts.consistency != null ? `\u00B1${ts.consistency.toFixed(1)}s` : '--';
      const avgInc = ts.avg_incidents != null ? ts.avg_incidents.toFixed(1) : '--';
      const bestFinish = ts.best_finish || '--';
      const avgFinish = ts.avg_finish != null ? ts.avg_finish.toFixed(1) : '--';
      const totalRaces = ts.total_races || 0;
      const dnfCount = ts.dnf_count || 0;
      const dnfRate = totalRaces > 0 ? ((dnfCount / totalRaces) * 100).toFixed(0) + '%' : '--';

      html += `
        <div style="margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Track Experience
          </h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));
                      gap:var(--spacing-sm);">
            ${_statChip('Best Quali', bestQuali)}
            ${_statChip('Avg Pace', avgPace)}
            ${_statChip('Consistency', consistency)}
            ${_statChip('Avg Inc', avgInc)}
            ${_statChip('Best Finish', 'P' + bestFinish)}
            ${_statChip('Avg Finish', 'P' + avgFinish)}
            ${_statChip('Races', totalRaces)}
            ${_statChip('DNF Rate', dnfRate)}
          </div>
        </div>`;
    }

    // ----- Recent Races Table -----
    if (races.length > 0) {
      let raceRows = '';
      races.forEach((r) => {
        const delta = r.irating_change || 0;
        const deltaColor = delta > 0 ? 'var(--accent-green)' : delta < 0 ? 'var(--accent-red)' : 'var(--text-secondary)';
        const deltaSign = delta > 0 ? '+' : '';
        const date = r.date || '--';
        const series = r.series || '--';
        const track = r.track || '--';
        const pos = r.position || '--';
        const inc = r.incidents != null ? r.incidents : '--';

        raceRows += `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-secondary);">${date}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-primary);
                       max-width:150px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">${series}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-secondary);
                       max-width:150px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">${track}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-primary);
                       text-align:center;">P${pos}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:${deltaColor};
                       text-align:center; font-weight:var(--weight-bold);">
              ${deltaSign}${delta}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-secondary);
                       text-align:center;">${inc}x</td>
          </tr>`;
      });

      html += `
        <div style="margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Recent Races
          </h4>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border);">
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:left;">Date</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:left;">Series</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:left;">Track</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:center;">Pos</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:center;">iR +/-</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:center;">Inc</th>
                </tr>
              </thead>
              <tbody>
                ${raceRows}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    // ----- Tags & Notes Section -----
    html += `
        <div style="padding-top:var(--spacing-lg); border-top:1px solid var(--border);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Tags & Notes
          </h4>
          <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                      align-items:flex-end;">
            <div style="flex:0 0 180px;">
              <label style="font-family:var(--font-data); font-size:var(--text-xs);
                            color:var(--text-secondary); text-transform:uppercase;
                            display:block; margin-bottom:4px;">Tag</label>
              <select id="driver-tag-select"
                      style="width:100%; padding:var(--spacing-xs) var(--spacing-sm);
                             background:var(--bg-input); color:var(--text-primary);
                             border:1px solid var(--border); border-radius:var(--radius-md);
                             font-family:var(--font-data); font-size:var(--text-sm);
                             outline:none;">
                <option value="neutre"     ${savedTag === 'neutre'     ? 'selected' : ''}>Neutre</option>
                <option value="propre"     ${savedTag === 'propre'     ? 'selected' : ''}>Propre</option>
                <option value="dangereux"  ${savedTag === 'dangereux'  ? 'selected' : ''}>Dangereux</option>
                <option value="ami"        ${savedTag === 'ami'        ? 'selected' : ''}>Ami</option>
              </select>
            </div>
            <div style="flex:1; min-width:200px;">
              <label style="font-family:var(--font-data); font-size:var(--text-xs);
                            color:var(--text-secondary); text-transform:uppercase;
                            display:block; margin-bottom:4px;">Notes</label>
              <textarea id="driver-notes-input" rows="2"
                        style="width:100%; padding:var(--spacing-xs) var(--spacing-sm);
                               background:var(--bg-input); color:var(--text-primary);
                               border:1px solid var(--border); border-radius:var(--radius-md);
                               font-family:var(--font-body); font-size:var(--text-sm);
                               resize:vertical; outline:none;"
                        placeholder="Personal notes about this driver...">${savedNotes}</textarea>
            </div>
            <button id="driver-save-tags-btn"
                    onclick="DriverProfile.saveTagsAndNotes(${d.user_id || 0})"
                    style="padding:var(--spacing-xs) var(--spacing-md);
                           background:var(--accent-cyan-dim); color:var(--accent-cyan);
                           border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                           font-family:var(--font-data); font-size:var(--text-sm);
                           cursor:pointer; white-space:nowrap;
                           transition:background 150ms ease;">
              Save
            </button>
          </div>
        </div>

      </div>`;

    return html;
  }

  // -------------------------------------------------------------------------
  // Helper: stat chip for track experience grid
  // -------------------------------------------------------------------------

  /**
   * Render a small stat chip with label and value.
   * @param {string} label
   * @param {string|number} value
   * @returns {string} HTML
   */
  function _statChip(label, value) {
    return `
      <div style="background:var(--bg-input); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-xs) var(--spacing-sm);
                  text-align:center;">
        <span style="font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted); text-transform:uppercase;
                     display:block; margin-bottom:2px;">${label}</span>
        <span style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-primary); font-weight:var(--weight-bold);">
          ${value}
        </span>
      </div>`;
  }

  /**
   * Convert a hex color to an rgb triplet string for rgba() usage.
   * @param {string} color
   * @returns {string} e.g. "59, 130, 246"
   */
  function _licColorRgb(color) {
    if (color.startsWith('var(')) return '128, 128, 128';
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `${r}, ${g}, ${b}`;
  }

  // -------------------------------------------------------------------------
  // Save tags and notes
  // -------------------------------------------------------------------------

  /**
   * Save the selected tag and notes for a driver to localStorage.
   * @param {number} driverId - The driver's iRacing user ID
   */
  function saveTagsAndNotes(driverId) {
    const tagSelect = document.getElementById('driver-tag-select');
    const notesInput = document.getElementById('driver-notes-input');

    if (tagSelect) {
      storage.set(`driver_tag_${driverId}`, tagSelect.value);
    }
    if (notesInput) {
      storage.set(`driver_notes_${driverId}`, notesInput.value);
    }

    // Visual feedback: flash the save button
    const btn = document.getElementById('driver-save-tags-btn');
    if (btn) {
      btn.textContent = 'Saved!';
      btn.style.background = 'var(--accent-green-dim)';
      btn.style.color = 'var(--accent-green)';
      btn.style.borderColor = 'var(--accent-green)';
      setTimeout(() => {
        btn.textContent = 'Save';
        btn.style.background = 'var(--accent-cyan-dim)';
        btn.style.color = 'var(--accent-cyan)';
        btn.style.borderColor = 'var(--accent-cyan)';
      }, 1500);
    }
  }

  return {
    render,
    saveTagsAndNotes,
  };
})();
