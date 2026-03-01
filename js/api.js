/**
 * IRSDK SOF — PHP API Client
 * ============================
 * HTTP client for communicating with the PHP backend API.
 * Provides typed methods for every endpoint and handles errors
 * gracefully by showing toast notifications to the user.
 *
 * Base URL is auto-detected from window.location (same origin).
 * All requests use the Fetch API with JSON content type.
 */

'use strict';

const api = (() => {

  // =========================================================================
  // Configuration
  // =========================================================================

  // Auto-detect the API base URL from the current origin
  // The PHP API is expected to be at /api/ relative to the document root
  const BASE_URL = (() => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    // If the app is served from a subdirectory, include it
    const basePath = path.substring(0, path.lastIndexOf('/') + 1);
    return `${origin}${basePath}api/`;
  })();

  // Track API connection state
  let _apiConnected = false;

  // =========================================================================
  // Status dot updater for API connection
  // =========================================================================

  /**
   * Update the API status dot in the sidebar.
   * @param {boolean} connected
   */
  const _updateApiDot = (connected) => {
    _apiConnected = connected;
    const dot = document.getElementById('dot-api');
    if (!dot) return;

    if (connected) {
      dot.classList.remove('status-dot--disconnected');
      dot.classList.add('status-dot--connected');
      dot.title = 'API: connected';
    } else {
      dot.classList.remove('status-dot--connected');
      dot.classList.add('status-dot--disconnected');
      dot.title = 'API: disconnected';
    }
  };

  // =========================================================================
  // Toast notification helper
  // =========================================================================

  /**
   * Show an error toast notification.
   * @param {string} message - Error message to display
   */
  const _showError = (message) => {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.error('[api]', message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast--error';
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.classList.add('toast--fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  };

  // =========================================================================
  // Core HTTP methods
  // =========================================================================

  /**
   * Perform a GET request to the API.
   *
   * @param {string} endpoint - API endpoint path (e.g. "session/live")
   * @param {object} [params={}] - Query parameters as key-value pairs
   * @returns {Promise<object|null>} Parsed JSON response or null on error
   */
  const get = async (endpoint, params = {}) => {
    try {
      // Build query string from params
      const queryString = Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params).toString()
        : '';

      const url = `${BASE_URL}${endpoint}${queryString}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      _updateApiDot(true);
      return await response.json();

    } catch (err) {
      console.error(`[api] GET ${endpoint} failed:`, err.message);
      _updateApiDot(false);
      _showError(`API error: ${err.message}`);
      return null;
    }
  };

  /**
   * Perform a POST request to the API.
   *
   * @param {string} endpoint - API endpoint path
   * @param {object} [data={}] - Request body (will be JSON-encoded)
   * @returns {Promise<object|null>} Parsed JSON response or null on error
   */
  const post = async (endpoint, data = {}) => {
    try {
      const url = `${BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const body = await response.json();

      if (!response.ok) {
        // Return the parsed error body so callers can read the actual message
        _updateApiDot(true); // API itself is reachable even if auth failed
        return body;
      }

      _updateApiDot(true);
      return body;

    } catch (err) {
      console.error(`[api] POST ${endpoint} failed:`, err.message);
      _updateApiDot(false);
      _showError(`API error: ${err.message}`);
      return null;
    }
  };

  // =========================================================================
  // Session endpoints
  // =========================================================================

  /**
   * Get live session data from the API.
   * @returns {Promise<object|null>}
   */
  const getSessionLive = () => get('session/live');

  /**
   * Get session history (past sessions).
   * @param {object} [params={}] - Filters (e.g. { limit: 20, offset: 0 })
   * @returns {Promise<object|null>}
   */
  const getSessionHistory = (params = {}) => get('session/history', params);

  // =========================================================================
  // Series endpoints
  // =========================================================================

  /**
   * Get the full list of available iRacing series.
   * @returns {Promise<object|null>}
   */
  const getSeriesList = () => get('series/list');

  /**
   * Sync series catalogue from the iRacing Data API.
   * @param {string} [category] - Optional filter (e.g. 'road')
   * @returns {Promise<object|null>}
   */
  const syncSeries = (category = 'road') => post('series/sync', { category });

  /**
   * Enrich series with current track and schedule data.
   * @returns {Promise<object|null>}
   */
  const enrichSeries = () => post('series/enrich', {});

  /**
   * Get the user's favorite series.
   * @returns {Promise<object|null>}
   */
  const getSeriesFavorites = () => get('series/favorites');

  /**
   * Set or unset a series as favorite.
   * @param {number|string} id - Series ID
   * @param {boolean} isFav - True to favorite, false to unfavorite
   * @returns {Promise<object|null>}
   */
  const setSeriesFavorite = (id, isFav) => post('series/favorite', {
    series_id: id,
    is_favorite: isFav,
  });

  /**
   * Get upcoming sessions for a specific series.
   * @param {number|string} seriesId - The series ID
   * @returns {Promise<object|null>}
   */
  const getSeriesSessions = (seriesId) => get('series/sessions', { series_id: seriesId });

  // =========================================================================
  // SOF / Decision endpoints
  // =========================================================================

  /**
   * Calculate SOF on the server side from a list of iRatings.
   * @param {number[]} iratings - Array of iRating values
   * @returns {Promise<object|null>}
   */
  const calculateSOF = (iratings) => post('sof/calculate', { iratings });

  /**
   * Evaluate GO/NOGO decision on the server side.
   * @param {object} sessionData - Session data payload
   * @returns {Promise<object|null>}
   */
  const evaluateDecision = (sessionData) => post('decision/evaluate', sessionData);

  // =========================================================================
  // Profile endpoints
  // =========================================================================

  /**
   * Get the authenticated user's profile data.
   * @returns {Promise<object|null>}
   */
  const getMyProfile = () => get('profile/me');

  // =========================================================================
  // Driver analysis endpoints
  // =========================================================================

  /**
   * Analyze a specific driver (stats at a track, tendencies, etc.).
   * @param {number|string} driverId - The iRacing customer ID
   * @param {string} [trackName=''] - Optional track name for track-specific analysis
   * @returns {Promise<object|null>}
   */
  const analyzeDriver = (driverId, trackName = '') => get('driver/analyze', {
    driver_id: driverId,
    track: trackName,
  });

  /**
   * Get a driver's recent race results.
   * @param {number|string} driverId - The iRacing customer ID
   * @returns {Promise<object|null>}
   */
  const getDriverRecent = (driverId) => get('driver/recent', { driver_id: driverId });

  // =========================================================================
  // Conditions / Weather endpoint
  // =========================================================================

  /**
   * Get live track conditions (weather, temperature, wind, etc.).
   * @returns {Promise<object|null>}
   */
  const getConditionsLive = () => get('conditions/live');

  // =========================================================================
  // Settings endpoints
  // =========================================================================

  /**
   * Get all user settings.
   * @returns {Promise<object|null>}
   */
  const getSettings = () => get('settings');

  /**
   * Save a single setting.
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<object|null>}
   */
  const saveSetting = (key, value) => post('settings/save', { key, value });

  // =========================================================================
  // Registration polling (predictive SOF)
  // =========================================================================

  /**
   * Poll iRacing for registered drivers and store in DB.
   * First call creates the baseline; subsequent calls detect newcomers.
   * @param {number} sessionId - iRacing session ID
   * @param {number} seriesId - iRacing series ID
   * @param {string} raceStartUtc - Race start time in ISO 8601 UTC
   * @returns {Promise<object|null>}
   */
  const pollRegistration = (sessionId, seriesId, raceStartUtc) => post('registration/poll', {
    session_id: sessionId,
    series_id: seriesId,
    race_start_utc: raceStartUtc,
  });

  /**
   * Get newcomers and predictive SOF for an upcoming race.
   * @param {number} seriesId - iRacing series ID
   * @param {string} raceStartUtc - Race start time in ISO 8601 UTC
   * @returns {Promise<object|null>}
   */
  const getNewcomers = (seriesId, raceStartUtc) => get('registration/newcomers', {
    series_id: seriesId,
    race_start_utc: raceStartUtc,
  });

  // =========================================================================
  // Connection check
  // =========================================================================

  /**
   * Check if the API is reachable.
   * @returns {boolean}
   */
  const isConnected = () => _apiConnected;

  /**
   * Get the base URL being used.
   * @returns {string}
   */
  const getBaseUrl = () => BASE_URL;

  // Public API
  return {
    get,
    post,
    getSessionLive,
    getSessionHistory,
    getSeriesList,
    syncSeries,
    enrichSeries,
    getSeriesFavorites,
    setSeriesFavorite,
    getSeriesSessions,
    calculateSOF,
    evaluateDecision,
    getMyProfile,
    analyzeDriver,
    getDriverRecent,
    getConditionsLive,
    getSettings,
    saveSetting,
    pollRegistration,
    getNewcomers,
    isConnected,
    getBaseUrl,
  };

})();
