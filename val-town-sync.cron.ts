/**
 * Google Calendar ↔ Linear Sync - Val Town Cron Job (DRL Architecture)
 * Uses the new Declarative Reconciliation Loop pattern
 * Runs every 5 minutes to keep calendars and issues in sync
 */

import { SyncWorker } from "./src/worker.ts";
import { RealGCalApiClient, RealLinearApiClient } from "./src/api-clients.ts";
import type { SyncConfig } from "./src/types.ts";

// @cron */5 * * * *
export default async function syncLinearGCal() {
  console.log("🚀 Val Town: Google Calendar ↔ Linear sync (DRL) starting...");
  
  const config: SyncConfig = {
    linearApiKey: Deno.env.get("LINEAR_API_KEY") || "",
    linearTeamId: Deno.env.get("LINEAR_TEAM_ID") || "",
    gcalCalendarId: Deno.env.get("GCAL_ID") || "", // Using GCAL_ID to match your existing env
    gcalHistoryCalendarId: Deno.env.get("GCAL_HISTORY_CALENDAR_ID"),
    timezone: "America/New_York", // Matching your existing config
    workingHours: {
      startHour: 9,
      endHour: 17,
      workingDays: [1, 2, 3, 4, 5], // Monday-Friday
    },
    lookbackDays: 2,
    lookaheadDays: 21, // Matching your existing 21-day window
  };

  // Validate configuration
  if (!config.linearApiKey || !config.linearTeamId) {
    console.error("❌ Missing Linear credentials: LINEAR_API_KEY, LINEAR_TEAM_ID");
    return;
  }

  if (!config.gcalCalendarId || !Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) {
    console.error("❌ Missing Google Calendar credentials: GCAL_ID, GOOGLE_SERVICE_ACCOUNT_JSON");
    return;
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

    // Log results in a format similar to your existing script
    const stats = {
      itemsProcessed: result.itemsProcessed,
      operationsExecuted: result.operationsExecuted.length,
      errors: result.errors.length,
      duration: `${result.duration}ms`,
    };

    // Operations breakdown
    const opsByType = result.operationsExecuted.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.table([stats]);
    
    if (Object.keys(opsByType).length > 0) {
      console.log("📋 Operations breakdown:");
      console.table([opsByType]);
    }

    if (result.operationsExecuted.length > 0) {
      console.log("📝 Operations executed:");
      result.operationsExecuted.forEach((op, i) => {
        console.log(`   ${i + 1}. ${op.type}: ${op.reason} (${op.item.title})`);
      });
    }

    if (result.errors.length > 0) {
      console.warn(`⚠️ ${result.errors.length} errors occurred:`);
      result.errors.forEach((error) => console.warn(`   ${error}`));
    } else {
      console.log("✅ Sync completed successfully");
    }

  } catch (error) {
    console.error("❌ Sync failed:", error);
    // Don't throw in Val Town - just log and continue
  }
}