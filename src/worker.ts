/**
 * Sync Worker: Main orchestrator implementing the DRL pattern
 * Observe → Project → Diff → Actuate → Repeat
 */

import { GCalEvent, LinearIssue, SyncConfig, SyncResult } from "./types.ts";
import { project } from "./projector.ts";
import { diff } from "./diff.ts";
import { Actuator, ApiClients } from "./actuator.ts";
import dayjs from "npm:dayjs@1.11.10";

export class SyncWorker {
  private actuator: Actuator;

  constructor(
    private config: SyncConfig,
    private clients: ApiClients,
  ) {
    this.actuator = new Actuator(clients, config);
  }

  /**
   * Main sync operation following DRL pattern:
   * 1. Observe: fetch current snapshots
   * 2. Project: create canonical truth
   * 3. Diff: compute required operations
   * 4. Actuate: execute operations
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const now = new Date();

    try {
      console.log("🔄 Starting sync operation...");

      // 1. OBSERVE: Fetch current snapshots (GCal first, then targeted Linear)
      console.log("📊 Fetching external data...");

      // Fetch GCal events first to get Linear IDs to query
      const gcalEvents = await this.fetchGCalEvents();

      // Extract Linear IDs referenced by GCal events
      const referencedLinearIds = gcalEvents
        .map((event) => event.extendedProperties?.private?.linearIssueId)
        .filter(Boolean) as string[];

      // Fetch targeted Linear issues (referenced + scheduled)
      const linearIssues = await this.fetchLinearIssues(referencedLinearIds);

      console.log(
        `📋 Found ${linearIssues.length} Linear issues (${referencedLinearIds.length} referenced), ${gcalEvents.length} GCal events`,
      );

      // 2. PROJECT: Create canonical truth
      console.log("🎯 Projecting canonical items...");
      const projection = project({
        linearIssues,
        gcalEvents,
        now,
      });

      console.log(`📦 Created ${projection.items.length} canonical items`);
      if (projection.orphanedLinearIssues.length > 0) {
        console.warn(
          `⚠️  ${projection.orphanedLinearIssues.length} orphaned Linear issues`,
        );
      }
      if (projection.orphanedGCalEvents.length > 0) {
        console.warn(
          `⚠️  ${projection.orphanedGCalEvents.length} orphaned GCal events`,
        );
      }

      // 3. DIFF: Compute required operations
      console.log("🔍 Computing operations...");
      const operations = diff(projection.items);

      console.log(`⚡ Generated ${operations.length} operations`);
      this.logOperations(operations);

      // 4. ACTUATE: Execute operations
      console.log("🚀 Executing operations...");
      const results = await this.actuator.execute(operations);

      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      console.log(
        `✅ ${successCount} operations succeeded, ❌ ${errorCount} failed`,
      );

      // Collect errors
      const errors = results
        .filter((r) => !r.success)
        .map((r) => r.error || "Unknown error");

      const duration = Date.now() - startTime;

      return {
        timestamp: dayjs(now).toISOString(),
        itemsProcessed: projection.items.length,
        operationsExecuted: operations,
        errors,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        timestamp: dayjs(now).toISOString(),
        itemsProcessed: 0,
        operationsExecuted: [],
        errors: [error instanceof Error ? error.message : String(error)],
        duration,
      };
    }
  }

  private fetchLinearIssues(
    referencedIds: string[] = [],
  ): Promise<LinearIssue[]> {
    return this.clients.linear.getTargetedIssues(
      this.config.linearTeamId,
      referencedIds,
    );
  }

  private fetchGCalEvents(): Promise<GCalEvent[]> {
    // Fetch last 2 days + forward 2 weeks as requested
    const timeMin = dayjs()
      .subtract(2, "days")
      .startOf("day")
      .toISOString();

    const timeMax = dayjs()
      .add(14, "days")
      .endOf("day")
      .toISOString();

    return this.clients.gcal.getEvents(
      this.config.gcalCalendarId,
      timeMin,
      timeMax,
    );
  }

  private logOperations(
    operations: typeof diff extends (...args: any[]) => infer R ? R : never,
  ): void {
    const byType = operations.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("📋 Operations breakdown:", byType);

    // Log details for debugging
    for (const op of operations) {
      console.log(`  ${op.type}: ${op.reason} (${op.item.title})`);
    }
  }
}
