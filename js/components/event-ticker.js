/**
 * EventTicker Component (Singleton)
 * ===================================
 * Real-time event log displaying timestamped entries for session events.
 * Maintains an internal events array (max 50) and supports live refresh
 * without full re-render.
 *
 * Event types and colors:
 *   join      = green   (driver joined the session)
 *   leave     = red     (driver left the session)
 *   sof       = cyan    (SOF recalculated)
 *   condition = yellow  (track conditions changed)
 *   info      = gray    (general information)
 *
 * Usage:
 *   container.innerHTML = EventTicker.render();
 *   EventTicker.addEvent('join', 'John Doe joined the session');
 *   EventTicker.refresh();
 */

'use strict';

const EventTicker = (() => {

  /** Maximum number of events to keep in the buffer. */
  const MAX_EVENTS = 50;

  /** DOM ID for the ticker container. */
  const TICKER_ID = 'event-ticker';

  /** DOM ID for the events list inside the ticker. */
  const TICKER_LIST_ID = 'event-ticker-list';

  /** Internal events array (newest at the end). */
  const _events = [];

  // -------------------------------------------------------------------------
  // Event type configuration
  // -------------------------------------------------------------------------

  /**
   * Visual config for each event type.
   */
  const TYPE_CONFIG = {
    join:      { icon: '+',   color: 'var(--accent-green)' },
    leave:     { icon: '-',   color: 'var(--accent-red)' },
    sof:       { icon: 'S',   color: 'var(--accent-cyan)' },
    condition: { icon: '!',   color: 'var(--accent-yellow)' },
    info:      { icon: 'i',   color: 'var(--text-secondary)' },
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Format a Date object as [HH:MM:SS].
   * @param {Date} date
   * @returns {string}
   */
  function _formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `[${h}:${m}:${s}]`;
  }

  /**
   * Render a single event entry as an HTML string.
   * @param {object} event - { type, message, timestamp }
   * @param {boolean} [animated=false] - Whether to apply the ticker-entry animation
   * @returns {string} HTML
   */
  function _renderEntry(event, animated) {
    const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
    const animClass = animated ? 'ticker-entry' : '';

    return `
      <div class="event-ticker__entry ${animClass}"
           style="display:flex; align-items:flex-start; gap:var(--spacing-xs);
                  padding:3px 0; font-family:var(--font-data); font-size:var(--text-xs);
                  line-height:1.4;">
        <span style="color:var(--text-muted); flex-shrink:0;">
          ${_formatTime(event.timestamp)}
        </span>
        <span style="color:${cfg.color}; font-weight:var(--weight-bold);
                     flex-shrink:0; width:14px; text-align:center;">
          ${cfg.icon}
        </span>
        <span style="color:var(--text-secondary); word-break:break-word;">
          ${event.message}
        </span>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Add a new event to the ticker.
   *
   * @param {string} type - Event type: 'join', 'leave', 'sof', 'condition', 'info'
   * @param {string} message - Human-readable event description
   */
  function addEvent(type, message) {
    const event = {
      type: TYPE_CONFIG[type] ? type : 'info',
      message: message || '',
      timestamp: new Date(),
    };

    _events.push(event);

    // Trim to max size (remove oldest events from the front)
    while (_events.length > MAX_EVENTS) {
      _events.shift();
    }

    // If the ticker is already in the DOM, append the new entry and scroll
    refresh(event);
  }

  /**
   * Render the full ticker container as an HTML string.
   * Call this when building a page; the ticker will be populated with
   * all current events from the buffer.
   *
   * @returns {string} HTML markup
   */
  function render() {
    const entries = _events.map((e) => _renderEntry(e, false)).join('');

    return `
      <div id="${TICKER_ID}" class="card event-ticker"
           style="background:var(--bg-card); border:1px solid var(--border);
                  border-radius:var(--radius-md); padding:var(--spacing-md);">

        <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                   color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Event Log
        </h4>

        <div id="${TICKER_LIST_ID}"
             style="max-height:200px; overflow-y:auto; overflow-x:hidden;
                    scrollbar-width:thin; scrollbar-color:var(--border) transparent;">
          ${entries || '<div style="color:var(--text-muted); font-family:var(--font-data); font-size:var(--text-xs);">No events yet.</div>'}
        </div>
      </div>`;
  }

  /**
   * Refresh the ticker DOM without full page re-render.
   * If a new event is provided, append only that entry and auto-scroll.
   * Otherwise, rebuild the entire list from the events buffer.
   *
   * @param {object|null} [newEvent=null] - Optional single new event to append
   */
  function refresh(newEvent) {
    const list = document.getElementById(TICKER_LIST_ID);
    if (!list) return; // Ticker is not in the DOM

    if (newEvent) {
      // Remove the "No events" placeholder if present
      const placeholder = list.querySelector('[style*="color:var(--text-muted)"]');
      if (placeholder && _events.length === 1) {
        placeholder.remove();
      }

      // Append the new entry with animation
      const entryHtml = _renderEntry(newEvent, true);
      list.insertAdjacentHTML('beforeend', entryHtml);

      // Auto-scroll to the bottom
      list.scrollTop = list.scrollHeight;
    } else {
      // Full rebuild
      const entries = _events.map((e) => _renderEntry(e, false)).join('');
      list.innerHTML = entries || '<div style="color:var(--text-muted); font-family:var(--font-data); font-size:var(--text-xs);">No events yet.</div>';
      list.scrollTop = list.scrollHeight;
    }
  }

  /**
   * Clear all events from the buffer and the DOM.
   */
  function clear() {
    _events.length = 0;
    refresh();
  }

  /**
   * Get the current events array (read-only snapshot).
   * @returns {Array}
   */
  function getEvents() {
    return [..._events];
  }

  return {
    addEvent,
    render,
    refresh,
    clear,
    getEvents,
  };
})();
