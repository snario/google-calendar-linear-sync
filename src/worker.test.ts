/**
 * Integration tests for the sync worker
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
import { SyncWorker } from "./worker.ts";
import { GCalEvent, LinearIssue, SyncConfig } from "./types.ts";
import { GCalApiClient, LinearApiClient } from "./actuator.ts";

// Mock API clients for testing
class MockLinearApiClient implements LinearApiClient {
  private issues: LinearIssue[] = [];
  private nextId = 1;

  constructor(initialIssues: LinearIssue[] = []) {
    this.issues = [...initialIssues];
  }

  createIssue(issue: Partial<LinearIssue>): Promise<LinearIssue> {
    const newIssue: LinearIssue = {
      id: `linear-${this.nextId++}`,
      title: issue.title || "Untitled",
      description: issue.description,
      state: issue.state || "Triage",
      targetDate: issue.targetDate,
    };
    this.issues.push(newIssue);
    return Promise.resolve(newIssue);
  }

  updateIssue(id: string, updates: Partial<LinearIssue>): Promise<LinearIssue> {
    const issue = this.issues.find((i) => i.id === id);
    if (!issue) throw new Error(`Issue ${id} not found`);

    Object.assign(issue, updates);
    return Promise.resolve(issue);
  }

  getIssues(_teamId: string): Promise<LinearIssue[]> {
    return Promise.resolve([...this.issues]);
  }

  getTargetedIssues(
    _teamId: string,
    referencedIds: string[],
  ): Promise<LinearIssue[]> {
    // Mock: return referenced issues + scheduled issues
    const referencedIssues = this.issues.filter((i) =>
      referencedIds.includes(i.id)
    );
    const scheduledIssues = this.issues.filter((i) => i.state === "Scheduled");

    // Merge, avoiding duplicates
    const seen = new Set<string>();
    const result: LinearIssue[] = [];

    for (const issue of [...referencedIssues, ...scheduledIssues]) {
      if (!seen.has(issue.id)) {
        seen.add(issue.id);
        result.push(issue);
      }
    }

    return Promise.resolve(result);
  }

  // Test helper
  getIssuesSync(): LinearIssue[] {
    return [...this.issues];
  }
}

class MockGCalApiClient implements GCalApiClient {
  private events: GCalEvent[] = [];
  private nextId = 1;

  constructor(initialEvents: GCalEvent[] = []) {
    this.events = [...initialEvents];
  }

  createEvent(event: Partial<GCalEvent>): Promise<GCalEvent> {
    const newEvent: GCalEvent = {
      id: `gcal-${this.nextId++}`,
      summary: event.summary || "Untitled",
      description: event.description,
      start: event.start || { dateTime: "2024-01-01T12:00:00Z" },
      end: event.end || { dateTime: "2024-01-01T13:00:00Z" },
      extendedProperties: event.extendedProperties,
      status: event.status || "confirmed",
    };
    this.events.push(newEvent);
    return Promise.resolve(newEvent);
  }

  updateEvent(id: string, updates: Partial<GCalEvent>): Promise<GCalEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) throw new Error(`Event ${id} not found`);

    Object.assign(event, updates);
    return Promise.resolve(event);
  }

  getEvents(
    _calendarId: string,
    _timeMin: string,
    _timeMax: string,
  ): Promise<GCalEvent[]> {
    return Promise.resolve([...this.events]);
  }

  copyEventToCalendar(
    eventId: string,
    _targetCalendarId: string,
    title?: string,
  ): Promise<GCalEvent> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    return this.createEvent({
      ...event,
      id: undefined, // Will get new ID
      summary: title || event.summary, // Use provided title or original
    });
  }

  // Test helper
  getEventsSync(): GCalEvent[] {
    return [...this.events];
  }
}

function createTestConfig(): SyncConfig {
  return {
    linearApiKey: "test-key",
    linearTeamId: "test-team",
    gcalCalendarId: "test-cal",
    gcalHistoryCalendarId: "test-history-cal",
    timezone: "America/New_York",
    workingHours: {
      startHour: 9,
      endHour: 17,
      workingDays: [1, 2, 3, 4, 5],
    },
    lookbackDays: 2,
    lookaheadDays: 14,
  };
}

Deno.test("SyncWorker handles empty state correctly", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const worker = new SyncWorker(config, {
    linear: linearClient,
    gcal: gcalClient,
  });

  const result = await worker.sync();

  assertEquals(result.itemsProcessed, 0);
  assertEquals(result.operationsExecuted.length, 0);
  assertEquals(result.errors.length, 0);
  assertExists(result.timestamp);
  assertEquals(typeof result.duration, "number");
});

Deno.test("SyncWorker creates Linear issue for orphaned GCal event", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient([
    {
      id: "gcal-1",
      summary: "Team meeting",
      start: { dateTime: "2024-01-01T14:00:00Z" },
      end: { dateTime: "2024-01-01T15:00:00Z" },
      status: "confirmed",
    },
  ]);

  const worker = new SyncWorker(config, {
    linear: linearClient,
    gcal: gcalClient,
  });

  const result = await worker.sync();

  assertEquals(result.itemsProcessed, 1);
  assertEquals(result.operationsExecuted.length, 1);
  assertEquals(
    result.operationsExecuted[0].type,
    "createLinearIssueAndUpdateGCal",
  );
  assertEquals(result.errors.length, 0);

  // Verify Linear issue was created
  const issues = linearClient.getIssuesSync();
  assertEquals(issues.length, 1);
  assertEquals(issues[0].title, "📥\u202FTeam meeting");
  assertEquals(issues[0].state, "Triage");
  // Check that calendar metadata is in description
  assertExists(issues[0].description);
});

Deno.test("SyncWorker creates GCal event for scheduled Linear issue", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient([
    {
      id: "linear-1",
      title: "Work on presentation",
      state: "Scheduled",
      targetDate: "2024-01-01T14:00:00Z",
    },
  ]);
  const gcalClient = new MockGCalApiClient();

  const worker = new SyncWorker(config, {
    linear: linearClient,
    gcal: gcalClient,
  });

  const result = await worker.sync();

  assertEquals(result.itemsProcessed, 1);
  assertEquals(result.operationsExecuted.length, 1);
  assertEquals(
    result.operationsExecuted[0].type,
    "createGCalEventAndUpdateLinear",
  );
  assertEquals(result.errors.length, 0);

  // Verify GCal event was created
  const events = gcalClient.getEventsSync();
  assertEquals(events.length, 1);
  assertEquals(events[0].summary, "📅\u202FWork on presentation");
  assertExists(events[0].extendedProperties?.private?.uid);
});

Deno.test("SyncWorker handles completed Linear issue", async () => {
  const uid = "test-uid-123";

  const config = createTestConfig();
  const linearClient = new MockLinearApiClient([
    {
      id: "linear-1",
      title: "✅\u202FCompleted task",
      state: "Done",
      description:
        "<!-- calendar-sync --> GoogleCalEventId:gcal-1 | Start:2024-01-01T14:00:00Z | DurMin:60",
    },
  ]);
  const gcalClient = new MockGCalApiClient([
    {
      id: "gcal-1",
      summary: "Old task title",
      start: { dateTime: "2024-01-01T14:00:00Z" },
      end: { dateTime: "2024-01-01T15:00:00Z" },
      status: "confirmed",
      extendedProperties: {
        private: {
          uid: uid,
          linearIssueId: "linear-1",
        },
      },
    },
  ]);

  const worker = new SyncWorker(config, {
    linear: linearClient,
    gcal: gcalClient,
  });

  const result = await worker.sync();

  assertEquals(result.itemsProcessed, 1);
  assertEquals(result.operationsExecuted.length, 1);
  assertEquals(result.operationsExecuted[0].type, "patchGCalEvent");
  assertEquals(result.errors.length, 0);

  // Verify GCal event was updated
  const events = gcalClient.getEventsSync();
  assertEquals(events.length, 1);
  assertEquals(events[0].summary, "✅\u202FCompleted task");
});

Deno.test("SyncWorker handles multiple items with different phases", async () => {
  const config = createTestConfig();

  // Setup initial state with various scenarios
  const linearClient = new MockLinearApiClient([
    {
      id: "linear-1",
      title: "Scheduled task",
      state: "Scheduled",
      targetDate: "2024-01-01T14:00:00Z",
    },
    {
      id: "linear-2",
      title: "Completed task",
      state: "Done",
      description:
        "<!-- calendar-sync --> GoogleCalEventId:gcal-2 | Start:2024-01-01T14:00:00Z | DurMin:60",
    },
  ]);

  const gcalClient = new MockGCalApiClient([
    {
      id: "gcal-1",
      summary: "Orphaned meeting",
      start: { dateTime: "2024-01-01T16:00:00Z" },
      end: { dateTime: "2024-01-01T17:00:00Z" },
      status: "confirmed",
    },
    {
      id: "gcal-2",
      summary: "Old title for completed",
      start: { dateTime: "2024-01-01T18:00:00Z" },
      end: { dateTime: "2024-01-01T19:00:00Z" },
      status: "confirmed",
      extendedProperties: {
        private: {
          uid: "uid-2",
          linearIssueId: "linear-2",
        },
      },
    },
  ]);

  const worker = new SyncWorker(config, {
    linear: linearClient,
    gcal: gcalClient,
  });

  const result = await worker.sync();

  assertEquals(result.itemsProcessed, 3);
  assertEquals(result.errors.length, 0);

  // Should have operations for:
  // 1. Create Linear for orphaned GCal
  // 2. Create GCal for scheduled Linear
  // 3. Patch GCal for completed Linear
  assertEquals(result.operationsExecuted.length, 3);

  const operationTypes = result.operationsExecuted.map((op) => op.type);
  assertEquals(operationTypes.includes("createLinearIssueAndUpdateGCal"), true);
  assertEquals(operationTypes.includes("createGCalEventAndUpdateLinear"), true);
  assertEquals(operationTypes.includes("patchGCalEvent"), true);
});
