/**
 * IRSDK SOF — LocalStorage Wrapper
 * ==================================
 * Provides a safe, namespaced wrapper around localStorage for persisting
 * user preferences such as collapsed panels, last viewed page, theme
 * settings, and favorite series.
 *
 * All keys are automatically prefixed with "irsof_" to avoid collisions
 * with other applications sharing the same origin.
 */

'use strict';

const storage = (() => {

  // Namespace prefix to avoid collisions in localStorage
  const PREFIX = 'irsof_';

  /**
   * Build the full namespaced key.
   * @param {string} key - The short key name
   * @returns {string} The prefixed key
   */
  const _prefixKey = (key) => `${PREFIX}${key}`;

  /**
   * Check whether localStorage is available and functional.
   * Some browsers block it in private mode or when storage quota is exceeded.
   * @returns {boolean}
   */
  const _isAvailable = () => {
    try {
      const testKey = _prefixKey('__test__');
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('[storage] localStorage is not available:', e.message);
      return false;
    }
  };

  /**
   * Retrieve a value from localStorage.
   * Returns the parsed JSON value, or the defaultValue if the key does not
   * exist or parsing fails.
   *
   * @param {string} key - The storage key (without prefix)
   * @param {*} [defaultValue=null] - Fallback value if key is absent
   * @returns {*} The stored value or the default
   */
  const get = (key, defaultValue = null) => {
    if (!_isAvailable()) return defaultValue;

    try {
      const raw = localStorage.getItem(_prefixKey(key));
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[storage] Failed to parse key "${key}":`, e.message);
      return defaultValue;
    }
  };

  /**
   * Store a value in localStorage.
   * The value is serialized to JSON before storage.
   *
   * @param {string} key - The storage key (without prefix)
   * @param {*} value - Any JSON-serializable value
   * @returns {boolean} True if the write succeeded
   */
  const set = (key, value) => {
    if (!_isAvailable()) return false;

    try {
      localStorage.setItem(_prefixKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[storage] Failed to set key "${key}":`, e.message);
      return false;
    }
  };

  /**
   * Remove a key from localStorage.
   *
   * @param {string} key - The storage key (without prefix)
   * @returns {boolean} True if the removal succeeded
   */
  const remove = (key) => {
    if (!_isAvailable()) return false;

    try {
      localStorage.removeItem(_prefixKey(key));
      return true;
    } catch (e) {
      console.warn(`[storage] Failed to remove key "${key}":`, e.message);
      return false;
    }
  };

  /**
   * Clear all keys in our namespace (does not touch other apps' data).
   * @returns {boolean} True if the operation succeeded
   */
  const clear = () => {
    if (!_isAvailable()) return false;

    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      return true;
    } catch (e) {
      console.warn('[storage] Failed to clear namespace:', e.message);
      return false;
    }
  };

  // Public API
  return { get, set, remove, clear };

})();
