/**
 * IRSDK SOF — SPA Router & Main Application Controller
 * ======================================================
 * Hash-based single-page application router that manages page navigation
 * and data refresh orchestration via the PHP API.
 *
 * Routes:
 *   #dashboard        — Main dashboard (default)
 *   #series           — Series catalog
 *   #session/{id}     — Session analysis (THE main page)
 *   #driver/{id}      — Driver profile detail
 *   #profile          — My profile
 *   #history          — Session history
 *   #settings         — Application settings
 *
 * Dependencies (loaded before this script in index.html):
 *   storage, formatters, sofEngine, decisionEngine, charts, api
 *
 * Page modules (loaded via <script> tags added to index.html):
 *   DashboardPage, SeriesPage, SessionPage, DriverPage,
 *   ProfilePage, HistoryPage, SettingsPage
 *
 * Component modules:
 *   DecisionPanel, ConditionsPanel, SOFGauge, DriverGrid,
 *   CriteriaDetail, IRatingSimulator, SeriesCard, SessionCard,
 *   DriverProfile, IRatingChart, FieldSummary, EventTicker
 */

'use strict';

const App = (() => {

  // =========================================================================
  // Route definitions
  // =========================================================================

  /**
   * Map route names to their page renderer modules.
   * Dynamic routes use a prefix match (e.g. "session/" extracts the ID).
   */
  const ROUTES = {
    'dashboard':     { render: () => _getPage('DashboardPage').render() },
    'series':        { render: () => _getPage('SeriesPage').render() },
    'series-detail': { render: (id) => _getPage('SeriesDetailPage').render(id) },
    'session':       { render: (id) => _getPage('SessionPage').render(id) },
    'driver':        { render: (id) => _getPage('DriverPage').render(id) },
    'profile':       { render: () => _getPage('ProfilePage').render() },
    'history':       { render: () => _getPage('HistoryPage').render() },
    'settings':      { render: () => _getPage('SettingsPage').render() },
  };

  /** Default route when no hash is present or hash is unrecognized. */
  const DEFAULT_ROUTE = 'dashboard';

  /** Reference to the main content container. */
  let _appContainer = null;

  /** The currently active route name (for avoiding redundant re-renders). */
  let _currentRoute = null;

  /** The currently active route parameter (e.g. session ID). */
  let _currentParam = null;

  /** Auto-refresh interval handle for dashboard/session. */
  let _refreshInterval = null;

  /** Auto-refresh period in milliseconds. */
  const REFRESH_INTERVAL_MS = 30000;

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Lazy-initialized registry for page modules.
   * Needed because `const` declarations at global scope do not create
   * properties on `window`, so window[name] lookup fails.
   */
  let _pageRegistry = null;

  /**
   * Safely retrieve a page module.
   * Returns a stub with a render() method that shows an error if not found.
   *
   * @param {string} name - Global name of the page module (e.g. "DashboardPage")
   * @returns {object} The page module or an error stub
   */
  function _getPage(name) {
    if (!_pageRegistry) {
      _pageRegistry = {
        ...(typeof DashboardPage !== 'undefined' && { DashboardPage }),
        ...(typeof SeriesPage !== 'undefined' && { SeriesPage }),
        ...(typeof SeriesDetailPage !== 'undefined' && { SeriesDetailPage }),
        ...(typeof SessionPage !== 'undefined' && { SessionPage }),
        ...(typeof DriverPage !== 'undefined' && { DriverPage }),
        ...(typeof ProfilePage !== 'undefined' && { ProfilePage }),
        ...(typeof HistoryPage !== 'undefined' && { HistoryPage }),
        ...(typeof SettingsPage !== 'undefined' && { SettingsPage }),
      };
    }
    if (_pageRegistry[name]) {
      return _pageRegistry[name];
    }
    console.warn(`[App] Page module "${name}" not found. Is the script loaded?`);
    return {
      render: () => {
        _appContainer.innerHTML = `
          <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);">
            <h2 style="font-family:var(--font-display); color:var(--accent-red);
                       font-size:var(--text-2xl); margin-bottom:var(--spacing-md);">
              Module Not Loaded
            </h2>
            <p style="font-family:var(--font-body); color:var(--text-secondary);
                      font-size:var(--text-base);">
              The page module <code style="color:var(--accent-cyan);">${name}</code>
              could not be found. Ensure the script is included in index.html.
            </p>
          </div>`;
      },
    };
  }

  /**
   * Parse the current window.location.hash into a route name and optional parameter.
   *
   * Examples:
   *   "#dashboard"      => { route: "dashboard", param: null }
   *   "#session/12345"  => { route: "session",   param: "12345" }
   *   "#driver/98765"   => { route: "driver",    param: "98765" }
   *   ""                => { route: "dashboard",  param: null }
   *
   * @returns {{ route: string, param: string|null }}
   */
  function _parseHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) {
      return { route: DEFAULT_ROUTE, param: null };
    }

    const slashIndex = hash.indexOf('/');
    if (slashIndex === -1) {
      return { route: hash, param: null };
    }

    const route = hash.substring(0, slashIndex);
    const param = hash.substring(slashIndex + 1) || null;
    return { route, param };
  }

  /**
   * Update the active CSS class on sidebar navigation links.
   * Highlights the link whose data-route matches the current route.
   *
   * @param {string} activeRoute - The current route name
   */
  function _updateNavActive(activeRoute) {
    // Map sub-routes to their parent nav item
    const navRoute = activeRoute === 'series-detail' ? 'series' : activeRoute;
    const links = document.querySelectorAll('.sidebar__link');
    links.forEach((link) => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute === navRoute) {
        link.classList.add('sidebar__link--active');
      } else {
        link.classList.remove('sidebar__link--active');
      }
    });
  }

  /**
   * Show a loading spinner in the app container while a page loads.
   */
  function _showLoading() {
    if (_appContainer) {
      _appContainer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center;
                    min-height:200px;">
          <div class="spinner"></div>
        </div>`;
    }
  }

  // =========================================================================
  // Routing
  // =========================================================================

  /**
   * Render the page for the given route.
   * Clears the #app container, calls the correct page renderer, and
   * manages auto-refresh intervals for live pages.
   *
   * @param {string} route - Route name (e.g. "dashboard", "session")
   * @param {string|null} param - Optional route parameter (e.g. session ID)
   */
  async function renderPage(route, param) {
    // Stop any existing auto-refresh
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }

    // Destroy existing charts to prevent memory leaks
    if (typeof charts !== 'undefined') {
      charts.destroyAll();
    }

    // Update state
    _currentRoute = route;
    _currentParam = param;

    // Update sidebar highlighting
    _updateNavActive(route);

    // Show loading spinner
    _showLoading();

    // Resolve the route handler
    const routeHandler = ROUTES[route];
    if (!routeHandler) {
      console.warn(`[App] Unknown route: "${route}". Redirecting to ${DEFAULT_ROUTE}.`);
      navigate(DEFAULT_ROUTE);
      return;
    }

    // Render the page (async — page renderers write directly to #app)
    try {
      await routeHandler.render(param);
    } catch (err) {
      console.error(`[App] Error rendering route "${route}":`, err);
      _appContainer.innerHTML = `
        <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);">
          <h2 style="font-family:var(--font-display); color:var(--accent-red);
                     font-size:var(--text-2xl); margin-bottom:var(--spacing-md);">
            Rendering Error
          </h2>
          <p style="font-family:var(--font-body); color:var(--text-secondary);
                    font-size:var(--text-base);">
            ${err.message || 'An unexpected error occurred.'}
          </p>
        </div>`;
    }

    // Set up auto-refresh for live pages (dashboard and session)
    if (route === 'dashboard' || route === 'session') {
      _refreshInterval = setInterval(() => {
        _refreshCurrentPage();
      }, REFRESH_INTERVAL_MS);
    }

    // Store last visited route for next session
    storage.set('last_route', route + (param ? '/' + param : ''));
  }

  /**
   * Refresh the current page data without full DOM rebuild.
   * Called by the auto-refresh interval.
   */
  async function _refreshCurrentPage() {
    if (!_currentRoute) return;

    try {
      const routeHandler = ROUTES[_currentRoute];
      if (routeHandler) {
        await routeHandler.render(_currentParam);
      }
    } catch (err) {
      console.error('[App] Refresh error:', err);
    }
  }

  /**
   * Programmatic navigation — update the hash and trigger a render.
   *
   * @param {string} hash - The target hash (e.g. "dashboard", "session/12345")
   */
  function navigate(hash) {
    const cleanHash = hash.replace(/^#\/?/, '');
    window.location.hash = '#' + cleanHash;
    // hashchange event will trigger onHashChange -> renderPage
  }

  /**
   * Handle the hashchange event — parse the new hash and render the page.
   */
  function _onHashChange() {
    const { route, param } = _parseHash();
    renderPage(route, param);
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initialize the application.
   * Called on DOMContentLoaded. Sets up the router and renders the initial page.
   */
  function init() {
    console.log('[App] Initializing IRSDK SOF application...');

    // Cache the app container reference
    _appContainer = document.getElementById('app');
    if (!_appContainer) {
      console.error('[App] FATAL: #app container not found in DOM.');
      return;
    }

    // Listen for hash changes (SPA navigation)
    window.addEventListener('hashchange', _onHashChange);

    // Determine initial route
    const { route, param } = _parseHash();

    // If no hash is set, try to restore the last visited route
    if (!window.location.hash || window.location.hash === '#') {
      const lastRoute = storage.get('last_route', DEFAULT_ROUTE);
      navigate(lastRoute);
    } else {
      renderPage(route, param);
    }

    console.log('[App] Initialization complete.');
  }

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    init,
    navigate,
    renderPage,
  };

})();

// ---------------------------------------------------------------------------
// Bootstrap: start the application when the DOM is ready
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
