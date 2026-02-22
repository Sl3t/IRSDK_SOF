/**
 * IRSDK SOF — Chart Wrapper (ApexCharts)
 * ========================================
 * Provides factory functions for creating dark-themed charts that match
 * the cockpit HUD aesthetic. All charts use the color palette defined
 * in CSS variables (black background, white text, cyan/green/red accents).
 *
 * Requires ApexCharts to be loaded globally (via CDN in index.html).
 *
 * Each function creates a new chart in the specified container element,
 * destroying any previous chart instance to prevent memory leaks.
 */

'use strict';

const charts = (() => {

  // Track active chart instances by container ID for cleanup
  const _instances = {};

  // =========================================================================
  // Shared theme configuration matching the cockpit HUD palette
  // =========================================================================
  const DARK_THEME = {
    mode: 'dark',
    palette: 'palette1',
    monochrome: { enabled: false },
  };

  /**
   * Base chart options shared by all chart types.
   * Individual chart creators merge their specific options on top.
   */
  const _baseOptions = () => ({
    chart: {
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
    theme: DARK_THEME,
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
    states: {
      hover: { filter: { type: 'lighten', value: 0.1 } },
      active: { filter: { type: 'darken', value: 0.1 } },
    },
  });

  /**
   * Destroy an existing chart instance in a container before rendering a new one.
   * @param {string} containerId - DOM element ID
   */
  const _destroyExisting = (containerId) => {
    if (_instances[containerId]) {
      try {
        _instances[containerId].destroy();
      } catch (e) {
        // Chart may already be destroyed
      }
      delete _instances[containerId];
    }
  };

  /**
   * Validate that ApexCharts is loaded and the container exists.
   * @param {string} containerId
   * @returns {HTMLElement|null} The container element, or null if invalid
   */
  const _getContainer = (containerId) => {
    if (typeof ApexCharts === 'undefined') {
      console.warn('[charts] ApexCharts is not loaded. Skipping chart render.');
      return null;
    }
    const el = document.getElementById(containerId);
    if (!el) {
      console.warn(`[charts] Container #${containerId} not found.`);
      return null;
    }
    return el;
  };

  // =========================================================================
  // iRating Distribution — Bar Chart
  // Shows iRating spread across 1k brackets with the user's position highlighted
  // =========================================================================

  /**
   * Create an iRating distribution bar chart.
   *
   * @param {string} containerId - DOM element ID for the chart
   * @param {Array<object>} drivers - Driver list with irating property
   * @param {number} [myIrating=null] - Highlight the user's bracket
   * @returns {ApexCharts|null} The chart instance
   */
  const createIRatingDistribution = (containerId, drivers, myIrating = null) => {
    const container = _getContainer(containerId);
    if (!container) return null;
    _destroyExisting(containerId);

    // Build distribution data using sofEngine
    const iratings = drivers
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    const distribution = sofEngine.getDistribution(iratings);

    // Determine which bracket the user falls in
    const myBracket = myIrating ? Math.floor(myIrating / 1000) : -1;

    // Color bars: cyan for user's bracket, dimmed white for others
    const colors = distribution.map((_, i) =>
      i === myBracket ? '#00BFFF' : '#4A4A4A'
    );

    const options = {
      ..._baseOptions(),
      chart: {
        ..._baseOptions().chart,
        type: 'bar',
        height: 280,
      },
      series: [{
        name: 'Drivers',
        data: distribution.map((d) => d.count),
      }],
      xaxis: {
        categories: distribution.map((d) => d.range),
        labels: {
          style: { colors: '#808080', fontSize: '10px' },
          rotate: -45,
        },
        axisBorder: { color: '#1E1E1E' },
        axisTicks: { color: '#1E1E1E' },
      },
      yaxis: {
        labels: { style: { colors: '#808080' } },
        title: { text: 'Drivers', style: { color: '#808080' } },
      },
      plotOptions: {
        bar: {
          borderRadius: 2,
          columnWidth: '70%',
          distributed: true,
        },
      },
      colors,
      dataLabels: {
        enabled: true,
        style: { fontSize: '11px', colors: ['#FFFFFF'] },
        offsetY: -6,
      },
      legend: { show: false },
      title: {
        text: 'iRating Distribution',
        align: 'left',
        style: {
          fontSize: '14px',
          fontFamily: "'Orbitron', sans-serif",
          color: '#FFFFFF',
        },
      },
    };

    const chart = new ApexCharts(container, options);
    chart.render();
    _instances[containerId] = chart;
    return chart;
  };

  // =========================================================================
  // iRating History — Line Chart
  // Shows iRating progression over time
  // =========================================================================

  /**
   * Create an iRating history line chart.
   *
   * @param {string} containerId - DOM element ID for the chart
   * @param {Array<{ date: string, irating: number }>} historyData - Time series data
   * @returns {ApexCharts|null} The chart instance
   */
  const createIRatingHistory = (containerId, historyData) => {
    const container = _getContainer(containerId);
    if (!container) return null;
    _destroyExisting(containerId);

    const dates = historyData.map((d) => d.date || d.timestamp);
    const values = historyData.map((d) => d.irating || d.iRating || d.value);

    const options = {
      ..._baseOptions(),
      chart: {
        ..._baseOptions().chart,
        type: 'line',
        height: 320,
        zoom: { enabled: true },
      },
      series: [{
        name: 'iRating',
        data: values,
      }],
      xaxis: {
        categories: dates,
        labels: {
          style: { colors: '#808080', fontSize: '10px' },
          rotate: -45,
          rotateAlways: false,
        },
        axisBorder: { color: '#1E1E1E' },
        axisTicks: { color: '#1E1E1E' },
      },
      yaxis: {
        labels: { style: { colors: '#808080' } },
        title: { text: 'iRating', style: { color: '#808080' } },
      },
      stroke: {
        curve: 'smooth',
        width: 2,
        colors: ['#00BFFF'],
      },
      markers: {
        size: 3,
        colors: ['#00BFFF'],
        strokeColors: '#000000',
        strokeWidth: 1,
        hover: { size: 5 },
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          type: 'vertical',
          opacityFrom: 0.3,
          opacityTo: 0.0,
          stops: [0, 100],
          colorStops: [
            { offset: 0, color: '#00BFFF', opacity: 0.3 },
            { offset: 100, color: '#00BFFF', opacity: 0.0 },
          ],
        },
      },
      title: {
        text: 'iRating History',
        align: 'left',
        style: {
          fontSize: '14px',
          fontFamily: "'Orbitron', sans-serif",
          color: '#FFFFFF',
        },
      },
    };

    const chart = new ApexCharts(container, options);
    chart.render();
    _instances[containerId] = chart;
    return chart;
  };

  // =========================================================================
  // Decision Gauge — Radial Bar
  // Shows the GO/NEUTRAL/NOGO score as a circular gauge
  // =========================================================================

  /**
   * Create a decision score gauge (radial bar).
   *
   * @param {string} containerId - DOM element ID for the chart
   * @param {number} score - Decision score (0-100)
   * @returns {ApexCharts|null} The chart instance
   */
  const createDecisionGauge = (containerId, score) => {
    const container = _getContainer(containerId);
    if (!container) return null;
    _destroyExisting(containerId);

    // Pick color based on score thresholds
    let color;
    let label;
    if (score >= 75) {
      color = '#00FF00'; // GO green
      label = 'GO';
    } else if (score >= 50) {
      color = '#FFFF00'; // NEUTRAL yellow
      label = 'NEUTRAL';
    } else {
      color = '#FF0000'; // NOGO red
      label = 'NOGO';
    }

    const options = {
      ..._baseOptions(),
      chart: {
        ..._baseOptions().chart,
        type: 'radialBar',
        height: 280,
      },
      series: [score],
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: {
            size: '65%',
            background: 'transparent',
          },
          track: {
            background: '#1E1E1E',
            strokeWidth: '100%',
            margin: 0,
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '16px',
              fontFamily: "'Orbitron', sans-serif",
              color: color,
              offsetY: -10,
            },
            value: {
              show: true,
              fontSize: '36px',
              fontFamily: "'Orbitron', sans-serif",
              color: color,
              offsetY: 10,
              formatter: (val) => `${Math.round(val)}`,
            },
          },
        },
      },
      colors: [color],
      labels: [label],
      stroke: { lineCap: 'round' },
    };

    const chart = new ApexCharts(container, options);
    chart.render();
    _instances[containerId] = chart;
    return chart;
  };

  // =========================================================================
  // Criteria Radar — Spider / Radar Chart
  // Shows each decision criterion as a spoke on a radar chart
  // =========================================================================

  /**
   * Create a criteria radar chart showing all 8 decision criteria.
   *
   * @param {string} containerId - DOM element ID for the chart
   * @param {Array<{ name: string, score: number }>} criteria - Array of criteria with scores
   * @returns {ApexCharts|null} The chart instance
   */
  const createCriteriaRadar = (containerId, criteria) => {
    const container = _getContainer(containerId);
    if (!container) return null;
    _destroyExisting(containerId);

    const labels = criteria.map((c) => c.name);
    const scores = criteria.map((c) => c.score);

    const options = {
      ..._baseOptions(),
      chart: {
        ..._baseOptions().chart,
        type: 'radar',
        height: 350,
      },
      series: [{
        name: 'Score',
        data: scores,
      }],
      xaxis: {
        categories: labels,
        labels: {
          style: {
            colors: Array(labels.length).fill('#808080'),
            fontSize: '11px',
          },
        },
      },
      yaxis: {
        show: false,
        min: 0,
        max: 100,
        tickAmount: 4,
      },
      stroke: {
        show: true,
        width: 2,
        colors: ['#00BFFF'],
      },
      fill: {
        opacity: 0.2,
        colors: ['#00BFFF'],
      },
      markers: {
        size: 4,
        colors: ['#00BFFF'],
        strokeColors: '#000000',
        strokeWidth: 1,
      },
      plotOptions: {
        radar: {
          polygons: {
            strokeColors: '#1E1E1E',
            connectorColors: '#1E1E1E',
            fill: { colors: ['#0A0A0A', '#050505'] },
          },
        },
      },
      title: {
        text: 'Decision Criteria',
        align: 'left',
        style: {
          fontSize: '14px',
          fontFamily: "'Orbitron', sans-serif",
          color: '#FFFFFF',
        },
      },
    };

    const chart = new ApexCharts(container, options);
    chart.render();
    _instances[containerId] = chart;
    return chart;
  };

  // =========================================================================
  // Cleanup utility
  // =========================================================================

  /**
   * Destroy all active chart instances (e.g. when navigating away from a page).
   */
  const destroyAll = () => {
    Object.keys(_instances).forEach((id) => _destroyExisting(id));
  };

  /**
   * Destroy a specific chart by its container ID.
   * @param {string} containerId
   */
  const destroy = (containerId) => {
    _destroyExisting(containerId);
  };

  // Public API
  return {
    createIRatingDistribution,
    createIRatingHistory,
    createDecisionGauge,
    createCriteriaRadar,
    destroyAll,
    destroy,
  };

})();
