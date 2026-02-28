/**
 * SessionPage — Session Analysis Page Renderer (THE main page)
 * ==============================================================
 * Full session analysis combining all components: conditions, SOF gauge,
 * decision panel, criteria detail, iRating simulator, field summary,
 * driver grid, iRating distribution chart, and event ticker.
 *
 * Layout:
 *   - Top row: ConditionsPanel (left) + SOFGauge (right)
 *   - Center: DecisionPanel (big GO/NOGO with score %)
 *   - Below: CriteriaDetail (expandable)
 *   - Below: IRatingSimulator (gain/loss table)
 *   - Below: FieldSummary
 *   - Below: DriverGrid (left) + IRatingChart (right, side by side on desktop)
 *   - Bottom: EventTicker (if live)
 *
 * Data flow:
 *   - If WebSocket connected: uses live data from wsClient.getLastData()
 *   - If not connected: fetches static data from api.getSessionLive()
 *
 * Usage:
 *   SessionPage.render(sessionId);  // Writes directly into #app container
 */

'use strict';

const SessionPage = (() => {

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the session analysis page into the #app container.
   *
   * @param {string|number} [sessionId] - Optional session ID to load.
   *   If omitted, uses the current live session data.
   */
  async function render(sessionId) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Gather session data from WebSocket (preferred) or API
    let sessionData = null;
    const isLive = wsClient.isConnected();

    if (isLive) {
      sessionData = wsClient.getLastData();
    }

    // If no WebSocket data available, fetch from API
    if (!sessionData) {
      sessionData = await api.getSessionLive();
    }

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

    // Extract data from session payload
    const drivers = sessionData.drivers || sessionData.entries || [];
    const conditions = sessionData.track_conditions || sessionData.conditions || sessionData.weather || null;
    const myIrating = sessionData.my_irating || storage.get('my_irating', 0);
    const mySR = sessionData.my_sr || storage.get('my_sr', 0);

    // Calculate SOF
    const sofResult = sofEngine.calculateSOF(drivers, myIrating);

    // Run decision engine
    const decisionResult = decisionEngine.evaluateDecision(
      { ...sessionData, sof: sofResult.value },
      myIrating,
      mySR
    );

    // Format criteria for CriteriaDetail component
    // Convert weights from 0-1 to 0-100 percentage for display
    const criteriaDisplay = decisionResult.criteria.map((c) => ({
      ...c,
      weight: Math.round(c.weight * 100),
    }));

    // Extract session info for header
    const sessionInfo = sessionData.session || {};
    const seriesName = sessionInfo.series_name || '';
    const trackName = sessionInfo.track_name || '';
    const trackConfig = sessionInfo.track_config || '';
    const sessionType = sessionInfo.session_type || '';
    const fullTrack = trackConfig && trackConfig !== trackName
      ? `${trackName} — ${trackConfig}` : trackName;

    // ----- Build page HTML -----
    let html = `<div class="animate-fade-in" style="padding:var(--spacing-lg);
                     max-width:var(--content-max-width); margin:0 auto;">`;

    // --- Session header: Series + Track + Session Type ---
    if (seriesName || fullTrack) {
      html += `
        <div style="margin-bottom:var(--spacing-lg); padding-bottom:var(--spacing-md);
                    border-bottom:1px solid var(--border);">
          <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-xs) 0;
                     text-transform:uppercase; letter-spacing:0.04em;
                     text-shadow:0 0 12px rgba(0,191,255,0.3);">
            ${seriesName || 'Live Session'}
          </h2>
          <div style="display:flex; gap:var(--spacing-md); align-items:center; flex-wrap:wrap;">
            ${fullTrack ? `<span style="font-family:var(--font-data); font-size:var(--text-base);
                                        color:var(--text-primary);">${fullTrack}</span>` : ''}
            ${sessionType ? `<span style="font-family:var(--font-data); font-size:var(--text-sm);
                                          color:var(--text-muted); text-transform:uppercase;
                                          background:var(--bg-elevated); padding:2px 8px;
                                          border-radius:var(--radius-sm);">${sessionType}</span>` : ''}
            <span style="font-family:var(--font-data); font-size:var(--text-sm);
                         color:var(--text-muted);">${drivers.length} driver${drivers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>`;
    }

    // --- Top row: Conditions + SOF Gauge ---
    html += `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);
                  margin-bottom:var(--spacing-lg);">
        <div>
          ${conditions ? ConditionsPanel.render(conditions) : `
            <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                     border-radius:var(--radius-md); padding:var(--spacing-md);
                                     text-align:center; color:var(--text-muted);
                                     font-family:var(--font-data); font-size:var(--text-sm);">
              No conditions data available
            </div>`}
        </div>
        <div>
          ${SOFGauge.render(sofResult, myIrating)}
        </div>
      </div>`;

    // --- Center: Decision Panel ---
    html += `
      <div style="margin-bottom:var(--spacing-lg); max-width:480px; margin-left:auto; margin-right:auto;">
        ${DecisionPanel.render({
          score: decisionResult.score,
          decision: decisionResult.recommendation,
          explanation: decisionResult.summary,
        })}
      </div>`;

    // --- Criteria Detail ---
    html += `
      <div style="margin-bottom:var(--spacing-lg);">
        ${CriteriaDetail.render(criteriaDisplay)}
      </div>`;

    // --- iRating Simulator ---
    html += `
      <div style="margin-bottom:var(--spacing-lg);">
        ${IRatingSimulator.render(myIrating, sofResult.value, drivers.length)}
      </div>`;

    // --- Field Summary ---
    html += `
      <div style="margin-bottom:var(--spacing-lg);">
        ${FieldSummary.render(drivers)}
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
      <div style="margin-bottom:var(--spacing-lg);">
        ${DriverGrid.render(drivers, myIrating)}
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

    // --- Post-render: Initialize the iRating distribution chart ---
    // (Must happen after innerHTML is set so the container exists in the DOM)
    setTimeout(() => {
      IRatingChart.render('session-irating-chart', drivers, myIrating);
    }, 50);
  }

  return {
    render,
  };
})();
