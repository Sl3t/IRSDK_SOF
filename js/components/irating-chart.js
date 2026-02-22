/**
 * IRatingChart Component
 * =======================
 * Renders an iRating distribution histogram as an ApexCharts bar chart.
 * Shows how many drivers fall into each iRating bracket with the user's
 * own iRating marked with an annotation line.
 *
 * Brackets: 0-1k, 1k-1.5k, 1.5k-2k, 2k-2.5k, 2.5k-3k, 3k-3.5k, 3.5k-4k, 4k+
 *
 * Dark theme matching the cockpit palette (cyan bars, white labels, black bg).
 *
 * Usage:
 *   IRatingChart.render('chart-container', driversArray, 2500);
 */

'use strict';

const IRatingChart = (() => {

  /** Track active chart instance for cleanup. */
  let _chartInstance = null;
  let _containerId = null;

  // -------------------------------------------------------------------------
  // Bracket definitions
  // -------------------------------------------------------------------------

  /**
   * Fixed iRating brackets for the histogram.
   * Each bracket has a label, min (inclusive), and max (exclusive).
   */
  const BRACKETS = [
    { label: '0-1k',     min: 0,    max: 1000 },
    { label: '1k-1.5k',  min: 1000, max: 1500 },
    { label: '1.5k-2k',  min: 1500, max: 2000 },
    { label: '2k-2.5k',  min: 2000, max: 2500 },
    { label: '2.5k-3k',  min: 2500, max: 3000 },
    { label: '3k-3.5k',  min: 3000, max: 3500 },
    { label: '3.5k-4k',  min: 3500, max: 4000 },
    { label: '4k+',      min: 4000, max: Infinity },
  ];

  // -------------------------------------------------------------------------
  // Build distribution data
  // -------------------------------------------------------------------------

  /**
   * Count drivers per bracket from a list of iRating values.
   * @param {number[]} iratings - Array of iRating values
   * @returns {number[]} Count per bracket (same length as BRACKETS)
   */
  function _buildDistribution(iratings) {
    const counts = BRACKETS.map(() => 0);
    iratings.forEach((ir) => {
      for (let i = 0; i < BRACKETS.length; i++) {
        if (ir >= BRACKETS[i].min && ir < BRACKETS[i].max) {
          counts[i]++;
          break;
        }
      }
    });
    return counts;
  }

  /**
   * Determine which bracket index a given iRating falls in.
   * @param {number} irating
   * @returns {number} Bracket index (0-based)
   */
  function _findBracketIndex(irating) {
    for (let i = 0; i < BRACKETS.length; i++) {
      if (irating >= BRACKETS[i].min && irating < BRACKETS[i].max) {
        return i;
      }
    }
    return BRACKETS.length - 1; // 4k+ bucket for very high values
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Render the iRating distribution bar chart into a DOM container.
   * Destroys any existing chart in the same container first.
   *
   * @param {string} containerId - DOM element ID for the chart
   * @param {Array<object>} drivers - Driver list with irating property
   * @param {number} [myIrating=null] - The user's iRating to highlight
   * @returns {ApexCharts|null} The chart instance or null if rendering failed
   */
  function render(containerId, drivers, myIrating) {
    // Validate prerequisites
    if (typeof ApexCharts === 'undefined') {
      console.warn('[IRatingChart] ApexCharts is not loaded. Skipping render.');
      return null;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[IRatingChart] Container #${containerId} not found.`);
      return null;
    }

    // Destroy previous instance in this container
    if (_chartInstance && _containerId === containerId) {
      try { _chartInstance.destroy(); } catch (e) { /* already destroyed */ }
      _chartInstance = null;
    }

    // Extract iRatings from drivers
    const iratings = (Array.isArray(drivers) ? drivers : [])
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    // Build distribution counts
    const counts = _buildDistribution(iratings);
    const labels = BRACKETS.map((b) => b.label);

    // Determine the user's bracket for highlighting
    const myBracketIdx = myIrating ? _findBracketIndex(myIrating) : -1;

    // Color bars: cyan for user's bracket, muted gray for others
    const colors = BRACKETS.map((_, i) =>
      i === myBracketIdx ? '#00BFFF' : '#4A4A4A'
    );

    // Build annotation for user's iRating
    const annotations = {};
    if (myIrating && myIrating > 0) {
      annotations.xaxis = [{
        x: labels[myBracketIdx],
        borderColor: '#00FF00',
        strokeDashArray: 4,
        label: {
          text: `My iR: ${myIrating.toLocaleString()}`,
          orientation: 'horizontal',
          style: {
            color: '#000000',
            background: '#00FF00',
            fontSize: '11px',
            fontFamily: "'Roboto Mono', monospace",
            padding: { left: 6, right: 6, top: 2, bottom: 2 },
          },
        },
      }];
    }

    // Chart configuration
    const options = {
      chart: {
        type: 'bar',
        height: 280,
        background: '#000000',
        foreColor: '#FFFFFF',
        fontFamily: "'Roboto Mono', monospace",
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 600,
        },
      },
      theme: {
        mode: 'dark',
        palette: 'palette1',
      },
      series: [{
        name: 'Drivers',
        data: counts,
      }],
      xaxis: {
        categories: labels,
        labels: {
          style: { colors: '#808080', fontSize: '10px' },
          rotate: -45,
        },
        axisBorder: { color: '#1E1E1E' },
        axisTicks: { color: '#1E1E1E' },
      },
      yaxis: {
        labels: { style: { colors: '#808080' } },
        title: {
          text: 'Drivers',
          style: { color: '#808080', fontSize: '11px' },
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 2,
          columnWidth: '70%',
          distributed: true,
        },
      },
      colors: colors,
      dataLabels: {
        enabled: true,
        style: { fontSize: '11px', colors: ['#FFFFFF'] },
        offsetY: -6,
      },
      legend: { show: false },
      grid: {
        borderColor: '#1E1E1E',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      tooltip: {
        theme: 'dark',
        style: { fontSize: '12px', fontFamily: "'Roboto Mono', monospace" },
      },
      title: {
        text: 'iRating Distribution',
        align: 'left',
        style: {
          fontSize: '14px',
          fontFamily: "'Orbitron', sans-serif",
          color: '#FFFFFF',
        },
      },
      annotations: annotations,
    };

    // Render the chart
    _chartInstance = new ApexCharts(container, options);
    _chartInstance.render();
    _containerId = containerId;

    return _chartInstance;
  }

  /**
   * Destroy the current chart instance.
   */
  function destroy() {
    if (_chartInstance) {
      try { _chartInstance.destroy(); } catch (e) { /* already destroyed */ }
      _chartInstance = null;
      _containerId = null;
    }
  }

  return {
    render,
    destroy,
  };
})();
