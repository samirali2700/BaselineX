import { readFileSync } from "fs";
import yaml from "js-yaml";
import { z } from "zod";
import { SettingsSchema, SettingsConfig } from "../config/settings.schema";
import { ResourcesSchema, ResourcesConfig } from "../config/resources.schema";


export function loadSettingsConfig(filePath: string): SettingsConfig {

  const raw = readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw);

  const result = SettingsSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Invalid settings configuration:");
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }

  return result.data;
}

export function loadResourcesConfig(filePath: string): ResourcesConfig {
  const raw = readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw);

  const result = ResourcesSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Invalid resources configuration:");
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }

  return result.data;
}
