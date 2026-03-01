-- ============================================================================
-- IRSDK SOF Agent — Database Schema (SQLite)
-- ============================================================================
-- Target: SQLite via PHP PDO
-- File:   db/irsdk_sof.sqlite
--
-- The database file is created automatically on first access by db.php.
-- ============================================================================


-- --------------------------------------------------------------------------
-- Table 1: drivers
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    iracing_user_id   INTEGER UNIQUE,
    user_name         TEXT,
    current_irating   INTEGER,
    current_sr        REAL,
    license_class     TEXT,
    club_name         TEXT,
    division          TEXT,
    is_me             INTEGER DEFAULT 0,
    tag               TEXT,
    notes             TEXT,
    updated_at        TEXT
);


-- --------------------------------------------------------------------------
-- Table 2: sessions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    iracing_subsession_id INTEGER,
    session_type          TEXT,
    is_official           INTEGER DEFAULT 0,
    series_id             INTEGER,
    series_name           TEXT,
    track_name            TEXT,
    track_config          TEXT,
    car_class             TEXT,
    sof                   INTEGER,
    driver_count          INTEGER,
    min_irating           INTEGER,
    max_irating           INTEGER,
    median_irating        INTEGER,
    std_dev_irating       INTEGER,
    my_irating_at_time    INTEGER,
    track_temp_c          REAL,
    air_temp_c            REAL,
    track_wetness         TEXT,
    weather_declared_wet  INTEGER DEFAULT 0,
    grip_state            TEXT,
    skies                 TEXT,
    wind_speed_ms         REAL,
    humidity_pct          REAL,
    decision              TEXT,
    decision_score        REAL,
    decision_details      TEXT,
    created_at            TEXT
);


-- --------------------------------------------------------------------------
-- Table 3: session_drivers
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_drivers (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id              INTEGER,
    driver_id               INTEGER,
    irating                 INTEGER,
    license_string          TEXT,
    car_number              TEXT,
    car_name                TEXT,
    track_experience_score  REAL,
    avg_pace_on_track       TEXT,
    avg_quali_on_track      TEXT,
    avg_incidents_on_track  REAL,
    races_on_track          INTEGER,
    danger_score            REAL,
    finish_position         INTEGER,
    incidents               INTEGER
);


-- --------------------------------------------------------------------------
-- Table 4: irating_history
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irating_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    irating          INTEGER,
    sr               REAL,
    series_name      TEXT,
    track_name       TEXT,
    sof              INTEGER,
    finish_position  INTEGER,
    irating_change   INTEGER,
    recorded_at      TEXT
);


-- --------------------------------------------------------------------------
-- Table 5: favorite_series
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorite_series (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    iracing_series_id      INTEGER UNIQUE,
    series_name            TEXT,
    category               TEXT,
    license_group          TEXT,
    is_favorite            INTEGER DEFAULT 0,
    last_sof_avg           INTEGER,
    current_track          TEXT,
    current_car_classes    TEXT,
    race_interval_minutes  INTEGER,
    updated_at             TEXT
);


-- --------------------------------------------------------------------------
-- Table 6: driver_track_stats
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_track_stats (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id           INTEGER,
    track_name          TEXT,
    track_config        TEXT,
    car_class           TEXT,
    races_count         INTEGER,
    best_quali_time     TEXT,
    avg_quali_time      TEXT,
    best_race_lap       TEXT,
    avg_race_pace       TEXT,
    lap_consistency     REAL,
    avg_finish_position REAL,
    avg_incidents       REAL,
    dnf_rate            REAL,
    best_finish         INTEGER,
    worst_finish        INTEGER,
    last_raced_at       TEXT,
    cached_at           TEXT
);


-- --------------------------------------------------------------------------
-- Table 7: api_cache
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint       TEXT,
    params_hash    TEXT,
    response_data  TEXT,
    expires_at     TEXT,
    created_at     TEXT
);


-- --------------------------------------------------------------------------
-- Table 8: settings
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    setting_key    TEXT PRIMARY KEY,
    setting_value  TEXT,
    updated_at     TEXT
);


-- --------------------------------------------------------------------------
-- Table 9: registration_entries
-- --------------------------------------------------------------------------
-- Tracks driver registrations for upcoming races.
-- Polled from iRacing /data/session/reg_drivers_list at regular intervals.
-- is_baseline = 1 for the initial snapshot (H-20), 0 for newcomers after.
-- Only newcomers (is_baseline = 0) are used for predictive SOF calculation.
CREATE TABLE IF NOT EXISTS registration_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id       INTEGER NOT NULL,
    session_id      INTEGER,
    race_start_utc  TEXT NOT NULL,
    customer_id     INTEGER NOT NULL,
    display_name    TEXT,
    irating         INTEGER,
    license         TEXT,
    car_name        TEXT,
    is_baseline     INTEGER DEFAULT 0,
    first_seen_at   TEXT NOT NULL,
    UNIQUE(series_id, race_start_utc, customer_id)
);


-- ============================================================================
-- Default settings (seed data)
-- ============================================================================

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('bridge_ws_host', 'localhost', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('bridge_ws_port', '8182', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_driver_stats', '86400', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_series', '3600', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('cache_ttl_race_guide', '300', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('threshold_go', '75', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('threshold_nogo', '50', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('sof_ratio_threshold', '1.15', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('sr_minimum', '3.00', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('irating_target', '2500', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('decision_weights', '{"sof_ratio":20,"position_estimate":15,"irating_gain":15,"field_quality":15,"danger_score":10,"track_conditions":10,"safety_rating":10,"participant_count":5}', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('my_iracing_user_id', '677180', datetime('now'));

INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at)
VALUES ('my_name', 'Paul Lavoisiere', datetime('now'));
