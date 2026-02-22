/**
 * SettingsPage — Application Settings Page Renderer
 * ====================================================
 * Full settings page with form sections for identity, objectives,
 * API credentials, bridge configuration, decision thresholds/weights,
 * and cache management.
 *
 * Form sections:
 *   - Identity: My iRacing User ID, Name
 *   - Objectives: iRating target, SR minimum
 *   - API: OAuth2 client_id, client_secret (password fields), test connection
 *   - Bridge: WebSocket host, port, test connection
 *   - Decision: GO threshold slider (default 75), NOGO threshold slider (default 50)
 *   - Decision weights: 8 sliders (one per criterion) that must sum to 100%
 *   - Cache: TTL values, clear cache button
 *
 * Usage:
 *   SettingsPage.render();  // Writes directly into #app container
 */

'use strict';

const SettingsPage = (() => {

  // =========================================================================
  // Default settings
  // =========================================================================

  const DEFAULTS = {
    my_user_id:       '',
    my_name:          '',
    irating_target:   2500,
    sr_minimum:       3.0,
    oauth_client_id:  '',
    oauth_client_secret: '',
    bridge_ws_host:   'localhost',
    bridge_ws_port:   8182,
    threshold_go:     75,
    threshold_nogo:   50,
    weight_sof_ratio:         20,
    weight_position_estimate: 15,
    weight_irating_gain:      15,
    weight_field_quality:     15,
    weight_danger_score:      10,
    weight_track_conditions:  10,
    weight_safety_rating:     10,
    weight_participant_count: 5,
    cache_ttl_driver:  86400,
    cache_ttl_series:  3600,
    cache_ttl_guide:   300,
    cache_ttl_profile: 900,
  };

  // =========================================================================
  // Render
  // =========================================================================

  /**
   * Render the settings page into the #app container.
   * Loads current settings from localStorage and API.
   */
  async function render() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Load settings from API (with localStorage fallback for each)
    const apiSettings = await api.getSettings();
    const s = apiSettings || {};

    // Merge: API response -> localStorage -> defaults
    const val = (key) => {
      return s[key] || storage.get(key, DEFAULTS[key]);
    };

    // Weight labels for the decision criteria
    const weightCriteria = [
      { key: 'weight_sof_ratio',         label: 'SOF Ratio' },
      { key: 'weight_position_estimate',  label: 'Estimated Position' },
      { key: 'weight_irating_gain',       label: 'iRating Gain' },
      { key: 'weight_field_quality',      label: 'Field Quality' },
      { key: 'weight_danger_score',       label: 'Danger Score' },
      { key: 'weight_track_conditions',   label: 'Track Conditions' },
      { key: 'weight_safety_rating',      label: 'Safety Rating' },
      { key: 'weight_participant_count',  label: 'Participant Count' },
    ];

    // Build weight sliders
    let weightSliders = '';
    weightCriteria.forEach((c) => {
      const v = Number(val(c.key)) || DEFAULTS[c.key];
      weightSliders += `
        <div style="display:flex; align-items:center; gap:var(--spacing-sm);
                    margin-bottom:var(--spacing-xs);">
          <label style="flex:0 0 160px; font-family:var(--font-data);
                        font-size:var(--text-xs); color:var(--text-secondary);
                        text-transform:uppercase;">${c.label}</label>
          <input type="range" min="0" max="50" value="${v}"
                 data-setting="${c.key}" class="settings-weight-slider"
                 oninput="SettingsPage.updateWeightDisplay()"
                 style="flex:1; accent-color:var(--accent-cyan);" />
          <span class="weight-value" data-for="${c.key}"
                style="flex:0 0 40px; text-align:right; font-family:var(--font-data);
                       font-size:var(--text-sm); color:var(--accent-cyan);
                       font-weight:var(--weight-bold);">
            ${v}%
          </span>
        </div>`;
    });

    // ----- Build page HTML -----
    const html = `
      <div class="animate-fade-in" style="padding:var(--spacing-lg);
                  max-width:800px; margin:0 auto;">

        <h2 style="font-family:var(--font-display); font-size:var(--text-xl);
                   color:var(--text-primary); margin:0 0 var(--spacing-lg) 0;
                   text-transform:uppercase; letter-spacing:0.08em;">
          Settings
        </h2>

        <!-- ============================================ -->
        <!-- SECTION: Identity -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Identity
          </h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);">
            ${_inputField('my_user_id', 'iRacing User ID', val('my_user_id'), 'text', '123456')}
            ${_inputField('my_name', 'Display Name', val('my_name'), 'text', 'Your Name')}
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Objectives -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Objectives
          </h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);">
            ${_inputField('irating_target', 'iRating Target', val('irating_target'), 'number', '2500')}
            ${_inputField('sr_minimum', 'SR Minimum', val('sr_minimum'), 'number', '3.00')}
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: iRacing API -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            iRacing API (OAuth2)
          </h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);
                      margin-bottom:var(--spacing-md);">
            ${_inputField('oauth_client_id', 'Client ID', val('oauth_client_id'), 'password', 'client_id')}
            ${_inputField('oauth_client_secret', 'Client Secret', val('oauth_client_secret'), 'password', 'client_secret')}
          </div>
          <button onclick="SettingsPage.testApiConnection()"
                  style="padding:var(--spacing-xs) var(--spacing-md);
                         background:var(--accent-cyan-dim); color:var(--accent-cyan);
                         border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         cursor:pointer; transition:all 150ms ease;">
            Test API Connection
          </button>
          <span id="api-test-result" style="margin-left:var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted);"></span>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: IRSDK Bridge -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            IRSDK Bridge (WebSocket)
          </h4>
          <div style="display:grid; grid-template-columns:2fr 1fr; gap:var(--spacing-md);
                      margin-bottom:var(--spacing-md);">
            ${_inputField('bridge_ws_host', 'Host', val('bridge_ws_host'), 'text', 'localhost')}
            ${_inputField('bridge_ws_port', 'Port', val('bridge_ws_port'), 'number', '8182')}
          </div>
          <button onclick="SettingsPage.testBridgeConnection()"
                  style="padding:var(--spacing-xs) var(--spacing-md);
                         background:var(--accent-cyan-dim); color:var(--accent-cyan);
                         border:1px solid var(--accent-cyan); border-radius:var(--radius-md);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         cursor:pointer; transition:all 150ms ease;">
            Test Bridge Connection
          </button>
          <span id="bridge-test-result" style="margin-left:var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted);"></span>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Decision Thresholds -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Decision Thresholds
          </h4>

          <!-- GO threshold -->
          <div style="display:flex; align-items:center; gap:var(--spacing-sm);
                      margin-bottom:var(--spacing-sm);">
            <label style="flex:0 0 120px; font-family:var(--font-data);
                          font-size:var(--text-xs); color:var(--accent-green);
                          text-transform:uppercase;">GO Threshold</label>
            <input type="range" min="50" max="100" value="${val('threshold_go')}"
                   data-setting="threshold_go"
                   oninput="document.getElementById('go-val').textContent=this.value+'%'"
                   style="flex:1; accent-color:var(--accent-green);" />
            <span id="go-val" style="flex:0 0 40px; text-align:right;
                       font-family:var(--font-data); font-size:var(--text-sm);
                       color:var(--accent-green); font-weight:var(--weight-bold);">
              ${val('threshold_go')}%
            </span>
          </div>

          <!-- NOGO threshold -->
          <div style="display:flex; align-items:center; gap:var(--spacing-sm);">
            <label style="flex:0 0 120px; font-family:var(--font-data);
                          font-size:var(--text-xs); color:var(--accent-red);
                          text-transform:uppercase;">NOGO Threshold</label>
            <input type="range" min="0" max="75" value="${val('threshold_nogo')}"
                   data-setting="threshold_nogo"
                   oninput="document.getElementById('nogo-val').textContent=this.value+'%'"
                   style="flex:1; accent-color:var(--accent-red);" />
            <span id="nogo-val" style="flex:0 0 40px; text-align:right;
                       font-family:var(--font-data); font-size:var(--text-sm);
                       color:var(--accent-red); font-weight:var(--weight-bold);">
              ${val('threshold_nogo')}%
            </span>
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Decision Weights -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-sm) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Decision Weights
          </h4>
          <p style="font-family:var(--font-data); font-size:var(--text-xs);
                    color:var(--text-muted); margin:0 0 var(--spacing-md) 0;">
            Must sum to 100%.
            Current total: <span id="weight-total" style="color:var(--accent-cyan);
                                  font-weight:var(--weight-bold);">100%</span>
          </p>
          ${weightSliders}
        </div>

        <!-- ============================================ -->
        <!-- SECTION: Cache -->
        <!-- ============================================ -->
        <div class="card" style="background:var(--bg-card); border:1px solid var(--border);
                                  border-radius:var(--radius-md); padding:var(--spacing-md);
                                  margin-bottom:var(--spacing-lg);">
          <h4 style="font-family:var(--font-display); font-size:var(--text-sm);
                     color:var(--accent-cyan); margin:0 0 var(--spacing-md) 0;
                     text-transform:uppercase; letter-spacing:0.08em;">
            Cache
          </h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
                      gap:var(--spacing-md); margin-bottom:var(--spacing-md);">
            ${_inputField('cache_ttl_driver', 'Driver TTL (s)', val('cache_ttl_driver'), 'number', '86400')}
            ${_inputField('cache_ttl_series', 'Series TTL (s)', val('cache_ttl_series'), 'number', '3600')}
            ${_inputField('cache_ttl_guide', 'Race Guide TTL (s)', val('cache_ttl_guide'), 'number', '300')}
            ${_inputField('cache_ttl_profile', 'Profile TTL (s)', val('cache_ttl_profile'), 'number', '900')}
          </div>
          <button onclick="SettingsPage.clearCache()"
                  style="padding:var(--spacing-xs) var(--spacing-md);
                         background:var(--accent-red-dim); color:var(--accent-red);
                         border:1px solid var(--accent-red); border-radius:var(--radius-md);
                         font-family:var(--font-data); font-size:var(--text-sm);
                         cursor:pointer; transition:all 150ms ease;">
            Clear All Cache
          </button>
          <span id="cache-clear-result" style="margin-left:var(--spacing-sm);
                     font-family:var(--font-data); font-size:var(--text-xs);
                     color:var(--text-muted);"></span>
        </div>

        <!-- ============================================ -->
        <!-- SAVE ALL BUTTON -->
        <!-- ============================================ -->
        <div style="text-align:center; margin-bottom:var(--spacing-2xl);">
          <button id="settings-save-btn" onclick="SettingsPage.saveAll()"
                  style="padding:var(--spacing-sm) var(--spacing-xl);
                         background:var(--accent-cyan-dim); color:var(--accent-cyan);
                         border:2px solid var(--accent-cyan); border-radius:var(--radius-md);
                         font-family:var(--font-display); font-size:var(--text-base);
                         text-transform:uppercase; letter-spacing:0.08em;
                         cursor:pointer; transition:all 200ms ease;">
            Save All Settings
          </button>
        </div>

      </div>`;

    appContainer.innerHTML = html;

    // Initialize weight total display
    updateWeightDisplay();
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Render a labeled input field.
   * @param {string} key - data-setting attribute value
   * @param {string} label
   * @param {string|number} value
   * @param {string} type - input type
   * @param {string} placeholder
   * @returns {string} HTML
   */
  function _inputField(key, label, value, type, placeholder) {
    return `
      <div>
        <label style="font-family:var(--font-data); font-size:var(--text-xs);
                      color:var(--text-muted); text-transform:uppercase;
                      display:block; margin-bottom:4px;">${label}</label>
        <input type="${type}" value="${value || ''}" placeholder="${placeholder}"
               data-setting="${key}"
               style="width:100%; padding:var(--spacing-xs) var(--spacing-sm);
                      background:var(--bg-input); color:var(--text-primary);
                      border:1px solid var(--border); border-radius:var(--radius-md);
                      font-family:var(--font-data); font-size:var(--text-sm);
                      outline:none; box-sizing:border-box;
                      transition:border-color 150ms ease;"
               onfocus="this.style.borderColor='var(--accent-cyan)'"
               onblur="this.style.borderColor='var(--border)'" />
      </div>`;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Update the weight total display and individual value labels.
   */
  function updateWeightDisplay() {
    const sliders = document.querySelectorAll('.settings-weight-slider');
    let total = 0;
    sliders.forEach((slider) => {
      const val = Number(slider.value);
      total += val;
      // Update the corresponding value span
      const key = slider.getAttribute('data-setting');
      const span = document.querySelector(`.weight-value[data-for="${key}"]`);
      if (span) span.textContent = val + '%';
    });

    const totalEl = document.getElementById('weight-total');
    if (totalEl) {
      totalEl.textContent = total + '%';
      totalEl.style.color = total === 100 ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }

  /**
   * Save all settings to localStorage and the API.
   */
  async function saveAll() {
    const inputs = document.querySelectorAll('[data-setting]');
    const settings = {};

    inputs.forEach((input) => {
      const key = input.getAttribute('data-setting');
      let value = input.type === 'range' ? Number(input.value) : input.value;

      // Store locally
      storage.set(key, value);
      settings[key] = value;
    });

    // Send to API
    try {
      await api.post('settings', settings);
    } catch (err) {
      console.error('[SettingsPage] Failed to save settings to API:', err);
    }

    // Update WebSocket connection if bridge settings changed
    const newHost = settings.bridge_ws_host || 'localhost';
    const newPort = settings.bridge_ws_port || 8182;
    const newUrl = `ws://${newHost}:${newPort}`;
    if (newUrl !== wsClient.getUrl()) {
      wsClient.setUrl(newUrl);
    }

    // Visual feedback
    const btn = document.getElementById('settings-save-btn');
    if (btn) {
      btn.textContent = 'SAVED!';
      btn.style.borderColor = 'var(--accent-green)';
      btn.style.color = 'var(--accent-green)';
      btn.style.background = 'var(--accent-green-dim)';
      setTimeout(() => {
        btn.textContent = 'Save All Settings';
        btn.style.borderColor = 'var(--accent-cyan)';
        btn.style.color = 'var(--accent-cyan)';
        btn.style.background = 'var(--accent-cyan-dim)';
      }, 2000);
    }
  }

  /**
   * Test the iRacing API connection using the entered credentials.
   */
  async function testApiConnection() {
    const resultEl = document.getElementById('api-test-result');
    if (resultEl) {
      resultEl.textContent = 'Testing...';
      resultEl.style.color = 'var(--accent-cyan)';
    }

    try {
      const clientId = document.querySelector('[data-setting="oauth_client_id"]')?.value || '';
      const clientSecret = document.querySelector('[data-setting="oauth_client_secret"]')?.value || '';

      const result = await api.post('iracing/auth', {
        client_id: clientId,
        client_secret: clientSecret,
      });

      if (result && !result.error) {
        if (resultEl) {
          resultEl.textContent = 'Connected successfully!';
          resultEl.style.color = 'var(--accent-green)';
        }
      } else {
        if (resultEl) {
          resultEl.textContent = 'Connection failed: ' + (result?.message || 'Unknown error');
          resultEl.style.color = 'var(--accent-red)';
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Error: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    }
  }

  /**
   * Test the IRSDK Bridge WebSocket connection.
   */
  function testBridgeConnection() {
    const resultEl = document.getElementById('bridge-test-result');
    if (resultEl) {
      resultEl.textContent = 'Testing...';
      resultEl.style.color = 'var(--accent-cyan)';
    }

    const host = document.querySelector('[data-setting="bridge_ws_host"]')?.value || 'localhost';
    const port = document.querySelector('[data-setting="bridge_ws_port"]')?.value || '8182';
    const url = `ws://${host}:${port}`;

    try {
      const testWs = new WebSocket(url);
      const timeout = setTimeout(() => {
        testWs.close();
        if (resultEl) {
          resultEl.textContent = 'Connection timed out';
          resultEl.style.color = 'var(--accent-red)';
        }
      }, 5000);

      testWs.onopen = () => {
        clearTimeout(timeout);
        testWs.close();
        if (resultEl) {
          resultEl.textContent = 'Bridge reachable!';
          resultEl.style.color = 'var(--accent-green)';
        }
      };

      testWs.onerror = () => {
        clearTimeout(timeout);
        if (resultEl) {
          resultEl.textContent = 'Connection failed';
          resultEl.style.color = 'var(--accent-red)';
        }
      };
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Error: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    }
  }

  /**
   * Clear all API cache via the backend.
   */
  async function clearCache() {
    const resultEl = document.getElementById('cache-clear-result');
    if (resultEl) {
      resultEl.textContent = 'Clearing...';
      resultEl.style.color = 'var(--accent-cyan)';
    }

    try {
      const result = await api.post('iracing/cache', { action: 'clear_all' });
      if (resultEl) {
        resultEl.textContent = result?.message || 'Cache cleared!';
        resultEl.style.color = 'var(--accent-green)';
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = 'Error: ' + err.message;
        resultEl.style.color = 'var(--accent-red)';
      }
    }
  }

  return {
    render,
    saveAll,
    testApiConnection,
    testBridgeConnection,
    clearCache,
    updateWeightDisplay,
  };
})();
