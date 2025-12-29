import Database from "better-sqlite3";
import { error } from "console";

export interface ProbeRecord {
  id?: number;
  api_id: number;
  endpoint_id: number;
  passed: boolean;
  status_code: number;
  response_type: string;
  latency_bucket: string;
  probe_time?: string;
  error_message?: string;
}

/**
 * Insert a probe result into the database
 */
export function insertProbeResult(db: Database.Database, probe: ProbeRecord): number {
  const stmt = db.prepare(`
    INSERT INTO probes (api_id, endpoint_id, passed, status_code, response_type, latency_bucket, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    probe.api_id,
    probe.endpoint_id,
    probe.passed ? 1 : 0,
    probe.status_code,
    probe.response_type,
    probe.latency_bucket,
    probe.error_message || null
  );

  return result.lastInsertRowid as number;
}

/**
 * Get all probe results for a specific API
 */
export function getProbesByApi(db: Database.Database, apiId: number): ProbeRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM probes WHERE api_id = ? ORDER BY probe_time DESC
  `);

  const results = stmt.all(apiId) as any[];
  return results.map(row => ({
    ...row,
    passed: row.passed === 1,
  }));
}

/**
 * Get probe result by ID
 */
export function getProbeById(db: Database.Database, id: number): ProbeRecord | null {
  const stmt = db.prepare(`
    SELECT * FROM probes WHERE id = ?
  `);

  const result = stmt.get(id) as any;
  if (!result) {
    return null;
  }

  return {
    ...result,
    passed: result.passed === 1,
  };
}

/**
 * Get all probe results for a specific endpoint
 */
export function getProbesByEndpoint(db: Database.Database, endpointId: number): ProbeRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM probes WHERE endpoint_id = ? ORDER BY probe_time DESC
  `);

  const results = stmt.all(endpointId) as any[];
  return results.map(row => ({
    ...row,
    passed: row.passed === 1,
  }));
}

/**
 * Get recent probe results (last N probes)
 */
export function getRecentProbes(db: Database.Database, limit: number = 100): ProbeRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM probes ORDER BY probe_time DESC LIMIT ?
  `);

  const results = stmt.all(limit) as any[];
  return results.map(row => ({
    ...row,
    passed: row.passed === 1,
  }));
}

/**
 * Get probe statistics for a time period
 */
export function getProbeStats(db: Database.Database, hours: number = 24): {
  total: number;
  passed: number;
  failed: number;
  successRate: number;
} {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed
    FROM probes
    WHERE probe_time > datetime('now', '-' || ? || ' hours')
  `);

  const result = stmt.get(hours) as any;
  const total = result.total || 0;
  const passed = result.passed || 0;
  const failed = result.failed || 0;
  const successRate = total > 0 ? (passed / total) * 100 : 0;

  return {
    total,
    passed,
    failed,
    successRate,
  };
}

/**
 * Get probe statistics by API
 */
export function getProbeStatsByApi(db: Database.Database, apiId: number): {
  total: number;
  passed: number;
  failed: number;
  successRate: number;
} {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed
    FROM probes
    WHERE api_id = ?
  `);

  const result = stmt.get(apiId) as any;
  const total = result.total || 0;
  const passed = result.passed || 0;
  const failed = result.failed || 0;
  const successRate = total > 0 ? (passed / total) * 100 : 0;

  return {
    total,
    passed,
    failed,
    successRate,
  };
}
