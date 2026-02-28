/**
 * SessionPage — Session Analysis Page Renderer (THE main page)
 * ==============================================================
 * Full session analysis combining all components: conditions, SOF gauge,
 * decision panel, criteria detail, iRating simulator, field summary,
 * driver grid, iRating distribution chart, and event ticker.
 *
 * Layout:
 *   - Header: Series name + Track + Session type + Time remaining + Driver count
 *   - Top row: ConditionsPanel (left) + SOFGauge (right)
 *   - Center: DecisionPanel (big GO/NOGO with score %)
 *   - Below: CriteriaDetail (expandable)
 *   - Below: IRatingSimulator (gain/loss table)
 *   - Below: FieldSummary
 *   - Below: DriverGrid + IRatingChart
 *   - Bottom: EventTicker (if live)
 *
 * Smart refresh:
 *   On subsequent data updates, uses targeted DOM updates instead of
 *   full innerHTML replacement to avoid screen flicker / jumping.
 *
 * Driver filtering:
 *   Spectators and AI drivers are excluded from the displayed list.
 *   Only real, active human drivers are shown.
 *
 * Data flow:
 *   - If WebSocket connected: uses live data from wsClient.getLastData()
 *   - If not connected: fetches static data from api.getSessionLive()
 *
 * Usage:
 *   SessionPage.render(sessionId);
 */

'use strict';

const SessionPage = (() => {

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
    return allDrivers.filter((d) => {
      // Exclude spectators and AI
      if (d.is_spectator || d.is_ai) return false;
      // Exclude drivers not in the world (registered but not connected)
      // Default to true if in_world flag is not present (backward compat)
      if (d.in_world === false) return false;
      return true;
    });
  }

  /**
   * Gather session data from the best available source.
   * Prefers WebSocket live data, falls back to REST API.
   *
   * @returns {{ sessionData: object|null, isLive: boolean }}
   */
  async function _getSessionData() {
    let sessionData = null;
    const isLive = wsClient.isConnected();

    if (isLive) {
      sessionData = wsClient.getLastData();
    }

    if (!sessionData) {
      sessionData = await api.getSessionLive();
    }

    return { sessionData, isLive };
  }

  /**
   * Extract and compute all data needed for rendering from raw session payload.
   *
   * @param {object} sessionData - Raw session data
   * @returns {object} Computed rendering data
   */
  function _computeRenderData(sessionData) {
    const allDrivers = sessionData.drivers || sessionData.entries || [];
    const drivers = _filterActiveDrivers(allDrivers);
    const conditions = sessionData.track_conditions || sessionData.conditions || sessionData.weather || null;
    const myIrating = sessionData.my_irating || storage.get('my_irating', 0);
    const mySR = sessionData.my_sr || storage.get('my_sr', 0);

    const sofResult = sofEngine.calculateSOF(drivers, myIrating);

    const decisionResult = decisionEngine.evaluateDecision(
      { ...sessionData, sof: sofResult.value },
      myIrating,
      mySR
    );

    const criteriaDisplay = decisionResult.criteria.map((c) => ({
      ...c,
      weight: Math.round(c.weight * 100),
    }));

    const sessionInfo = sessionData.session || {};
    const seriesName = sessionInfo.series_name || '';
    const trackName = sessionInfo.track_name || '';
    const trackConfig = sessionInfo.track_config || '';
    const sessionType = sessionInfo.session_type || '';
    const sessionTimeRemain = _formatTime(sessionInfo.session_time_remain);
    const fullTrack = trackConfig && trackConfig !== trackName
      ? `${trackName} — ${trackConfig}` : trackName;

    return {
      drivers, conditions, myIrating, mySR,
      sofResult, decisionResult, criteriaDisplay,
      seriesName, trackName, trackConfig, sessionType,
      sessionTimeRemain, fullTrack,
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

    // --- Session header: Series + Track + Session Type + Time + Count ---
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
          ${data.sessionTimeRemain ? `<span id="session-time-remain"
              style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--accent-yellow); background:var(--bg-elevated);
                     padding:2px 8px; border-radius:var(--radius-sm);">
              &#9202; ${data.sessionTimeRemain}</span>` : `<span id="session-time-remain"
              style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--accent-yellow); background:var(--bg-elevated);
                     padding:2px 8px; border-radius:var(--radius-sm);
                     display:none;"></span>`}
          <span id="session-driver-count"
              style="font-family:var(--font-data); font-size:var(--text-sm);
                     color:var(--text-muted);">
            ${data.drivers.length} driver${data.drivers.length !== 1 ? 's' : ''}
          </span>
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

    // --- Criteria Detail ---
    html += `
      <div id="session-criteria-container" style="margin-bottom:var(--spacing-lg);">
        ${CriteriaDetail.render(data.criteriaDisplay)}
      </div>`;

    // --- iRating Simulator ---
    html += `
      <div id="session-simulator-container" style="margin-bottom:var(--spacing-lg);">
        ${IRatingSimulator.render(data.myIrating, data.sofResult.value, data.drivers.length)}
      </div>`;

    // --- Field Summary ---
    html += `
      <div id="session-field-container" style="margin-bottom:var(--spacing-lg);">
        ${FieldSummary.render(data.drivers)}
      </div>`;

    // --- iRating Chart ---
    html += `
      <div style="margin-bottom:var(--spacing-lg);">
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);">
          <div id="session-irating-chart" style="min-height:280px;"></div>
        </div>
      </div>`;

    // --- Driver Grid (full width) ---
    html += `
      <div id="session-driver-grid-wrapper" style="margin-bottom:var(--spacing-lg);">
        ${DriverGrid.render(data.drivers, data.myIrating)}
      </div>`;

    // --- Event Ticker (if live) ---
    if (isLive) {
      html += `
        <div style="margin-bottom:var(--spacing-lg);">
          ${EventTicker.render()}
        </div>`;
    }

    html += '</div>';

    appContainer.innerHTML = html;

    // Post-render: Initialize the iRating distribution chart
    setTimeout(() => {
      IRatingChart.render('session-irating-chart', data.drivers, data.myIrating);
    }, 50);
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
      countEl.textContent = `${data.drivers.length} driver${data.drivers.length !== 1 ? 's' : ''}`;
    }

    // --- Header: session time remaining ---
    const timeEl = document.getElementById('session-time-remain');
    if (timeEl) {
      if (data.sessionTimeRemain) {
        timeEl.innerHTML = `&#9202; ${data.sessionTimeRemain}`;
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

    // --- Criteria Detail ---
    const criteriaContainer = document.getElementById('session-criteria-container');
    if (criteriaContainer) {
      criteriaContainer.innerHTML = CriteriaDetail.render(data.criteriaDisplay);
    }

    // --- iRating Simulator ---
    const simContainer = document.getElementById('session-simulator-container');
    if (simContainer) {
      simContainer.innerHTML = IRatingSimulator.render(
        data.myIrating, data.sofResult.value, data.drivers.length
      );
    }

    // --- Field Summary ---
    const fieldContainer = document.getElementById('session-field-container');
    if (fieldContainer) {
      fieldContainer.innerHTML = FieldSummary.render(data.drivers);
    }

    // --- Driver Grid (uses its own targeted refresh) ---
    DriverGrid.refresh(data.drivers, data.myIrating);

    // --- iRating Chart (re-render in existing container) ---
    IRatingChart.render('session-irating-chart', data.drivers, data.myIrating);
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

    // Gather session data from WebSocket (preferred) or API
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
            Connect to the IRSDK Bridge or wait for a session to load.
            Check your <a href="#settings" style="color:var(--accent-cyan);">settings</a>
            for WebSocket configuration.
          </p>
        </div>`;
      return;
    }

    // Compute all rendering data
    const data = _computeRenderData(sessionData);

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
