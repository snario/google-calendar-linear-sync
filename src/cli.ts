/**
 * CLI for running validations and dry runs
 * Usage: deno run --allow-env --allow-net --allow-import src/cli.ts [command]
 */

import { validateApis } from "./api-validator.ts";
import { runDrySync } from "./dry-run.ts";
import {
  checkEnvironment,
  getValidationConfig,
  getValTownConfig,
  printValTownSetupGuide,
} from "./val-town-config.ts";

async function main() {
  const args = Deno.args;
  const command = args[0] || "help";

  console.log("🚀 Google Calendar ↔ Linear Sync CLI");
  console.log("=====================================\n");

  try {
    switch (command) {
      case "check":
        checkCommand();
        break;

      case "validate":
        await validateCommand();
        break;

      case "dry-run":
        await dryRunCommand();
        break;

      case "setup":
        setupCommand();
        break;

      case "test":
        await testCommand();
        break;

      case "help":
      default:
        helpCommand();
        break;
    }
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

function checkCommand() {
  console.log("🔍 Checking environment configuration...\n");

  const check = checkEnvironment();

  if (check.valid) {
    console.log("✅ All required environment variables are set!");
  } else {
    console.log("❌ Missing required environment variables:");
    check.missing.forEach((key) => console.log(`   - ${key}`));
    console.log("\nRun `deno run src/cli.ts setup` for configuration guide.");
    return;
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

async function validateCommand() {
  console.log("🔍 Validating API structure and mock compatibility...\n");

  const config = getValidationConfig();
  const result = await validateApis(config);

  if (result.success) {
    console.log(
      "\n🎉 Validation successful! Your mock data structures are compatible with the real APIs.",
    );
  } else {
    console.log("\n⚠️  Validation issues found. Check the details above.");
  }
}

async function dryRunCommand() {
  console.log("🎯 Running dry sync with real production data...\n");

  const config = getValTownConfig();
  const result = await runDrySync(config);

  if (result.errors.length === 0) {
    console.log("\n🎉 Dry run completed successfully!");
    console.log(
      `Would make ${result.wouldExecute.summary.totalChanges} changes if run for real.`,
    );
  } else {
    console.log(
      "\n⚠️  Dry run completed with errors. Check the details above.",
    );
  }
}

function setupCommand() {
  printValTownSetupGuide();
}

async function testCommand() {
  console.log("🧪 Running comprehensive test suite...\n");

  console.log("1. Environment check...");
  checkCommand();

  console.log("\n2. API validation...");
  await validateCommand();

  console.log("\n3. Dry run...");
  await dryRunCommand();

  console.log("\n✅ All tests completed!");
}

function helpCommand() {
  console.log("Available commands:");
  console.log("");
  console.log("📋 check       - Check environment configuration");
  console.log("🔍 validate    - Validate API structure and mock compatibility");
  console.log(
    "🎯 dry-run     - Run sync logic with real data (no changes made)",
  );
  console.log("⚙️  setup       - Show Val Town configuration guide");
  console.log("🧪 test        - Run all validation tests");
  console.log("❓ help        - Show this help message");
  console.log("");
  console.log("Examples:");
  console.log(
    "  deno run --allow-env --allow-net --allow-import src/cli.ts check",
  );
  console.log(
    "  deno run --allow-env --allow-net --allow-import src/cli.ts validate",
  );
  console.log(
    "  deno run --allow-env --allow-net --allow-import src/cli.ts dry-run",
  );
  console.log("");
  console.log("Environment variables needed:");
  console.log(
    "  LINEAR_API_KEY, LINEAR_TEAM_ID, GOOGLE_SERVICE_ACCOUNT_JSON, GCAL_CALENDAR_ID",
  );
  console.log("");
  console.log("For setup instructions: `deno run src/cli.ts setup`");
}

// Run the CLI
if (import.meta.main) {
  await main();
}
