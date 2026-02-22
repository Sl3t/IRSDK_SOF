/**
 * HistoryPage — Session History Page Renderer
 * ==============================================
 * Displays a paginated, filterable table of past session analyses.
 * Users can filter by series and date range, and click a row to
 * navigate to the session detail page.
 *
 * Layout:
 *   - Filter bar: series dropdown + date range inputs
 *   - Table: date, series, track, SOF, decision (GO/NOGO badge), score %, result
 *   - Pagination controls
 *   - Click row -> navigate to #session/{id}
 *
 * Usage:
 *   HistoryPage.render();  // Writes directly into #app container
 */

'use strict';

const HistoryPage = (() => {

  /** Number of rows per page. */
  const PAGE_SIZE = 20;

  /** Current page number (0-based). */
  let _currentPage = 0;

  /** Current series filter (empty = all). */
  let _seriesFilter = '';

  /** Date range filters. */
  let _dateFrom = '';
  let _dateTo = '';

  /** Cached history data from API. */
  let _allHistory = [];

  // =========================================================================
  // Filter and pagination
  // =========================================================================

  /**
   * Filter the history based on current filters.
   * @returns {Array} Filtered array
   */
  function _getFiltered() {
    let filtered = [..._allHistory];

    if (_seriesFilter) {
      filtered = filtered.filter((h) =>
        (h.series_name || '').toLowerCase().includes(_seriesFilter.toLowerCase())
      );
    }

    if (_dateFrom) {
      const from = new Date(_dateFrom);
      filtered = filtered.filter((h) => new Date(h.date || h.created_at) >= from);
    }

    if (_dateTo) {
      const to = new Date(_dateTo);
      to.setHours(23, 59, 59); // Include the full day
      filtered = filtered.filter((h) => new Date(h.date || h.created_at) <= to);
    }

    return filtered;
  }

  /**
   * Get the current page slice from filtered data.
   * @returns {{ rows: Array, total: number, totalPages: number }}
   */
  function _getPageData() {
    const filtered = _getFiltered();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = _currentPage * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);
    return { rows, total, totalPages };
  }

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the history page into the #app container.
   */
  async function render() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Fetch history from API
    const data = await api.getSessionHistory({ limit: 200, offset: 0 });
    _allHistory = Array.isArray(data) ? data : (data?.sessions || data?.history || []);

    // Extract unique series names for the dropdown
    const seriesNames = [...new Set(_allHistory.map((h) => h.series_name).filter(Boolean))].sort();

    // Get page data
    const { rows, total, totalPages } = _getPageData();

    // Build series dropdown options
    let seriesOptions = '<option value="">All Series</option>';
    seriesNames.forEach((name) => {
      const selected = name === _seriesFilter ? 'selected' : '';
      seriesOptions += `<option value="${name}" ${selected}>${name}</option>`;
    });

    // Build table rows
    let tableRows = '';
    if (rows.length > 0) {
      rows.forEach((h) => {
        const score = h.decision_score != null ? Math.round(h.decision_score) : null;
        const decision = h.decision || null;

        // Decision badge styling
        let badgeBg = 'transparent';
        let badgeColor = 'var(--text-muted)';
        let badgeText = '--';
        if (decision === 'GO' || score >= 75) {
          badgeBg = 'var(--accent-green-dim)'; badgeColor = 'var(--accent-green)'; badgeText = 'GO';
        } else if (decision === 'NOGO' || (score != null && score < 50)) {
          badgeBg = 'var(--accent-red-dim)'; badgeColor = 'var(--accent-red)'; badgeText = 'NO-GO';
        } else if (decision === 'NEUTRE' || score != null) {
          badgeBg = 'var(--accent-yellow-dim)'; badgeColor = 'var(--accent-yellow)'; badgeText = 'NEUTRE';
        }

        const sof = h.sof || 0;
        const result = h.my_result || h.my_position || '--';

        tableRows += `
          <tr style="border-bottom:1px solid var(--border); cursor:pointer;
                     transition:background 120ms ease;"
              onclick="window.location.hash='#session/${h.id || h.session_id || ''}';"
              onmouseenter="this.style.background='var(--bg-card-hover)';"
              onmouseleave="this.style.background='transparent';">
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-secondary);">
              ${h.date || h.created_at || '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-primary);
                       max-width:180px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">
              ${h.series_name || '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-secondary);
                       max-width:180px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">
              ${h.track_name || '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--accent-cyan);
                       text-align:center; font-weight:var(--weight-bold);">
              ${sof > 0 ? sof.toLocaleString() : '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); text-align:center;">
              <span style="background:${badgeBg}; color:${badgeColor};
                           font-family:var(--font-data); font-size:var(--text-xs);
                           padding:2px 8px; border-radius:var(--radius-full);
                           font-weight:var(--weight-bold);">
                ${badgeText}
              </span>
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-primary);
                       text-align:center;">
              ${score != null ? score + '%' : '--'}
            </td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-primary);
                       text-align:center;">
              ${result !== '--' ? 'P' + result : '--'}
            </td>
          </tr>`;
      });
    } else {
      tableRows = `
        <tr>
          <td colspan="7" style="padding:var(--spacing-xl); text-align:center;
                                  color:var(--text-muted); font-family:var(--font-body);">
            No session history found.
          </td>
        </tr>`;
    }

    // Build pagination
    let pagination = '';
    if (totalPages > 1) {
      const prevDisabled = _currentPage === 0 ? 'opacity:0.4; pointer-events:none;' : '';
      const nextDisabled = _currentPage >= totalPages - 1 ? 'opacity:0.4; pointer-events:none;' : '';

      pagination = `
        <div style="display:flex; justify-content:center; align-items:center;
                    gap:var(--spacing-md); margin-top:var(--spacing-md);">
          <button onclick="HistoryPage.prevPage()"
                  style="background:var(--bg-input); border:1px solid var(--border);
                         border-radius:var(--radius-md); color:var(--text-secondary);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         padding:var(--spacing-xs) var(--spacing-md);
                         cursor:pointer; ${prevDisabled}">
            &#9664; Prev
          </button>
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-muted);">
            Page ${_currentPage + 1} of ${totalPages} (${total} sessions)
          </span>
          <button onclick="HistoryPage.nextPage()"
                  style="background:var(--bg-input); border:1px solid var(--border);
                         border-radius:var(--radius-md); color:var(--text-secondary);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         padding:var(--spacing-xs) var(--spacing-md);
                         cursor:pointer; ${nextDisabled}">
            Next &#9654;
          </button>
        </div>`;
    }

    // ----- Assemble page -----
    const html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:var(--content-max-width); margin:0 auto;">

        <!-- Page header -->
        <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                   color:var(--text-primary); margin:0 0 var(--spacing-lg) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Session History
        </h2>

        <!-- Filter bar -->
        <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                    align-items:flex-end; margin-bottom:var(--spacing-lg);
                    padding-bottom:var(--spacing-md);
                    border-bottom:1px solid var(--border);">
          <div>
            <label style="font-family:var(--font-data); font-size:var(--text-xs);
                          color:var(--text-muted); text-transform:uppercase;
                          display:block; margin-bottom:4px;">Series</label>
            <select onchange="HistoryPage.setSeries(this.value)"
                    style="padding:var(--spacing-xs) var(--spacing-sm);
                           background:var(--bg-input); color:var(--text-primary);
                           border:1px solid var(--border); border-radius:var(--radius-md);
                           font-family:var(--font-data); font-size:var(--text-sm);
                           outline:none; min-width:200px;">
              ${seriesOptions}
            </select>
          </div>
          <div>
            <label style="font-family:var(--font-data); font-size:var(--text-xs);
                          color:var(--text-muted); text-transform:uppercase;
                          display:block; margin-bottom:4px;">From</label>
            <input type="date" value="${_dateFrom}"
                   onchange="HistoryPage.setDateFrom(this.value)"
                   style="padding:var(--spacing-xs) var(--spacing-sm);
                          background:var(--bg-input); color:var(--text-primary);
                          border:1px solid var(--border); border-radius:var(--radius-md);
                          font-family:var(--font-data); font-size:var(--text-sm);
                          outline:none;" />
          </div>
          <div>
            <label style="font-family:var(--font-data); font-size:var(--text-xs);
                          color:var(--text-muted); text-transform:uppercase;
                          display:block; margin-bottom:4px;">To</label>
            <input type="date" value="${_dateTo}"
                   onchange="HistoryPage.setDateTo(this.value)"
                   style="padding:var(--spacing-xs) var(--spacing-sm);
                          background:var(--bg-input); color:var(--text-primary);
                          border:1px solid var(--border); border-radius:var(--radius-md);
                          font-family:var(--font-data); font-size:var(--text-sm);
                          outline:none;" />
          </div>
        </div>

        <!-- History table -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  overflow-x:auto;">
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
                           text-transform:uppercase; text-align:center;">SOF</th>
                <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                           font-size:var(--text-xs); color:var(--text-muted);
                           text-transform:uppercase; text-align:center;">Decision</th>
                <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                           font-size:var(--text-xs); color:var(--text-muted);
                           text-transform:uppercase; text-align:center;">Score</th>
                <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                           font-size:var(--text-xs); color:var(--text-muted);
                           text-transform:uppercase; text-align:center;">Result</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          ${pagination}
        </div>
      </div>`;

    appContainer.innerHTML = html;
  }

  // =========================================================================
  // Filter/pagination setters
  // =========================================================================

  function setSeries(value) {
    _seriesFilter = value;
    _currentPage = 0;
    render();
  }

  function setDateFrom(value) {
    _dateFrom = value;
    _currentPage = 0;
    render();
  }

  function setDateTo(value) {
    _dateTo = value;
    _currentPage = 0;
    render();
  }

  function prevPage() {
    if (_currentPage > 0) {
      _currentPage--;
      render();
    }
  }

  function nextPage() {
    const { totalPages } = _getPageData();
    if (_currentPage < totalPages - 1) {
      _currentPage++;
      render();
    }
  }

  return {
    render,
    setSeries,
    setDateFrom,
    setDateTo,
    prevPage,
    nextPage,
  };
})();
