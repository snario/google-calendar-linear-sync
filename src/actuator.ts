/**
 * Actuator: Executes operations via Linear & Calendar APIs
 * Performs idempotent API calls to make external reality match canonical truth
 */

import {
  addPrefix,
  CanonicalItem,
  estimateToPoints,
  GCalEvent,
  LinearIssue,
  Operation,
  PREFIXES,
  SyncConfig,
} from "./types.ts";
import { SmartScheduler } from "./scheduler.ts";

export interface ApiClients {
  linear: LinearApiClient;
  gcal: GCalApiClient;
}

export interface LinearApiClient {
  createIssue(issue: Partial<LinearIssue>): Promise<LinearIssue>;
  updateIssue(id: string, updates: Partial<LinearIssue>): Promise<LinearIssue>;
  getIssues(teamId: string): Promise<LinearIssue[]>;
  getTargetedIssues(
    teamId: string,
    referencedIds: string[],
  ): Promise<LinearIssue[]>;
}

export interface GCalApiClient {
  createEvent(event: Partial<GCalEvent>): Promise<GCalEvent>;
  updateEvent(id: string, updates: Partial<GCalEvent>): Promise<GCalEvent>;
  getEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<GCalEvent[]>;
  copyEventToCalendar(
    eventId: string,
    targetCalendarId: string,
    title?: string,
  ): Promise<GCalEvent>;
}

export class Actuator {
  private scheduler: SmartScheduler;

  constructor(
    private clients: ApiClients,
    private config: SyncConfig,
  ) {
    this.scheduler = new SmartScheduler(config);
  }

  async execute(operations: Operation[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const operation of operations) {
      try {
        const result = await this.executeOperation(operation);
        results.push({
          operation,
          success: true,
          result,
          error: null,
        });
      } catch (error) {
        results.push({
          operation,
          success: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async executeOperation(
    operation: Operation,
  ): Promise<LinearIssue | GCalEvent | null> {
    switch (operation.type) {
      case "createLinearIssue":
        return this.createLinearIssue(operation.item);

      case "createGCalEvent":
        return this.createGCalEvent(operation.item);

      case "patchGCalEvent":
        return this.patchGCalEvent(operation.item);

      case "patchLinearIssue":
        return this.patchLinearIssue(operation.item);

      case "copyEventToHistory":
        return this.copyEventToHistory(operation.item);

      case "createRescheduledEvent":
        return this.createRescheduledEvent(operation.item);

      case "createLinearIssueAndUpdateGCal":
        return this.createLinearIssueAndUpdateGCal(operation.item);

      case "createGCalEventAndUpdateLinear":
        return this.createGCalEventAndUpdateLinear(operation.item);

      case "noop":
        return null;

      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  }

  private async createLinearIssue(item: CanonicalItem): Promise<LinearIssue> {
    // Include calendar metadata in description for linking
    let description = item.description || "";
    if (item.gcalId && item.startTime && item.durationMin) {
      const metadata =
        `<!-- calendar-sync --> GoogleCalEventId:${item.gcalId} | Start:${item.startTime} | DurMin:${item.durationMin}`;
      description = description ? `${metadata}\n\n${description}` : metadata;
    }

    const issue: Partial<LinearIssue> = {
      title: addPrefix(item.title, PREFIXES.TRIAGE),
      description,
      state: "Triage",
      targetDate: item.startTime,
      estimate: item.estimate ? estimateToPoints(item.estimate) : 2, // Default to S (2 points)
    };

    return this.clients.linear.createIssue(issue);
  }

  private async createGCalEvent(item: CanonicalItem): Promise<GCalEvent> {
    let startTime = item.startTime;
    let endTime = item.endTime;

    // For Linear scheduled tasks, always create timed events (never all-day)
    // Use smart scheduling if times aren't set or if we have a date-only Linear target date
    const needsScheduling = !startTime || !endTime ||
      (startTime && startTime.length === 10);

    if (needsScheduling) {
      const existingEvents = await this.clients.gcal.getEvents(
        this.config.gcalCalendarId,
        "", // Will use default timeframes
        "",
      );

      const slot = await this.scheduler.findNextAvailableSlot(
        {
          estimate: item.estimate || "S",
          title: item.title,
          // If we have a date-only target date, use it as preferred date
          preferredDate: startTime && startTime.length === 10
            ? startTime
            : undefined,
        },
        existingEvents,
      );

      startTime = slot.startTime;
      endTime = slot.endTime;
    }

    // Always create timed events for Linear tasks (never all-day)
    let description = item.description || "";

    // Add Linear link to GCal description for easy navigation
    if (item.linearId) {
      const linearLink =
        `Linear issue: [${item.linearId}](https://linear.app/liamhorne/issue/${item.linearId})`;
      description = description
        ? `${linearLink}\n\n${description}`
        : linearLink;
    }

    const event: Partial<GCalEvent> = {
      summary: addPrefix(item.title, PREFIXES.SCHEDULED),
      description,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      extendedProperties: {
        private: {
          uid: item.uid,
          linearIssueId: item.linearId,
        },
      },
      status: "confirmed",
    };

    return this.clients.gcal.createEvent(event);
  }

  private async patchGCalEvent(item: CanonicalItem): Promise<GCalEvent> {
    if (!item.gcalId) {
      throw new Error("Cannot patch GCal event without gcalId");
    }

    const updates: Partial<GCalEvent> = {
      summary: item.title,
    };

    // Add description if present
    if (item.description !== undefined) {
      updates.description = item.description;
    }

    // Add timing if present
    if (item.startTime && item.endTime) {
      updates.start = { dateTime: item.startTime };
      updates.end = { dateTime: item.endTime };
    }

    // Ensure UID is preserved/set
    updates.extendedProperties = {
      private: {
        uid: item.uid,
        linearIssueId: item.linearId,
      },
    };

    return this.clients.gcal.updateEvent(item.gcalId, updates);
  }

  private async patchLinearIssue(item: CanonicalItem): Promise<LinearIssue> {
    if (!item.linearId) {
      throw new Error("Cannot patch Linear issue without linearId");
    }

    // Include calendar metadata in description for linking
    let description = item.description || "";
    if (item.gcalId && item.startTime && item.durationMin) {
      const metadata =
        `<!-- calendar-sync --> GoogleCalEventId:${item.gcalId} | Start:${item.startTime} | DurMin:${item.durationMin}`;
      description = description ? `${metadata}\n\n${description}` : metadata;
    }

    const updates: Partial<LinearIssue> = {
      title: item.title,
      description,
      state: item.linearState,
      targetDate: item.startTime,
    };

    return this.clients.linear.updateIssue(item.linearId, updates);
  }

  private async copyEventToHistory(
    item: CanonicalItem,
  ): Promise<GCalEvent | null> {
    if (!item.gcalId || !this.config.gcalHistoryCalendarId) {
      return null; // No history calendar configured
    }

    return this.clients.gcal.copyEventToCalendar(
      item.gcalId,
      this.config.gcalHistoryCalendarId,
      item.title, // Pass the title with ⏳ prefix
    );
  }

  /**
   * Creates a new Google Calendar event for overdue items.
   * This is used when a task goes overdue - we mark the original event as "worked on" (⏳)
   * and create this new event to continue tracking the task.
   */
  private async createRescheduledEvent(
    item: CanonicalItem,
  ): Promise<GCalEvent> {
    let startTime = item.startTime;
    let endTime = item.endTime;

    // Use smart scheduling for rescheduled events
    if (!startTime || !endTime) {
      const existingEvents = await this.clients.gcal.getEvents(
        this.config.gcalCalendarId,
        "", // Will use default timeframes
        "",
      );

      const slot = await this.scheduler.findNextAvailableSlot(
        {
          estimate: item.estimate || "S",
          title: item.title,
          preferredDate: undefined, // Let scheduler find next available
        },
        existingEvents,
      );

      startTime = slot.startTime;
      endTime = slot.endTime;
    }

    const event: Partial<GCalEvent> = {
      summary: item.title, // Already has correct prefix from diff
      description: item.description,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      extendedProperties: {
        private: {
          uid: item.uid, // Same UID to maintain linkage
          linearIssueId: item.linearId,
        },
      },
      status: "confirmed",
    };

    return this.clients.gcal.createEvent(event);
  }

  /**
   * Combined operation: Create Linear issue first, then update GCal event with link
   * This ensures the GCal event gets updated with the Linear issue ID and proper title/description
   */
  private async createLinearIssueAndUpdateGCal(
    item: CanonicalItem,
  ): Promise<LinearIssue> {
    // Step 1: Create the Linear issue
    const createdIssue = await this.createLinearIssue(item);

    // Step 2: Update the GCal event with the new Linear issue ID and title
    if (item.gcalId) {
      const updates: Partial<GCalEvent> = {
        summary: item.title, // Should already have 📥 prefix from item
        description:
          `Linear issue: [${createdIssue.id}](https://linear.app/liamhorne/issue/${createdIssue.id})`,
        extendedProperties: {
          private: {
            uid: item.uid,
            linearIssueId: createdIssue.id,
          },
        },
      };

      try {
        await this.clients.gcal.updateEvent(item.gcalId, updates);
        console.log(
          `✅ Updated GCal event "${item.title}" with Linear issue link`,
        );
      } catch (error) {
        console.warn(`⚠️  Failed to update GCal event: ${error}`);
        // Don't fail the whole operation if GCal update fails
      }
    }

    return createdIssue;
  }

  /**
   * Combined operation: Create GCal event first, then update Linear issue with link
   * This ensures the Linear issue gets updated with the calendar event ID and proper metadata
   */
  private async createGCalEventAndUpdateLinear(
    item: CanonicalItem,
  ): Promise<GCalEvent> {
    // Step 1: Create the GCal event
    const createdEvent = await this.createGCalEvent(item);

    // Step 2: Update the Linear issue with the new GCal event ID and metadata
    if (item.linearId) {
      // Include calendar metadata in description for linking
      let description = item.description || "";
      if (createdEvent.id && item.startTime && item.durationMin) {
        const metadata =
          `<!-- calendar-sync --> GoogleCalEventId:${createdEvent.id} | Start:${item.startTime} | DurMin:${item.durationMin}`;
        description = description ? `${metadata}\n\n${description}` : metadata;
      }

      const updates: Partial<LinearIssue> = {
        description,
        // Keep other fields unchanged, just add the calendar link
        targetDate: item.startTime,
      };

      try {
        await this.clients.linear.updateIssue(item.linearId, updates);
        console.log(
          `✅ Updated Linear issue "${item.title}" with calendar event link`,
        );
      } catch (error) {
        console.warn(`⚠️  Failed to update Linear issue: ${error}`);
        // Don't fail the whole operation if Linear update fails
      }
    }

    return createdEvent;
  }
}

export interface ExecutionResult {
  operation: Operation;
  success: boolean;
  result: LinearIssue | GCalEvent | null;
  error: string | null;
}
