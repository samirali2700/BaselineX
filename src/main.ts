import { loadSettingsConfig, loadResourcesConfig } from "./validation/schema.validator"
import * as path from "path";

export async function main() {
  const setting_file_path = path.join(__dirname, "../config/settings.yaml");
  const resources_file_path = path.join(__dirname, "../config/resources.yaml");

  const settings = loadSettingsConfig(setting_file_path);
  const resources = loadResourcesConfig(resources_file_path);

  console.log("Settings loaded:", settings);
  console.log("Resources loaded:", resources);

//   const plan = buildExecutionPlan(resources);
//   const results = await runPlan(plan, settings);

//   const diff = compareWithBaseline(results, settings);

//   outputResults(diff, settings);
}
