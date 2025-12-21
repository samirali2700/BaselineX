import Database from "better-sqlite3";
import { EndpointConfig,  ResourcesConfig } from "../config/resources.schema";
import { SettingsConfig } from "../config/settings.schema";
import { probeEndpoint } from "../probe/prob.api";
import { BaselineRecord, getLatestBaseline } from "../database/baseline.queries";
import { getApiByName } from "../database/api.queries";
import { getEndpoint } from "../database/endpoints.queries";
import { preHandleEndpoints, PreHandlerResult } from "./pre_handler";
import { getProbeById, insertProbeResult, ProbeRecord } from "../database/probe.queries";
import { outputResults } from "./output_handler";
import { checkAndCreateBaseline } from "./baseline_handler";


type TaskResult = {
    api_name: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    fields?: string[];
    error?: string;
    responseType: string;
    latencyBucket: string;
}

type ProbeValidationResult = {
    statusCode?: number;
    expectedStatus?: number;
    expectedFields: string[];
    new_fields?: string[];
    removed_fields?: string[];
    passed: boolean;
};

type BaselineComparisonResult = {
    exists: boolean;
    statusCodeMatch: boolean;
    responseType: boolean;
    latencyBucket: boolean;
    passed: boolean;
};

type ValidationResult = {
    api_name: string;
    endpoint: string;
    method: string;
    probeValidation: ProbeValidationResult;
    baselineComparison?: BaselineComparisonResult;
    passed: boolean; // Final result - baseline takes precedence if it exists
};

type TaskSummary = {
    api_name: string;
    total_endpoints: number;
    passed: number;
    failed: number;
    success_rate: number;
};

type TaskResults = {
    total_apis: number;
    total_endpoints: number;
    total_passed: number;
    total_failed: number;
    success_rate: number;
    apis: TaskSummary[];
    validations: ValidationResult[];
};


async function getBaseline(db: Database.Database, apiId: number, endpointId: number): Promise<ProbeRecord | null> {
    // Get the latest baseline directly with API and endpoint IDs
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

export async function startTask(db: Database.Database, settings: SettingsConfig, resources: ResourcesConfig): Promise<TaskResults> {
    console.log("Starting task ...");

    const validations: ValidationResult[] = [];
    const apiSummaries: TaskSummary[] = [];
    let totalPassed = 0;
    let totalFailed = 0;

    for (const api of resources.apis) {
        try {
            const apiDetails = await preHandleEndpoints(db, api); 
            const apiData = apiDetails.get(api.name);

            if (!apiData) {
                console.log(`❌ Failed to process API: ${api.name}`);
                continue;
            }

            console.log(`\nProbing API: ${api.name} (${api.base_url})`);
            
            let apiPassed = 0;
            let apiFailed = 0;

            for (const endpoint of api.endpoints) {
                try {

                    const endpointKey = `${endpoint.method} ${endpoint.path}`;
                    const endpointId = apiData.endpoints.get(endpointKey);

                    if (!endpointId) {
                        console.log(`  ❌ Endpoint not found in pre-handler: ${endpointKey}`);
                        continue;
                    }

                    const probeResult = await runProbe(api, endpoint, settings);
                    const baseline = await getBaseline(db, apiData.apiId, endpointId);
                    const validationResult = validateResponse(probeResult, endpoint, baseline);
                    
                    insertProbeResult(
                        db, {
                            api_id: apiData.apiId,
                            endpoint_id: endpointId,
                            passed: validationResult.passed,
                            status_code: probeResult.statusCode || 0,
                            response_type: probeResult.responseType,
                            latency_bucket: probeResult.latencyBucket
                        }
                    );
                    
                    // Check and create baseline if conditions are met
                    await checkAndCreateBaseline(db, apiData.apiId, endpointId, settings);
                    
                    validations.push(validationResult);
                    console.log(`  ${validationResult.passed ? '✅' : '❌'} ${endpointKey}`);
                    
                    if (validationResult.passed) {
                        apiPassed++;
                        totalPassed++;
                    } else {
                        apiFailed++;
                        totalFailed++;
                    }
                } catch (endpointError) {
                    console.error(`  ❌ Error processing endpoint:`, endpointError);
                    apiFailed++;
                    totalFailed++;
                }
            }

            // Add API summary
            const totalEndpoints = apiPassed + apiFailed;
            const successRate = totalEndpoints > 0 ? (apiPassed / totalEndpoints) * 100 : 0;
            apiSummaries.push({
                api_name: api.name,
                total_endpoints: totalEndpoints,
                passed: apiPassed,
                failed: apiFailed,
                success_rate: successRate,
            });
        } catch (apiError) {
            console.error(`❌ Error processing API:`, apiError);
        }
    }

    // Calculate overall statistics
    const totalEndpoints = totalPassed + totalFailed;
    const overallSuccessRate = totalEndpoints > 0 ? (totalPassed / totalEndpoints) * 100 : 0;

    const results: TaskResults = {
        total_apis: resources.apis.length,
        total_endpoints: totalEndpoints,
        total_passed: totalPassed,
        total_failed: totalFailed,
        success_rate: overallSuccessRate,
        apis: apiSummaries,
        validations,
    };

    // Output results based on settings
    outputResults(results, settings);

    return results;
}

export async function runProbe(api: any, endpoint: EndpointConfig, settings: SettingsConfig): Promise<TaskResult> {
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
        
        return {
            api_name: api.name,
            endpoint: endpoint.path,
            method: endpoint.method,
            statusCode: result.statusCode,
            responseType: result.responseType,
            fields: result.body ? result.body : [],
            latencyBucket: result.latencyBucket
            
        } as TaskResult;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            api_name: api.name,
            endpoint: endpoint.path,
            method: endpoint.method,
            error: errorMessage
        } as TaskResult;
    }
}

function validateResponse(result: TaskResult, resource: EndpointConfig, baseline: ProbeRecord | null): ValidationResult {
    // Step 1: Validate probe against expected configuration
    const probeValidation: ProbeValidationResult = {
        statusCode: result.statusCode,
        expectedStatus: resource.expected_status,
        expectedFields: resource.expected_fields || [],
        new_fields: [],
        removed_fields: [],
        passed: true
    };

    // Validate status code
    if (result.statusCode !== resource.expected_status) {
        probeValidation.passed = false;
    }

    // Validate fields
    const expectedFields = resource.expected_fields || [];
    const actualFields = result.fields || [];

    probeValidation.new_fields = actualFields.filter(field => !expectedFields.includes(field));
    probeValidation.removed_fields = expectedFields.filter(field => !actualFields.includes(field));

    if (probeValidation.new_fields.length > 0 || probeValidation.removed_fields.length > 0) {
        probeValidation.passed = false;
    }

    // Step 2: Compare against baseline if it exists
    let baselineComparison: BaselineComparisonResult | undefined;
    let finalPassed = probeValidation.passed;

    if (baseline) {
        baselineComparison = {
            exists: true,
            statusCodeMatch: baseline.status_code === result.statusCode,
            responseType: baseline.response_type === result.responseType,
            latencyBucket: baseline.latency_bucket === result.latencyBucket,
            passed: true
        };

        // Baseline comparison takes precedence
        if (!baselineComparison.statusCodeMatch || !baselineComparison.responseType) {
            baselineComparison.passed = false;
        }

        finalPassed = baselineComparison.passed;
    } else {
        baselineComparison = {
            exists: false,
            statusCodeMatch: false,
            responseType: false,
            latencyBucket: false,
            passed: false
        };
    }

    const validation: ValidationResult = {
        api_name: result.api_name,
        endpoint: result.endpoint,
        method: result.method,
        probeValidation,
        baselineComparison,
        passed: finalPassed
    };

    return validation;
}