import fs from "fs";
import path from "path";
import { SettingsConfig } from "../config/settings.schema";

// ANSI color codes for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  brightGreen: "\x1b[92m",
  brightRed: "\x1b[91m",
};

export interface TaskResults {
  total_apis: number;
  total_endpoints: number;
  total_passed: number;
  total_failed: number;
  success_rate: number;
  apis: Array<{
    api_name: string;
    total_endpoints: number;
    passed: number;
    failed: number;
    success_rate: number;
  }>;
  validations: Array<{
    api_name: string;
    endpoint: string;
    method: string;
    probeValidation: {
      statusCode?: number;
      expectedStatus?: number;
      expectedFields: string[];
      new_fields?: string[];
      removed_fields?: string[];
      passed: boolean;
    };
    baselineComparison?: {
      exists: boolean;
      statusCodeMatch: boolean;
      responseType: boolean;
      latencyBucket: boolean;
      passed: boolean;
    };
    passed: boolean;
  }>;
}

/**
 * Output results based on settings configuration
 * Supports console and JSON output formats
 */
export function outputResults(results: TaskResults, settings: SettingsConfig): void {
  const outputFormat = settings.settings.output.format;

  if (outputFormat === "json") {
    outputAsJson(results, settings);
  } else {
    outputAsConsole(results);
  }

  // Optionally save results to file
  if (settings.settings.output.save_results) {
    saveResultsToFile(results, settings);
  }
}

/**
 * Output results to console with formatted summary
 */
function outputAsConsole(results: TaskResults): void {
  console.log("\n" + "=".repeat(60));
  console.log("BASELINE TEST SUMMARY");
  console.log("=".repeat(60));

  const success: typeof results.validations = [];
  const failures: typeof results.validations = [];

  for (const validation of results.validations) {
    if (validation.passed) {
      success.push(validation);
    } else {
      failures.push(validation);
    }
  }

  // SUCCESS SECTION
  if (success.length === 0) {
    console.log("No successful endpoints");
  } else {
    // Group by API
    const successByApi = new Map<string, typeof success>();
    for (const validation of success) {
      if (!successByApi.has(validation.api_name)) {
        successByApi.set(validation.api_name, []);
      }
      successByApi.get(validation.api_name)!.push(validation);
    }

    for (const [apiName, apiValidations] of successByApi) {
      const api = results.apis.find(a => a.api_name === apiName);
      const allSuccess = api && api.passed === api.total_endpoints;
      console.log(`${allSuccess ? colors.brightGreen + "" : ""} ${apiName}${colors.reset}`);
      for (const validation of apiValidations) {
        console.log(`${colors.green} ${validation.method} ${validation.endpoint}${colors.reset}`);
      }
    }
  }

  // ❌ FAILURES SECTION
  if (failures.length > 0) {
    console.log(`\n${colors.brightRed}❌ FAILED ENDPOINTS:${colors.reset}`);
    const failuresByApi = new Map<string, typeof failures>();
    for (const validation of failures) {
      if (!failuresByApi.has(validation.api_name)) {
        failuresByApi.set(validation.api_name, []);
      }
      failuresByApi.get(validation.api_name)!.push(validation);
    }

    for (const [apiName, apiValidations] of failuresByApi) {
      console.log(`\n   ${colors.red}${apiName}${colors.reset}`);
      for (const validation of apiValidations) {
        console.log(`      ${colors.brightRed}❌ ${validation.method} ${validation.endpoint}${colors.reset}`);

        // Show probe validation results
        console.log(`         📌 Probe Validation:`);
        const probeStatus = validation.probeValidation.passed ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
        console.log(
          `            ${probeStatus} Status Code: ${validation.probeValidation.statusCode} (expected ${validation.probeValidation.expectedStatus})`
        );

        if (validation.probeValidation.new_fields && validation.probeValidation.new_fields.length > 0) {
          console.log(`            ℹ️  New Fields: ${colors.yellow}${validation.probeValidation.new_fields.join(", ")}${colors.reset}`);
        }

        if (validation.probeValidation.removed_fields && validation.probeValidation.removed_fields.length > 0) {
          console.log(
            `            ⚠️  Removed Fields: ${colors.yellow}${validation.probeValidation.removed_fields.join(", ")}${colors.reset}`
          );
        }

        // Show baseline comparison results
        if (validation.baselineComparison) {
          console.log(`         🔄 Baseline Comparison:`);
          if (validation.baselineComparison.exists) {
            console.log(`            Baseline Found: ${colors.green}✅${colors.reset}`);
            console.log(`            Status Code Match: ${validation.baselineComparison.statusCodeMatch ? colors.green + "✅" : colors.red + "❌"}${colors.reset}`);
            
          } else {
            console.log(`            Baseline Found: ${colors.red}❌${colors.reset} (No baseline to compare against)`);
          }
        }
      }
    }
  }

  // 📊 SUMMARY AT THE BOTTOM
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY:");
  console.log("=".repeat(60));
  console.log(`Total APIs: ${results.total_apis}`);
  console.log(`Total Endpoints: ${results.total_endpoints}`);
  console.log(`${colors.brightGreen}Passed: ${results.total_passed}${colors.reset}`);
  console.log(`${colors.brightRed}Failed: ${results.total_failed}${colors.reset}`);
  console.log(
    `Success Rate: ${results.success_rate.toFixed(2)}%`
  );
  console.log("=".repeat(60) + "\n");
}

/**
 * Output results as JSON to console
 */
function outputAsJson(results: TaskResults, settings: SettingsConfig): void {
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    application: settings.name,
    version: settings.version,
    results,
  };

  console.log(JSON.stringify(jsonOutput, null, 2));
}

/**
 * Save results to a JSON file
 */
function saveResultsToFile(results: TaskResults, settings: SettingsConfig): void {
  try {
    const resultsPath = settings.settings.output.results_path;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `baseline-results-${timestamp}.json`;
    const filepath = path.join(resultsPath, filename);

    // Create directory if it doesn't exist
    if (!fs.existsSync(resultsPath)) {
      fs.mkdirSync(resultsPath, { recursive: true });
    }

    const fileContent = {
      timestamp: new Date().toISOString(),
      application: settings.name,
      version: settings.version,
      results,
    };

    fs.writeFileSync(filepath, JSON.stringify(fileContent, null, 2));
    console.log(`\n💾 Results saved to: ${filepath}`);
  } catch (error) {
    console.error(`⚠️  Failed to save results to file:`, error);
  }
}
