/**
 * SOFGauge Component
 * ===================
 * Large visual display of the Strength of Field for a session.
 *
 * Shows:
 *   - SOF value as a prominent number (Orbitron font)
 *   - Driver count
 *   - Min / Max iRating range
 *   - A linear scale bar with a position marker for "my iRating"
 *
 * Data contract (sofData — matches bridge message sof section):
 *   {
 *     value,            // integer — average SOF
 *     driver_count,     // integer
 *     min_irating,      // integer
 *     max_irating,      // integer
 *     median_irating    // integer
 *   }
 *
 * Usage:
 *   container.innerHTML = SOFGauge.render(sofData, myIrating);
 */

'use strict';

const SOFGauge = (() => {

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Clamp a value between min and max.
   * @param {number} val
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Determine the SOF color based on ratio of SOF to my iRating.
   * Green when SOF is lower (favourable), red when higher (unfavourable).
   * @param {number} sof
   * @param {number} myIr
   * @returns {string} CSS color
   */
  function _sofColor(sof, myIr) {
    if (!myIr || !sof) return 'var(--accent-cyan)';
    const ratio = sof / myIr;
    if (ratio < 0.90) return 'var(--accent-green)';
    if (ratio <= 1.10) return 'var(--accent-cyan)';
    if (ratio <= 1.25) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the SOF gauge as an HTML string.
   *
   * @param {object} sofData  - SOF statistics object
   * @param {number} myIrating - The user's current iRating
   * @returns {string} HTML markup
   */
  function render(sofData, myIrating) {
    const d       = sofData || {};
    const sof     = d.value || 0;
    const count   = d.driver_count || 0;
    const minIr   = d.min_irating || 0;
    const maxIr   = d.max_irating || 0;
    const median  = d.median_irating || 0;
    const myIr    = myIrating || 0;

    const color = _sofColor(sof, myIr);

    // Calculate position of "my iRating" on the min-max scale (0-100%)
    const range = maxIr - minIr;
    let myPosition = 50; // default center
    if (range > 0 && myIr > 0) {
      myPosition = _clamp(((myIr - minIr) / range) * 100, 2, 98);
    }

    // Calculate SOF position on the scale
    let sofPosition = 50;
    if (range > 0 && sof > 0) {
      sofPosition = _clamp(((sof - minIr) / range) * 100, 2, 98);
    }

    return `
      <div class="card gauge sof-gauge"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  text-align:center;">

        <!-- Section title -->
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Strength of Field
        </h4>

        <!-- Big SOF number -->
        <div style="margin-bottom:var(--spacing-xs);">
          <span style="font-family:var(--font-display); font-size:var(--text-5xl);
                       color:${color}; font-weight:var(--weight-bold);
                       line-height:var(--leading-tight);
                       text-shadow:0 0 16px ${color};">
            ${sof > 0 ? sof.toLocaleString() : '--'}
          </span>
        </div>

        <!-- Driver count + median -->
        <div class="data-grid"
             style="display:flex; justify-content:center; gap:var(--spacing-lg);
                    margin-bottom:var(--spacing-md);">
          <div>
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;
                         text-transform:uppercase;">Drivers</span>
            <span class="data-value" style="color:var(--text-primary);
                         font-family:var(--font-data); font-size:var(--text-lg);
                         font-weight:var(--weight-bold);">${count}</span>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;
                         text-transform:uppercase;">Median</span>
            <span class="data-value" style="color:var(--text-primary);
                         font-family:var(--font-data); font-size:var(--text-lg);
                         font-weight:var(--weight-bold);">
              ${median > 0 ? median.toLocaleString() : '--'}
            </span>
          </div>
        </div>

        <!-- iRating scale bar -->
        <div style="position:relative; margin:0 auto; max-width:400px;">

          <!-- Min / Max labels -->
          <div style="display:flex; justify-content:space-between;
                      font-family:var(--font-data); font-size:var(--text-xs);
                      color:var(--text-muted); margin-bottom:4px;">
            <span>${minIr > 0 ? minIr.toLocaleString() : '0'}</span>
            <span>${maxIr > 0 ? maxIr.toLocaleString() : '0'}</span>
          </div>

          <!-- Scale track -->
          <div style="position:relative; height:12px; background:var(--bg-input);
                      border:1px solid var(--border); border-radius:var(--radius-full);
                      overflow:visible;">

            <!-- SOF marker (vertical line) -->
            <div style="position:absolute; top:-2px; bottom:-2px; width:2px;
                        background:var(--accent-cyan); left:${sofPosition}%;
                        transform:translateX(-50%); border-radius:1px;
                        box-shadow:0 0 6px var(--accent-cyan);"
                 title="SOF: ${sof}"></div>

            ${myIr > 0 ? `
            <!-- My iRating marker (triangle + dot) -->
            <div style="position:absolute; top:-8px; left:${myPosition}%;
                        transform:translateX(-50%);"
                 title="My iRating: ${myIr}">
              <div style="width:0; height:0;
                          border-left:5px solid transparent;
                          border-right:5px solid transparent;
                          border-top:6px solid var(--accent-green);
                          margin:0 auto;"></div>
              <div style="width:4px; height:16px; background:var(--accent-green);
                          margin:0 auto; border-radius:1px;
                          box-shadow:0 0 6px var(--accent-green);"></div>
            </div>` : ''}
          </div>

          <!-- Legend below the scale -->
          <div style="display:flex; justify-content:center; gap:var(--spacing-md);
                      margin-top:var(--spacing-sm); font-family:var(--font-data);
                      font-size:var(--text-xs); color:var(--text-secondary);">
            <span>
              <span style="display:inline-block; width:8px; height:8px;
                           background:var(--accent-cyan); border-radius:var(--radius-full);
                           margin-right:4px; vertical-align:middle;"></span>
              SOF
            </span>
            ${myIr > 0 ? `
            <span>
              <span style="display:inline-block; width:8px; height:8px;
                           background:var(--accent-green); border-radius:var(--radius-full);
                           margin-right:4px; vertical-align:middle;"></span>
              My iR (${myIr.toLocaleString()})
            </span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  return {
    render,
  };
})();
