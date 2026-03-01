/**
 * SessionPage — Session Analysis Page Renderer (THE main page)
 * ==============================================================
 * Predictive SOF analysis using iRacing registration polling.
 *
 * Layout:
 *   - Header: Series name + Track + Session type + Time remaining + Newcomer count
 *   - Top row: ConditionsPanel (left) + SOFGauge (right, predictive SOF)
 *   - Center: DecisionPanel (big GO/NOGO with score %)
 *   - Below: IRatingSimulator (gain/loss table, predictive SOF)
 *   - Below: DriverGrid (newcomers only: name + iRating)
 *
 * Predictive SOF flow:
 *   1. At H-20 min: first poll → baseline snapshot (not counted in SOF)
 *   2. From H-18 to H-0: poll every minute → newcomers detected by diff
 *   3. SOF = average iRating of newcomers only
 *   4. DriverGrid shows only newcomers
 *
 * Fallback:
 *   When no predictive data is available, uses bridge/API live session data.
 *
 * Usage:
 *   SessionPage.render(sessionId);
 */

'use strict';

const SessionPage = (() => {

  // =========================================================================
  // Predictive SOF state
  // =========================================================================

  /** @type {object|null} Latest newcomer data from registration polling */
  let _predictiveData = null;
  /** @type {number} Timestamp of last poll (ms) */
  let _lastPollTime = 0;
  /** Minimum interval between polls (ms) */
  const POLL_INTERVAL_MS = 60000;

  /**
   * Calculate the next race start time based on the race interval.
   * iRacing races run on fixed schedules (e.g., every 2 hours from 00:00 UTC).
   * @param {number} intervalMinutes - Race interval in minutes
   * @returns {string} ISO 8601 UTC string of next race start
   */
  function _computeRaceStartUtc(intervalMinutes) {
    if (!intervalMinutes || intervalMinutes <= 0) return '';
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    const nextStart = new Date(Math.ceil(now / intervalMs) * intervalMs);
    return nextStart.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /**
   * Fetch predictive data from the registration polling system.
   * Triggers a poll if enough time has elapsed, then fetches newcomers.
   * @param {number} seriesId - iRacing series ID
   * @param {number} sessionId - iRacing session ID for reg_drivers_list
   * @param {string} raceStartUtc - Race start time in ISO 8601 UTC
   * @returns {Promise<object|null>} Predictive data or null
   */
  async function _fetchPredictiveData(seriesId, sessionId, raceStartUtc) {
    if (!seriesId || !raceStartUtc) return null;

    try {
      // Poll registration (every 60s max)
      const now = Date.now();
      if (sessionId && (now - _lastPollTime > POLL_INTERVAL_MS)) {
        _lastPollTime = now;
        await api.pollRegistration(sessionId, seriesId, raceStartUtc);
      }

      // Fetch latest newcomers
      const result = await api.getNewcomers(seriesId, raceStartUtc);
      if (result && !result.error) {
        _predictiveData = result;
      }
    } catch (e) {
      console.warn('[SessionPage] Predictive data fetch failed:', e);
    }

    return _predictiveData;
  }

  // =========================================================================
  // Series name resolution cache
  // =========================================================================

  /** @type {Object<number, string>} series_id → resolved name */
  const _seriesNameCache = {};
  /** @type {Object<number, boolean>} series_id → fetch in progress */
  const _seriesNamePending = {};

  /**
   * Asynchronously resolve a series name from the local DB via API,
   * then trigger a page re-render so the name appears.
   * @param {number} seriesId - iRacing series ID from IRSDK WeekendInfo
   */
  async function _resolveSeriesName(seriesId) {
    try {
      // Try favorites first (smaller set, faster), then fall back to full list
      // API returns wrapped objects: { favorites: [...] } and { series: [...] }
      const favResp = await api.getSeriesFavorites();
      let match = _findSeriesById(favResp && favResp.favorites, seriesId);
      if (!match) {
        const listResp = await api.getSeriesList();
        match = _findSeriesById(listResp && listResp.series, seriesId);
      }
      if (match && match.series_name) {
        _seriesNameCache[seriesId] = match.series_name;
        render();
      }
    } catch (e) {
      console.warn('[SessionPage] Failed to resolve series name for ID', seriesId, e);
    } finally {
      _seriesNamePending[seriesId] = false;
    }
  }

  /** Find a series by ID in an array (handles both number and string IDs). */
  function _findSeriesById(list, seriesId) {
    if (!Array.isArray(list)) return null;
    return list.find((s) =>
      Number(s.iracing_series_id) === Number(seriesId)
    ) || null;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Format seconds into a human-readable time string (HH:MM:SS or MM:SS).
   * Returns null for invalid, negative, or unlimited-time values.
   *
   * @param {number|null} seconds - Time in seconds
   * @returns {string|null} Formatted time string or null
   */
  function _formatTime(seconds) {
    if (seconds == null || seconds < 0 || !isFinite(seconds)) return null;
    // iRacing uses very large numbers (604800+) for unlimited time sessions
    if (seconds > 86400) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Filter drivers: keep only those who are real, human, and actually
   * connected to the session (in the world).
   *
   * Filters out:
   *   - Spectators (is_spectator = true)
   *   - AI drivers (is_ai = true)
   *   - Registered but not connected drivers (in_world = false)
   *     This is the key fix for Practice sessions where iRacing lists
   *     all 32+ registered drivers but only 3 are actually on track.
   *
   * @param {Array} allDrivers - Raw driver list from session data
   * @returns {Array} Filtered driver list
   */
  function _filterActiveDrivers(allDrivers) {
    if (!Array.isArray(allDrivers)) return [];

    // Step 1: exclude spectators and AI
    const humans = allDrivers.filter((d) => !d.is_spectator && !d.is_ai);

    // Step 2: try to filter by in_world (telemetry-based: actually connected)
    const inWorld = humans.filter((d) => d.in_world !== false);

    // Fallback: if in_world filtering removes everyone, the telemetry
    // data might not be available yet or CarIdxTrackSurface is unreliable.
    // In that case, show all non-spectator/non-AI drivers.
    if (inWorld.length === 0 && humans.length > 0) {
      console.warn('[SessionPage] in_world filter removed all drivers, falling back to full list');
      return humans;
    }

    return inWorld;
  }

  /**
   * Gather session data from the REST API.
   *
   * @returns {{ sessionData: object|null, isLive: boolean }}
   */
  async function _getSessionData() {
    const sessionData = await api.getSessionLive();
    return { sessionData, isLive: false };
  }

  /**
   * Extract and compute all data needed for rendering from raw session payload.
   * When predictive data is available (newcomers from registration polling),
   * it overrides the bridge data for SOF, decision, simulator, and driver grid.
   *
   * @param {object} sessionData - Raw session data
   * @param {object|null} predictive - Predictive data from registration polling
   * @returns {object} Computed rendering data
   */
  function _computeRenderData(sessionData, predictive) {
    const allDrivers = sessionData.drivers || sessionData.entries || [];
    const bridgeDrivers = _filterActiveDrivers(allDrivers);
    const conditions = sessionData.track_conditions || sessionData.conditions || sessionData.weather || null;
    const myIrating = sessionData.my_irating || storage.get('my_irating', 0);
    const mySR = sessionData.my_sr || storage.get('my_sr', 0);

    // Use predictive newcomers for SOF when available, fallback to bridge drivers
    const hasPredictive = predictive && Array.isArray(predictive.newcomers) && predictive.newcomers.length > 0;
    const drivers = hasPredictive
      ? predictive.newcomers.map((n) => ({
          user_id: n.customer_id,
          user_name: n.display_name,
          irating: n.irating,
        }))
      : bridgeDrivers;

    const sofResult = hasPredictive
      ? sofEngine.calculateSOF(drivers, myIrating)
      : sofEngine.calculateSOF(bridgeDrivers, myIrating);

    const decisionResult = decisionEngine.evaluateDecision(
      { ...sessionData, sof: sofResult.value },
      myIrating,
      mySR
    );

    const sessionInfo = sessionData.session || {};
    let seriesName = sessionInfo.series_name || '';
    const seriesId = sessionInfo.series_id || null;

    // Resolve series name from local DB when IRSDK only gives a fallback
    // (e.g. "SportsCar — Practice" instead of the real series name).
    // Uses a simple cache so the lookup only happens once per series_id.
    if (seriesId && (!seriesName || seriesName.includes(' — '))) {
      const cached = _seriesNameCache[seriesId];
      if (cached) {
        seriesName = cached;
      } else if (!_seriesNamePending[seriesId]) {
        _seriesNamePending[seriesId] = true;
        _resolveSeriesName(seriesId);
      }
    }

    const trackName = sessionInfo.track_name || '';
    const trackConfig = sessionInfo.track_config || '';
    const sessionType = sessionInfo.session_type || '';
    const sessionName = sessionInfo.session_name || '';
    // Time remaining: prefer telemetry countdown, fallback to YAML duration
    const sessionTimeRemain = _formatTime(sessionInfo.session_time_remain);
    const sessionDuration = _formatTime(sessionInfo.session_duration_sec);
    const subsessionId = sessionInfo.subsession_id || sessionInfo.session_id || '';
    const isOfficial = sessionInfo.is_official || false;
    const category = sessionInfo.category || '';
    const eventType = sessionInfo.event_type || '';
    const fullTrack = trackConfig && trackConfig !== trackName
      ? `${trackName} — ${trackConfig}` : trackName;

    // Debug: log what we got from the bridge to console
    console.log('[SessionPage] session info:', JSON.stringify(sessionInfo));

    return {
      drivers, conditions, myIrating, mySR,
      sofResult, decisionResult, hasPredictive,
      baselineCount: hasPredictive ? (predictive.baseline_count || 0) : 0,
      seriesName, trackName, trackConfig, sessionType,
      sessionName, sessionTimeRemain, sessionDuration,
      fullTrack, subsessionId, isOfficial, category, eventType,
    };
  }

  // =========================================================================
  // Initial full render
  // =========================================================================

  /**
   * Build and inject the complete page HTML for the first render.
   * All key sections have stable IDs for subsequent targeted updates.
   *
   * @param {HTMLElement} appContainer - The #app container
   * @param {object} data - Computed rendering data
   * @param {boolean} isLive - Whether WebSocket is connected
   */
  function _renderFull(appContainer, data, isLive) {
    let html = `<div id="session-page-root" class="animate-fade-in"
                     style="padding:var(--spacing-lg);
                            max-width:var(--content-max-width); margin:0 auto;">`;

    // --- Session header: Series + Track + Session Type + Time + Count + ID ---
    const officialBadge = data.isOfficial
      ? `<span style="font-family:var(--font-data); font-size:var(--text-xs);
                color:var(--accent-green); background:rgba(0,255,0,0.1);
                padding:2px 6px; border-radius:var(--radius-sm);
                border:1px solid var(--accent-green);">OFFICIAL</span>`
      : '';

    const sessionIdBadge = data.subsessionId
      ? `<span style="font-family:var(--font-data); font-size:var(--text-xs);
                color:var(--text-muted);">#${data.subsessionId}</span>`
      : '';

    html += `
      <div id="session-header" style="margin-bottom:var(--spacing-lg);
                  padding-bottom:var(--spacing-md);
                  border-bottom:1px solid var(--border);">
        <h2 id="session-series-name"
            style="font-family:var(--font-display); font-size:var(--text-xl);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-xs) 0;
                   text-transform:uppercase; letter-spacing:0.04em;
                   text-shadow:0 0 12px rgba(0,191,255,0.3);">
          ${data.seriesName || 'Live Session'}
        </h2>
        <div style="display:flex; gap:var(--spacing-md); align-items:center; flex-wrap:wrap;">
          ${data.fullTrack ? `<span id="session-track-name"
              style="font-family:var(--font-data); font-size:var(--text-base);
                     color:var(--text-primary);">${data.fullTrack}</span>` : ''}
          ${data.sessionType ? `<span id="session-type-badge"
              style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-muted); text-transform:uppercase;
                     background:var(--bg-elevated); padding:2px 8px;
                     border-radius:var(--radius-sm);">${data.sessionType}</span>` : ''}
          ${officialBadge}
          ${data.sessionTimeRemain
            ? `<span id="session-time-remain"
                style="font-family:var(--font-data); font-size:var(--text-sm);
                       color:var(--accent-yellow); background:var(--bg-elevated);
                       padding:2px 8px; border-radius:var(--radius-sm);">
                &#9202; ${data.sessionTimeRemain}</span>`
            : data.sessionDuration
              ? `<span id="session-time-remain"
                  style="font-family:var(--font-data); font-size:var(--text-sm);
                         color:var(--text-secondary); background:var(--bg-elevated);
                         padding:2px 8px; border-radius:var(--radius-sm);">
                  &#9202; ${data.sessionDuration}</span>`
              : `<span id="session-time-remain"
                  style="font-family:var(--font-data); font-size:var(--text-sm);
                         color:var(--accent-yellow); background:var(--bg-elevated);
                         padding:2px 8px; border-radius:var(--radius-sm);
                         display:none;"></span>`}
          <span id="session-driver-count"
              style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-muted);">
            ${data.hasPredictive
              ? `${data.drivers.length} newcomer${data.drivers.length !== 1 ? 's' : ''} / ${data.baselineCount} baseline`
              : `${data.drivers.length} driver${data.drivers.length !== 1 ? 's' : ''}`}
          </span>
          ${sessionIdBadge}
        </div>
      </div>`;

    // --- Top row: Conditions + SOF Gauge ---
    html += `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);
                  margin-bottom:var(--spacing-lg);">
        <div id="session-conditions-container">
          ${data.conditions ? ConditionsPanel.render(data.conditions) : `
            <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                     border-radius:var(--radius-md); padding:var(--spacing-md);
                                     text-align:center; color:var(--text-muted);
                                     font-family:var(--font-data); font-size:var(--text-sm);">
              No conditions data available
            </div>`}
        </div>
        <div id="session-sof-container">
          ${SOFGauge.render(data.sofResult, data.myIrating)}
        </div>
      </div>`;

    // --- Center: Decision Panel ---
    html += `
      <div id="session-decision-container"
           style="margin-bottom:var(--spacing-lg); max-width:480px;
                  margin-left:auto; margin-right:auto;">
        ${DecisionPanel.render({
          score: data.decisionResult.score,
          decision: data.decisionResult.recommendation,
          explanation: data.decisionResult.summary,
        })}
      </div>`;

    // --- iRating Simulator ---
    html += `
      <div id="session-simulator-container" style="margin-bottom:var(--spacing-lg);">
        ${IRatingSimulator.render(data.myIrating, data.sofResult.value, data.drivers.length)}
      </div>`;

    // --- Driver Grid (full width) ---
    html += `
      <div id="session-driver-grid-wrapper" style="margin-bottom:var(--spacing-lg);">
        ${DriverGrid.render(data.drivers, data.myIrating)}
      </div>`;

    html += '</div>';

    appContainer.innerHTML = html;
  }

  // =========================================================================
  // Targeted in-place update (smart refresh — no flicker)
  // =========================================================================

  /**
   * Update existing DOM elements with new data instead of replacing innerHTML.
   * This prevents the screen from jumping / flashing on every data refresh.
   *
   * @param {object} data - Computed rendering data
   */
  function _updateInPlace(data) {
    // --- Header: series name ---
    const seriesEl = document.getElementById('session-series-name');
    if (seriesEl) {
      seriesEl.textContent = data.seriesName || 'Live Session';
    }

    // --- Header: driver count ---
    const countEl = document.getElementById('session-driver-count');
    if (countEl) {
      countEl.textContent = data.hasPredictive
        ? `${data.drivers.length} newcomer${data.drivers.length !== 1 ? 's' : ''} / ${data.baselineCount} baseline`
        : `${data.drivers.length} driver${data.drivers.length !== 1 ? 's' : ''}`;
    }

    // --- Header: session time remaining (or total duration as fallback) ---
    const timeEl = document.getElementById('session-time-remain');
    if (timeEl) {
      if (data.sessionTimeRemain) {
        timeEl.innerHTML = `&#9202; ${data.sessionTimeRemain}`;
        timeEl.style.color = 'var(--accent-yellow)';
        timeEl.style.display = '';
      } else if (data.sessionDuration) {
        timeEl.innerHTML = `&#9202; ${data.sessionDuration}`;
        timeEl.style.color = 'var(--text-secondary)';
        timeEl.style.display = '';
      } else {
        timeEl.style.display = 'none';
      }
    }

    // --- Conditions panel (uses its own targeted update method) ---
    if (data.conditions) {
      ConditionsPanel.update(data.conditions);
    }

    // --- SOF Gauge ---
    const sofContainer = document.getElementById('session-sof-container');
    if (sofContainer) {
      sofContainer.innerHTML = SOFGauge.render(data.sofResult, data.myIrating);
    }

    // --- Decision Panel ---
    const decisionContainer = document.getElementById('session-decision-container');
    if (decisionContainer) {
      decisionContainer.innerHTML = DecisionPanel.render({
        score: data.decisionResult.score,
        decision: data.decisionResult.recommendation,
        explanation: data.decisionResult.summary,
      });
    }

    // --- iRating Simulator ---
    const simContainer = document.getElementById('session-simulator-container');
    if (simContainer) {
      simContainer.innerHTML = IRatingSimulator.render(
        data.myIrating, data.sofResult.value, data.drivers.length
      );
    }

    // --- Driver Grid (uses its own targeted refresh) ---
    DriverGrid.refresh(data.drivers, data.myIrating);
  }

  // =========================================================================
  // Render (public entry point)
  // =========================================================================

  /**
   * Render the session analysis page into the #app container.
   * First call does a full render; subsequent calls do targeted updates.
   *
   * @param {string|number} [sessionId] - Optional session ID to load.
   *   If omitted, uses the current live session data.
   */
  async function render(sessionId) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Gather session data from API
    const { sessionData, isLive } = await _getSessionData();

    // Handle no data scenario
    if (!sessionData) {
      appContainer.innerHTML = `
        <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);">
          <h2 style="font-family:var(--font-display); font-size:var(--text-2xl);
                     color:var(--text-muted); margin-bottom:var(--spacing-md);">
            No Session Data
          </h2>
          <p style="font-family:var(--font-body); color:var(--text-secondary);
                    font-size:var(--text-base); max-width:400px; margin:0 auto;">
            Aucune donnée de session disponible.
            Utilisez la page <a href="#series" style="color:var(--accent-cyan);">Séries</a>
            pour sélectionner une série et lancer le polling.
          </p>
        </div>`;
      return;
    }

    // Fetch predictive data (registration polling) if we have session info
    const sessionInfo = sessionData.session || {};
    const seriesId = sessionInfo.series_id || 0;
    const iracingSessionId = sessionInfo.session_id || 0;
    const raceIntervalMin = sessionInfo.race_interval_minutes
      || storage.get('race_interval_minutes', 120);
    const raceStartUtc = _computeRaceStartUtc(raceIntervalMin);

    let predictive = null;
    if (seriesId > 0 && raceStartUtc) {
      predictive = await _fetchPredictiveData(seriesId, iracingSessionId, raceStartUtc);
    }

    // Compute all rendering data
    const data = _computeRenderData(sessionData, predictive);

    // Smart refresh: if the page is already rendered, update in place
    const existingPage = document.getElementById('session-page-root');
    if (existingPage) {
      _updateInPlace(data);
      return;
    }

    // First render: build full DOM
    _renderFull(appContainer, data, isLive);
  }

  return {
    render,
  };
})();
