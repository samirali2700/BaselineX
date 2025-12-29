import Database from "better-sqlite3";
import { EndpointConfig,  ResourcesConfig } from "../config/resources.schema";
import { SettingsConfig } from "../config/settings.schema";
import { preHandleEndpoints, PreHandlerResult } from "./pre_handler";
import { insertProbeResult } from "../database/probe.queries";
import { outputResults } from "./output_handler";
import { checkAndCreateBaseline } from "./baseline_handler";
import { probeHandler, validateProbeResponse, ProbeValidationFull } from "./handlers/request_handler";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  brightGreen: "\x1b[92m",
  cyan: "\x1b[36m",
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
    validations: ProbeValidationFull[];
};

export async function startTask(db: Database.Database, settings: SettingsConfig, resources: ResourcesConfig, verbose: boolean = false): Promise<TaskResults> {
    if (verbose) console.log(`${colors.cyan}[INFO]${colors.reset} Starting task ...`);

    const validations: ProbeValidationFull[] = [];
    const apiSummaries: TaskSummary[] = [];
    let totalPassed = 0;
    let totalFailed = 0;

    // Global variables stash for the entire task run
    const variables: Record<string, any> = {};

    for (const api of resources.apis) {
        if (api.disabled) {
            if (verbose) console.log(`${colors.cyan}[INFO]${colors.reset} Skipping disabled API: ${api.name}`);
            continue;
        }

        try {
            const apiDetails = await preHandleEndpoints(db, api, verbose); 
            const apiData = apiDetails.get(api.name);

            if (!apiData) {
                console.log(`${colors.red}[ERROR]${colors.reset} Failed to process API: ${api.name}`);
                continue;
            }

            if (verbose) console.log(`\n${colors.cyan}[PROBE]${colors.reset} Probing API: ${api.name} (${api.base_url})`);
            
            let apiPassed = 0;
            let apiFailed = 0;

            for (const endpoint of api.endpoints) {
                try {
                    // Resolve variables in endpoint configuration
                    const resolvedEndpoint = resolveEndpointVariables(endpoint, variables);
                    const endpointKey = `${resolvedEndpoint.method} ${resolvedEndpoint.path}`;
                    
                    // Use original endpoint key for ID lookup as pre-handler uses raw paths
                    // Note: This assumes pre-handler stores paths with variables intact or we need to handle this mismatch
                    // For now, let's try to find ID using the raw path from config if possible, or resolved path
                    let endpointId = apiData.endpoints.get(`${endpoint.method} ${endpoint.path}`);
                    
                    if (!endpointId) {
                         // Fallback to resolved path if raw path not found (though pre-handler likely saw raw path)
                         endpointId = apiData.endpoints.get(endpointKey);
                    }

                    if (!endpointId) {
                        if (verbose) console.log(`  ${colors.red}[ERROR]${colors.reset} Endpoint not found in pre-handler: ${endpoint.method} ${endpoint.path}`);
                        continue;
                    }

                    const probeResult = await probeHandler(api, resolvedEndpoint, settings);
                    const validationResult = await validateProbeResponse(db, probeResult, resolvedEndpoint, apiData.apiId, endpointId);
                    
                    // Stash variables if successful
                    if (validationResult.passed && endpoint.stash && probeResult.data) {
                        updateVariables(variables, probeResult.data, endpoint.stash, verbose);
                    }

                    insertProbeResult(
                        db, {
                            api_id: apiData.apiId,
                            endpoint_id: endpointId,
                            passed: validationResult.passed,
                            status_code: probeResult.statusCode || 0,
                            response_type: probeResult.responseType,
                            latency_bucket: probeResult.latencyBucket,
                            error_message: probeResult.error || undefined,
                        }
                    );
                    
                    // Check and create baseline if conditions are met
                    await checkAndCreateBaseline(db, apiData.apiId, endpointId, settings);
                    
                    validations.push(validationResult);
                    if (verbose) console.log(`  ${validationResult.passed ? colors.green + '[OK]' : colors.red + '[ERR]'}${colors.reset} ${endpointKey}`);
                    
                    if (validationResult.passed) {
                        apiPassed++;
                        totalPassed++;
                    } else {
                        apiFailed++;
                        totalFailed++;
                    }
                } catch (endpointError) {
                    if (verbose) console.error(`  ❌ Error processing endpoint:`, endpointError);
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
            if (verbose) console.error(`❌ Error processing API:`, apiError);
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

/**
 * Recursively replace variables in an object or string
 */
function replaceVariables(target: any, variables: Record<string, any>): any {
    if (typeof target === 'string') {
        return target.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            return variables[key] !== undefined ? String(variables[key]) : match;
        });
    } else if (Array.isArray(target)) {
        return target.map(item => replaceVariables(item, variables));
    } else if (typeof target === 'object' && target !== null) {
        const result: any = {};
        for (const key in target) {
            result[key] = replaceVariables(target[key], variables);
        }
        return result;
    }
    return target;
}

/**
 * Create a new endpoint config with variables resolved
 */
function resolveEndpointVariables(endpoint: EndpointConfig, variables: Record<string, any>): EndpointConfig {
    // Deep clone to avoid mutating original config
    const clone = JSON.parse(JSON.stringify(endpoint));
    
    // Resolve path
    clone.path = replaceVariables(clone.path, variables);
    
    // Resolve request body/query if they exist
    if (clone.request?.fixture) {
        if (clone.request.fixture.body) {
            clone.request.fixture.body = replaceVariables(clone.request.fixture.body, variables);
        }
        if (clone.request.fixture.query) {
            clone.request.fixture.query = replaceVariables(clone.request.fixture.query, variables);
        }
    }
    
    return clone;
}

/**
 * Update variables map from response data based on stash config
 */
function updateVariables(variables: Record<string, any>, data: any, stash: Record<string, string>, verbose: boolean) {
    for (const [varName, path] of Object.entries(stash)) {
        // Simple property access for now (e.g. "id" or "user.id")
        // For flat objects "id" works. For nested, we might need a helper.
        // Assuming flat or simple access for MVP.
        const value = data[path]; 
        if (value !== undefined) {
            variables[varName] = value;
            if (verbose) console.log(`${colors.cyan}[STASH]${colors.reset} Stashed ${varName} = ${value}`);
        } else {
            if (verbose) console.log(`${colors.red}[STASH]${colors.reset} Failed to stash ${varName}: path '${path}' not found in response`);
        }
    }
}