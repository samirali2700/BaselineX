import { ResourcesConfig } from "../config/resources.schema";
import { SettingsConfig } from "../config/settings.schema";

export async function startTask(settings: SettingsConfig, resources: ResourcesConfig) {
    console.log("Starting task ...");

    


    

}

export async function runProbe(resource: any, settings: SettingsConfig) {
    console.log(`Running probe for resource: ${resource.name}`);
    // Implement probe logic here
}