/**
 * DriverPage — Driver Profile Page Renderer
 * ============================================
 * Displays the full profile for a specific driver including their stats,
 * track experience, recent races, and tagging controls.
 *
 * Usage:
 *   DriverPage.render(driverId);  // Writes directly into #app container
 */

'use strict';

const DriverPage = (() => {

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the driver profile page into the #app container.
   *
   * @param {string|number} driverId - The iRacing customer ID of the driver
   */
  async function render(driverId) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Validate driver ID
    if (!driverId) {
      appContainer.innerHTML = `
        <div class="animate-fade-in" style="text-align:center; padding:var(--spacing-3xl);">
          <h2 style="font-family:var(--font-display); font-size:var(--text-2xl);
                     color:var(--text-muted);">
            No Driver Selected
          </h2>
          <p style="font-family:var(--font-body); color:var(--text-secondary);
                    margin-top:var(--spacing-sm);">
            Select a driver from the session grid.
          </p>
          <a href="#session" style="color:var(--accent-cyan); font-family:var(--font-body);
                                    font-size:var(--text-sm); text-decoration:underline;
                                    margin-top:var(--spacing-md); display:inline-block;">
            Back to Session
          </a>
        </div>`;
      return;
    }

    // Show loading state
    appContainer.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center;
                  min-height:300px;">
        <div class="spinner"></div>
      </div>`;

    // Fetch driver data, track stats, and recent races in parallel
    const [driverData, recentRacesData] = await Promise.all([
      api.analyzeDriver(driverId),
      api.getDriverRecent(driverId),
    ]);

    // Extract structured data from API responses
    const driver = driverData?.driver || driverData || {};
    const trackStats = driverData?.track_stats || null;
    const recentRaces = Array.isArray(recentRacesData)
      ? recentRacesData
      : (recentRacesData?.races || []);

    // Ensure driver has the user_id set
    if (!driver.user_id) {
      driver.user_id = driverId;
    }

    // ----- Build page HTML -----
    let html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:var(--content-max-width); margin:0 auto;">

        <!-- Back button -->
        <div style="margin-bottom:var(--spacing-md);">
          <button onclick="history.back();"
                  style="background:none; border:1px solid var(--border);
                         border-radius:var(--radius-md); color:var(--text-secondary);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         padding:var(--spacing-xs) var(--spacing-md);
                         cursor:pointer; transition:all 150ms ease;"
                  onmouseenter="this.style.borderColor='var(--accent-cyan)'; this.style.color='var(--accent-cyan)';"
                  onmouseleave="this.style.borderColor='var(--border)'; this.style.color='var(--text-secondary)';">
            &#9664; Back to Session
          </button>
        </div>

        <!-- Driver Profile Component -->
        ${DriverProfile.render(driver, trackStats, recentRaces)}
      </div>`;

    appContainer.innerHTML = html;
  }

  return {
    render,
  };
})();
