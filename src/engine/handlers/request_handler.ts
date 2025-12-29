import Database from "better-sqlite3";
import { EndpointConfig } from "../../config/resources.schema";
import { SettingsConfig } from "../../config/settings.schema";
import { probeEndpoint } from "../../probe/prob.request.api";
import { BaselineRecord, getLatestBaseline } from "../../database/baseline.queries";
import { getProbeById, ProbeRecord } from "../../database/probe.queries";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

export type ProbeTaskResult = {
  api_name: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  fields?: string[];
  error?: string;
  responseType: string;
  latencyBucket: string;
  data?: any;
};

export type ProbeValidationResult = {
  statusCode?: number;
  expectedStatus?: number;
  expectedFields: string[];
  new_fields?: string[];
  removed_fields?: string[];
  passed: boolean;
};

export type BaselineComparisonResult = {
  exists: boolean;
  statusCodeMatch: boolean;
  responseType: boolean;
  latencyBucket: boolean;
  passed: boolean;
};

export type ProbeValidationFull = {
  api_name: string;
  endpoint: string;
  method: string;
  probeValidation: ProbeValidationResult;
  baselineComparison?: BaselineComparisonResult;
  passed: boolean;
  isConnectionError?: boolean;
  errorMessage?: string;
};

/**
 * Get baseline for an endpoint
 */
async function getBaseline(
  db: Database.Database,
  apiId: number,
  endpointId: number
): Promise<ProbeRecord | null> {
  const baseline = getLatestBaseline(db, apiId, endpointId);
  if (!baseline) {
    return null;
  }

  const probe = getProbeById(db, baseline.probe_id);
  if (!probe) {
    return null;
  }

  return probe;
}

/**
 * Make a probe request to an endpoint
 */
export async function probeHandler(
  api: any,
  endpoint: EndpointConfig,
  settings: SettingsConfig
): Promise<ProbeTaskResult> {
  let url = new URL(`${api.base_url}${endpoint.path}`);

  // Add query parameters if fixture contains query params
  if (endpoint.request?.fixture?.query) {
    for (const [key, value] of Object.entries(endpoint.request.fixture.query)) {
      url.searchParams.append(key, String(value));
    }
  }

  const fullUrl = url.toString();

  try {
    const result = await probeEndpoint(
      fullUrl,
      endpoint.method,
      endpoint.request?.fixture?.body,
      settings.settings.run.timeout_seconds * 1000
    );


    // Check if probeEndpoint returned an API error
    if ((result as any).isApiError) {
      if ((result as any).isConnectionError) {
        console.log(
          `${colors.red}[API_ERROR]${colors.reset} Connection refused to ${api.name} - API unavailable at ${api.base_url}`
        );
      } else {
        console.log(
          `${colors.red}[API_ERROR]${colors.reset} ${result.error} for ${api.name} - ${endpoint.method} ${endpoint.path}`
        );
      }
      return {
        api_name: api.name,
        endpoint: endpoint.path,
        method: endpoint.method,
        statusCode: result.statusCode,
        responseType: result.responseType || "error",
        error_message: result.error,
        latencyBucket: result.latencyBucket,
        fields: result.body ? result.body : [],
      } as ProbeTaskResult;
    }

    // Success case
    return {
      api_name: api.name,
      endpoint: endpoint.path,
      method: endpoint.method,
      statusCode: result.statusCode,
      responseType: result.responseType,
      fields: result.body ? result.body : [],
      latencyBucket: result.latencyBucket,
      data: result.data,
    } as ProbeTaskResult;
  } catch (error) {
    // Only internal errors reach here
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `${colors.red}[INTERNAL_ERROR]${colors.reset} Unexpected error processing ${api.name} ${endpoint.method} ${endpoint.path}:`,
      error
    );
    return {
      api_name: api.name,
      endpoint: endpoint.path,
      method: endpoint.method,
      error: errorMessage,
      responseType: "error",
      latencyBucket: "timeout",
    } as ProbeTaskResult;
  }
}

/**
 * Validate probe response against expected configuration and baseline
 */
export async function validateProbeResponse(
  db: Database.Database,
  result: ProbeTaskResult,
  resource: EndpointConfig,
  apiId: number,
  endpointId: number
): Promise<ProbeValidationFull> {
  // Step 1: Check if there was a connection error
  if (result.statusCode === 0 && result.error) {
    // Connection error - API is unavailable
    const validation: ProbeValidationFull = {
      api_name: result.api_name,
      endpoint: result.endpoint,
      method: result.method,
      probeValidation: {
        statusCode: 0,
        expectedStatus: resource.expected_status,
        expectedFields: resource.expected_fields || [],
        new_fields: [],
        removed_fields: [],
        passed: false,
      },
      passed: false,
      isConnectionError: true,
      errorMessage: result.error,
    };
    return validation;
  }

  // Step 2: Validate probe against expected configuration
  const probeValidation: ProbeValidationResult = {
    statusCode: result.statusCode,
    expectedStatus: resource.expected_status,
    expectedFields: resource.expected_fields || [],
    new_fields: [],
    removed_fields: [],
    passed: true,
  };

  // Validate status code
  if (result.statusCode !== resource.expected_status) {
    probeValidation.passed = false;
  }

  // Validate fields
  const expectedFields = resource.expected_fields || [];
  const actualFields = result.fields || [];

  probeValidation.new_fields = actualFields.filter(
    (field) => !expectedFields.includes(field)
  );
  probeValidation.removed_fields = expectedFields.filter(
    (field) => !actualFields.includes(field)
  );

  if (
    probeValidation.new_fields.length > 0 ||
    probeValidation.removed_fields.length > 0
  ) {
    probeValidation.passed = false;
  }

  // Step 3: Compare against baseline if it exists
  let baselineComparison: BaselineComparisonResult | undefined;
  let finalPassed = probeValidation.passed;

  const baseline = await getBaseline(db, apiId, endpointId);

  if (baseline && probeValidation.passed) {
    baselineComparison = {
      exists: true,
      statusCodeMatch: baseline.status_code === result.statusCode,
      responseType: baseline.response_type === result.responseType,
      latencyBucket: baseline.latency_bucket === result.latencyBucket,
      passed: true,
    };

    // Baseline comparison takes precedence
    if (
      !baselineComparison.statusCodeMatch ||
      !baselineComparison.responseType
    ) {
      baselineComparison.passed = false;
    }

    finalPassed = baselineComparison.passed;
  } else {
    baselineComparison = {
      exists: false,
      statusCodeMatch: false,
      responseType: false,
      latencyBucket: false,
      passed: false,
    };
  }

  let errorMessage = result.error;

  // If no connection error but validation failed, try to extract error message from body
  if (!errorMessage && !finalPassed && result.data) {
    if (typeof result.data === 'object') {
      if (result.data.message) {
        errorMessage = result.data.message;
      } else if (result.data.error) {
        errorMessage = typeof result.data.error === 'string' ? result.data.error : JSON.stringify(result.data.error);
      }
    }
  }

  const validation: ProbeValidationFull = {
    api_name: result.api_name,
    endpoint: result.endpoint,
    method: result.method,
    probeValidation,
    baselineComparison,
    passed: finalPassed,
    errorMessage: errorMessage,
  };

  return validation;
}
