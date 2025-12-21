import Database from "better-sqlite3";
import { getLatestBaseline, insertBaseline, BaselineRecord } from "../database/baseline.queries";
import { getProbesByEndpoint } from "../database/probe.queries";
import { SettingsConfig } from "../config/settings.schema";

/**
 * Check if a baseline exists for an endpoint
 * If not, create one if the required successful probes threshold is met
 * All recent probes must be successful
 */
export async function checkAndCreateBaseline(
  db: Database.Database,
  apiId: number,
  endpointId: number,
  settings: SettingsConfig
): Promise<BaselineRecord | null> {
  // Step 1: Check if baseline already exists
  const existingBaseline = getLatestBaseline(db, apiId, endpointId);
  if (existingBaseline) {
    return existingBaseline;
  }

  // Step 2: Get recent probes for this endpoint
  const allProbes = getProbesByEndpoint(db, endpointId);
  
  if (allProbes.length === 0) {
    console.log(
      `  ⚠️  No probes found for endpoint (ID: ${endpointId})`
    );
    return null;
  }

  // Step 3: Get the required successful probes from settings
  const requiredSuccessfulProbes =
    settings.settings.baseline.required_successful_probes;

  // Get the most recent probes (up to the required threshold)
  const recentProbes = allProbes.slice(0, requiredSuccessfulProbes);

  // Step 4: Check if we have enough probes
  if (recentProbes.length < requiredSuccessfulProbes) {
    console.log(
      `  ⚠️  Not enough probes yet. Have ${recentProbes.length}, need ${requiredSuccessfulProbes}`
    );
    return null;
  }

  // Step 5: Check if all recent probes are successful
  const allSuccessful = recentProbes.every((probe) => probe.passed);

  if (!allSuccessful) {
    const successCount = recentProbes.filter((p) => p.passed).length;
    console.log(
      `  ⚠️  Not all recent probes are successful. ${successCount}/${requiredSuccessfulProbes} passed`
    );
    return null;
  }

  // Step 6: All conditions met - create a baseline
  console.log(
    `  ✨ Creating baseline - ${requiredSuccessfulProbes} successful probes confirmed`
  );

  // Use the most recent probe as the baseline
  const baselineProbe = recentProbes[0];
  const baselineId = insertBaseline(db, {
    api_id: apiId,
    endpoint_id: endpointId,
    probe_id: baselineProbe.id!,
  });

  console.log(`  ✅ Baseline created (ID: ${baselineId})`);

  return {
    id: baselineId,
    api_id: apiId,
    endpoint_id: endpointId,
    probe_id: baselineProbe.id!,
  };
}
