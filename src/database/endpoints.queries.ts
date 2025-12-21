import Database from "better-sqlite3";

export interface EndpointRecord {
  id?: number;
  api_id: number;
  path: string;
  method: string;
  expected_status: number;
  expected_fields?: string | string[];
  body_fixture_params?: string | string[];
  created_at?: string;
}

/**
 * Insert a new endpoint
 */
export function insertEndpoint(db: Database.Database, endpoint: EndpointRecord): number {
  const stmt = db.prepare(`
    INSERT INTO endpoints (api_id, path, method, expected_status, expected_fields, body_fixture_params)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Convert arrays to JSON strings if needed
  const expectedFields = Array.isArray(endpoint.expected_fields)
    ? JSON.stringify(endpoint.expected_fields)
    : endpoint.expected_fields || null;

  const bodyFixtureParams = Array.isArray(endpoint.body_fixture_params)
    ? JSON.stringify(endpoint.body_fixture_params)
    : endpoint.body_fixture_params || null;

  const result = stmt.run(
    endpoint.api_id,
    endpoint.path,
    endpoint.method,
    endpoint.expected_status,
    expectedFields,
    bodyFixtureParams
  );

  return result.lastInsertRowid as number;
}

/**
 * Get endpoint by ID
 */
export function getEndpointById(db: Database.Database, id: number): EndpointRecord | null {
  const stmt = db.prepare(`SELECT * FROM endpoints WHERE id = ?`);
  const result = stmt.get(id) as any;
  return result ? parseEndpoint(result) : null;
}

/**
 * Get all endpoints for an API
 */
export function getEndpointsByApi(db: Database.Database, apiId: number): EndpointRecord[] {
  const stmt = db.prepare(`SELECT * FROM endpoints WHERE api_id = ? ORDER BY path`);
  const results = stmt.all(apiId) as any[];
  return results.map(parseEndpoint);
}

/**
 * Get specific endpoint
 */
export function getEndpoint(
  db: Database.Database,
  apiId: number,
  path: string,
  method: string
): EndpointRecord | null {
  const stmt = db.prepare(`SELECT * FROM endpoints WHERE api_id = ? AND path = ? AND method = ?`);
  const result = stmt.get(apiId, path, method) as any;
  return result ? parseEndpoint(result) : null;
}

/**
 * Update endpoint
 */
export function updateEndpoint(db: Database.Database, endpoint: EndpointRecord): void {
  const stmt = db.prepare(`
    UPDATE endpoints
    SET expected_status = ?, expected_fields = ?, body_fixture_params = ?
    WHERE id = ?
  `);

  const expectedFields = Array.isArray(endpoint.expected_fields)
    ? JSON.stringify(endpoint.expected_fields)
    : endpoint.expected_fields || null;

  const bodyFixtureParams = Array.isArray(endpoint.body_fixture_params)
    ? JSON.stringify(endpoint.body_fixture_params)
    : endpoint.body_fixture_params || null;

  stmt.run(endpoint.expected_status, expectedFields, bodyFixtureParams, endpoint.id);
}

/**
 * Delete endpoint
 */
export function deleteEndpoint(db: Database.Database, endpointId: number): void {
  const stmt = db.prepare(`DELETE FROM endpoints WHERE id = ?`);
  stmt.run(endpointId);
}

/**
 * Get all endpoints
 */
export function getAllEndpoints(db: Database.Database): EndpointRecord[] {
  const stmt = db.prepare(`SELECT * FROM endpoints ORDER BY api_id, path`);
  const results = stmt.all() as any[];
  return results.map(parseEndpoint);
}

/**
 * Parse endpoint record and convert JSON fields to arrays
 */
function parseEndpoint(result: any): EndpointRecord {
  return {
    ...result,
    expected_fields: result.expected_fields ? JSON.parse(result.expected_fields) : undefined,
    body_fixture_params: result.body_fixture_params
      ? JSON.parse(result.body_fixture_params)
      : undefined,
  };
}
