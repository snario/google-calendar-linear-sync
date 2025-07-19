/**
 * Environment configuration checker
 */

import { checkEnvironment, getValTownConfig } from "./val-town-config.ts";

function main() {
  console.log("🔍 Checking environment configuration...\n");

  const check = checkEnvironment();

  if (check.valid) {
    console.log("✅ All required environment variables are set!");
  } else {
    console.log("❌ Missing required environment variables:");
    check.missing.forEach((key) => console.log(`   - ${key}`));
    console.log("\nRun `deno task setup` for configuration guide.");
    Deno.exit(1);
  }

  if (check.warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    check.warnings.forEach((warning) => console.log(`   - ${warning}`));
  }

  const config = getValTownConfig();
  console.log("\n📋 Current Configuration:");
  console.log(`   Timezone: ${config.timezone}`);
  console.log(
    `   Working Hours: ${config.workingHours.startHour}:00 - ${config.workingHours.endHour}:00`,
  );
  console.log(`   Max Items: ${config.maxItemsToProcess}`);
  console.log(`   Validate APIs: ${config.validateApiStructure}`);
  console.log(`   Verbose Logging: ${config.verboseLogging}`);
}

if (import.meta.main) {
  main();
}
