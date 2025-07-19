/**
 * Tests for the actuator module
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
import { Actuator } from "./actuator.ts";
import { CanonicalItem, GCalEvent, LinearIssue, SyncConfig } from "./types.ts";

// Enhanced mock clients for actuator testing
class MockLinearApiClient {
  private issues: LinearIssue[] = [];
  private nextId = 1;

  async createIssue(issue: Partial<LinearIssue>): Promise<LinearIssue> {
    const newIssue: LinearIssue = {
      id: `linear-${this.nextId++}`,
      title: issue.title || "Untitled",
      description: issue.description,
      state: issue.state || "Triage",
      targetDate: issue.targetDate,
      estimate: issue.estimate,
    };
    this.issues.push(newIssue);
    return newIssue;
  }

  async updateIssue(
    id: string,
    updates: Partial<LinearIssue>,
  ): Promise<LinearIssue> {
    const issue = this.issues.find((i) => i.id === id);
    if (!issue) throw new Error(`Issue ${id} not found`);

    Object.assign(issue, updates);
    return issue;
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

  // Test helpers
  getCreatedIssues(): LinearIssue[] {
    return [...this.issues];
  }

  reset(): void {
    this.issues = [];
    this.nextId = 1;
  }
}

class MockGCalApiClient {
  private events: GCalEvent[] = [];
  private nextId = 1;

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
  ): Promise<GCalEvent> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    return this.createEvent({
      ...event,
      id: undefined, // Will get new ID
    });
  }

  // Test helpers
  getCreatedEvents(): GCalEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
    this.nextId = 1;
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

Deno.test("Actuator createLinearIssue operation", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const item: CanonicalItem = {
    uid: "test-uid-123",
    title: "Test Task",
    description: "A test task from GCal",
    startTime: "2024-01-01T14:00:00Z",
    endTime: "2024-01-01T15:00:00Z",
    durationMin: 60,
    estimate: "M",
    gcalId: "gcal-1",
    phase: "eventOnly",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = [{
    type: "createLinearIssue" as const,
    item,
    reason: "Test creation",
  }];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);
  assertEquals(results[0].error, null);

  const createdIssues = linearClient.getCreatedIssues();
  assertEquals(createdIssues.length, 1);
  assertEquals(createdIssues[0].title, "📥\u202FTest Task");
  assertEquals(createdIssues[0].state, "Triage");
  assertEquals(createdIssues[0].estimate, 3); // M = 3 points
  // Check that calendar metadata is in description
  assertExists(createdIssues[0].description);
  assertEquals(
    createdIssues[0].description?.includes("GoogleCalEventId:gcal-1"),
    true,
  );
});

Deno.test("Actuator createGCalEvent operation", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const item: CanonicalItem = {
    uid: "test-uid-456",
    title: "Scheduled Task",
    description: "A scheduled Linear task",
    startTime: "2024-01-02T10:00:00Z",
    endTime: "2024-01-02T10:30:00Z",
    durationMin: 30,
    estimate: "S",
    linearId: "linear-1",
    phase: "linearOnly",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = [{
    type: "createGCalEvent" as const,
    item,
    reason: "Test GCal creation",
  }];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const createdEvents = gcalClient.getCreatedEvents();
  assertEquals(createdEvents.length, 1);
  assertEquals(createdEvents[0].summary, "📅\u202FScheduled Task");
  assertEquals(createdEvents[0].start.dateTime, "2024-01-02T10:00:00Z");
  assertEquals(createdEvents[0].end.dateTime, "2024-01-02T10:30:00Z");
  assertEquals(
    createdEvents[0].extendedProperties?.private?.uid,
    "test-uid-456",
  );
  assertEquals(
    createdEvents[0].extendedProperties?.private?.linearIssueId,
    "linear-1",
  );
});

Deno.test("Actuator patchGCalEvent operation", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  // Create an existing event first
  const existingEvent = await gcalClient.createEvent({
    summary: "Old Title",
    start: { dateTime: "2024-01-01T14:00:00Z" },
    end: { dateTime: "2024-01-01T15:00:00Z" },
  });

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const item: CanonicalItem = {
    uid: "test-uid-789",
    title: "✅\u202FCompleted Task",
    description: "Task is now complete",
    gcalId: existingEvent.id,
    linearId: "linear-1",
    phase: "completed",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = [{
    type: "patchGCalEvent" as const,
    item,
    reason: "Mark as completed",
  }];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const events = gcalClient.getCreatedEvents();
  const updatedEvent = events.find((e) => e.id === existingEvent.id);
  assertEquals(updatedEvent?.summary, "✅\u202FCompleted Task");
  assertEquals(updatedEvent?.extendedProperties?.private?.uid, "test-uid-789");
});

Deno.test("Actuator createRescheduledEvent operation", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const item: CanonicalItem = {
    uid: "test-uid-overdue",
    title: "📅\u202FOverdue Task",
    description: "Task that went overdue",
    startTime: "2024-01-03T11:00:00Z",
    endTime: "2024-01-03T12:00:00Z",
    durationMin: 60,
    estimate: "M",
    linearId: "linear-overdue",
    gcalId: "gcal-overdue",
    phase: "overdue",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = [{
    type: "createRescheduledEvent" as const,
    item,
    reason: "Reschedule overdue task",
  }];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const events = gcalClient.getCreatedEvents();
  assertEquals(events.length, 1);
  assertEquals(events[0].summary, "📅\u202FOverdue Task");
  assertEquals(events[0].extendedProperties?.private?.uid, "test-uid-overdue");
  assertEquals(
    events[0].extendedProperties?.private?.linearIssueId,
    "linear-overdue",
  );
});

Deno.test("Actuator handles operation errors gracefully", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const item: CanonicalItem = {
    uid: "test-uid-error",
    title: "Error Task",
    // Missing gcalId for patch operation
    phase: "completed",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = [{
    type: "patchGCalEvent" as const,
    item,
    reason: "This should fail",
  }];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 1);
  assertEquals(results[0].success, false);
  assertEquals(results[0].result, null);
  assertExists(results[0].error);
  assertEquals(results[0].error, "Cannot patch GCal event without gcalId");
});

Deno.test("Actuator processes multiple operations", async () => {
  const config = createTestConfig();
  const linearClient = new MockLinearApiClient();
  const gcalClient = new MockGCalApiClient();

  const actuator = new Actuator({
    linear: linearClient,
    gcal: gcalClient,
  }, config);

  const operations = [
    {
      type: "createLinearIssue" as const,
      item: {
        uid: "uid-1",
        title: "Task 1",
        gcalId: "gcal-1",
        phase: "eventOnly" as const,
        lastModified: "2024-01-01T12:00:00Z",
      },
      reason: "Create Linear issue 1",
    },
    {
      type: "createGCalEvent" as const,
      item: {
        uid: "uid-2",
        title: "Task 2",
        startTime: "2024-01-02T10:00:00Z",
        endTime: "2024-01-02T10:30:00Z",
        linearId: "linear-2",
        phase: "linearOnly" as const,
        lastModified: "2024-01-01T12:00:00Z",
      },
      reason: "Create GCal event 1",
    },
  ];

  const results = await actuator.execute(operations);

  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.success), true);

  const createdIssues = linearClient.getCreatedIssues();
  const createdEvents = gcalClient.getCreatedEvents();

  assertEquals(createdIssues.length, 1);
  assertEquals(createdEvents.length, 1);

  assertEquals(createdIssues[0].title, "📥\u202FTask 1");
  assertEquals(createdEvents[0].summary, "📅\u202FTask 2");
});
