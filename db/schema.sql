-- ============================================================================
-- IRSDK SOF Agent — Database Schema for Microsoft Access (.mdb)
-- ============================================================================
-- Target: Microsoft Access via PHP ODBC (Jet SQL / ACE SQL syntax)
-- File:   db/irsdk_sof.mdb
--
-- Notes on Access-specific syntax:
--   - AUTOINCREMENT replaces AUTO_INCREMENT / SERIAL
--   - YESNO is the Access boolean type (stores -1 for True, 0 for False)
--   - MEMO is Access's long text type (replaces TEXT/LONGTEXT in MySQL)
--   - TEXT(n) is Access's variable-length string (replaces VARCHAR)
--   - DATETIME is native in Access
--   - DOUBLE replaces DECIMAL/FLOAT
--   - CONSTRAINT names must be unique across the entire .mdb file
--   - No IF NOT EXISTS support; tables must not already exist
-- ============================================================================


-- --------------------------------------------------------------------------
-- Table 1: drivers
-- Stores every driver encountered in sessions, with personal tags and notes.
-- --------------------------------------------------------------------------
CREATE TABLE drivers (
    id                AUTOINCREMENT PRIMARY KEY,
    iracing_user_id   INTEGER,
    user_name         TEXT(100),
    current_irating   INTEGER,
    current_sr        DOUBLE,
    license_class     TEXT(10),
    club_name         TEXT(50),
    division          TEXT(20),
    is_me             YESNO,
    tag               TEXT(20),
    notes             MEMO,
    updated_at        DATETIME,
    CONSTRAINT uq_drivers_iracing_user_id UNIQUE (iracing_user_id)
);


-- --------------------------------------------------------------------------
-- Table 2: sessions
-- Each detected session (practice, qualifying, race) with conditions,
-- SOF calculations, and GO/NO-GO decision data.
-- --------------------------------------------------------------------------
CREATE TABLE sessions (
    id                    AUTOINCREMENT PRIMARY KEY,
    iracing_subsession_id INTEGER,
    session_type          TEXT(20),
    is_official           YESNO,
    series_id             INTEGER,
    series_name           TEXT(100),
    track_name            TEXT(100),
    track_config          TEXT(100),
    car_class             TEXT(50),
    sof                   INTEGER,
    driver_count          INTEGER,
    min_irating           INTEGER,
    max_irating           INTEGER,
    median_irating        INTEGER,
    std_dev_irating       INTEGER,
    my_irating_at_time    INTEGER,
    track_temp_c          DOUBLE,
    air_temp_c            DOUBLE,
    track_wetness         TEXT(20),
    weather_declared_wet  YESNO,
    grip_state            TEXT(30),
    skies                 TEXT(20),
    wind_speed_ms         DOUBLE,
    humidity_pct          DOUBLE,
    decision              TEXT(10),
    decision_score        DOUBLE,
    decision_details      MEMO,
    created_at            DATETIME
);


-- --------------------------------------------------------------------------
-- Table 3: session_drivers
-- Junction table linking drivers to sessions with snapshot data at the time
-- of the session plus per-track analysis metrics.
-- --------------------------------------------------------------------------
CREATE TABLE session_drivers (
    id                      AUTOINCREMENT PRIMARY KEY,
    session_id              INTEGER,
    driver_id               INTEGER,
    irating                 INTEGER,
    license_string          TEXT(10),
    car_number              TEXT(10),
    car_name                TEXT(100),
    track_experience_score  DOUBLE,
    avg_pace_on_track       TEXT(10),
    avg_quali_on_track      TEXT(10),
    avg_incidents_on_track  DOUBLE,
    races_on_track          INTEGER,
    danger_score            DOUBLE,
    finish_position         INTEGER,
    incidents               INTEGER
);


-- --------------------------------------------------------------------------
-- Table 4: irating_history
-- Personal iRating / SR evolution over time, one row per completed race.
-- --------------------------------------------------------------------------
CREATE TABLE irating_history (
    id               AUTOINCREMENT PRIMARY KEY,
    irating          INTEGER,
    sr               DOUBLE,
    series_name      TEXT(100),
    track_name       TEXT(100),
    sof              INTEGER,
    finish_position  INTEGER,
    irating_change   INTEGER,
    recorded_at      DATETIME
);


-- --------------------------------------------------------------------------
-- Table 5: favorite_series
-- Catalogue of iRacing series with user favorites and current-week metadata.
-- --------------------------------------------------------------------------
CREATE TABLE favorite_series (
    id                     AUTOINCREMENT PRIMARY KEY,
    iracing_series_id      INTEGER,
    series_name            TEXT(100),
    category               TEXT(20),
    license_group          TEXT(10),
    is_favorite            YESNO,
    last_sof_avg           INTEGER,
    current_track          TEXT(100),
    current_car_classes    TEXT(200),
    race_interval_minutes  INTEGER,
    updated_at             DATETIME,
    CONSTRAINT uq_favorite_series_iracing_id UNIQUE (iracing_series_id)
);


-- --------------------------------------------------------------------------
-- Table 6: driver_track_stats
-- Cached per-driver, per-track performance statistics fetched from the
-- iRacing Data API. Expires after 24 hours (checked via cached_at).
-- --------------------------------------------------------------------------
CREATE TABLE driver_track_stats (
    id                  AUTOINCREMENT PRIMARY KEY,
    driver_id           INTEGER,
    track_name          TEXT(100),
    track_config        TEXT(100),
    car_class           TEXT(50),
    races_count         INTEGER,
    best_quali_time     TEXT(10),
    avg_quali_time      TEXT(10),
    best_race_lap       TEXT(10),
    avg_race_pace       TEXT(10),
    lap_consistency     DOUBLE,
    avg_finish_position DOUBLE,
    avg_incidents       DOUBLE,
    dnf_rate            DOUBLE,
    best_finish         INTEGER,
    worst_finish        INTEGER,
    last_raced_at       DATETIME,
    cached_at           DATETIME
);


-- --------------------------------------------------------------------------
-- Table 7: api_cache
-- Generic cache for iRacing Data API responses to respect rate limits.
-- Each entry is keyed by endpoint + parameter hash and expires after TTL.
-- --------------------------------------------------------------------------
CREATE TABLE api_cache (
    id             AUTOINCREMENT PRIMARY KEY,
    endpoint       TEXT(200),
    params_hash    TEXT(64),
    response_data  MEMO,
    expires_at     DATETIME,
    created_at     DATETIME
);


-- --------------------------------------------------------------------------
-- Table 8: settings
-- Key-value store for application configuration (credentials, thresholds,
-- decision weights, bridge connection info, etc.).
-- --------------------------------------------------------------------------
CREATE TABLE settings (
    setting_key    TEXT(50) PRIMARY KEY,
    setting_value  MEMO,
    updated_at     DATETIME
);


-- ============================================================================
-- Default settings (seed data)
-- ============================================================================

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('bridge_ws_host', 'localhost', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('bridge_ws_port', '8182', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_driver_stats', '86400', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_series', '3600', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_race_guide', '300', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('threshold_go', '75', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('threshold_nogo', '50', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('sof_ratio_threshold', '1.15', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('sr_minimum', '3.00', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('irating_target', '2500', NOW());

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('decision_weights', '{"sof_ratio":20,"position_estimate":15,"irating_gain":15,"field_quality":15,"danger_score":10,"track_conditions":10,"safety_rating":10,"participant_count":5}', NOW());
