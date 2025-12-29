import { main } from "./src/main";
import { getDatabase, closeDatabase } from "./src/engine/db_initializer";

const db = getDatabase();

const verbose = process.argv.includes("-v");

main(db, verbose)
  .then(() => {
    console.log("\n✅ Application completed successfully");
    closeDatabase();
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ An error occurred during application execution:");
    console.error(error);
    closeDatabase();
    process.exit(1);
  });

