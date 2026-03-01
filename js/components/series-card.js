/**
 * SeriesCard Component
 * =====================
 * Renders a card for a single iRacing series in the catalog / dashboard.
 *
 * Displays: series name, category badge (Road/Oval/Dirt), license class badge
 * (colored by class), current track, next race countdown, race interval,
 * and a favorite star toggle.
 *
 * Data contract (series object):
 *   {
 *     iracing_series_id, series_name, category,
 *     license_group, current_track, current_car_classes,
 *     next_race_time,          // ISO-8601 or unix timestamp
 *     last_sof_avg,            // integer
 *     race_interval_minutes,   // integer
 *     is_favorite              // boolean
 *   }
 *
 * Usage:
 *   const html = SeriesCard.render(seriesObj);
 *   container.innerHTML += html;
 *   SeriesCard.toggleFavorite(42);
 */

'use strict';

const SeriesCard = (() => {

  // -------------------------------------------------------------------------
  // License class color mapping
  // -------------------------------------------------------------------------

  const LICENSE_COLORS = {
    'R':    '#B45309',  // Rookie — amber-brown
    'D':    '#FF8C00',  // D — orange
    'C':    '#FFFF00',  // C — yellow
    'B':    '#00FF00',  // B — green
    'A':    '#3B82F6',  // A — blue
    'Pro':  '#A855F7',  // Pro — purple
  };

  // -------------------------------------------------------------------------
  // Category styling
  // -------------------------------------------------------------------------

  const CATEGORY_STYLES = {
    'Road':       { bg: 'var(--accent-cyan-dim)',   color: 'var(--accent-cyan)'   },
    'Oval':       { bg: 'var(--accent-orange-dim)', color: 'var(--accent-orange)' },
    'Dirt Road':  { bg: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' },
    'Dirt Oval':  { bg: 'var(--accent-red-dim)',    color: 'var(--accent-red)'    },
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Compute a human-readable countdown string from now until targetTime.
   * @param {string|number} targetTime - ISO-8601 string or unix timestamp (ms)
   * @returns {string} e.g. "12m 30s", "1h 05m", "NOW"
   */
  function _formatCountdown(targetTime) {
    if (!targetTime) return '--:--';
    const target = typeof targetTime === 'number' ? targetTime : new Date(targetTime).getTime();
    const diff = target - Date.now();
    if (diff <= 0) return 'NOW';

    const totalSec = Math.floor(diff / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);
    const secs  = totalSec % 60;

    if (hours > 0) {
      return `${hours}h ${String(mins).padStart(2, '0')}m`;
    }
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }

  /**
   * Get the badge color for a license class string.
   * @param {string} licGroup - "R", "D", "C", "B", "A", "Pro"
   * @returns {string} CSS color value
   */
  function _licColor(licGroup) {
    return LICENSE_COLORS[licGroup] || 'var(--text-secondary)';
  }

  /**
   * Get category badge styles.
   * @param {string} category - "Road", "Oval", "Dirt Road", "Dirt Oval"
   * @returns {{ bg: string, color: string }}
   */
  function _catStyle(category) {
    return CATEGORY_STYLES[category] || { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' };
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render a series card as an HTML string.
   *
   * @param {object} series - Series data object
   * @returns {string} HTML markup for the card
   */
  function render(series) {
    const s = series || {};
    const id        = s.iracing_series_id || 0;
    const name      = s.series_name || 'Unknown Series';
    const rawCat    = s.category || 'road';
    const category  = rawCat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const lic       = s.license_group || 'R';
    const track     = s.current_track || 'TBD';
    const sof       = s.last_sof_avg || 0;
    const isFav     = !!s.is_favorite;
    const cars      = s.current_car_classes || '';
    const interval  = s.race_interval_minutes || 0;

    const catStyle  = _catStyle(category);
    const licClr    = _licColor(lic);
    const countdown = _formatCountdown(s.next_race_time);
    const starChar  = isFav ? '\u2605' : '\u2606'; // filled / hollow star
    const starColor = isFav ? 'var(--accent-yellow)' : 'var(--text-muted)';

    return `
      <div class="card series-card" data-series-id="${id}"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);
                  display:flex; flex-direction:column; gap:var(--spacing-sm);
                  transition:border-color var(--transition-fast), box-shadow var(--transition-fast);
                  cursor:pointer;"
           onclick="App.navigate('series-detail/${id}')"
           onmouseenter="this.style.borderColor='var(--border-hover)'; this.style.boxShadow='var(--shadow-card-hover)';"
           onmouseleave="this.style.borderColor='var(--border)'; this.style.boxShadow='var(--shadow-card)';">

        <!-- Header row: name + favorite star -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--spacing-sm);">
          <h3 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--text-primary); margin:0; line-height:var(--leading-tight);
                     flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${name}
          </h3>
          <button class="series-card__fav-btn" data-series-id="${id}"
                  onclick="SeriesCard.toggleFavorite(${id}); event.stopPropagation();"
                  style="background:none; border:none; cursor:pointer; font-size:var(--text-lg);
                         color:${starColor}; padding:0; line-height:1;"
                  title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            ${starChar}
          </button>
        </div>

        <!-- Badges row: category + license -->
        <div style="display:flex; gap:var(--spacing-xs); flex-wrap:wrap;">
          <span class="badge"
                style="background:${catStyle.bg}; color:${catStyle.color};
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:2px 8px; border-radius:var(--radius-full);
                       text-transform:uppercase; letter-spacing:0.04em;">
            ${category}
          </span>
          <span class="badge"
                style="background:rgba(${_hexToRgb(licClr)}, 0.15); color:${licClr};
                       font-family:var(--font-data); font-size:var(--text-xs);
                       padding:2px 8px; border-radius:var(--radius-full);
                       font-weight:var(--weight-bold); letter-spacing:0.04em;">
            ${lic}
          </span>
        </div>

        <!-- Track -->
        <div style="display:flex; align-items:center; gap:var(--spacing-xs);">
          <span style="color:var(--text-muted); font-size:var(--text-xs);
                       font-family:var(--font-data); text-transform:uppercase;">Track</span>
          <span style="color:var(--text-primary); font-size:var(--text-sm);
                       font-family:var(--font-body); overflow:hidden;
                       text-overflow:ellipsis; white-space:nowrap; flex:1;">
            ${track}
          </span>
        </div>

        ${cars ? `
        <div style="color:var(--text-secondary); font-size:var(--text-xs);
                    font-family:var(--font-data); overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap;">
          ${cars}
        </div>` : ''}

        <!-- Bottom row: countdown + SOF -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end;
                    margin-top:auto; padding-top:var(--spacing-xs);
                    border-top:1px solid var(--border);">
          <div>
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;">NEXT RACE</span>
            <span class="data-value" style="color:var(--accent-cyan);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         font-weight:var(--weight-semibold);">
              ${countdown}
            </span>
          </div>
          <div style="text-align:right;">
            <span style="color:var(--text-muted); font-size:var(--text-xs);
                         font-family:var(--font-data); display:block;">INTERVAL</span>
            <span class="data-value" style="color:var(--text-primary);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         font-weight:var(--weight-bold);">
              ${interval > 0 ? (interval >= 60 ? Math.round(interval / 60) + 'h' : interval + 'min') : '--'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Favorite toggle
  // -------------------------------------------------------------------------

  /**
   * Toggle the favorite status for a series and refresh its card visually.
   * Calls the PHP API endpoint POST /api/series/favorites.
   *
   * @param {number} seriesId - iRacing series ID
   */
  async function toggleFavorite(seriesId) {
    try {
      // Assumes a global API helper (api.js) exposes API.post()
      if (typeof API !== 'undefined' && API.post) {
        await API.post('/api/series/favorites', { iracing_series_id: seriesId });
      }

      // Toggle the star visually in all matching cards
      const buttons = document.querySelectorAll(`.series-card__fav-btn[data-series-id="${seriesId}"]`);
      buttons.forEach((btn) => {
        const isFav = btn.textContent.trim() === '\u2605';
        btn.textContent = isFav ? '\u2606' : '\u2605';
        btn.style.color = isFav ? 'var(--text-muted)' : 'var(--accent-yellow)';
      });
    } catch (err) {
      console.error('[SeriesCard] Failed to toggle favorite:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Utility — hex color to rgb (for rgba backgrounds)
  // -------------------------------------------------------------------------

  /**
   * Convert a hex or CSS variable color reference to an rgb() triplet string.
   * Falls back gracefully if the value is a CSS variable.
   * @param {string} color
   * @returns {string} e.g. "0, 255, 0"
   */
  function _hexToRgb(color) {
    // If it is a CSS variable reference, return a neutral fallback
    if (color.startsWith('var(')) return '128, 128, 128';
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `${r}, ${g}, ${b}`;
  }

  return {
    render,
    toggleFavorite,
  };
})();
