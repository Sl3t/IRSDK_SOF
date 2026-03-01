/**
 * DriverGrid Component
 * =====================
 * Sortable table of all drivers in the current session.
 *
 * Columns: #, Name, iRating, License, Car, Track XP (score/100), Danger (score/100)
 *
 * Features:
 *   - Sortable by clicking column headers
 *   - iRating color-coded relative to user's iRating:
 *       green  = lower than mine (favourable)
 *       red    = higher than mine (stronger opponent)
 *       white  = within +/- 200 (similar)
 *   - Row click navigates to #driver/{id}
 *
 * Data contract (drivers — array):
 *   [
 *     {
 *       user_id, user_name, irating, license,
 *       car_name, car_number,
 *       track_experience_score,  // 0-100 or null
 *       danger_score             // 0-100 or null
 *     }, ...
 *   ]
 *
 * Usage:
 *   container.innerHTML = DriverGrid.render(drivers, myIrating);
 *   DriverGrid.sort('irating', 'desc');
 */

'use strict';

const DriverGrid = (() => {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** @type {Array} Cached driver data */
  let _drivers = [];

  /** @type {number} User's iRating for comparison coloring */
  let _myIrating = 0;

  /** @type {string} Current sort column key */
  let _sortColumn = 'irating';

  /** @type {string} Current sort direction: 'asc' | 'desc' */
  let _sortDirection = 'desc';

  /** @type {HTMLElement|null} Container for re-rendering */
  let _container = null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Color-code an iRating relative to the user's own.
   * @param {number} ir - Driver's iRating
   * @param {number} myIr - User's iRating
   * @returns {string} CSS color value
   */
  function _irColor(ir, myIr) {
    if (!myIr) return 'var(--text-primary)';
    const diff = ir - myIr;
    if (Math.abs(diff) <= 200) return 'var(--text-primary)';
    return diff < 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  }

  /**
   * Color-code a 0-100 score. Higher track XP is green, higher danger is red.
   * @param {number|null} score
   * @param {boolean} invertColors - When true, higher = red (for danger)
   * @returns {string} CSS color
   */
  function _scoreColor(score, invertColors) {
    if (score == null) return 'var(--text-muted)';
    const threshold = invertColors ? (s) => {
      if (s > 70) return 'var(--accent-red)';
      if (s >= 40) return 'var(--accent-yellow)';
      return 'var(--accent-green)';
    } : (s) => {
      if (s > 70) return 'var(--accent-green)';
      if (s >= 40) return 'var(--accent-yellow)';
      return 'var(--accent-red)';
    };
    return threshold(score);
  }

  /**
   * Get the license class color from a license string (e.g. "B 3.45").
   * @param {string} lic
   * @returns {string} CSS color
   */
  function _licColor(lic) {
    if (!lic) return 'var(--text-secondary)';
    const cls = lic.charAt(0).toUpperCase();
    switch (cls) {
      case 'A': return '#3B82F6';
      case 'B': return '#00FF00';
      case 'C': return '#FFFF00';
      case 'D': return '#FF8C00';
      case 'R': return '#B45309';
      case 'P': return '#A855F7';
      default:  return 'var(--text-secondary)';
    }
  }

  /**
   * Sort the driver list by the specified column.
   * @param {Array} drivers
   * @param {string} column
   * @param {string} direction
   * @returns {Array} Sorted copy
   */
  function _sortDrivers(drivers, column, direction) {
    const sorted = [...drivers];
    const mult = direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let va = a[column];
      let vb = b[column];

      // Handle null/undefined
      if (va == null) va = column === 'user_name' ? '' : -1;
      if (vb == null) vb = column === 'user_name' ? '' : -1;

      // String comparison for name
      if (typeof va === 'string' && typeof vb === 'string') {
        return mult * va.localeCompare(vb);
      }

      // Numeric comparison
      return mult * ((va || 0) - (vb || 0));
    });

    return sorted;
  }

  // -------------------------------------------------------------------------
  // Sort indicator
  // -------------------------------------------------------------------------

  function _sortArrow(column) {
    if (column !== _sortColumn) return '';
    return _sortDirection === 'asc' ? ' &#9650;' : ' &#9660;';
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Build the table HTML for the driver grid.
   * @returns {string} HTML table markup
   */
  function _buildTable() {
    const sorted = _sortDrivers(_drivers, _sortColumn, _sortDirection);

    const headerStyle = `
      padding:3px var(--spacing-sm);
      font-family:var(--font-data); font-size:var(--text-xs);
      color:var(--text-muted); text-transform:uppercase;
      cursor:pointer; user-select:none; white-space:nowrap;
      border-bottom:1px solid var(--border); text-align:left;
      line-height:1.2;
    `;

    const cellStyle = `
      padding:2px var(--spacing-sm);
      font-family:var(--font-data); font-size:var(--text-sm);
      border-bottom:1px solid var(--border); white-space:nowrap;
      line-height:1.3;
    `;

    let rows = '';
    sorted.forEach((d, i) => {
      const xpScore     = d.track_experience_score != null ? Math.round(d.track_experience_score) : null;
      const dangerScore = d.danger_score != null ? Math.round(d.danger_score) : null;

      rows += `
        <tr class="driver-row" data-driver-id="${d.user_id}"
            style="cursor:pointer; transition:background var(--transition-fast);"
            onclick="window.location.hash='#driver/${d.user_id}';"
            onmouseenter="this.style.background='var(--bg-card-hover)';"
            onmouseleave="this.style.background='transparent';">
          <td style="${cellStyle} color:var(--text-muted); text-align:center; width:30px;">
            ${i + 1}
          </td>
          <td style="${cellStyle} color:var(--text-primary);">
            ${d.user_name || 'Unknown'}
          </td>
          <td style="${cellStyle} color:${_irColor(d.irating, _myIrating)};
                     font-weight:var(--weight-bold); text-align:right;">
            ${(d.irating || 0).toLocaleString()}
          </td>
          <td style="${cellStyle} text-align:center;">
            <span style="color:${_licColor(d.license)}; font-weight:var(--weight-semibold);">
              ${d.license || '--'}
            </span>
          </td>
          <td style="${cellStyle} color:var(--text-secondary); max-width:150px;
                     overflow:hidden; text-overflow:ellipsis;">
            ${d.car_name || '--'}
          </td>
          <td style="${cellStyle} text-align:center;">
            <span style="color:${_scoreColor(xpScore, false)};
                         font-weight:var(--weight-bold);">
              ${xpScore !== null ? xpScore : '--'}
            </span>
          </td>
          <td style="${cellStyle} text-align:center;">
            <span style="color:${_scoreColor(dangerScore, true)};
                         font-weight:var(--weight-bold);">
              ${dangerScore !== null ? dangerScore : '--'}
            </span>
          </td>
        </tr>
      `;
    });

    return `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="${headerStyle} text-align:center; width:30px;"
                onclick="DriverGrid.sort('car_number');">#${_sortArrow('car_number')}</th>
            <th style="${headerStyle}"
                onclick="DriverGrid.sort('user_name');">Name${_sortArrow('user_name')}</th>
            <th style="${headerStyle} text-align:right;"
                onclick="DriverGrid.sort('irating');">iRating${_sortArrow('irating')}</th>
            <th style="${headerStyle} text-align:center;"
                onclick="DriverGrid.sort('license');">License${_sortArrow('license')}</th>
            <th style="${headerStyle}"
                onclick="DriverGrid.sort('car_name');">Car${_sortArrow('car_name')}</th>
            <th style="${headerStyle} text-align:center;"
                onclick="DriverGrid.sort('track_experience_score');">Track XP${_sortArrow('track_experience_score')}</th>
            <th style="${headerStyle} text-align:center;"
                onclick="DriverGrid.sort('danger_score');">Danger${_sortArrow('danger_score')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" style="color:var(--text-muted); text-align:center; padding:var(--spacing-lg);">No drivers in session</td></tr>'}
        </tbody>
      </table>
    `;
  }

  /**
   * Render the complete driver grid component as an HTML string.
   * Also stores the data internally for subsequent sort operations.
   *
   * @param {Array}  drivers   - Array of driver objects
   * @param {number} myIrating - User's current iRating for comparison
   * @returns {string} HTML markup
   */
  function render(drivers, myIrating) {
    _drivers   = Array.isArray(drivers) ? drivers : [];
    _myIrating = myIrating || 0;

    return `
      <div class="card driver-grid" id="driver-grid"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  overflow-x:auto;">
        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Drivers (${_drivers.length})
        </h4>
        <div id="driver-grid-table">
          ${_buildTable()}
        </div>
      </div>
    `;
  }

  /**
   * Re-sort the grid by a column and re-render the table in place.
   *
   * @param {string} column    - Column key to sort by
   * @param {string} [direction] - 'asc' or 'desc'. If omitted, toggles current.
   */
  function sort(column, direction) {
    if (column === _sortColumn && !direction) {
      _sortDirection = _sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      _sortColumn = column;
      _sortDirection = direction || 'desc';
    }

    const tableContainer = document.getElementById('driver-grid-table');
    if (tableContainer) {
      tableContainer.innerHTML = _buildTable();
    }
  }

  /**
   * Update the grid data and re-render the table in place (no full DOM rebuild).
   * Used by the smart-refresh path to avoid screen flicker.
   *
   * @param {Array}  drivers   - Updated driver list
   * @param {number} myIrating - User's current iRating
   */
  function refresh(drivers, myIrating) {
    _drivers   = Array.isArray(drivers) ? drivers : [];
    _myIrating = myIrating || 0;

    // Update the header count
    const gridEl = document.getElementById('driver-grid');
    if (gridEl) {
      const header = gridEl.querySelector('h4');
      if (header) {
        header.textContent = `Drivers (${_drivers.length})`;
      }
    }

    // Re-render the table body
    const tableContainer = document.getElementById('driver-grid-table');
    if (tableContainer) {
      tableContainer.innerHTML = _buildTable();
    }
  }

  return {
    render,
    sort,
    refresh,
  };
})();
