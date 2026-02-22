/**
 * SeriesPage — Series Catalog Page Renderer
 * ============================================
 * Displays all available iRacing series in a filterable, searchable grid.
 *
 * Features:
 *   - Category filter buttons: All / Road / Oval / Dirt Road / Dirt Oval
 *   - License filter: All / Rookie / D / C / B / A
 *   - Search input to filter by series name
 *   - Grid of series cards (SeriesCard component)
 *   - Favorite star toggle on each card
 *   - Shows current track + next race time
 *
 * Usage:
 *   SeriesPage.render();  // Writes directly into #app container
 */

'use strict';

const SeriesPage = (() => {

  /** Currently selected category filter. */
  let _categoryFilter = 'All';

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

    // Category filter
    if (_categoryFilter !== 'All') {
      filtered = filtered.filter((s) => s.category === _categoryFilter);
    }

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

    // Determine active button styles
    const categories = ['All', 'Road', 'Oval', 'Dirt Road', 'Dirt Oval'];
    const licenses = ['All', 'R', 'D', 'C', 'B', 'A'];

    // Build filter bar
    let catButtons = '';
    categories.forEach((cat) => {
      const isActive = cat === _categoryFilter;
      const bg = isActive ? 'var(--accent-cyan-dim)' : 'transparent';
      const color = isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)';
      const border = isActive ? 'var(--accent-cyan)' : 'var(--border)';
      catButtons += `
        <button onclick="SeriesPage.setCategory('${cat}')"
                style="padding:var(--spacing-xs) var(--spacing-md);
                       background:${bg}; color:${color};
                       border:1px solid ${border}; border-radius:var(--radius-full);
                       font-family:var(--font-data); font-size:var(--text-xs);
                       cursor:pointer; text-transform:uppercase;
                       transition:all 150ms ease;">
          ${cat}
        </button>`;
    });

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
        <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                   color:var(--text-primary); margin:0 0 var(--spacing-lg) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Series Catalog
        </h2>

        <!-- Filter bar -->
        <div style="display:flex; flex-direction:column; gap:var(--spacing-sm);
                    margin-bottom:var(--spacing-lg); padding-bottom:var(--spacing-md);
                    border-bottom:1px solid var(--border);">

          <!-- Category buttons -->
          <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-xs);">
            ${catButtons}
          </div>

          <!-- License buttons + search -->
          <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);
                      align-items:center;">
            <div style="display:flex; gap:var(--spacing-xs);">
              ${licButtons}
            </div>

            <span style="flex:1;"></span>

            <!-- Search input -->
            <input id="series-search-input" type="text" placeholder="Search series..."
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
   * Set the category filter and re-render the grid.
   * @param {string} category
   */
  function setCategory(category) {
    _categoryFilter = category;
    _applyFilters();
    // Re-render filter buttons for active state
    render();
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
    setCategory,
    setLicense,
    setSearch,
  };
})();
