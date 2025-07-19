/**
 * Dry Run Mode: Test with real production data without making changes
 * Fetches real data, runs sync logic, but only logs what would happen
 */

import { SyncWorker } from "./worker.ts";
import { SyncConfig, SyncResult } from "./types.ts";
import { RealGCalApiClient, RealLinearApiClient } from "./api-clients.ts";
import { validateApis, ValidationConfig } from "./api-validator.ts";

export interface DryRunConfig extends SyncConfig {
  // Real API credentials
  linearApiKey: string;
  linearTeamId: string;
  googleServiceAccountJson: string;
  gcalCalendarId: string;

  // Dry run options
  validateApiStructure: boolean;
  maxItemsToProcess: number;
  verboseLogging: boolean;
}

export interface DryRunResult extends SyncResult {
  dryRun: true;
  validation?: {
    apiStructureValid: boolean;
    mockCompatible: boolean;
    errors: string[];
  };
  wouldExecute: {
    operations: Array<{
      type: string;
      reason: string;
      itemTitle: string;
      details: string;
    }>;
    summary: {
      createLinearIssues: number;
      createGCalEvents: number;
      updateOperations: number;
      totalChanges: number;
    };
  };
}

/**
 * Dry Run API Clients - Read real data but don't make changes
 */
class DryRunLinearClient extends RealLinearApiClient {
  override async createIssue(issue: any): Promise<any> {
    console.log("🔍 [DRY RUN] Would create Linear issue:");
    console.log(`   Title: ${issue.title}`);
    console.log(`   State: ${issue.state}`);
    console.log(`   Estimate: ${issue.estimate} points`);
    console.log(`   Target Date: ${issue.targetDate || "None"}`);

    // Return mock response
    return {
      id: `dry-run-linear-${Date.now()}`,
      title: issue.title,
      description: issue.description,
      state: issue.state,
      targetDate: issue.targetDate,
      estimate: issue.estimate,
      customFields: issue.customFields,
    };
  }

  override async updateIssue(id: string, updates: any): Promise<any> {
    console.log("🔍 [DRY RUN] Would update Linear issue:");
    console.log(`   ID: ${id}`);
    console.log(`   Updates:`, JSON.stringify(updates, null, 2));

    // Return mock response
    return {
      id,
      ...updates,
    };
  }
}

class DryRunGCalClient extends RealGCalApiClient {
  override async createEvent(event: any): Promise<any> {
    console.log("🔍 [DRY RUN] Would create Google Calendar event:");
    console.log(`   Summary: ${event.summary}`);
    console.log(`   Start: ${event.start?.dateTime}`);
    console.log(`   End: ${event.end?.dateTime}`);
    console.log(`   Description: ${event.description || "None"}`);

    // Return mock response
    return {
      id: `dry-run-gcal-${Date.now()}`,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      extendedProperties: event.extendedProperties,
      status: event.status || "confirmed",
    };
  }

  override async updateEvent(id: string, updates: any): Promise<any> {
    console.log("🔍 [DRY RUN] Would update Google Calendar event:");
    console.log(`   ID: ${id}`);
    console.log(`   Updates:`, JSON.stringify(updates, null, 2));

    // Return mock response
    return {
      id,
      ...updates,
    };
  }

  override async copyEventToCalendar(
    eventId: string,
    targetCalendarId: string,
  ): Promise<any> {
    console.log("🔍 [DRY RUN] Would copy event to history calendar:");
    console.log(`   Event ID: ${eventId}`);
    console.log(`   Target Calendar: ${targetCalendarId}`);

    // Return mock response
    return {
      id: `dry-run-copy-${Date.now()}`,
      summary: "Copied Event",
    };
  }
}

export class DryRunWorker {
  constructor(private config: DryRunConfig) {}

  async runDrySync(): Promise<DryRunResult> {
    console.log("🚀 Starting DRY RUN sync with real production data...");
    console.log("📊 Configuration:");
    console.log(`   Timezone: ${this.config.timezone}`);
    console.log(`   Max Items: ${this.config.maxItemsToProcess}`);
    console.log(`   Validate APIs: ${this.config.validateApiStructure}`);

    let validation: DryRunResult["validation"] | undefined;

    // Step 1: Validate API structure if requested
    if (this.config.validateApiStructure) {
      console.log("\n🔍 Step 1: Validating API structure...");

      const validationConfig: ValidationConfig = {
        linearApiKey: this.config.linearApiKey,
        linearTeamId: this.config.linearTeamId,
        googleServiceAccountJson: this.config.googleServiceAccountJson,
        gcalCalendarId: this.config.gcalCalendarId,
      };

      try {
        const validationResult = await validateApis(validationConfig);
        validation = {
          apiStructureValid: validationResult.success,
          mockCompatible:
            validationResult.mockValidation.linearStructureValid &&
            validationResult.mockValidation.gcalStructureValid,
          errors: validationResult.errors,
        };
      } catch (error) {
        validation = {
          apiStructureValid: false,
          mockCompatible: false,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    }

    // Step 2: Create clients (read real data, but dry-run writes)
    const realLinearClient = new RealLinearApiClient({
      apiKey: this.config.linearApiKey,
      teamId: this.config.linearTeamId,
    });

    const realGCalClient = new RealGCalApiClient({
      serviceAccountJson: this.config.googleServiceAccountJson,
      calendarId: this.config.gcalCalendarId,
    });

    const dryRunLinearClient = new DryRunLinearClient({
      apiKey: this.config.linearApiKey,
      teamId: this.config.linearTeamId,
    });

    const dryRunGCalClient = new DryRunGCalClient({
      serviceAccountJson: this.config.googleServiceAccountJson,
      calendarId: this.config.gcalCalendarId,
    });

    // Step 3: Fetch real data
    console.log("\n📊 Step 2: Fetching real production data...");

    const [linearIssues, gcalEvents] = await Promise.all([
      realLinearClient.getIssues(this.config.linearTeamId),
      realGCalClient.getEvents(this.config.gcalCalendarId, "", ""),
    ]);

    console.log(`   Found ${linearIssues.length} Linear issues`);
    console.log(`   Found ${gcalEvents.length} Google Calendar events`);

    // Limit items if configured
    const limitedLinearIssues = linearIssues.slice(
      0,
      this.config.maxItemsToProcess,
    );
    const limitedGCalEvents = gcalEvents.slice(
      0,
      this.config.maxItemsToProcess,
    );

    if (this.config.verboseLogging) {
      console.log("\n📋 Sample Linear Issues:");
      limitedLinearIssues.slice(0, 3).forEach((issue) => {
        console.log(`   - ${issue.title} (${issue.state})`);
      });

      console.log("\n📅 Sample Calendar Events:");
      limitedGCalEvents.slice(0, 3).forEach((event) => {
        console.log(`   - ${event.summary} (${event.start.dateTime})`);
      });
    }

    // Step 4: Run sync logic with dry-run clients
    console.log("\n⚙️  Step 3: Running sync logic (DRY RUN)...");

    const syncWorker = new SyncWorker(this.config, {
      linear: dryRunLinearClient,
      gcal: dryRunGCalClient,
    });

    const syncResult = await syncWorker.sync();

    // Step 5: Analyze what would happen
    const wouldExecute = this.analyzePotentialChanges(syncResult);

    console.log("\n📊 Step 4: Analysis complete!");
    console.log(
      `   Would execute ${wouldExecute.summary.totalChanges} total operations`,
    );
    console.log(
      `   Linear issues to create: ${wouldExecute.summary.createLinearIssues}`,
    );
    console.log(
      `   Calendar events to create: ${wouldExecute.summary.createGCalEvents}`,
    );
    console.log(
      `   Update operations: ${wouldExecute.summary.updateOperations}`,
    );

    return {
      ...syncResult,
      dryRun: true,
      validation,
      wouldExecute,
    };
  }

  private analyzePotentialChanges(
    syncResult: SyncResult,
  ): DryRunResult["wouldExecute"] {
    const operations = syncResult.operationsExecuted.map((op) => ({
      type: op.type,
      reason: op.reason,
      itemTitle: op.item.title,
      details: this.formatOperationDetails(op),
    }));

    const summary = {
      createLinearIssues:
        operations.filter((op) => op.type === "createLinearIssue").length,
      createGCalEvents:
        operations.filter((op) => op.type === "createGCalEvent").length,
      updateOperations:
        operations.filter((op) =>
          op.type.includes("patch") || op.type.includes("update")
        ).length,
      totalChanges: operations.length,
    };

    return { operations, summary };
  }

  private formatOperationDetails(operation: any): string {
    switch (operation.type) {
      case "createLinearIssue":
        return `Create "${operation.item.title}" in Triage state`;
      case "createGCalEvent":
        return `Schedule "${operation.item.title}" for ${operation.item.startTime}`;
      case "patchGCalEvent":
        return `Update calendar event title to "${operation.item.title}"`;
      case "createRescheduledEvent":
        return `Reschedule overdue item "${operation.item.title}"`;
      default:
        return `Execute ${operation.type} operation`;
    }
  }

  printDryRunSummary(result: DryRunResult): void {
    console.log("\n" + "=".repeat(60));
    console.log("🎯 DRY RUN SUMMARY");
    console.log("=".repeat(60));

    if (result.validation) {
      console.log("\n📋 API Validation:");
      console.log(
        `   Structure Valid: ${
          result.validation.apiStructureValid ? "✅" : "❌"
        }`,
      );
      console.log(
        `   Mock Compatible: ${result.validation.mockCompatible ? "✅" : "❌"}`,
      );
      if (result.validation.errors.length > 0) {
        console.log("   Errors:", result.validation.errors.join(", "));
      }
    }

    console.log("\n📊 Sync Analysis:");
    console.log(`   Items Processed: ${result.itemsProcessed}`);
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Errors: ${result.errors.length}`);

    console.log("\n🎯 Would Execute:");
    console.log(
      `   📥 Create Linear Issues: ${result.wouldExecute.summary.createLinearIssues}`,
    );
    console.log(
      `   📅 Create Calendar Events: ${result.wouldExecute.summary.createGCalEvents}`,
    );
    console.log(
      `   ✏️  Update Operations: ${result.wouldExecute.summary.updateOperations}`,
    );
    console.log(
      `   📊 Total Changes: ${result.wouldExecute.summary.totalChanges}`,
    );

    if (result.wouldExecute.operations.length > 0) {
      console.log("\n📝 Detailed Operations:");
      result.wouldExecute.operations.forEach((op, i) => {
        console.log(`   ${i + 1}. ${op.type}: ${op.details}`);
        console.log(`      Reason: ${op.reason}`);
      });
    }

    if (result.errors.length > 0) {
      console.log("\n❌ Errors:");
      result.errors.forEach((error) => console.log(`   - ${error}`));
    }

    console.log("\n✅ Dry run complete - no actual changes were made!");
  }
}

/**
 * Standalone function for easy CLI usage
 */
export async function runDrySync(config: DryRunConfig): Promise<DryRunResult> {
  const worker = new DryRunWorker(config);
  const result = await worker.runDrySync();
  worker.printDryRunSummary(result);
  return result;
}
