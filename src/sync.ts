/**
 * Unified sync script with --dry-run support
 * Run with: deno run --allow-env --allow-net --env-file=.env src/sync.ts [--dry-run]
 */

import { SyncWorker } from "./worker.ts";
import { SyncConfig } from "./types.ts";
import { RealGCalApiClient, RealLinearApiClient } from "./api-clients.ts";
import { DryRunConfig, runDrySync } from "./dry-run.ts";

function getConfig(): SyncConfig {
  return {
    linearApiKey: Deno.env.get("LINEAR_API_KEY") || "",
    linearTeamId: Deno.env.get("LINEAR_TEAM_ID") || "",
    gcalCalendarId: Deno.env.get("GCAL_CALENDAR_ID") || "",
    gcalHistoryCalendarId: Deno.env.get("GCAL_HISTORY_CALENDAR_ID"),
    timezone: Deno.env.get("TIMEZONE") || "America/New_York",
    workingHours: {
      startHour: parseInt(Deno.env.get("WORK_START_HOUR") || "9"),
      endHour: parseInt(Deno.env.get("WORK_END_HOUR") || "17"),
      workingDays: [1, 2, 3, 4, 5], // Monday-Friday
    },
    lookbackDays: parseInt(Deno.env.get("LOOKBACK_DAYS") || "2"),
    lookaheadDays: parseInt(Deno.env.get("LOOKAHEAD_DAYS") || "14"),
  };
}

function getDryRunConfig(): DryRunConfig {
  const baseConfig = getConfig();
  return {
    ...baseConfig,
    googleServiceAccountJson: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "",
    validateApiStructure: true,
    maxItemsToProcess: 50,
    verboseLogging: false,
  };
}

async function runRealSync() {
  console.log("🚀 Starting Google Calendar ↔ Linear sync...");

  const config = getConfig();

  // Validate configuration
  if (!config.linearApiKey || !config.linearTeamId) {
    console.error("❌ Missing required Linear API credentials");
    console.error("   Required: LINEAR_API_KEY, LINEAR_TEAM_ID");
    Deno.exit(1);
  }

  if (!config.gcalCalendarId || !Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) {
    console.error("❌ Missing required Google Calendar credentials");
    console.error("   Required: GCAL_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_JSON");
    Deno.exit(1);
  }

  try {
    // Create API clients
    const clients = {
      linear: new RealLinearApiClient({
        apiKey: config.linearApiKey,
        teamId: config.linearTeamId,
      }),
      gcal: new RealGCalApiClient({
        serviceAccountJson: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!,
        calendarId: config.gcalCalendarId,
      }),
    };

    // Create and run sync worker
    const worker = new SyncWorker(config, clients);
    const result = await worker.sync();

    // Log results
    console.log("✅ Sync completed successfully");
    console.log(
      `📊 Processed ${result.itemsProcessed} items in ${result.duration}ms`,
    );
    console.log(`⚡ Executed ${result.operationsExecuted.length} operations`);

    if (result.operationsExecuted.length > 0) {
      console.log("\n📝 Operations executed:");
      result.operationsExecuted.forEach((op, i) => {
        console.log(`   ${i + 1}. ${op.type}: ${op.reason} (${op.item.title})`);
      });
    }

    if (result.errors.length > 0) {
      console.warn(`\n⚠️  ${result.errors.length} errors occurred:`);
      result.errors.forEach((error) => console.warn(`   ${error}`));
      Deno.exit(1);
    }
  } catch (error) {
    console.error("❌ Sync failed:", error);
    Deno.exit(1);
  }
}

async function main() {
  const args = Deno.args;
  const isDryRun = args.includes("--dry-run") || args.includes("-d");

  if (isDryRun) {
    console.log("🎯 Running in DRY RUN mode - no changes will be made\n");
    const config = getDryRunConfig();
    const result = await runDrySync(config);

    if (result.errors.length === 0) {
      console.log("\n🎉 Dry run completed successfully!");
      if (result.wouldExecute.summary.totalChanges > 0) {
        console.log(
          `💡 Run without --dry-run to execute ${result.wouldExecute.summary.totalChanges} operations`,
        );
      } else {
        console.log("💡 No operations needed - everything is in sync!");
      }
    } else {
      console.log("\n⚠️  Dry run completed with errors - check configuration");
      Deno.exit(1);
    }
  } else {
    await runRealSync();
  }
}

// Show usage if no environment variables are set
function showUsage() {
  console.log("Usage:");
  console.log(
    "  deno run --allow-env --allow-net --env-file=.env src/sync.ts           # Run real sync",
  );
  console.log(
    "  deno run --allow-env --allow-net --env-file=.env src/sync.ts --dry-run # Dry run mode",
  );
  console.log("");
  console.log("Environment variables required:");
  console.log("  LINEAR_API_KEY, LINEAR_TEAM_ID");
  console.log("  GOOGLE_SERVICE_ACCOUNT_JSON, GCAL_CALENDAR_ID");
  console.log("  GCAL_HISTORY_CALENDAR_ID (optional)");
}

// Run if this is the main module
if (import.meta.main) {
  // Check if help is requested
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    showUsage();
    Deno.exit(0);
  }

  // Check if basic environment variables are set
  if (
    !Deno.env.get("LINEAR_API_KEY") &&
    !Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")
  ) {
    console.log("🚀 Google Calendar ↔ Linear Sync\n");
    console.log("❌ No environment variables detected");
    console.log("");
    showUsage();
    Deno.exit(1);
  }

  await main();
}
