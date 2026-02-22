/**
 * CriteriaDetail Component
 * =========================
 * Renders an expandable panel showing each decision criterion with its
 * individual score, weight, and explanation.
 *
 * For each criterion: name, score bar (0-100%), weight badge, explanation text.
 * Score bars are color-coded:
 *   >70  => green
 *   50-70 => yellow
 *   <50  => red
 *
 * Data contract (criteria — array of criterion objects):
 *   [
 *     {
 *       key,            // e.g. "sof_ratio"
 *       name,           // e.g. "SOF vs iRating"
 *       score,          // 0-100
 *       weight,         // 0-100 (percentage weight)
 *       explanation     // string describing the score reasoning
 *     },
 *     ...
 *   ]
 *
 * Usage:
 *   container.innerHTML = CriteriaDetail.render(criteriaArray);
 */

'use strict';

const CriteriaDetail = (() => {

  // -------------------------------------------------------------------------
  // Human-readable criterion names (fallback when name is not in data)
  // -------------------------------------------------------------------------

  const CRITERIA_LABELS = {
    sof_ratio:         'SOF vs iRating',
    position_estimate: 'Estimated Position',
    irating_gain:      'iRating Gain Probability',
    field_quality:     'Field Quality (Track XP)',
    danger_score:      'Field Danger Score',
    track_conditions:  'Track Conditions',
    safety_rating:     'Safety Rating',
    participant_count: 'Participant Count',
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Determine the bar color for a given score.
   * @param {number} score - 0 to 100
   * @returns {string} CSS color
   */
  function _barColor(score) {
    if (score > 70) return 'var(--accent-green)';
    if (score >= 50) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  }

  /**
   * Determine the dim background for a given score.
   * @param {number} score - 0 to 100
   * @returns {string} CSS color
   */
  function _barBg(score) {
    if (score > 70) return 'var(--accent-green-dim)';
    if (score >= 50) return 'var(--accent-yellow-dim)';
    return 'var(--accent-red-dim)';
  }

  /**
   * Render a single criterion row.
   * @param {object} criterion - { key, name, score, weight, explanation }
   * @param {number} index - Row index for collapse/expand targeting
   * @returns {string} HTML string
   */
  function _renderCriterion(criterion, index) {
    const c       = criterion || {};
    const key     = c.key || `criterion_${index}`;
    const name    = c.name || CRITERIA_LABELS[c.key] || key;
    const score   = c.score != null ? Math.round(c.score) : 0;
    const weight  = c.weight != null ? c.weight : 0;
    const explain = c.explanation || '';

    const color   = _barColor(score);
    const bgDim   = _barBg(score);

    return `
      <div class="criteria-detail__row" data-criterion="${key}"
           style="border-bottom:1px solid var(--border); padding:var(--spacing-sm) 0;">

        <!-- Main row: name + bar + score + weight badge -->
        <div style="display:flex; align-items:center; gap:var(--spacing-sm);
                    cursor:pointer;"
             onclick="this.parentElement.querySelector('.criteria-detail__explanation').classList.toggle('criteria-detail__explanation--visible');">

          <!-- Criterion name -->
          <span style="flex:0 0 180px; font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-primary);
                       overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${name}
          </span>

          <!-- Score bar -->
          <div class="score-bar"
               style="flex:1; height:10px; background:var(--bg-input);
                      border-radius:var(--radius-full); overflow:hidden;
                      border:1px solid var(--border); min-width:80px;">
            <div style="height:100%; width:${score}%;
                        background:${color}; border-radius:var(--radius-full);
                        box-shadow:0 0 4px ${color};
                        transition:width var(--transition-normal);"></div>
          </div>

          <!-- Score value -->
          <span class="data-value"
                style="flex:0 0 40px; text-align:right;
                       font-family:var(--font-data); font-size:var(--text-sm);
                       font-weight:var(--weight-bold); color:${color};">
            ${score}%
          </span>

          <!-- Weight badge -->
          <span class="badge"
                style="flex:0 0 36px; text-align:center;
                       background:${bgDim}; color:var(--text-secondary);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:2px 6px; border-radius:var(--radius-full);
                       border:1px solid var(--border);">
            ${weight}%
          </span>

          <!-- Expand chevron -->
          <span style="flex:0 0 16px; color:var(--text-muted); font-size:var(--text-xs);
                       transition:transform var(--transition-fast);">
            &#9662;
          </span>
        </div>

        <!-- Explanation (collapsed by default) -->
        <div class="criteria-detail__explanation"
             style="max-height:0; overflow:hidden; transition:max-height var(--transition-normal);
                    padding-left:calc(180px + var(--spacing-sm));">
          <p style="font-family:var(--font-body); font-size:var(--text-xs);
                    color:var(--text-secondary); margin:var(--spacing-xs) 0 0 0;
                    line-height:var(--leading-normal);">
            ${explain}
          </p>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Render the criteria detail panel as an HTML string.
   *
   * @param {Array} criteria - Array of criterion objects
   * @returns {string} HTML markup
   */
  function render(criteria) {
    const items = Array.isArray(criteria) ? criteria : [];

    // Sort by weight descending so most important criteria appear first
    const sorted = [...items].sort((a, b) => (b.weight || 0) - (a.weight || 0));

    const rows = sorted.map((c, i) => _renderCriterion(c, i)).join('');

    return `
      <div class="card criteria-detail"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);">
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Decision Criteria
        </h4>

        <!-- Legend row -->
        <div style="display:flex; align-items:center; gap:var(--spacing-sm);
                    margin-bottom:var(--spacing-sm); padding-bottom:var(--spacing-xs);
                    border-bottom:1px solid var(--border);">
          <span style="flex:0 0 180px; font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-muted);
                       text-transform:uppercase;">Criterion</span>
          <span style="flex:1; font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-muted);
                       text-transform:uppercase;">Score</span>
          <span style="flex:0 0 40px; text-align:right; font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-muted);
                       text-transform:uppercase;">%</span>
          <span style="flex:0 0 36px; text-align:center; font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-muted);
                       text-transform:uppercase;">Wt</span>
          <span style="flex:0 0 16px;"></span>
        </div>

        ${rows || '<p style="color:var(--text-muted); font-size:var(--text-sm);">No criteria data available.</p>'}
      </div>

      <!-- Inline style for the expand/collapse toggle -->
      <style>
        .criteria-detail__explanation--visible {
          max-height: 100px !important;
          padding-bottom: var(--spacing-xs);
        }
      </style>
    `;
  }

  return {
    render,
  };
})();
