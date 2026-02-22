/**
 * IRSDK SOF — Client-Side SOF Calculator
 * ========================================
 * Calculates Strength of Field (SOF) and related statistics from a list
 * of drivers in a session. This mirrors the server-side calculation so
 * that the UI can display real-time SOF as drivers join/leave without
 * waiting for an API round-trip.
 *
 * SOF = arithmetic mean of all eligible (non-spectator, non-AI) iRatings.
 *
 * Also computes:
 *   - min, max, median, standard deviation
 *   - iRating distribution by 1k brackets
 *   - the user's rank and percentile within the field
 */

'use strict';

const sofEngine = (() => {

  /**
   * Filter out spectators and AI drivers, returning only eligible humans.
   * A driver is eligible if:
   *   - They have a positive iRating
   *   - They are not flagged as a spectator
   *   - They are not flagged as AI
   *
   * @param {Array<object>} drivers - Raw driver list from session data
   * @returns {Array<object>} Filtered driver list
   */
  const _filterEligible = (drivers) => {
    if (!Array.isArray(drivers)) return [];
    return drivers.filter((d) => {
      const ir = Number(d.irating || d.iRating || d.IRating || 0);
      const isSpectator = d.is_spectator || d.isSpectator || false;
      const isAI = d.is_ai || d.isAI || false;
      return ir > 0 && !isSpectator && !isAI;
    });
  };

  /**
   * Extract the iRating number from a driver object,
   * handling multiple possible property names.
   *
   * @param {object} driver - A driver object
   * @returns {number} The iRating value
   */
  const _getIR = (driver) => {
    return Number(driver.irating || driver.iRating || driver.IRating || 0);
  };

  /**
   * Calculate the arithmetic mean of an array of numbers.
   * @param {number[]} values
   * @returns {number}
   */
  const _mean = (values) => {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  /**
   * Calculate the median of an array of numbers.
   * @param {number[]} values - Will be sorted in place
   * @returns {number}
   */
  const _median = (values) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  /**
   * Calculate the population standard deviation of an array of numbers.
   * @param {number[]} values
   * @param {number} mean - Pre-computed mean
   * @returns {number}
   */
  const _stdDev = (values, mean) => {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  };

  /**
   * Build an iRating distribution by 1000-point brackets.
   * Returns an array of { range, count, percentage } objects.
   *
   * Brackets: 0-999, 1000-1999, 2000-2999, ..., up to the max found.
   *
   * @param {number[]} iratings - Array of iRating values
   * @returns {Array<{ range: string, min: number, max: number, count: number, percentage: number }>}
   */
  const getDistribution = (iratings) => {
    if (iratings.length === 0) return [];

    const maxIR = Math.max(...iratings);
    const bracketCount = Math.floor(maxIR / 1000) + 1;
    const total = iratings.length;
    const distribution = [];

    for (let i = 0; i < bracketCount; i++) {
      const min = i * 1000;
      const max = min + 999;
      const count = iratings.filter((ir) => ir >= min && ir <= max).length;
      distribution.push({
        range: `${min}-${max}`,
        min,
        max,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      });
    }

    return distribution;
  };

  /**
   * Calculate full SOF statistics from a list of drivers.
   *
   * @param {Array<object>} drivers - The raw driver list from session data
   * @param {number} [myIrating=null] - The current user's iRating (to compute rank/percentile)
   * @returns {{
   *   value: number,
   *   driver_count: number,
   *   min_irating: number,
   *   max_irating: number,
   *   median_irating: number,
   *   std_dev: number,
   *   distribution: Array,
   *   my_rank: number|null,
   *   my_percentile: number|null
   * }}
   */
  const calculateSOF = (drivers, myIrating = null) => {
    const eligible = _filterEligible(drivers);
    const iratings = eligible.map(_getIR);
    const count = iratings.length;

    // Handle empty field
    if (count === 0) {
      return {
        value: 0,
        driver_count: 0,
        min_irating: 0,
        max_irating: 0,
        median_irating: 0,
        std_dev: 0,
        distribution: [],
        my_rank: null,
        my_percentile: null,
      };
    }

    const sofValue = Math.round(_mean(iratings));
    const minIR = Math.min(...iratings);
    const maxIR = Math.max(...iratings);
    const medianIR = Math.round(_median(iratings));
    const stdDev = Math.round(_stdDev(iratings, sofValue));
    const distribution = getDistribution(iratings);

    // Calculate the user's rank and percentile within the field
    let myRank = null;
    let myPercentile = null;
    if (myIrating !== null && myIrating !== undefined) {
      const myIR = Number(myIrating);
      // Rank: how many drivers have a higher iRating (rank 1 = highest)
      const sorted = [...iratings].sort((a, b) => b - a);
      myRank = sorted.findIndex((ir) => myIR >= ir) + 1;
      if (myRank === 0) myRank = count; // Lowest in the field
      // Percentile: percentage of drivers with lower iRating
      const below = iratings.filter((ir) => ir < myIR).length;
      myPercentile = Math.round((below / count) * 100);
    }

    return {
      value: sofValue,
      driver_count: count,
      min_irating: minIR,
      max_irating: maxIR,
      median_irating: medianIR,
      std_dev: stdDev,
      distribution,
      my_rank: myRank,
      my_percentile: myPercentile,
    };
  };

  // Public API
  return {
    calculateSOF,
    getDistribution,
  };

})();
