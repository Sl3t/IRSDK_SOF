/**
 * ProfilePage — My Profile Page Renderer
 * =========================================
 * Displays the authenticated user's iRacing profile with big iRating/SR
 * displays, iRating history chart, stats cards, and recent races table.
 *
 * Layout:
 *   - Big iRating display + SR display
 *   - iRating history line chart (last 30 races)
 *   - Stats cards: total races, wins, top5, avg finish, avg incidents
 *   - Recent races table
 *
 * Usage:
 *   ProfilePage.render();  // Writes directly into #app container
 */

'use strict';

const ProfilePage = (() => {

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the profile page into the #app container.
   */
  async function render() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Fetch profile data from API
    const profileData = await api.getMyProfile();
    const profile = profileData || {};

    // Extract profile fields
    const name = profile.name || profile.user_name || storage.get('my_name', 'Driver');
    const irating = profile.irating || profile.iRating || storage.get('my_irating', 0);
    const sr = profile.safety_rating || profile.sr || storage.get('my_sr', 0);
    const license = profile.license || storage.get('my_license', '--');
    const club = profile.club || '--';

    // Stats
    const totalRaces = profile.total_races || profile.races || 0;
    const wins = profile.wins || 0;
    const top5 = profile.top5 || profile.top_5 || 0;
    const avgFinish = profile.avg_finish || 0;
    const avgInc = profile.avg_incidents || profile.avg_inc || 0;

    // iRating history data
    const irHistory = profile.irating_history || profile.history || [];

    // Recent races
    const recentRaces = profile.recent_races || profile.races_detail || [];

    // ----- Build page HTML -----
    let html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:var(--content-max-width); margin:0 auto;">

        <!-- Page header -->
        <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                   color:var(--text-primary); margin:0 0 var(--spacing-lg) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          My Profile
        </h2>

        <!-- Big ratings display -->
        <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-xl);
                    align-items:center; margin-bottom:var(--spacing-xl);
                    padding-bottom:var(--spacing-lg); border-bottom:1px solid var(--border);">

          <!-- Name + license -->
          <div>
            <h3 style="font-family:var(--font-body); font-size:var(--text-lg);
                       color:var(--text-primary); margin:0 0 var(--spacing-xs) 0;">
              ${name}
            </h3>
            <span style="font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-secondary);">
              License: <span style="color:${_licColor(license)}; font-weight:var(--weight-bold);">${license}</span>
              &nbsp;|&nbsp; Club: ${club}
            </span>
          </div>

          <span style="flex:1;"></span>

          <!-- Big iRating -->
          <div style="text-align:center;">
            <span style="font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase; display:block;">
              iRating
            </span>
            <span style="font-family:var(--font-display); font-size:var(--text-5xl);
                         color:var(--accent-cyan); font-weight:var(--weight-bold);
                         text-shadow:0 0 20px rgba(0,191,255,0.4);
                         line-height:var(--leading-tight);">
              ${irating > 0 ? irating.toLocaleString() : '--'}
            </span>
          </div>

          <!-- Big SR -->
          <div style="text-align:center;">
            <span style="font-family:var(--font-data); font-size:var(--text-xs);
                         color:var(--text-muted); text-transform:uppercase; display:block;">
              Safety Rating
            </span>
            <span style="font-family:var(--font-display); font-size:var(--text-3xl);
                         color:var(--text-primary); font-weight:var(--weight-bold);
                         line-height:var(--leading-tight);">
              ${sr > 0 ? Number(sr).toFixed(2) : '--'}
            </span>
          </div>
        </div>`;

    // --- iRating History Chart ---
    html += `
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <div id="profile-irating-chart" style="min-height:320px;"></div>
        </div>`;

    // --- Stats cards ---
    html += `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
                    gap:var(--spacing-md); margin-bottom:var(--spacing-lg);">
          ${_statCard('Total Races', totalRaces, 'var(--text-primary)')}
          ${_statCard('Wins', wins, 'var(--accent-green)')}
          ${_statCard('Top 5', top5, 'var(--accent-cyan)')}
          ${_statCard('Avg Finish', avgFinish > 0 ? 'P' + avgFinish.toFixed(1) : '--', 'var(--text-primary)')}
          ${_statCard('Avg Incidents', avgInc > 0 ? avgInc.toFixed(1) + 'x' : '--', 'var(--accent-yellow)')}
        </div>`;

    // --- Recent races table ---
    if (Array.isArray(recentRaces) && recentRaces.length > 0) {
      let raceRows = '';
      recentRaces.forEach((r) => {
        const delta = r.irating_change || 0;
        const deltaColor = delta > 0 ? 'var(--accent-green)' : delta < 0 ? 'var(--accent-red)' : 'var(--text-secondary)';
        const deltaSign = delta > 0 ? '+' : '';

        raceRows += `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-xs); color:var(--text-secondary);">${r.date || '--'}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-primary);
                       max-width:180px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">${r.series || '--'}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-body);
                       font-size:var(--text-sm); color:var(--text-secondary);
                       max-width:180px; overflow:hidden; text-overflow:ellipsis;
                       white-space:nowrap;">${r.track || '--'}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-primary);
                       text-align:center;">P${r.position || '--'}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:${deltaColor};
                       text-align:center; font-weight:var(--weight-bold);">
              ${deltaSign}${delta}</td>
            <td style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--text-secondary);
                       text-align:center;">${r.incidents != null ? r.incidents + 'x' : '--'}</td>
          </tr>`;
      });

      html += `
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Recent Races
          </h4>
          <div style="overflow-x:auto;">
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
                             text-transform:uppercase; text-align:center;">Pos</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:center;">iR +/-</th>
                  <th style="padding:var(--spacing-xs) var(--spacing-sm); font-family:var(--font-data);
                             font-size:var(--text-xs); color:var(--text-muted);
                             text-transform:uppercase; text-align:center;">Inc</th>
                </tr>
              </thead>
              <tbody>
                ${raceRows}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    html += '</div>';

    appContainer.innerHTML = html;

    // --- Post-render: Initialize iRating history chart ---
    if (irHistory.length > 0) {
      setTimeout(() => {
        charts.createIRatingHistory('profile-irating-chart', irHistory);
      }, 50);
    } else {
      const chartEl = document.getElementById('profile-irating-chart');
      if (chartEl) {
        chartEl.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center;
                      height:200px; color:var(--text-muted); font-family:var(--font-data);
                      font-size:var(--text-sm);">
            No iRating history data available.
          </div>`;
      }
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Render a statistics card.
   * @param {string} label
   * @param {string|number} value
   * @param {string} color
   * @returns {string} HTML
   */
  function _statCard(label, value, color) {
    return `
      <div class="card animate-slide-up"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  text-align:center;">
        <span style="font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted); text-transform:uppercase;
                     display:block; margin-bottom:var(--spacing-xs);">
          ${label}
        </span>
        <span style="font-family:var(--font-display); font-size:var(--text-2xl);
                     color:${color}; font-weight:var(--weight-bold);">
          ${value}
        </span>
      </div>`;
  }

  /**
   * Get the CSS color for a license class letter.
   * @param {string} lic
   * @returns {string} CSS color
   */
  function _licColor(lic) {
    if (!lic) return 'var(--text-secondary)';
    const cls = lic.charAt(0).toUpperCase();
    const map = { A: '#3B82F6', B: '#00FF00', C: '#FFFF00', D: '#FF8C00', R: '#B45309', P: '#A855F7' };
    return map[cls] || 'var(--text-secondary)';
  }

  return {
    render,
  };
})();
