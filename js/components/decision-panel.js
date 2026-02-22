/**
 * DecisionPanel Component
 * ========================
 * THE main component — renders the GO / NEUTRE / NO-GO recommendation.
 *
 * Features:
 *   - Large score percentage in Orbitron font, color-coded green/yellow/red
 *   - Decision label text: "GO", "NEUTRE", or "NO-GO"
 *   - Glowing border matching the decision color
 *   - Optional explanation text
 *
 * Data contract (decision object):
 *   {
 *     score,          // number 0-100
 *     decision,       // "GO" | "NEUTRE" | "NOGO"
 *     explanation      // string (optional — summary text)
 *   }
 *
 * Default thresholds:
 *   >= 75  => GO     (green)
 *   50-74  => NEUTRE (yellow)
 *   < 50   => NO-GO  (red)
 *
 * Usage:
 *   container.innerHTML = DecisionPanel.render(decisionObj);
 */

'use strict';

const DecisionPanel = (() => {

  // -------------------------------------------------------------------------
  // Decision visual mapping
  // -------------------------------------------------------------------------

  /**
   * Resolve visual properties from a decision object.
   * @param {object} dec - Decision data
   * @returns {{ label: string, color: string, glow: string, bgDim: string }}
   */
  function _resolveStyle(dec) {
    const score = dec.score != null ? dec.score : null;
    let label   = dec.decision || null;

    // Derive label from score if not explicitly provided
    if (!label && score !== null) {
      if (score >= 75) label = 'GO';
      else if (score >= 50) label = 'NEUTRE';
      else label = 'NOGO';
    }

    switch (label) {
      case 'GO':
        return {
          label:  'GO',
          color:  'var(--accent-green)',
          glow:   'var(--glow-green)',
          bgDim:  'var(--accent-green-dim)',
        };
      case 'NEUTRE':
        return {
          label:  'NEUTRE',
          color:  'var(--accent-yellow)',
          glow:   'var(--glow-yellow)',
          bgDim:  'var(--accent-yellow-dim)',
        };
      case 'NOGO':
        return {
          label:  'NO-GO',
          color:  'var(--accent-red)',
          glow:   'var(--glow-red)',
          bgDim:  'var(--accent-red-dim)',
        };
      default:
        return {
          label:  '--',
          color:  'var(--text-muted)',
          glow:   'none',
          bgDim:  'transparent',
        };
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the decision panel as an HTML string.
   *
   * @param {object} decision - Decision data from the decision engine
   * @returns {string} HTML markup
   */
  function render(decision) {
    const d     = decision || {};
    const score = d.score != null ? Math.round(d.score) : null;
    const style = _resolveStyle(d);
    const explanation = d.explanation || '';

    // Build the score progress arc as a simple linear bar
    const barWidth = score !== null ? score : 0;

    return `
      <div class="card decision-panel"
           style="background:${style.bgDim}; border:2px solid ${style.color};
                  border-radius:var(--radius-lg); padding:var(--spacing-xl) var(--spacing-lg);
                  text-align:center;
                  box-shadow:${style.glow}, inset 0 0 30px ${style.bgDim};
                  transition:border-color var(--transition-normal),
                             box-shadow var(--transition-normal),
                             background var(--transition-normal);">

        <!-- Section title -->
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--text-secondary); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.10em;">
          Recommendation
        </h4>

        <!-- Decision label -->
        <div style="margin-bottom:var(--spacing-xs);">
          <span style="font-family:var(--font-display); font-size:var(--text-3xl);
                       color:${style.color}; font-weight:var(--weight-bold);
                       text-transform:uppercase; letter-spacing:0.15em;
                       text-shadow:0 0 20px ${style.color};">
            ${style.label}
          </span>
        </div>

        <!-- Large score percentage -->
        <div style="margin-bottom:var(--spacing-md);">
          <span style="font-family:var(--font-display); font-size:var(--text-5xl);
                       color:${style.color}; font-weight:var(--weight-bold);
                       line-height:var(--leading-tight);
                       text-shadow:0 0 24px ${style.color};">
            ${score !== null ? score + '%' : '--'}
          </span>
        </div>

        <!-- Score bar -->
        <div style="position:relative; height:8px; max-width:320px; margin:0 auto
                    var(--spacing-md) auto; background:var(--bg-input);
                    border-radius:var(--radius-full); overflow:hidden;
                    border:1px solid var(--border);">
          <div style="height:100%; width:${barWidth}%;
                      background:${style.color};
                      border-radius:var(--radius-full);
                      box-shadow:0 0 8px ${style.color};
                      transition:width var(--transition-normal);"></div>
        </div>

        ${explanation ? `
        <!-- Explanation text -->
        <div style="margin-top:var(--spacing-md); padding-top:var(--spacing-sm);
                    border-top:1px solid var(--border);">
          <p style="font-family:var(--font-body); font-size:var(--text-sm);
                    color:var(--text-secondary); margin:0; line-height:var(--leading-normal);">
            ${explanation}
          </p>
        </div>` : ''}
      </div>
    `;
  }

  return {
    render,
  };
})();
