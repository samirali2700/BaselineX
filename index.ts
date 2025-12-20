import { main } from "./src/main";


main().catch((error) => {
    console.error("An error occurred during application execution:");
    console.error(error);
    process.exit(1);
});