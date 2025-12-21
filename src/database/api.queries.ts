import Database from "better-sqlite3";

export interface ApiRecord {
  id?: number;
  name: string;
  base_url: string;
  created_at?: string;
}

/**
 * Insert or get an API by name
 */
export function insertOrGetApi(db: Database.Database, api: ApiRecord): number {
  // First try to get existing API
  const selectStmt = db.prepare(`SELECT id FROM apis WHERE name = ?`);
  const existing = selectStmt.get(api.name) as any;

  if (existing) {
    return existing.id;
  }

  // Insert new API
  const insertStmt = db.prepare(`
    INSERT INTO apis (name, base_url)
    VALUES (?, ?)
  `);

  const result = insertStmt.run(api.name, api.base_url);
  return result.lastInsertRowid as number;
}

/**
 * Get API by name
 */
export function getApiByName(db: Database.Database, name: string): ApiRecord | null {
  const stmt = db.prepare(`SELECT * FROM apis WHERE name = ?`);
  return (stmt.get(name) as ApiRecord) || null;
}

/**
 * Get API by ID
 */
export function getApiById(db: Database.Database, id: number): ApiRecord | null {
  const stmt = db.prepare(`SELECT * FROM apis WHERE id = ?`);
  return (stmt.get(id) as ApiRecord) || null;
}

/**
 * Get all APIs
 */
export function getAllApis(db: Database.Database): ApiRecord[] {
  const stmt = db.prepare(`SELECT * FROM apis ORDER BY name`);
  return stmt.all() as ApiRecord[];
}

/**
 * Delete API and cascade to endpoints and probes
 */
export function deleteApi(db: Database.Database, apiName: string): void {
  const stmt = db.prepare(`DELETE FROM apis WHERE name = ?`);
  stmt.run(apiName);
}
