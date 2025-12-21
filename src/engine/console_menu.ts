import Database from "better-sqlite3";
import * as readline from "readline";
import { SettingsConfig } from "../config/settings.schema";
import { ResourcesConfig } from "../config/resources.schema";
import { getAllApis, getApiById } from "../database/api.queries";
import { getEndpointsByApi, getEndpoint } from "../database/endpoints.queries";
import { getProbesByEndpoint, getProbeStatsByApi } from "../database/probe.queries";
import { getBaselinesByApi } from "../database/baseline.queries";
import { startTask } from "./start_task";
import { resetDatabase } from "./db_initializer";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Display main menu and handle user selection
 */
export async function showMainMenu(
  db: Database.Database,
  settings: SettingsConfig,
  resources: ResourcesConfig
): Promise<void> {
  let running = true;

  while (running) {
    console.log("\n" + "=".repeat(60));
    console.log("📊 BASELINEX - CONSOLE MENU");
    console.log("=".repeat(60));
    console.log("1. View API Details & History");
    console.log("2. Run All Probes");
    console.log("3. Exit");
    console.log("=".repeat(60));

    const choice = await question("\n👉 Select an option (1-3): ");

    switch (choice) {
      case "1":
        await showApiMenu(db);
        break;
      case "2":
        await runAllProbes(db, settings, resources);
        break;
      case "3":
        console.log("\n👋 Goodbye!\n");
        running = false;
        break;
      case "reset":
        console.log("\n🔄 Resetting database ...");
        
        resetDatabase(db);
        break;
      default:
        console.log("\n❌ Invalid option. Please try again.");
    }
  }

  rl.close();
}

/**
 * Show API selection menu
 */
async function showApiMenu(db: Database.Database): Promise<void> {
  const apis = getAllApis(db);

  if (apis.length === 0) {
    console.log("\n❌ No APIs found in database.");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🔍 SELECT AN API");
  console.log("=".repeat(60));

  for (let i = 0; i < apis.length; i++) {
    console.log(`${i + 1}. ${apis[i].name}`);
  }
  console.log(`${apis.length + 1}. Back to Main Menu`);
  console.log("=".repeat(60));

  const choice = await question("\n👉 Select an API (number): ");
  const index = parseInt(choice) - 1;

  if (index < 0 || index >= apis.length) {
    if (parseInt(choice) === apis.length + 1) {
      return;
    }
    console.log("\n❌ Invalid selection.");
    return;
  }

  await showApiDetails(db, apis[index].id!);
}

/**
 * Show detailed information about a specific API
 */
async function showApiDetails(db: Database.Database, apiId: number): Promise<void> {
  const api = getApiById(db, apiId);
  if (!api) {
    console.log("\n❌ API not found.");
    return;
  }

  const endpoints = getEndpointsByApi(db, apiId);
  const probeStats = getProbeStatsByApi(db, apiId);
  const baselines = getBaselinesByApi(db, apiId);

  console.log("\n" + "=".repeat(60));
  console.log("📋 API DETAILS");
  console.log("=".repeat(60));
  console.log(`\n🔗 API: ${api.name}`);
  console.log(`   Base URL: ${api.base_url}`);
  console.log(`   Created: ${api.created_at || "N/A"}`);

  console.log(`\n📊 Probe Statistics:`);
  console.log(`   Total Probes: ${probeStats.total}`);
  console.log(`   ✅ Passed: ${probeStats.passed}`);
  console.log(`   ❌ Failed: ${probeStats.failed}`);
  console.log(`   Success Rate: ${probeStats.successRate.toFixed(2)}%`);

  console.log(`\n🔗 Endpoints (${endpoints.length}):`);
  for (const endpoint of endpoints) {
    const endpointProbes = getProbesByEndpoint(db, endpoint.id!);
    const passedCount = endpointProbes.filter((p) => p.passed).length;
    const failedCount = endpointProbes.length - passedCount;

    console.log(`\n   ${endpoint.method} ${endpoint.path}`);
    console.log(`      Expected Status: ${endpoint.expected_status}`);
    if (endpoint.expected_fields && endpoint.expected_fields.length > 0) {
      console.log(
        `      Expected Fields: ${Array.isArray(endpoint.expected_fields) ? endpoint.expected_fields.join(", ") : endpoint.expected_fields}`
      );
    }
    console.log(`      Probes: ${endpointProbes.length} (${passedCount} passed, ${failedCount} failed)`);

    if (endpointProbes.length > 0) {
      const recentProbe = endpointProbes[0];
      console.log(
        `      Last Probe: ${recentProbe.probe_time} - ${recentProbe.passed ? "✅ Passed" : "❌ Failed"}`
      );
    }
  }

  console.log(`\n📦 Baselines: ${baselines.length}`);
  for (const baseline of baselines.slice(0, 5)) {
    console.log(`   • ${baseline.baseline_time} (Probe ID: ${baseline.probe_id})`);
  }
  if (baselines.length > 5) {
    console.log(`   ... and ${baselines.length - 5} more`);
  }

  console.log("\n" + "=".repeat(60));
  await question("Press Enter to continue...");
}

/**
 * Run all probes on all APIs
 */
async function runAllProbes(
  db: Database.Database,
  settings: SettingsConfig,
  resources: ResourcesConfig
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 RUNNING ALL PROBES");
  console.log("=".repeat(60));

  const startTime = Date.now();

  const results = await startTask(db, settings, resources);
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n✅ Probe run completed in ${duration}s`);
  console.log("=".repeat(60));

  await question("Press Enter to return to menu...");
}
