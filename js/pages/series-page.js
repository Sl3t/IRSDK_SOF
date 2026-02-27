/**
 * SeriesPage — Series Catalog Page Renderer
 * ============================================
 * Displays all available iRacing series in a filterable, searchable grid.
 *
 * Features:
 *   - Road series only (synced from iRacing Data API)
 *   - License filter: All / R / D / C / B / A
 *   - Search input to filter by series name
 *   - Sync button to import series from iRacing
 *   - Grid of series cards (SeriesCard component)
 *   - Favorite star toggle on each card
 *
 * Usage:
 *   SeriesPage.render();  // Writes directly into #app container
 */

'use strict';

const SeriesPage = (() => {

  /** Syncing flag. */
  let _syncing = false;

  /** Currently selected license filter. */
  let _licenseFilter = 'All';

  /** Current search query. */
  let _searchQuery = '';

  /** Cached full series list from API. */
  let _allSeries = [];

  // =========================================================================
  // Filter logic
  // =========================================================================

  /**
   * Filter the series list based on current category, license, and search filters.
   * @returns {Array} Filtered series array
   */
  function _getFiltered() {
    let filtered = [..._allSeries];

    // License filter
    if (_licenseFilter !== 'All') {
      filtered = filtered.filter((s) => {
        const lic = (s.license_group || '').charAt(0).toUpperCase();
        return lic === _licenseFilter;
      });
    }

    // Search filter (case-insensitive name match)
    if (_searchQuery.trim()) {
      const q = _searchQuery.trim().toLowerCase();
      filtered = filtered.filter((s) =>
        (s.series_name || '').toLowerCase().includes(q) ||
        (s.current_track || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }

  /**
   * Apply filters and re-render the grid without a full page reload.
   */
  function _applyFilters() {
    const grid = document.getElementById('series-grid');
    if (!grid) return;

    const filtered = _getFiltered();

    if (filtered.length > 0) {
      grid.innerHTML = filtered.map((s, i) =>
        `<div class="animate-slide-up" style="--delay:${Math.min(i * 40, 400)}ms;">
           ${SeriesCard.render(s)}
         </div>`
      ).join('');
    } else {
      grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:var(--spacing-2xl);
                    color:var(--text-muted); font-family:var(--font-body);">
          No series match your filters.
        </div>`;
    }

    // Update result count
    const countEl = document.getElementById('series-count');
    if (countEl) {
      countEl.textContent = `${filtered.length} series`;
    }
  }

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the series catalog page into the #app container.
   */
  async function render() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Fetch full series list from API
    const data = await api.getSeriesList();
    _allSeries = Array.isArray(data) ? data : (data?.series || []);

    const licenses = ['All', 'R', 'D', 'C', 'B', 'A'];

    let licButtons = '';
    licenses.forEach((lic) => {
      const isActive = lic === _licenseFilter;
      const bg = isActive ? 'var(--accent-cyan-dim)' : 'transparent';
      const color = isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)';
      const border = isActive ? 'var(--accent-cyan)' : 'var(--border)';
      licButtons += `
        <button onclick="SeriesPage.setLicense('${lic}')"
                style="padding:var(--spacing-xs) var(--spacing-sm);
                       background:${bg}; color:${color};
                       border:1px solid ${border}; border-radius:var(--radius-full);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       cursor:pointer; min-width:36px;
                       transition:all 150ms ease;">
          ${lic === 'All' ? 'All' : lic}
        </button>`;
    });

    // Render filtered grid
    const filtered = _getFiltered();
    let gridHtml = '';
    if (filtered.length > 0) {
      gridHtml = filtered.map((s, i) =>
        `<div class="animate-slide-up" style="--delay:${Math.min(i * 40, 400)}ms;">
           ${SeriesCard.render(s)}
         </div>`
      ).join('');
    } else {
      gridHtml = `
        <div style="grid-column:1/-1; text-align:center; padding:var(--spacing-2xl);
                    color:var(--text-muted); font-family:var(--font-body);">
          No series match your filters.
        </div>`;
    }

    const html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:var(--content-max-width); margin:0 auto;">

        <!-- Page header -->
        <div style="display:flex; align-items:center; gap:var(--spacing-md);
                    margin-bottom:var(--spacing-lg);">
          <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                     color:var(--text-primary); margin:0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Series Road
          </h2>
          <button id="sync-series-btn" onclick="SeriesPage.syncFromIRacing()"
                  style="padding:var(--spacing-xs) var(--spacing-md);
                         background:var(--accent-cyan-dim); color:var(--accent-cyan);
                         border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                         font-family:var(--font-data); font-size:var(--text-xs);
                         cursor:pointer; transition:all 150ms ease;">
            Sync iRacing
          </button>
          <span id="sync-result" style="font-family:var(--font-data);
                     font-size:var(--text-xs); color:var(--text-muted);"></span>
        </div>

        <!-- Filter bar -->
        <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                    align-items:center; margin-bottom:var(--spacing-lg);
                    padding-bottom:var(--spacing-md);
                    border-bottom:1px solid var(--border);">

          <!-- License buttons -->
          <div style="display:flex; gap:var(--spacing-xs);">
            ${licButtons}
          </div>

          <span style="flex:1;"></span>

          <!-- Search input -->
          <input id="series-search-input" type="text" placeholder="Rechercher..."
                 value="${_searchQuery}"
                 oninput="SeriesPage.setSearch(this.value)"
                 style="padding:var(--spacing-xs) var(--spacing-sm);
                        background:var(--bg-input); color:var(--text-primary);
                        border:1px solid var(--border); border-radius:var(--radius-md);
                        font-family:var(--font-body); font-size:var(--text-sm);
                        outline:none; min-width:200px;
                        transition:border-color 150ms ease;"
                 onfocus="this.style.borderColor='var(--accent-cyan)'"
                 onblur="this.style.borderColor='var(--border)'" />

          <!-- Count -->
          <span id="series-count" style="font-family:var(--font-data);
                     font-size:var(--text-xs); color:var(--text-muted);">
            ${filtered.length} series
          </span>
        </div>

        <!-- Series grid -->
        <div id="series-grid"
             style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));
                    gap:var(--spacing-md);">
          ${gridHtml}
        </div>
      </div>`;

    appContainer.innerHTML = html;
  }

  // =========================================================================
  // Filter setters (called from onclick handlers)
  // =========================================================================

  /**
   * Sync series from iRacing Data API (road only).
   */
  async function syncFromIRacing() {
    if (_syncing) return;
    _syncing = true;

    const btn = document.getElementById('sync-series-btn');
    const resultEl = document.getElementById('sync-result');
    if (btn) btn.textContent = 'Syncing...';
    if (resultEl) { resultEl.textContent = ''; resultEl.style.color = 'var(--accent-cyan)'; }

    try {
      // Step 1: Sync series catalogue
      if (resultEl) resultEl.textContent = 'Syncing series...';
      const result = await api.syncSeries('road');
      console.log('[series] Sync result:', result);

      if (!result || !result.success) {
        if (resultEl) {
          resultEl.textContent = result?.message || 'Sync failed';
          resultEl.style.color = 'var(--accent-red)';
        }
        return;
      }

      let msg = result.message || `${result.total} series synced`;
      if (result.total === 0 && result.debug) {
        msg += ` [debug: ${result.debug.data_count} items, keys: ${JSON.stringify(result.debug.first_item_keys)}]`;
      }

      // Step 2: Enrich with track & schedule data
      if (btn) btn.textContent = 'Loading tracks...';
      if (resultEl) { resultEl.textContent = 'Fetching schedules...'; resultEl.style.color = 'var(--accent-cyan)'; }

      const enrichResult = await api.enrichSeries();
      console.log('[series] Enrich result:', enrichResult);

      if (enrichResult && enrichResult.success && enrichResult.enriched > 0) {
        msg += ` | ${enrichResult.enriched} tracks loaded`;
      } else if (enrichResult && enrichResult.debug) {
        msg += ` | tracks: 0 [${JSON.stringify(enrichResult.debug.first_item_keys || enrichResult.debug.first_season_keys || 'N/A')}]`;
      }

      if (resultEl) {
        resultEl.textContent = msg;
        resultEl.style.color = result.total > 0 ? 'var(--accent-green)' : 'var(--accent-orange, orange)';
      }

      // Reload series list with enriched data
      await render();

    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Error: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    } finally {
      _syncing = false;
      if (btn) btn.textContent = 'Sync iRacing';
    }
  }

  /**
   * Set the license filter and re-render the grid.
   * @param {string} license
   */
  function setLicense(license) {
    _licenseFilter = license;
    _applyFilters();
    render();
  }

  /**
   * Set the search query and re-filter (without full re-render).
   * @param {string} query
   */
  function setSearch(query) {
    _searchQuery = query;
    _applyFilters();
  }

  return {
    render,
    syncFromIRacing,
    setLicense,
    setSearch,
  };
})();
