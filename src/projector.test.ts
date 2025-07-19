/**
 * Tests for the projector module
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
import { project } from "./projector.ts";
import { GCalEvent, LinearIssue } from "./types.ts";

Deno.test("project handles empty inputs", () => {
  const result = project({
    linearIssues: [],
    gcalEvents: [],
    now: new Date("2024-01-01T12:00:00Z"),
  });

  assertEquals(result.items.length, 0);
  assertEquals(result.orphanedLinearIssues.length, 0);
  assertEquals(result.orphanedGCalEvents.length, 0);
});

Deno.test("project creates eventOnly item for orphaned GCal event", () => {
  const gcalEvent: GCalEvent = {
    id: "gcal-1",
    summary: "Meeting with client",
    start: { dateTime: "2024-01-01T14:00:00Z" },
    end: { dateTime: "2024-01-01T15:00:00Z" },
    status: "confirmed",
  };

  const result = project({
    linearIssues: [],
    gcalEvents: [gcalEvent],
    now: new Date("2024-01-01T12:00:00Z"),
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].phase, "eventOnly");
  assertEquals(result.items[0].title, "Meeting with client");
  assertEquals(result.items[0].gcalId, "gcal-1");
  assertEquals(result.items[0].linearId, undefined);
  assertExists(result.items[0].uid);
});

Deno.test("project creates linearOnly item for orphaned Linear issue", () => {
  const linearIssue: LinearIssue = {
    id: "linear-1",
    title: "Fix bug in auth",
    state: "Triage",
  };

  const result = project({
    linearIssues: [linearIssue],
    gcalEvents: [],
    now: new Date("2024-01-01T12:00:00Z"),
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].phase, "linearOnly");
  assertEquals(result.items[0].title, "Fix bug in auth");
  assertEquals(result.items[0].linearId, "linear-1");
  assertEquals(result.items[0].gcalId, undefined);
  assertExists(result.items[0].uid);
});

Deno.test("project creates active item for linked items", () => {
  const uid = "test-uid-123";

  const linearIssue: LinearIssue = {
    id: "linear-1",
    title: "📅\u202FWork on presentation",
    state: "Scheduled",
    description:
      "<!-- calendar-sync --> GoogleCalEventId:gcal-1 | Start:2024-01-01T14:00:00Z | DurMin:120",
  };

  const gcalEvent: GCalEvent = {
    id: "gcal-1",
    summary: "📅\u202FWork on presentation",
    start: { dateTime: "2024-01-01T14:00:00Z" },
    end: { dateTime: "2024-01-01T16:00:00Z" },
    status: "confirmed",
    extendedProperties: {
      private: {
        uid: uid,
        linearIssueId: "linear-1",
      },
    },
  };

  const result = project({
    linearIssues: [linearIssue],
    gcalEvents: [gcalEvent],
    now: new Date("2024-01-01T12:00:00Z"),
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].phase, "active");
  assertEquals(result.items[0].title, "Work on presentation"); // prefix stripped
  assertEquals(result.items[0].linearId, "linear-1");
  assertEquals(result.items[0].gcalId, "gcal-1");
  assertEquals(result.items[0].uid, uid);
});

Deno.test("project creates completed item for done Linear issue", () => {
  const uid = "test-uid-123";

  const linearIssue: LinearIssue = {
    id: "linear-1",
    title: "✅\u202FCompleted task",
    state: "Done",
    description:
      "<!-- calendar-sync --> GoogleCalEventId:gcal-1 | Start:2024-01-01T14:00:00Z | DurMin:120",
  };

  const gcalEvent: GCalEvent = {
    id: "gcal-1",
    summary: "✅\u202FCompleted task",
    start: { dateTime: "2024-01-01T14:00:00Z" },
    end: { dateTime: "2024-01-01T16:00:00Z" },
    status: "confirmed",
    extendedProperties: {
      private: {
        uid: uid,
        linearIssueId: "linear-1",
      },
    },
  };

  const result = project({
    linearIssues: [linearIssue],
    gcalEvents: [gcalEvent],
    now: new Date("2024-01-01T12:00:00Z"),
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].phase, "completed");
  assertEquals(result.items[0].linearState, "Done");
});

Deno.test("project creates overdue item for old events", () => {
  const uid = "test-uid-123";

  const linearIssue: LinearIssue = {
    id: "linear-1",
    title: "Old active task",
    state: "Scheduled",
    description:
      "<!-- calendar-sync --> GoogleCalEventId:gcal-1 | Start:2024-01-01T14:00:00Z | DurMin:120",
  };

  const gcalEvent: GCalEvent = {
    id: "gcal-1",
    summary: "Old active task",
    start: { dateTime: "2024-01-01T14:00:00Z" },
    end: { dateTime: "2024-01-01T16:00:00Z" }, // Ended 2 days ago
    status: "confirmed",
    extendedProperties: {
      private: {
        uid: uid,
        linearIssueId: "linear-1",
      },
    },
  };

  const result = project({
    linearIssues: [linearIssue],
    gcalEvents: [gcalEvent],
    now: new Date("2024-01-03T12:00:00Z"), // 2 days later
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].phase, "overdue");
});
