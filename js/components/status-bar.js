/**
 * StatusBar Component
 * ====================
 * Renders connection status indicators in the sidebar for both
 * the IRSDK bridge (WebSocket) and the PHP API backend.
 *
 * Each indicator is a colored dot (green = connected, red = disconnected)
 * accompanied by a small text label.
 *
 * Usage:
 *   StatusBar.init('#status-bar-container');
 *   StatusBar.update(true, false);  // IRSDK connected, API disconnected
 */

'use strict';

const StatusBar = (() => {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** @type {HTMLElement|null} The container element */
  let _container = null;

  /** @type {boolean} Current IRSDK connection state */
  let _irsdkConnected = false;

  /** @type {boolean} Current API connection state */
  let _apiConnected = false;

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Build the HTML string for the status bar.
   * Uses .status-dot and .status-label classes from the design system.
   *
   * @returns {string} HTML markup
   */
  function _buildHTML() {
    const irsdkDotClass = _irsdkConnected ? 'status-dot--connected' : 'status-dot--disconnected';
    const apiDotClass   = _apiConnected   ? 'status-dot--connected' : 'status-dot--disconnected';

    const irsdkColor = _irsdkConnected ? 'var(--accent-green)' : 'var(--accent-red)';
    const apiColor   = _apiConnected   ? 'var(--accent-green)' : 'var(--accent-red)';

    return `
      <div class="status-bar" style="display:flex; flex-direction:column; gap:var(--spacing-sm); padding:var(--spacing-sm) var(--spacing-md);">
        <div class="status-bar__indicator" style="display:flex; align-items:center; gap:var(--spacing-sm);">
          <span class="status-dot ${irsdkDotClass}"
                style="width:8px; height:8px; border-radius:var(--radius-full);
                       background:${irsdkColor};
                       box-shadow:0 0 6px ${irsdkColor};
                       display:inline-block; flex-shrink:0;"></span>
          <span class="status-label"
                style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-secondary); text-transform:uppercase;
                       letter-spacing:0.05em;">IRSDK</span>
        </div>
        <div class="status-bar__indicator" style="display:flex; align-items:center; gap:var(--spacing-sm);">
          <span class="status-dot ${apiDotClass}"
                style="width:8px; height:8px; border-radius:var(--radius-full);
                       background:${apiColor};
                       box-shadow:0 0 6px ${apiColor};
                       display:inline-block; flex-shrink:0;"></span>
          <span class="status-label"
                style="font-family:var(--font-data); font-size:var(--text-xs);
                       color:var(--text-secondary); text-transform:uppercase;
                       letter-spacing:0.05em;">API</span>
        </div>
      </div>
    `;
  }

  /**
   * Re-render the status bar into the container without replacing
   * the container element itself (preserves DOM references).
   */
  function _render() {
    if (!_container) return;
    _container.innerHTML = _buildHTML();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Initialise the StatusBar by attaching it to a container element.
   *
   * @param {string|HTMLElement} selector - CSS selector or DOM element
   */
  function init(selector) {
    _container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!_container) {
      console.warn('[StatusBar] Container not found:', selector);
      return;
    }

    _render();
  }

  /**
   * Update the connection states and re-render.
   *
   * @param {boolean} irsdkConnected - Whether the IRSDK bridge WebSocket is connected
   * @param {boolean} apiConnected   - Whether the PHP API is reachable
   */
  function update(irsdkConnected, apiConnected) {
    _irsdkConnected = !!irsdkConnected;
    _apiConnected   = !!apiConnected;
    _render();
  }

  /**
   * Returns the current connection states.
   *
   * @returns {{ irsdk: boolean, api: boolean }}
   */
  function getStatus() {
    return { irsdk: _irsdkConnected, api: _apiConnected };
  }

  return {
    init,
    update,
    getStatus,
  };
})();
