import fs from "fs";
import path from "path";
import { SettingsConfig } from "../config/settings.schema";
import { ProbeValidationFull } from "./handlers/request_handler";

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
  validations: ProbeValidationFull[];
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
 * Output results to console with pytest-like format
 */
function outputAsConsole(results: TaskResults): void {
  console.log("");

  const success: typeof results.validations = [];
  const failures: typeof results.validations = [];

  for (const validation of results.validations) {
    if (validation.passed) {
      success.push(validation);
    } else {
      failures.push(validation);
    }
  }

  // PASSED SECTION (pytest style: green PASSED)
  if (success.length > 0) {
    for (const validation of success) {
      console.log(
        `${validation.api_name}::${validation.method} ${validation.endpoint} ${colors.brightGreen}PASSED${colors.reset}`
      );
    }
  }

  // FAILED SECTION (pytest style: red FAILED with traceback)
  if (failures.length > 0) {
    console.log("");
    
    for (const validation of failures) {
      console.log(
        `${validation.api_name}::${validation.method} ${validation.endpoint} ${colors.brightRed}FAILED${colors.reset}`
      );

      // Connection error - only show API unavailable
      if ((validation as any).isConnectionError) {
        console.log(`  ${colors.red}API Unavailable${colors.reset}`);
        if (validation.errorMessage) {
          console.log(`  Error: ${validation.errorMessage}`);
        }
        continue;
      }

      if (validation.errorMessage) {
        console.log(`  Error: ${validation.errorMessage}`);
      }

      // Probe validation failures
      if (!validation.probeValidation.passed) {
        if (validation.probeValidation.statusCode !== validation.probeValidation.expectedStatus) {
          console.log(
            `  Expected status code: ${validation.probeValidation.expectedStatus}`
          );
          console.log(
            `  Actual status code: ${colors.red}${validation.probeValidation.statusCode}${colors.reset}`
          );
        }

        if (validation.probeValidation.new_fields && validation.probeValidation.new_fields.length > 0) {
          console.log(
            `  Unexpected fields: ${colors.yellow}${validation.probeValidation.new_fields.join(", ")}${colors.reset}`
          );
        }

        if (validation.probeValidation.removed_fields && validation.probeValidation.removed_fields.length > 0) {
          console.log(
            `  Missing fields: ${colors.yellow}${validation.probeValidation.removed_fields.join(", ")}${colors.reset}`
          );
        }
      }

      // Baseline comparison failures
      if (validation.baselineComparison && !validation.baselineComparison.passed) {
        if (validation.baselineComparison.exists) {
          if (!validation.baselineComparison.statusCodeMatch) {
            console.log(`  Baseline status code mismatch`);
          }
          if (!validation.baselineComparison.responseType) {
            console.log(`  Baseline response type mismatch`);
          }
          if (!validation.baselineComparison.latencyBucket) {
            console.log(`  Baseline latency bucket mismatch`);
          }
        } else {
          console.log(`  No baseline to compare against`);
        }
      }

      console.log("");
    }
  }

  // SUMMARY (pytest style)
  const totalTests = results.total_endpoints;
  const passedTests = results.total_passed;
  const failedTests = results.total_failed;
  const passRate = results.success_rate;

  console.log("=".repeat(70));

  if (failedTests === 0) {
    console.log(
      `${colors.brightGreen}${passedTests} passed${colors.reset} in ${totalTests} endpoints`
    );
  } else {
    console.log(
      `${colors.brightRed}${failedTests} failed${colors.reset}, ${colors.brightGreen}${passedTests} passed${colors.reset} in ${totalTests} endpoints`
    );
  }

  console.log(`Success Rate: ${passRate.toFixed(2)}%`);
  console.log("=".repeat(70));
  console.log("");
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
