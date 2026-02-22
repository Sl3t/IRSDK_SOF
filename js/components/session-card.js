/**
 * SessionCard Component
 * ======================
 * Renders a compact card for an active session (Practice, Qualifying, or Race).
 *
 * Shows a session type badge (cyan), driver count, quick SOF value, and a
 * mini GO/NOGO indicator. Clicking the card navigates to #session/{id}.
 *
 * Data contract (session object):
 *   {
 *     id,                       // internal session id or subsession_id
 *     session_type,             // "Practice" | "Qualifying" | "Race"
 *     series_name,
 *     track_name,
 *     driver_count,             // integer
 *     sof,                      // integer — Strength of Field
 *     decision_score,           // 0-100 or null
 *     decision                  // "GO" | "NOGO" | "NEUTRE" | null
 *   }
 *
 * Usage:
 *   container.innerHTML = SessionCard.render(sessionObj);
 */

'use strict';

const SessionCard = (() => {

  // -------------------------------------------------------------------------
  // Session type badge colors — all use cyan family per design spec
  // -------------------------------------------------------------------------

  const TYPE_STYLES = {
    'Practice':   { abbr: 'PRA', bg: 'var(--accent-cyan-dim)',   color: 'var(--accent-cyan)' },
    'Qualifying': { abbr: 'QUA', bg: 'var(--accent-cyan-dim)',   color: 'var(--accent-cyan)' },
    'Race':       { abbr: 'RCE', bg: 'var(--accent-cyan-dim)',   color: 'var(--accent-cyan)' },
  };

  // -------------------------------------------------------------------------
  // Decision indicator helpers
  // -------------------------------------------------------------------------

  /**
   * Map a decision string to visual properties.
   * @param {string|null} decision - "GO", "NOGO", "NEUTRE", or null
   * @param {number|null} score    - 0-100 percentage
   * @returns {{ label: string, color: string, glow: string }}
   */
  function _decisionStyle(decision, score) {
    if (decision === 'GO')    return { label: 'GO',    color: 'var(--accent-green)',  glow: 'var(--glow-green)' };
    if (decision === 'NOGO')  return { label: 'NO-GO', color: 'var(--accent-red)',    glow: 'var(--glow-red)' };
    if (decision === 'NEUTRE') return { label: 'NEU',  color: 'var(--accent-yellow)', glow: 'var(--glow-yellow)' };

    // Infer from score when decision string is not set
    if (score !== null && score !== undefined) {
      if (score >= 75) return { label: 'GO',    color: 'var(--accent-green)',  glow: 'var(--glow-green)' };
      if (score >= 50) return { label: 'NEU',   color: 'var(--accent-yellow)', glow: 'var(--glow-yellow)' };
      return                   { label: 'NO-GO', color: 'var(--accent-red)',    glow: 'var(--glow-red)' };
    }

    // No data
    return { label: '--', color: 'var(--text-muted)', glow: 'none' };
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render a session card as an HTML string.
   *
   * @param {object} session - Session data object
   * @returns {string} HTML markup
   */
  function render(session) {
    const s = session || {};
    const id          = s.id || s.iracing_subsession_id || 0;
    const sessionType = s.session_type || 'Practice';
    const series      = s.series_name || '';
    const track       = s.track_name || '';
    const drivers     = s.driver_count || 0;
    const sof         = s.sof || 0;
    const score       = s.decision_score != null ? s.decision_score : null;
    const decision    = s.decision || null;

    const typeStyle   = TYPE_STYLES[sessionType] || TYPE_STYLES['Practice'];
    const dec         = _decisionStyle(decision, score);

    return `
      <div class="card session-card" data-session-id="${id}"
           onclick="window.location.hash='#session/${id}';"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  display:flex; flex-direction:column; gap:var(--spacing-sm);
                  cursor:pointer;
                  transition:border-color var(--transition-fast), box-shadow var(--transition-fast);"
           onmouseenter="this.style.borderColor='var(--accent-cyan)'; this.style.boxShadow='var(--glow-cyan)';"
           onmouseleave="this.style.borderColor='var(--border)'; this.style.boxShadow='none';">

        <!-- Top row: type badge + series name -->
        <div style="display:flex; align-items:center; gap:var(--spacing-sm);">
          <span class="badge"
                style="background:${typeStyle.bg}; color:${typeStyle.color};
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:2px 8px; border-radius:var(--radius-full);
                       text-transform:uppercase; letter-spacing:0.06em;
                       font-weight:var(--weight-bold);">
            ${typeStyle.abbr}
          </span>
          <span style="color:var(--text-secondary); font-family:var(--font-body);
                       font-size:var(--text-xs); overflow:hidden;
                       text-overflow:ellipsis; white-space:nowrap; flex:1;">
            ${series}
          </span>
        </div>

        ${track ? `
        <div style="color:var(--text-primary); font-family:var(--font-body);
                    font-size:var(--text-sm); overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap;">
          ${track}
        </div>` : ''}

        <!-- Data row: drivers + SOF + mini GO/NOGO -->
        <div class="data-grid"
             style="display:flex; justify-content:space-between; align-items:flex-end;
                    margin-top:auto; padding-top:var(--spacing-xs);
                    border-top:1px solid var(--border);">

          <!-- Driver count -->
          <div style="text-align:center;">
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;
                         text-transform:uppercase;">Drivers</span>
            <span class="data-value"
                  style="color:var(--text-primary); font-family:var(--font-data);
                         font-size:var(--text-base); font-weight:var(--weight-bold);">
              ${drivers}
            </span>
          </div>

          <!-- SOF -->
          <div style="text-align:center;">
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;
                         text-transform:uppercase;">SOF</span>
            <span class="data-value"
                  style="color:var(--accent-cyan); font-family:var(--font-data);
                         font-size:var(--text-base); font-weight:var(--weight-bold);">
              ${sof > 0 ? sof.toLocaleString() : '--'}
            </span>
          </div>

          <!-- Mini GO/NOGO indicator -->
          <div style="text-align:center;">
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;
                         text-transform:uppercase;">Score</span>
            <span class="badge"
                  style="color:${dec.color}; font-family:var(--font-display);
                         font-size:var(--text-sm); font-weight:var(--weight-bold);
                         text-shadow:${dec.glow};">
              ${score !== null ? Math.round(score) + '%' : dec.label}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  return {
    render,
  };
})();
