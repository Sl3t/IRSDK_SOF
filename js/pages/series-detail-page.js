/**
 * SeriesDetailPage — Series Detail Page Renderer
 * =================================================
 * Displays full detail for a single tracked series:
 *   - Series metadata (name, category, license, track, cars)
 *   - Configurable H-timestamp parameters (baseline & active polling offsets)
 *   - Table of upcoming race sessions with status, registration stats,
 *     and predictive SOF
 *   - Button to fetch sessions from iRacing race_guide
 *
 * Route: #series-detail/{series_id}
 *
 * Usage:
 *   SeriesDetailPage.render(seriesId);
 */

'use strict';

const SeriesDetailPage = (() => {

  /** Cached series data from API. */
  let _seriesData = null;

  /** Cached race sessions from API. */
  let _raceSessions = [];

  /** Fetching state. */
  let _fetching = false;

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Format a UTC date string for display.
   * @param {string} utcStr - ISO 8601 UTC string
   * @returns {string} Formatted local date/time
   */
  function _formatDateTime(utcStr) {
    if (!utcStr) return '--';
    try {
      const d = new Date(utcStr);
      return d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return utcStr;
    }
  }

  /**
   * Compute countdown to a target time.
   * @param {string} utcStr - ISO 8601 UTC string
   * @returns {string} e.g. "1h 23m", "15m", "LIVE", "Passed"
   */
  function _countdown(utcStr) {
    if (!utcStr) return '--';
    const diff = new Date(utcStr).getTime() - Date.now();
    if (diff <= -3600000) return 'Passed';
    if (diff <= 0) return 'LIVE';

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);

    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m`;
  }

  /**
   * Status badge color.
   * @param {string} status
   * @returns {{ bg: string, color: string }}
   */
  function _statusStyle(status) {
    switch (status) {
      case 'upcoming':           return { bg: 'var(--accent-cyan-dim)',   color: 'var(--accent-cyan)' };
      case 'baseline_collected': return { bg: 'var(--accent-orange-dim)', color: 'var(--accent-orange)' };
      case 'polling':            return { bg: 'var(--accent-green-dim)',  color: 'var(--accent-green)' };
      case 'completed':          return { bg: 'var(--bg-card)',           color: 'var(--text-muted)' };
      default:                   return { bg: 'var(--bg-card)',           color: 'var(--text-secondary)' };
    }
  }

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the series detail page.
   * @param {string|number} seriesId - iRacing series ID
   */
  async function render(seriesId) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    if (!seriesId) {
      appContainer.innerHTML = `
        <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);
                    color:var(--text-muted); font-family:var(--font-body);">
          No series ID provided. <a href="#series" style="color:var(--accent-cyan);">Back to Series</a>
        </div>`;
      return;
    }

    // Fetch series detail from API
    const result = await api.getSeriesDetail(seriesId);

    if (!result || !result.series) {
      appContainer.innerHTML = `
        <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);
                    color:var(--text-muted); font-family:var(--font-body);">
          Series ${seriesId} not found. <a href="#series" style="color:var(--accent-cyan);">Back to Series</a>
        </div>`;
      return;
    }

    _seriesData = result.series;
    _raceSessions = result.race_sessions || [];

    const s = _seriesData;
    const baselineOffset = s.baseline_offset_minutes ?? 120;
    const activeOffset = s.active_poll_offset_minutes ?? 20;
    const interval = s.race_interval_minutes || '--';

    // Build sessions table rows
    let sessionsHtml = '';
    if (_raceSessions.length > 0) {
      sessionsHtml = _raceSessions.map((rs) => {
        const st = _statusStyle(rs.status);
        const cd = _countdown(rs.race_start_utc);
        const cdColor = cd === 'LIVE' ? 'var(--accent-green)' :
                        cd === 'Passed' ? 'var(--text-muted)' : 'var(--accent-cyan)';
        const practiceCount = (rs.practice_session_ids && Array.isArray(rs.practice_session_ids))
            ? rs.practice_session_ids.length
            : (rs.practice_session_ids ? JSON.parse(rs.practice_session_ids || '[]').length : 0);

        return `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-primary);">
              ${_formatDateTime(rs.race_start_utc)}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;">
              <span style="font-family:var(--font-data); font-size:var(--text-sm);
                           color:${cdColor}; font-weight:var(--weight-bold);">
                ${cd}
              </span>
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;">
              <span style="background:${st.bg}; color:${st.color};
                           font-family:var(--font-data); font-size:var(--text-xs);
                           padding:2px 8px; border-radius:var(--radius-full);
                           text-transform:uppercase;">
                ${rs.status}
              </span>
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                       font-family:var(--font-data); font-size:var(--text-sm); color:var(--text-secondary);">
              ${rs.baseline_count || 0}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                       font-family:var(--font-data); font-size:var(--text-sm); color:var(--accent-cyan);">
              ${rs.newcomer_count || 0}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                       font-family:var(--font-data); font-size:var(--text-sm);
                       color:${rs.predictive_sof > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)'};
                       font-weight:var(--weight-bold);">
              ${rs.predictive_sof > 0 ? rs.predictive_sof.toLocaleString() : '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                       font-family:var(--font-data); font-size:var(--text-xs); color:var(--text-muted);">
              ${practiceCount > 0 ? practiceCount + ' practice(s)' : '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;">
              ${rs.session_id ? `<span style="font-family:var(--font-data); font-size:var(--text-xs); color:var(--text-muted);">
                #${rs.session_id}</span>` : '--'}
            </td>
          </tr>`;
      }).join('');
    } else {
      sessionsHtml = `
        <tr>
          <td colspan="8" style="text-align:center; padding:var(--spacing-lg);
                                  color:var(--text-muted); font-family:var(--font-body);">
            Aucune session. Cliquez "Fetch Sessions" pour charger depuis iRacing.
          </td>
        </tr>`;
    }

    const html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:var(--content-max-width); margin:0 auto;">

        <!-- Back link + Page header -->
        <div style="display:flex; align-items:center; gap:var(--spacing-md);
                    margin-bottom:var(--spacing-lg);">
          <a href="#series" style="color:var(--text-muted); font-family:var(--font-data);
                                   font-size:var(--text-sm); text-decoration:none;"
             onmouseenter="this.style.color='var(--accent-cyan)'"
             onmouseleave="this.style.color='var(--text-muted)'">&larr; Series</a>
          <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                     color:var(--text-primary); margin:0;
                     text-transform:uppercase; letter-spacing:0.08em; flex:1;">
            ${s.series_name || 'Series #' + seriesId}
          </h2>
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-muted);">ID: ${seriesId}</span>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Series Info -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Informations
          </h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
                      gap:var(--spacing-md);">
            ${_infoField('Catégorie', s.category || '--')}
            ${_infoField('Licence', s.license_group || '--')}
            ${_infoField('Circuit actuel', s.current_track || '--')}
            ${_infoField('Voitures', s.current_car_classes || '--')}
            ${_infoField('Intervalle courses', interval + ' min')}
            ${_infoField('SOF moyen', s.last_sof_avg ? s.last_sof_avg.toLocaleString() : '--')}
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Polling Parameters (H-Timestamps) -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Paramètres de polling
          </h4>
          <p style="font-family:var(--font-data); font-size:var(--text-xs);
                    color:var(--text-muted); margin:0 0 var(--spacing-md) 0;">
            Définissez quand capturer la liste initiale (baseline) et quand commencer à détecter les pilotes actifs.
          </p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-lg);">
            <!-- Baseline offset -->
            <div>
              <label style="font-family:var(--font-data); font-size:var(--text-xs);
                            color:var(--text-muted); text-transform:uppercase;
                            display:block; margin-bottom:4px;">
                H - Baseline (minutes avant course)
              </label>
              <div style="display:flex; align-items:center; gap:var(--spacing-sm);">
                <input type="number" id="sd-baseline-offset" value="${baselineOffset}" min="1" max="720"
                       style="width:100px; padding:var(--spacing-xs) var(--spacing-sm);
                              background:var(--bg-input); color:var(--text-primary);
                              border:1px solid var(--border); border-radius:var(--radius-md);
                              font-family:var(--font-data); font-size:var(--text-sm);
                              outline:none; box-sizing:border-box;
                              transition:border-color 150ms ease;"
                       onfocus="this.style.borderColor='var(--accent-cyan)'"
                       onblur="this.style.borderColor='var(--border)'" />
                <span style="font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-secondary);">
                  = H-${baselineOffset >= 60 ? Math.floor(baselineOffset / 60) + 'h' + (baselineOffset % 60 > 0 ? String(baselineOffset % 60).padStart(2, '0') : '') : baselineOffset + 'min'}
                </span>
              </div>
              <p style="font-family:var(--font-data); font-size:10px;
                        color:var(--text-muted); margin:4px 0 0 0;">
                Snapshot initial de tous les pilotes inscrits
              </p>
            </div>

            <!-- Active poll offset -->
            <div>
              <label style="font-family:var(--font-data); font-size:var(--text-xs);
                            color:var(--text-muted); text-transform:uppercase;
                            display:block; margin-bottom:4px;">
                H - Active Polling (minutes avant course)
              </label>
              <div style="display:flex; align-items:center; gap:var(--spacing-sm);">
                <input type="number" id="sd-active-offset" value="${activeOffset}" min="1" max="120"
                       style="width:100px; padding:var(--spacing-xs) var(--spacing-sm);
                              background:var(--bg-input); color:var(--text-primary);
                              border:1px solid var(--border); border-radius:var(--radius-md);
                              font-family:var(--font-data); font-size:var(--text-sm);
                              outline:none; box-sizing:border-box;
                              transition:border-color 150ms ease;"
                       onfocus="this.style.borderColor='var(--accent-cyan)'"
                       onblur="this.style.borderColor='var(--border)'" />
                <span style="font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-secondary);">
                  = H-${activeOffset}min
                </span>
              </div>
              <p style="font-family:var(--font-data); font-size:10px;
                        color:var(--text-muted); margin:4px 0 0 0;">
                Début du polling différentiel (tous les practices ouverts)
              </p>
            </div>
          </div>

          <!-- Save button -->
          <div style="margin-top:var(--spacing-md);">
            <button id="sd-save-params-btn" onclick="SeriesDetailPage.saveParams(${seriesId})"
                    style="padding:var(--spacing-xs) var(--spacing-md);
                           background:var(--accent-cyan-dim); color:var(--accent-cyan);
                           border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                           font-family:var(--font-data); font-size:var(--text-sm);
                           cursor:pointer; transition:all 150ms ease;">
              Sauvegarder
            </button>
            <span id="sd-save-result" style="margin-left:var(--spacing-sm);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-muted);"></span>
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Race Sessions -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <div style="display:flex; align-items:center; gap:var(--spacing-md);
                      margin-bottom:var(--spacing-md);">
            <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                       color:var(--accent-cyan); margin:0;
                       text-transform:uppercase; letter-spacing:0.08em; flex:1;">
              Sessions de course
            </h4>
            <button id="sd-fetch-btn" onclick="SeriesDetailPage.fetchSessions(${seriesId})"
                    style="padding:var(--spacing-xs) var(--spacing-md);
                           background:var(--accent-cyan-dim); color:var(--accent-cyan);
                           border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                           font-family:var(--font-data); font-size:var(--text-xs);
                           cursor:pointer; transition:all 150ms ease;">
              Fetch Sessions
            </button>
            <span id="sd-fetch-result" style="font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-muted);"></span>
            <span style="font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted);">
              ${_raceSessions.length} session(s)
            </span>
          </div>

          <!-- Sessions table -->
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:left;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Départ
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Countdown
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Statut
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Baseline
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Nouveaux
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    SOF Préd.
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Practices
                  </th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;
                             font-family:var(--font-data); font-size:var(--text-xs);
                             color:var(--text-muted); text-transform:uppercase;">
                    Session ID
                  </th>
                </tr>
              </thead>
              <tbody id="sd-sessions-body">
                ${sessionsHtml}
              </tbody>
            </table>
          </div>
        </div>

      </div>`;

    appContainer.innerHTML = html;
  }

  // =========================================================================
  // Helper: info field
  // =========================================================================

  function _infoField(label, value) {
    return `
      <div>
        <span style="font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted); text-transform:uppercase;
                     display:block; margin-bottom:2px;">${label}</span>
        <span style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-primary);">${value}</span>
      </div>`;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Save the H-timestamp parameters for this series.
   * @param {number} seriesId
   */
  async function saveParams(seriesId) {
    const baselineEl = document.getElementById('sd-baseline-offset');
    const activeEl = document.getElementById('sd-active-offset');
    const resultEl = document.getElementById('sd-save-result');

    if (!baselineEl || !activeEl) return;

    const baseline = parseInt(baselineEl.value, 10) || 120;
    const active = parseInt(activeEl.value, 10) || 20;

    if (resultEl) {
      resultEl.textContent = 'Saving...';
      resultEl.style.color = 'var(--accent-cyan)';
    }

    try {
      const result = await api.updateSeries(seriesId, {
        baseline_offset_minutes: baseline,
        active_poll_offset_minutes: active,
      });

      if (result && result.success) {
        if (resultEl) {
          resultEl.textContent = 'Sauvegardé !';
          resultEl.style.color = 'var(--accent-green)';
          setTimeout(() => { resultEl.textContent = ''; }, 3000);
        }
      } else {
        if (resultEl) {
          resultEl.textContent = result?.message || 'Erreur';
          resultEl.style.color = 'var(--accent-red)';
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Erreur: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    }
  }

  /**
   * Fetch upcoming race sessions from iRacing for this series.
   * @param {number} seriesId
   */
  async function fetchSessions(seriesId) {
    if (_fetching) return;
    _fetching = true;

    const btn = document.getElementById('sd-fetch-btn');
    const resultEl = document.getElementById('sd-fetch-result');

    if (btn) btn.textContent = 'Fetching...';
    if (resultEl) {
      resultEl.textContent = '';
      resultEl.style.color = 'var(--accent-cyan)';
    }

    try {
      const result = await api.fetchSeriesSessions(seriesId);

      if (result && result.success) {
        if (resultEl) {
          resultEl.textContent = `${result.inserted} ajoutée(s), ${result.updated} mise(s) à jour`;
          resultEl.style.color = 'var(--accent-green)';
        }
        // Reload the page to show updated sessions
        await render(seriesId);
      } else {
        if (resultEl) {
          resultEl.textContent = result?.message || 'Erreur';
          resultEl.style.color = 'var(--accent-red)';
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Erreur: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    } finally {
      _fetching = false;
      if (btn) btn.textContent = 'Fetch Sessions';
    }
  }

  return {
    render,
    saveParams,
    fetchSessions,
  };
})();
