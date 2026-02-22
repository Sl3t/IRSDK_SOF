<?php
/**
 * IRSDK SOF Agent — Database Access Layer
 *
 * Provides a singleton PDO connection to the Microsoft Access .mdb database
 * via ODBC, along with convenience methods for common query patterns.
 *
 * Usage:
 *   require_once __DIR__ . '/db.php';
 *   $db = Database::getInstance();
 *   $rows = $db->fetchAll("SELECT * FROM drivers WHERE irating > ?", [2000]);
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    /** @var Database|null Singleton instance. */
    private static ?Database $instance = null;

    /** @var PDO Active PDO connection to the Access database. */
    private PDO $pdo;

    // ========================================================================
    // Construction & Connection
    // ========================================================================

    /**
     * Private constructor — use getInstance() instead.
     *
     * Opens a PDO ODBC connection to the Microsoft Access .mdb file
     * defined in config.php. Configures PDO to throw exceptions on errors
     * and return associative arrays by default.
     *
     * @throws RuntimeException If the database file does not exist.
     * @throws PDOException     If the ODBC connection fails.
     */
    private function __construct()
    {
        $dbPath = DB_PATH;

        if (!file_exists($dbPath)) {
            throw new RuntimeException(
                "Database file not found: {$dbPath}. " .
                "Create the .mdb file and run schema.sql before starting the application."
            );
        }

        $this->pdo = new PDO(DB_DSN);
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    /**
     * Prevent cloning of the singleton.
     */
    private function __clone() {}

    /**
     * Prevent unserialization of the singleton.
     *
     * @throws RuntimeException Always.
     */
    public function __wakeup()
    {
        throw new RuntimeException('Cannot unserialize a singleton.');
    }

    /**
     * Returns the singleton Database instance, creating it on first call.
     *
     * @return Database
     */
    public static function getInstance(): Database
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Returns the underlying PDO connection for advanced use cases.
     *
     * @return PDO
     */
    public function getConnection(): PDO
    {
        return $this->pdo;
    }

    // ========================================================================
    // Query Execution
    // ========================================================================

    /**
     * Executes a prepared SQL statement with optional bound parameters.
     *
     * @param  string $sql    SQL query with ? placeholders.
     * @param  array  $params Values to bind to the placeholders.
     * @return PDOStatement   The executed statement.
     *
     * @throws PDOException On query failure.
     */
    public function query(string $sql, array $params = []): PDOStatement
    {
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        } catch (PDOException $e) {
            if (DEBUG_MODE) {
                throw new PDOException(
                    "Query failed: {$e->getMessage()} | SQL: {$sql} | Params: " . json_encode($params),
                    (int) $e->getCode(),
                    $e
                );
            }
            throw $e;
        }
    }

    // ========================================================================
    // Fetch Helpers
    // ========================================================================

    /**
     * Executes a SELECT query and returns all matching rows.
     *
     * @param  string $sql    SQL SELECT with ? placeholders.
     * @param  array  $params Values to bind.
     * @return array          Array of associative arrays (one per row).
     */
    public function fetchAll(string $sql, array $params = []): array
    {
        $stmt = $this->query($sql, $params);
        return $stmt->fetchAll();
    }

    /**
     * Executes a SELECT query and returns the first matching row, or null.
     *
     * @param  string     $sql    SQL SELECT with ? placeholders.
     * @param  array      $params Values to bind.
     * @return array|null         Associative array of the row, or null if none.
     */
    public function fetchOne(string $sql, array $params = []): ?array
    {
        $stmt = $this->query($sql, $params);
        $row = $stmt->fetch();
        return $row !== false ? $row : null;
    }

    // ========================================================================
    // Insert & Update
    // ========================================================================

    /**
     * Inserts a row into the specified table and returns the new auto-increment ID.
     *
     * Column names are taken from the array keys; values from the array values.
     * All values are bound as prepared-statement parameters for safety.
     *
     * @param  string   $table Table name (must be a valid Access table).
     * @param  array    $data  Associative array of column => value.
     * @return int             The last inserted AUTOINCREMENT ID.
     *
     * @throws InvalidArgumentException If $data is empty.
     */
    public function insert(string $table, array $data): int
    {
        if (empty($data)) {
            throw new InvalidArgumentException('Cannot insert an empty data array.');
        }

        $columns = implode(', ', array_keys($data));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));

        $sql = "INSERT INTO {$table} ({$columns}) VALUES ({$placeholders})";
        $this->query($sql, array_values($data));

        // Access ODBC: retrieve the last auto-increment ID.
        // The standard lastInsertId() may not work with all ODBC drivers,
        // so we fall back to SELECT @@IDENTITY which Access supports.
        $result = $this->fetchOne("SELECT @@IDENTITY AS last_id");
        return (int) ($result['last_id'] ?? 0);
    }

    /**
     * Updates rows in the specified table matching the WHERE clause.
     *
     * @param  string $table       Table name.
     * @param  array  $data        Associative array of column => new value.
     * @param  string $where       WHERE clause with ? placeholders (without "WHERE" keyword).
     * @param  array  $whereParams Values to bind in the WHERE clause.
     * @return int                 Number of affected rows.
     *
     * @throws InvalidArgumentException If $data or $where is empty.
     */
    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        if (empty($data)) {
            throw new InvalidArgumentException('Cannot update with an empty data array.');
        }
        if (empty($where)) {
            throw new InvalidArgumentException('Cannot update without a WHERE clause. Use a raw query for bulk updates.');
        }

        $setClauses = [];
        foreach (array_keys($data) as $column) {
            $setClauses[] = "{$column} = ?";
        }
        $setString = implode(', ', $setClauses);

        $sql = "UPDATE {$table} SET {$setString} WHERE {$where}";
        $params = array_merge(array_values($data), $whereParams);

        $stmt = $this->query($sql, $params);
        return $stmt->rowCount();
    }

    /**
     * Deletes rows from the specified table matching the WHERE clause.
     *
     * @param  string $table       Table name.
     * @param  string $where       WHERE clause with ? placeholders (without "WHERE" keyword).
     * @param  array  $whereParams Values to bind in the WHERE clause.
     * @return int                 Number of deleted rows.
     *
     * @throws InvalidArgumentException If $where is empty.
     */
    public function delete(string $table, string $where, array $whereParams = []): int
    {
        if (empty($where)) {
            throw new InvalidArgumentException('Cannot delete without a WHERE clause. Use a raw query for TRUNCATE.');
        }

        $sql = "DELETE FROM {$table} WHERE {$where}";
        $stmt = $this->query($sql, $whereParams);
        return $stmt->rowCount();
    }

    // ========================================================================
    // Settings Helpers
    // ========================================================================

    /**
     * Retrieves a value from the settings table by key.
     *
     * @param  string      $key     The setting_key to look up.
     * @param  string|null $default Value to return if the key does not exist.
     * @return string|null          The setting_value, or $default if not found.
     */
    public function getSetting(string $key, ?string $default = null): ?string
    {
        $row = $this->fetchOne(
            "SELECT setting_value FROM settings WHERE setting_key = ?",
            [$key]
        );

        return $row !== null ? $row['setting_value'] : $default;
    }

    /**
     * Sets a value in the settings table (insert or update).
     *
     * Because Access does not support UPSERT / ON CONFLICT, this method
     * checks for existence first, then either updates or inserts.
     *
     * @param  string $key   The setting_key.
     * @param  string $value The setting_value.
     * @return void
     */
    public function setSetting(string $key, string $value): void
    {
        $existing = $this->fetchOne(
            "SELECT setting_key FROM settings WHERE setting_key = ?",
            [$key]
        );

        $now = date('Y-m-d H:i:s');

        if ($existing !== null) {
            $this->query(
                "UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?",
                [$value, $now, $key]
            );
        } else {
            $this->query(
                "INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)",
                [$key, $value, $now]
            );
        }
    }

    /**
     * Retrieves a setting and decodes it as JSON.
     *
     * @param  string     $key     The setting_key to look up.
     * @param  mixed      $default Value to return if key not found or decode fails.
     * @return mixed               Decoded JSON value, or $default.
     */
    public function getSettingJson(string $key, mixed $default = null): mixed
    {
        $raw = $this->getSetting($key);
        if ($raw === null) {
            return $default;
        }

        $decoded = json_decode($raw, true);
        return (json_last_error() === JSON_ERROR_NONE) ? $decoded : $default;
    }

    /**
     * Stores a value in the settings table as a JSON-encoded string.
     *
     * @param  string $key   The setting_key.
     * @param  mixed  $value The value to JSON-encode and store.
     * @return void
     */
    public function setSettingJson(string $key, mixed $value): void
    {
        $this->setSetting($key, json_encode($value, JSON_UNESCAPED_UNICODE));
    }

    // ========================================================================
    // Cache Helpers
    // ========================================================================

    /**
     * Retrieves a cached API response if it has not expired.
     *
     * @param  string      $endpoint   The API endpoint path.
     * @param  string      $paramsHash SHA-256 hash of the request parameters.
     * @return string|null             Cached response data, or null if expired/missing.
     */
    public function getCachedResponse(string $endpoint, string $paramsHash): ?string
    {
        $row = $this->fetchOne(
            "SELECT response_data FROM api_cache WHERE endpoint = ? AND params_hash = ? AND expires_at > NOW()",
            [$endpoint, $paramsHash]
        );

        return $row !== null ? $row['response_data'] : null;
    }

    /**
     * Stores an API response in the cache with the given TTL.
     *
     * Overwrites any existing entry for the same endpoint + params_hash.
     *
     * @param  string $endpoint     The API endpoint path.
     * @param  string $paramsHash   SHA-256 hash of the request parameters.
     * @param  string $responseData The raw response data to cache.
     * @param  int    $ttlSeconds   Time-to-live in seconds.
     * @return void
     */
    public function setCachedResponse(string $endpoint, string $paramsHash, string $responseData, int $ttlSeconds): void
    {
        // Remove any existing cache entry for this endpoint + hash.
        $this->query(
            "DELETE FROM api_cache WHERE endpoint = ? AND params_hash = ?",
            [$endpoint, $paramsHash]
        );

        $now = date('Y-m-d H:i:s');
        $expiresAt = date('Y-m-d H:i:s', time() + $ttlSeconds);

        $this->insert('api_cache', [
            'endpoint'      => $endpoint,
            'params_hash'   => $paramsHash,
            'response_data' => $responseData,
            'expires_at'    => $expiresAt,
            'created_at'    => $now,
        ]);
    }

    /**
     * Removes all expired entries from the api_cache table.
     * Call this periodically to keep the database size manageable.
     *
     * @return int Number of purged rows.
     */
    public function purgeExpiredCache(): int
    {
        $stmt = $this->query("DELETE FROM api_cache WHERE expires_at <= NOW()");
        return $stmt->rowCount();
    }

    // ========================================================================
    // Transaction Support
    // ========================================================================

    /**
     * Begins a database transaction.
     *
     * @return bool
     */
    public function beginTransaction(): bool
    {
        return $this->pdo->beginTransaction();
    }

    /**
     * Commits the current transaction.
     *
     * @return bool
     */
    public function commit(): bool
    {
        return $this->pdo->commit();
    }

    /**
     * Rolls back the current transaction.
     *
     * @return bool
     */
    public function rollBack(): bool
    {
        return $this->pdo->rollBack();
    }
}
