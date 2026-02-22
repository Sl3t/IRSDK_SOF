/**
 * DashboardPage — Main Dashboard Page Renderer
 * ===============================================
 * The landing page showing an overview of the user's iRacing status,
 * live conditions (if WebSocket connected), and favorite series cards.
 *
 * Layout:
 *   - Top bar: My iRating (big number + trend arrow) + My SR + IRSDK status
 *   - Conditions panel (if WebSocket connected, show live conditions)
 *   - Grid of favorite series cards (fetched from API)
 *   - Each card shows active sessions with quick SOF + mini GO/NOGO badge
 *   - Auto-refresh every 30 seconds (managed by App router)
 *
 * Usage:
 *   DashboardPage.render();  // Writes directly into #app container
 */

'use strict';

const DashboardPage = (() => {

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the dashboard page into the #app container.
   * Fetches data from the API and WebSocket, then builds the full page HTML.
   */
  async function render() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Fetch data in parallel
    const [profileData, favoritesData, conditionsData] = await Promise.all([
      api.getMyProfile(),
      api.getSeriesFavorites(),
      api.getConditionsLive(),
    ]);

    // Extract user stats
    const profile = profileData || {};
    const myIrating = profile.irating || profile.iRating || storage.get('my_irating', 0);
    const mySR = profile.safety_rating || profile.sr || storage.get('my_sr', 0);
    const irTrend = profile.irating_trend || profile.irating_change || 0;
    const irsdkConnected = wsClient.isConnected();

    // Use WebSocket conditions if available, otherwise API conditions
    const wsData = wsClient.getLastData();
    const conditions = (wsData && wsData.conditions) ? wsData.conditions : conditionsData;

    // Favorites list
    const favorites = Array.isArray(favoritesData) ? favoritesData : (favoritesData?.series || []);

    // Trend arrow
    const trendArrow = irTrend > 0 ? '&#9650;' : irTrend < 0 ? '&#9660;' : '&#9644;';
    const trendColor = irTrend > 0 ? 'var(--accent-green)' : irTrend < 0 ? 'var(--accent-red)' : 'var(--text-muted)';

    // IRSDK status dot
    const irsdkColor = irsdkConnected ? 'var(--accent-green)' : 'var(--accent-red)';
    const irsdkLabel = irsdkConnected ? 'Connected' : 'Disconnected';

    // ----- Build HTML -----
    let html = `<div class="animate-fade-in" style="padding:var(--spacing-lg); max-width:var(--content-max-width); margin:0 auto;">`;

    // --- Top status bar ---
    html += `
      <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-lg);
                  align-items:center; margin-bottom:var(--spacing-xl);
                  padding-bottom:var(--spacing-lg); border-bottom:1px solid var(--border);">

        <!-- My iRating -->
        <div style="text-align:center;">
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-muted); text-transform:uppercase; display:block;">
            My iRating
          </span>
          <span style="font-family:var(--font-display); font-size:var(--text-4xl);
                       color:var(--accent-cyan); font-weight:var(--weight-bold);
                       text-shadow:0 0 16px rgba(0,191,255,0.4);
                       line-height:var(--leading-tight);">
            ${myIrating > 0 ? myIrating.toLocaleString() : '--'}
          </span>
          <span style="color:${trendColor}; font-family:var(--font-data);
                       font-size:var(--text-sm); margin-left:var(--spacing-xs);">
            ${trendArrow}
          </span>
        </div>

        <!-- My SR -->
        <div style="text-align:center;">
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-muted); text-transform:uppercase; display:block;">
            Safety Rating
          </span>
          <span style="font-family:var(--font-display); font-size:var(--text-2xl);
                       color:var(--text-primary); font-weight:var(--weight-bold);
                       line-height:var(--leading-tight);">
            ${mySR > 0 ? Number(mySR).toFixed(2) : '--'}
          </span>
        </div>

        <!-- Spacer -->
        <span style="flex:1;"></span>

        <!-- IRSDK Status -->
        <div style="display:flex; align-items:center; gap:var(--spacing-xs);">
          <span style="display:inline-block; width:10px; height:10px;
                       border-radius:var(--radius-full); background:${irsdkColor};
                       box-shadow:0 0 6px ${irsdkColor};"></span>
          <span style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-secondary);">
            IRSDK: ${irsdkLabel}
          </span>
        </div>
      </div>`;

    // --- Conditions panel ---
    if (conditions) {
      html += `
        <div style="margin-bottom:var(--spacing-lg);">
          ${ConditionsPanel.render(conditions)}
        </div>`;
    }

    // --- Favorite series section ---
    html += `
      <div style="margin-bottom:var(--spacing-md);">
        <h3 style="font-family:var(--font-display); font-size:var(--text-base);
                   color:var(--text-primary); margin:0 0 var(--spacing-md) 0;
                   text-transform:uppercase; letter-spacing:0.06em;">
          Favorite Series
        </h3>`;

    if (favorites.length > 0) {
      html += `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));
                    gap:var(--spacing-md);">`;

      favorites.forEach((series, i) => {
        html += `<div class="animate-slide-up" style="--delay:${i * 60}ms;">
          ${SeriesCard.render(series)}
        </div>`;
      });

      html += '</div>';
    } else {
      html += `
        <div style="text-align:center; padding:var(--spacing-2xl);
                    color:var(--text-muted); font-family:var(--font-body);
                    font-size:var(--text-base);">
          <p>No favorite series yet.</p>
          <p style="font-size:var(--text-sm); margin-top:var(--spacing-sm);">
            Go to <a href="#series" style="color:var(--accent-cyan);
                     text-decoration:underline;">Series</a> to browse and
            star your favorites.
          </p>
        </div>`;
    }

    html += '</div></div>';

    appContainer.innerHTML = html;
  }

  return {
    render,
  };
})();
