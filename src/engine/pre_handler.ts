import Database from "better-sqlite3";
import { insertOrGetApi, getApiByName } from "../database/api.queries";
import { insertEndpoint, getEndpoint } from "../database/endpoints.queries";
import { ApiConfig } from "../config/resources.schema";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  brightGreen: "\x1b[92m",
  cyan: "\x1b[36m",
};

/**
 * Pre-handler for endpoints
 * Checks the database for APIs and their endpoints
 * If they don't exist, adds them to the database
 * Returns an object mapping API names to their IDs and endpoints
 */
export async function preHandleEndpoints(
  db: Database.Database,
  api: ApiConfig,
  verbose: boolean = false
): Promise<Map<string, { apiId: number; endpoints: Map<string, number> }>> {
  const apiMap = new Map<
    string,
    { apiId: number; endpoints: Map<string, number> }
  >();

    
    if (verbose) console.log(`\n${colors.cyan}[INIT]${colors.reset} Pre-processing API: ${api.name}`);

    // Step 1: Insert or get API
    const apiId = insertOrGetApi(db, {
        name: api.name,
        base_url: api.base_url,
    });
    if (verbose) console.log(`  ${colors.green}[OK]${colors.reset} API registered (ID: ${apiId})`);

    // Step 2: Process endpoints
    const endpointMap = new Map<string, number>();
    let existingEndpoints = 0;
    let newEndpoints = 0;

    for (const endpoint of api.endpoints) {
        const endpointKey = `${endpoint.method} ${endpoint.path}`;

        // Check if endpoint already exists
        const existingEndpoint = getEndpoint(
        db,
        apiId,
        endpoint.path,
        endpoint.method
        );

        let endpointId: number;

        if (existingEndpoint && existingEndpoint.id) {
        endpointId = existingEndpoint.id;
        existingEndpoints++;
        if (verbose) console.log(`  ${colors.green}[OK]${colors.reset} Endpoint exists: ${endpointKey}`);
        } else {
        // Insert new endpoint
        endpointId = insertEndpoint(db, {
            api_id: apiId,
            path: endpoint.path,
            method: endpoint.method,
            expected_status: endpoint.expected_status,
            expected_fields: endpoint.expected_fields || [],
            body_fixture_params: extractBodyFixtureParams(endpoint),
        });
        newEndpoints++;
        if (verbose) console.log(`  ${colors.brightGreen}[NEW]${colors.reset} Endpoint added: ${endpointKey} (ID: ${endpointId})`);
        }

        endpointMap.set(endpointKey, endpointId);
    }

    // Summary for API
    if (verbose) console.log(
        `  ${colors.cyan}[INFO]${colors.reset} Summary: ${existingEndpoints} existing, ${newEndpoints} new endpoints`
    );

    apiMap.set(api.name, {
        apiId,
        endpoints: endpointMap,
    });
    


  return apiMap;
}

/**
 * Extract body fixture parameter keys from endpoint request fixture
 * Returns an array of parameter keys if fixture exists, empty array otherwise
 */
function extractBodyFixtureParams(endpoint: any): string[] {
  if (endpoint.request?.fixture?.body_params && Array.isArray(endpoint.request.fixture.body_params)) {
    // If body_params is an array of objects, extract the keys
    const params: string[] = [];
    for (const param of endpoint.request.fixture.body_params) {
      if (typeof param === 'object') {
        params.push(...Object.keys(param));
      }
    }
    return params;
  }

  if (endpoint.request?.fixture?.body && typeof endpoint.request.fixture.body === 'object') {
    return Object.keys(endpoint.request.fixture.body);
  }

  return [];
}

/**
 * Type for the pre-handler result
 */
export type PreHandlerResult = Map<
  string,
  {
    apiId: number;
    endpoints: Map<string, number>;
  }
>;
