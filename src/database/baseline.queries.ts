import Database from "better-sqlite3";

export interface BaselineRecord {
  id?: number;
  api_id: number;
  endpoint_id: number;
  probe_id: number;
  baseline_time?: string;
}

/**
 * Insert a baseline record
 */
export function insertBaseline(db: Database.Database, baseline: BaselineRecord): number {
  const stmt = db.prepare(`
    INSERT INTO baselines (api_id, endpoint_id, probe_id)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(baseline.api_id, baseline.endpoint_id, baseline.probe_id);
  return result.lastInsertRowid as number;
}

/**
 * Get baseline by ID
 */
export function getBaselineById(db: Database.Database, id: number): BaselineRecord | null {
  const stmt = db.prepare(`SELECT * FROM baselines WHERE id = ?`);
  return (stmt.get(id) as BaselineRecord) || null;
}

/**
 * Get all baselines for an API
 */
export function getBaselinesByApi(db: Database.Database, apiId: number): BaselineRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM baselines WHERE api_id = ? ORDER BY baseline_time DESC
  `);
  return stmt.all(apiId) as BaselineRecord[];
}

/**
 * Get all baselines for an endpoint
 */
export function getBaselinesByEndpoint(
  db: Database.Database,
  endpointId: number
): BaselineRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM baselines WHERE endpoint_id = ? ORDER BY baseline_time DESC
  `);
  return stmt.all(endpointId) as BaselineRecord[];
}

/**
 * Get all baselines
 */
export function getAllBaselines(db: Database.Database): BaselineRecord[] {
  const stmt = db.prepare(`SELECT * FROM baselines ORDER BY baseline_time DESC`);
  return stmt.all() as BaselineRecord[];
}

/**
 * Get baseline by API and endpoint
 */
export function getBaselineByApiAndEndpoint(
  db: Database.Database,
  apiId: number,
  endpointId: number
): BaselineRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM baselines WHERE api_id = ? AND endpoint_id = ? ORDER BY baseline_time DESC
  `);
  return stmt.all(apiId, endpointId) as BaselineRecord[];
}

/**
 * Delete baseline
 */
export function deleteBaseline(db: Database.Database, id: number): void {
  const stmt = db.prepare(`DELETE FROM baselines WHERE id = ?`);
  stmt.run(id);
}

/**
 * Get latest baseline for API and endpoint
 */
export function getLatestBaseline(
  db: Database.Database,
  apiId: number,
  endpointId: number
): BaselineRecord | null {
  const stmt = db.prepare(`
    SELECT * FROM baselines WHERE api_id = ? AND endpoint_id = ? ORDER BY baseline_time DESC LIMIT 1
  `);
  return (stmt.get(apiId, endpointId) as BaselineRecord) || null;
}
