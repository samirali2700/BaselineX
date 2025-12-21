import { loadSettingsConfig, loadResourcesConfig } from "./validation/schema.validator"
import { showMainMenu } from "./engine/console_menu";
import * as path from "path";
import Database from "better-sqlite3";

export async function main(db: Database.Database) {
  
  const setting_file_path = path.join(__dirname, "../config/settings.yaml");
  const resources_file_path = path.join(__dirname, "../config/resources.yaml");

  const settings = loadSettingsConfig(setting_file_path);
  const resources = loadResourcesConfig(resources_file_path);

  await showMainMenu(db, settings, resources);
}
