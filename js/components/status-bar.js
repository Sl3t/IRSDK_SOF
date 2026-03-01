/**
 * StatusBar Component
 * ====================
 * Renders connection status indicator in the sidebar for
 * the PHP API backend.
 *
 * The indicator is a colored dot (green = connected, red = disconnected)
 * accompanied by a small text label.
 *
 * Usage:
 *   StatusBar.init('#status-bar-container');
 *   StatusBar.update(true);  // API connected
 */

'use strict';

const StatusBar = (() => {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** @type {HTMLElement|null} The container element */
  let _container = null;

  /** @type {boolean} Current API connection state */
  let _apiConnected = false;

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Build the HTML string for the status bar.
   *
   * @returns {string} HTML markup
   */
  function _buildHTML() {
    const apiDotClass = _apiConnected ? 'status-dot--connected' : 'status-dot--disconnected';
    const apiColor    = _apiConnected ? 'var(--accent-green)' : 'var(--accent-red)';

    return `
      <div class="status-bar" style="display:flex; flex-direction:column; gap:var(--spacing-sm); padding:var(--spacing-sm) var(--spacing-md);">
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
   * Re-render the status bar into the container.
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
   * Update the connection state and re-render.
   *
   * @param {boolean} apiConnected - Whether the PHP API is reachable
   */
  function update(apiConnected) {
    _apiConnected = !!apiConnected;
    _render();
  }

  /**
   * Returns the current connection state.
   *
   * @returns {{ api: boolean }}
   */
  function getStatus() {
    return { api: _apiConnected };
  }

  return {
    init,
    update,
    getStatus,
  };
})();
