import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "baseline.db");

/**
 * Initialize SQLite database
 * Creates the database file and schema if it doesn't exist
 * Returns existing database if it already exists
 */
export function initializeDatabase(): Database.Database {
  // Create data directory if it doesn't exist
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`📁 Created database directory: ${DB_DIR}`);
  }

  // Check if database already exists
  const dbExists = fs.existsSync(DB_PATH);
  
  // Open or create database
  const db = new Database(DB_PATH);
  
  if (dbExists) {
    console.log(`✅ Connected to existing database: ${DB_PATH}`);
  } else {
    console.log(`📝 Creating new database: ${DB_PATH}`);
    initializeSchema(db);
  }

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Initialize database schema
 * Creates all necessary tables for the baseline system
 */
function initializeSchema(db: Database.Database): void {
  // APIs table - stores API definitions (name and base_url only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS apis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_apis_name ON apis(name);
  `);

  // Endpoints table - stores endpoint definitions for a given API
  db.exec(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
      expected_status INTEGER NOT NULL,
      expected_fields TEXT,
      body_fixture_params TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE,
      UNIQUE(api_id, path, method)
    );

    CREATE INDEX IF NOT EXISTS idx_endpoints_api_id ON endpoints(api_id);
  `);

  // Probes table - stores individual probe results
  db.exec(`
    CREATE TABLE IF NOT EXISTS probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_id INTEGER NOT NULL,
      endpoint_id INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL,
      response_type TEXT NOT NULL,
      latency_bucket TEXT NOT NULL,
      probe_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_probes_api_id ON probes(api_id);
    CREATE INDEX IF NOT EXISTS idx_probes_endpoint_id ON probes(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_probes_probe_time ON probes(probe_time);
  `);

  // Baselines table - stores baseline snapshots with API and endpoint results
  db.exec(`
    CREATE TABLE IF NOT EXISTS baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_id INTEGER NOT NULL,
      endpoint_id INTEGER NOT NULL,
      probe_id INTEGER NOT NULL,
      baseline_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
      FOREIGN KEY (probe_id) REFERENCES probes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_baselines_api_id ON baselines(api_id);
    CREATE INDEX IF NOT EXISTS idx_baselines_endpoint_id ON baselines(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_baselines_probe_id ON baselines(probe_id);
    CREATE INDEX IF NOT EXISTS idx_baselines_baseline_time ON baselines(baseline_time);
  `);

  console.log(`✨ Database schema initialized successfully`);
}

/**
 * Get or create database connection
 * Singleton pattern - returns the same connection instance
 */
let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = initializeDatabase();
  }
  return dbInstance;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log("Database connection closed");
  }
}

/**
 * Reset database - clears all data while preserving schema
 * Removes all rows from all tables (in correct order to respect foreign keys)
 */
export function resetDatabase(db: Database.Database): void {
  try {
    // Disable foreign key checks temporarily
    db.pragma("foreign_keys = OFF");

    // Delete all data from tables (order matters due to foreign keys)
    db.exec(`
      DELETE FROM baselines;
      DELETE FROM probes;
      DELETE FROM endpoints;
      DELETE FROM apis;
    `);

    // Re-enable foreign key checks
    db.pragma("foreign_keys = ON");

    console.log("✨ Database reset successfully - all data cleared");
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    throw error;
  }
}

/**
 * Clear database file completely and reinitialize
 * This removes the database file and creates a fresh one
 */
export function clearAndReinitializeDatabase(): Database.Database {
  try {
    // Close existing connection
    closeDatabase();

    // Delete database file if it exists
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
      console.log(`🗑️  Deleted database file: ${DB_PATH}`);
    }

    // Reinitialize fresh database
    dbInstance = initializeDatabase();
    console.log("✨ Database cleared and reinitialized");

    return dbInstance;
  } catch (error) {
    console.error("❌ Error clearing and reinitializing database:", error);
    throw error;
  }
}
