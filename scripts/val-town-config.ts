/**
 * Val Town Configuration
 * Configuration helpers for running in Val Town environment with secrets
 */

import { DryRunConfig } from "../src/dry-run.ts";
import { ValidationConfig } from "./api-validator.ts";

/**
 * Get configuration from Val Town environment variables
 * These should be set as secrets in your Val Town account
 */
export function getValTownConfig(): DryRunConfig {
  // Check if we're in Val Town environment
  const isValTown = typeof globalThis.fetch !== "undefined" &&
    typeof Deno !== "undefined" &&
    Deno.env.get("DENO_DEPLOYMENT_ID");

  if (isValTown) {
    console.log("🏔️  Running in Val Town environment");
  } else {
    console.log("💻 Running in local environment");
  }

  // Required secrets from Val Town
  const linearApiKey = Deno.env.get("LINEAR_API_KEY");
  const linearTeamId = Deno.env.get("LINEAR_TEAM_ID");
  const googleServiceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const gcalCalendarId = Deno.env.get("GCAL_CALENDAR_ID");

  // Validate required environment variables
  const missing = [];
  if (!linearApiKey) missing.push("LINEAR_API_KEY");
  if (!linearTeamId) missing.push("LINEAR_TEAM_ID");
  if (!googleServiceAccountJson) missing.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!gcalCalendarId) missing.push("GCAL_CALENDAR_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  // Optional configuration with defaults
  const config: DryRunConfig = {
    // API credentials
    linearApiKey: linearApiKey!,
    linearTeamId: linearTeamId!,
    googleServiceAccountJson: googleServiceAccountJson!,
    gcalCalendarId: gcalCalendarId!,
    gcalHistoryCalendarId: Deno.env.get("GCAL_HISTORY_CALENDAR_ID"),

    // Sync configuration
    timezone: Deno.env.get("TIMEZONE") || "America/New_York",
    workingHours: {
      startHour: parseInt(Deno.env.get("WORK_START_HOUR") || "9"),
      endHour: parseInt(Deno.env.get("WORK_END_HOUR") || "17"),
      workingDays: [1, 2, 3, 4, 5], // Monday-Friday
    },
    lookbackDays: parseInt(Deno.env.get("LOOKBACK_DAYS") || "2"),
    lookaheadDays: parseInt(Deno.env.get("LOOKAHEAD_DAYS") || "14"),

    // Dry run specific options
    validateApiStructure: Deno.env.get("VALIDATE_API_STRUCTURE") !== "false",
    maxItemsToProcess: parseInt(Deno.env.get("MAX_ITEMS_TO_PROCESS") || "50"),
    verboseLogging: Deno.env.get("VERBOSE_LOGGING") === "true",
  };

  return config;
}

/**
 * Get validation config for API structure validation
 */
export function getValidationConfig(): ValidationConfig {
  const linearApiKey = Deno.env.get("LINEAR_API_KEY");
  const linearTeamId = Deno.env.get("LINEAR_TEAM_ID");
  const googleServiceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const gcalCalendarId = Deno.env.get("GCAL_CALENDAR_ID");

  if (
    !linearApiKey || !linearTeamId || !googleServiceAccountJson ||
    !gcalCalendarId
  ) {
    throw new Error("Missing required API credentials for validation");
  }

  return {
    linearApiKey,
    linearTeamId,
    googleServiceAccountJson,
    gcalCalendarId,
  };
}

/**
 * Print configuration guide for setting up Val Town secrets
 */
export function printValTownSetupGuide(): void {
  console.log("\n" + "=".repeat(60));
  console.log("🏔️  VAL TOWN SETUP GUIDE");
  console.log("=".repeat(60));

  console.log("\n📋 Required Secrets (set these in your Val Town settings):");
  console.log("");
  console.log("1. LINEAR_API_KEY");
  console.log("   • Go to: https://linear.app/settings/api");
  console.log("   • Create new Personal API Key");
  console.log("   • Copy the key");
  console.log("");
  console.log("2. LINEAR_TEAM_ID");
  console.log("   • In Linear, go to your team settings");
  console.log("   • Copy the team ID from the URL or settings");
  console.log("");
  console.log("3. GOOGLE_SERVICE_ACCOUNT_JSON");
  console.log(
    "   • Go to: https://console.cloud.google.com/iam-admin/serviceaccounts",
  );
  console.log("   • Create service account with Calendar API access");
  console.log("   • Download JSON key file");
  console.log(
    "   • Base64 encode the entire JSON: `base64 -i service-account.json`",
  );
  console.log("   • Use the base64 string as the secret value");
  console.log("");
  console.log("4. GCAL_CALENDAR_ID");
  console.log("   • Open Google Calendar");
  console.log("   • Go to calendar settings");
  console.log("   • Copy the Calendar ID (looks like email@gmail.com)");

  console.log("\n⚙️  Optional Configuration:");
  console.log(
    "   • GCAL_HISTORY_CALENDAR_ID: For storing overdue event copies",
  );
  console.log('   • TIMEZONE: Default "America/New_York"');
  console.log("   • WORK_START_HOUR: Default 9 (9 AM)");
  console.log("   • WORK_END_HOUR: Default 17 (5 PM)");
  console.log("   • VALIDATE_API_STRUCTURE: Default true");
  console.log("   • MAX_ITEMS_TO_PROCESS: Default 50");
  console.log("   • VERBOSE_LOGGING: Default false");

  console.log("\n🔒 Setting Secrets in Val Town:");
  console.log("   1. Go to your Val Town dashboard");
  console.log('   2. Click on "Environment Variables" or "Secrets"');
  console.log("   3. Add each required secret with its value");
  console.log("   4. Make sure the val has access to these secrets");

  console.log("\n✅ Test Your Setup:");
  console.log("   Run validateApis() first to check API access");
  console.log("   Then run a dry sync to see what would happen");

  console.log("\n" + "=".repeat(60));
}

/**
 * Check if all required environment variables are set
 */
export function checkEnvironment(): {
  valid: boolean;
  missing: string[];
  warnings: string[];
} {
  const required = [
    "LINEAR_API_KEY",
    "LINEAR_TEAM_ID",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GCAL_CALENDAR_ID",
  ];

  const optional = [
    "GCAL_HISTORY_CALENDAR_ID",
    "TIMEZONE",
    "WORK_START_HOUR",
    "WORK_END_HOUR",
  ];

  const missing = required.filter((key) => !Deno.env.get(key));
  const warnings = optional.filter((key) => !Deno.env.get(key))
    .map((key) => `${key} not set, using default`);

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}
