/**
 * IRSDK SOF — Formatting Utilities
 * ==================================
 * Pure functions for formatting telemetry values, ratings, lap times,
 * deltas, and dates into human-readable strings suitable for the HUD.
 *
 * All functions are side-effect-free and return strings.
 * French locale is used for time-ago formatting (lang="fr").
 */

'use strict';

const formatters = (() => {

  /**
   * Format an iRating as a compact string.
   * Values >= 1000 are shown as "X.Xk", lower values are shown as-is.
   *
   * @param {number} value - The iRating (e.g. 2543)
   * @returns {string} Formatted string (e.g. "2.5k")
   *
   * @example
   *   formatIRating(2543)  // "2.5k"
   *   formatIRating(850)   // "850"
   *   formatIRating(12300) // "12.3k"
   */
  const formatIRating = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    const num = Number(value);
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return String(Math.round(num));
  };

  /**
   * Format a lap time in seconds to "M:SS.mmm" format.
   *
   * @param {number} seconds - Lap time in seconds (e.g. 137.342)
   * @returns {string} Formatted time (e.g. "2:17.342")
   *
   * @example
   *   formatLapTime(137.342) // "2:17.342"
   *   formatLapTime(65.1)    // "1:05.100"
   */
  const formatLapTime = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) {
      return '--:--.---';
    }
    const totalMs = Math.round(seconds * 1000);
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  /**
   * Format a delta value with a sign prefix.
   * Positive deltas are shown with "+" and negative with "-".
   * This returns an object with text and cssClass for coloring.
   *
   * @param {number} value - The delta (positive = gain, negative = loss)
   * @returns {{ text: string, cssClass: string }} Formatted delta
   *
   * @example
   *   formatDelta(85)   // { text: "+85", cssClass: "delta--positive" }
   *   formatDelta(-45)  // { text: "-45", cssClass: "delta--negative" }
   */
  const formatDelta = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return { text: '--', cssClass: 'delta--neutral' };
    }
    const num = Math.round(Number(value));
    if (num > 0) {
      return { text: `+${num}`, cssClass: 'delta--positive' };
    } else if (num < 0) {
      return { text: String(num), cssClass: 'delta--negative' };
    }
    return { text: '0', cssClass: 'delta--neutral' };
  };

  /**
   * Format a percentage value with "%" suffix.
   *
   * @param {number} value - The value (0-100 or 0-1; auto-detected)
   * @param {number} [decimals=0] - Number of decimal places
   * @returns {string} Formatted percentage (e.g. "73%")
   *
   * @example
   *   formatPercentage(73.456)   // "73%"
   *   formatPercentage(0.73456)  // "73%"
   */
  const formatPercentage = (value, decimals = 0) => {
    if (value === null || value === undefined || isNaN(value)) return '--%';
    let num = Number(value);
    // Auto-detect: if value is between 0 and 1 (exclusive), treat as fraction
    if (num > 0 && num < 1) {
      num = num * 100;
    }
    return `${num.toFixed(decimals)}%`;
  };

  /**
   * Format a temperature in Celsius.
   *
   * @param {number} celsius - Temperature in degrees Celsius
   * @returns {string} Formatted string (e.g. "32\u00B0C")
   */
  const formatTemperature = (celsius) => {
    if (celsius === null || celsius === undefined || isNaN(celsius)) return '--\u00B0C';
    return `${Math.round(Number(celsius))}\u00B0C`;
  };

  /**
   * Format a timestamp as a relative time string in French.
   * Uses "il y a X min/h/j" pattern.
   *
   * @param {string|number|Date} date - The timestamp to format
   * @returns {string} Relative time string in French
   *
   * @example
   *   formatTimeAgo(Date.now() - 300000)  // "il y a 5 min"
   *   formatTimeAgo(Date.now() - 7200000) // "il y a 2 h"
   */
  const formatTimeAgo = (date) => {
    if (!date) return '--';

    const now = Date.now();
    const then = date instanceof Date ? date.getTime() : new Date(date).getTime();

    if (isNaN(then)) return '--';

    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'il y a quelques secondes';
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffHour < 24) return `il y a ${diffHour} h`;
    if (diffDay < 7) return `il y a ${diffDay} j`;
    if (diffDay < 30) return `il y a ${Math.floor(diffDay / 7)} sem`;

    // For older dates, show the actual date
    const d = new Date(then);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /**
   * Format wind speed in m/s.
   *
   * @param {number} ms - Wind speed in meters per second
   * @returns {string} Formatted string (e.g. "3.2 m/s")
   */
  const formatWindSpeed = (ms) => {
    if (ms === null || ms === undefined || isNaN(ms)) return '-- m/s';
    return `${Number(ms).toFixed(1)} m/s`;
  };

  /**
   * Return a CSS class name based on a GO/NEUTRAL/NOGO score.
   *
   * Score ranges (configurable via thresholds):
   *   - >= 75 : GO      -> "score--go"
   *   - >= 50 : NEUTRAL -> "score--neutral"
   *   - <  50 : NOGO    -> "score--nogo"
   *
   * @param {number} score - Decision score (0-100)
   * @param {number} [goThreshold=75] - Minimum score for GO
   * @param {number} [nogoThreshold=50] - Scores below this are NOGO
   * @returns {string} CSS class name
   */
  const classForScore = (score, goThreshold = 75, nogoThreshold = 50) => {
    if (score === null || score === undefined || isNaN(score)) return 'score--unknown';
    const num = Number(score);
    if (num >= goThreshold) return 'score--go';
    if (num >= nogoThreshold) return 'score--neutral';
    return 'score--nogo';
  };

  /**
   * Format a Safety Rating value (e.g. 3.54 -> "3.54").
   *
   * @param {number} value - The SR value
   * @returns {string} Formatted SR
   */
  const formatSR = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return Number(value).toFixed(2);
  };

  /**
   * Format a number with thousand separators (space for French locale).
   *
   * @param {number} value - The number to format
   * @returns {string} Formatted number (e.g. "12 345")
   */
  const formatNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return Number(value).toLocaleString('fr-FR');
  };

  // Public API
  return {
    formatIRating,
    formatLapTime,
    formatDelta,
    formatPercentage,
    formatTemperature,
    formatTimeAgo,
    formatWindSpeed,
    classForScore,
    formatSR,
    formatNumber,
  };

})();
