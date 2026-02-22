/**
 * IRatingSimulator Component
 * ============================
 * Renders a table showing estimated iRating change for each possible
 * finishing position in the current session.
 *
 * Columns: Position | Delta iRating | New iRating
 *
 * Features:
 *   - Highlighted row for the user's estimated finishing position
 *   - Green text for positive deltas, red for negative
 *   - Includes a DNF row at the bottom
 *   - Uses an Elo-like approximation of the iRacing iRating formula
 *
 * Usage:
 *   container.innerHTML = IRatingSimulator.render(myIrating, sof, fieldSize);
 */

'use strict';

const IRatingSimulator = (() => {

  // -------------------------------------------------------------------------
  // iRating change estimation
  // -------------------------------------------------------------------------

  /**
   * Estimate iRating change for a given finishing position using an
   * Elo/Glicko-style approximation.
   *
   * iRacing uses a complex Elo variant where each driver is compared
   * pairwise against every other driver. This simplified model gives a
   * reasonable ballpark estimate.
   *
   * Expected score E = 1 / (1 + 10^((SOF - myIR) / 1600))
   * Actual score S(pos) = (N - pos) / (N - 1)  [1.0 for P1, 0.0 for last]
   * Delta = K * (S - E)
   *
   * K-factor scales with field size (more opponents = more change).
   *
   * @param {number} myIrating  - Current iRating
   * @param {number} sof        - Strength of Field
   * @param {number} fieldSize  - Total drivers
   * @param {number} position   - Finishing position (1-based)
   * @returns {number} Estimated iRating change (positive = gain, negative = loss)
   */
  function _estimateDelta(myIrating, sof, fieldSize, position) {
    if (fieldSize <= 1) return 0;

    // Expected score based on rating difference
    const expected = 1 / (1 + Math.pow(10, (sof - myIrating) / 1600));

    // Actual score: linear from 1.0 (P1) to 0.0 (last place)
    const actual = (fieldSize - position) / (fieldSize - 1);

    // K-factor: higher for larger fields, base ~60-80
    const kFactor = Math.round(40 + fieldSize * 1.5);

    return Math.round(kFactor * (actual - expected));
  }

  /**
   * Estimate the most likely finishing position based on iRating ranking.
   * @param {number} myIrating - Current iRating
   * @param {number} sof       - Strength of Field
   * @param {number} fieldSize - Total drivers
   * @returns {number} 1-based position estimate
   */
  function _estimatePosition(myIrating, sof, fieldSize) {
    if (fieldSize <= 0) return 1;
    // Rough estimate: if myIR == SOF, expect mid-field
    // Scale linearly around the midpoint
    const ratio = sof / (myIrating || 1);
    const midPos = fieldSize / 2;
    const estimated = Math.round(midPos * ratio);
    return Math.max(1, Math.min(fieldSize, estimated));
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the iRating simulator table as an HTML string.
   *
   * @param {number} myIrating - Current user iRating
   * @param {number} sof       - Strength of Field
   * @param {number} fieldSize - Number of drivers in the session
   * @returns {string} HTML markup
   */
  function render(myIrating, sof, fieldSize) {
    const ir   = myIrating || 0;
    const s    = sof || 0;
    const n    = fieldSize || 0;
    const estPos = _estimatePosition(ir, s, n);

    let rows = '';

    // Generate a row for each finishing position
    for (let pos = 1; pos <= n; pos++) {
      const delta    = _estimateDelta(ir, s, n, pos);
      const newIr    = ir + delta;
      const isEstRow = pos === estPos;

      const deltaColor = delta > 0
        ? 'var(--accent-green)'
        : delta < 0
          ? 'var(--accent-red)'
          : 'var(--text-secondary)';

      const deltaSign = delta > 0 ? '+' : '';
      const rowBg     = isEstRow ? 'var(--accent-cyan-dim)' : 'transparent';
      const rowBorder = isEstRow ? '1px solid var(--accent-cyan)' : 'none';

      rows += `
        <tr style="background:${rowBg}; border:${rowBorder};">
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-primary); text-align:center;">
            P${pos}${isEstRow ? ' *' : ''}
          </td>
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:${deltaColor}; text-align:center;
                     font-weight:var(--weight-bold);">
            ${deltaSign}${delta}
          </td>
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-primary); text-align:center;">
            ${newIr.toLocaleString()}
          </td>
        </tr>
      `;
    }

    // DNF row — assume last place minus penalty
    if (n > 0) {
      const dnfDelta = _estimateDelta(ir, s, n, n) - 15; // additional DNF penalty
      const dnfNew   = ir + dnfDelta;
      rows += `
        <tr style="background:var(--accent-red-dim); border-top:1px solid var(--border);">
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--accent-red); text-align:center;
                     font-weight:var(--weight-bold);">
            DNF
          </td>
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--accent-red); text-align:center;
                     font-weight:var(--weight-bold);">
            ${dnfDelta}
          </td>
          <td style="padding:var(--spacing-xs) var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--accent-red); text-align:center;">
            ${dnfNew.toLocaleString()}
          </td>
        </tr>
      `;
    }

    return `
      <div class="card irating-simulator"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  max-height:400px; overflow-y:auto;">
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          iRating Simulator
        </h4>

        <div style="font-family:var(--font-data); font-size:var(--text-xs);
                    color:var(--text-muted); margin-bottom:var(--spacing-sm);">
          Current iR: <span style="color:var(--text-primary);">${ir.toLocaleString()}</span>
          &nbsp;|&nbsp; SOF: <span style="color:var(--accent-cyan);">${s.toLocaleString()}</span>
          &nbsp;|&nbsp; Field: <span style="color:var(--text-primary);">${n}</span>
          &nbsp;|&nbsp; Est. position: <span style="color:var(--accent-cyan);">P${estPos}</span>
        </div>

        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="padding:var(--spacing-xs) var(--spacing-sm);
                         font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase;
                         text-align:center;">Position</th>
              <th style="padding:var(--spacing-xs) var(--spacing-sm);
                         font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase;
                         text-align:center;">Delta iR</th>
              <th style="padding:var(--spacing-xs) var(--spacing-sm);
                         font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase;
                         text-align:center;">New iR</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="color:var(--text-muted); text-align:center; padding:var(--spacing-md);">No session data</td></tr>'}
          </tbody>
        </table>

        <div style="font-family:var(--font-data); font-size:var(--text-xs);
                    color:var(--text-muted); margin-top:var(--spacing-sm);
                    font-style:italic;">
          * Estimated finishing position based on iRating comparison.
          Values are approximations based on Elo-style formula.
        </div>
      </div>
    `;
  }

  return {
    render,
  };
})();
