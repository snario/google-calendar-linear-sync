/**
 * Tests for the diff engine
 */

import { assertEquals } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { diff, validateTransition } from "./diff.ts";
import { CanonicalItem } from "./types.ts";

Deno.test("diff generates createLinearIssue for eventOnly items", () => {
  const item: CanonicalItem = {
    uid: "test-uid",
    title: "Meeting with client",
    phase: "eventOnly",
    gcalId: "gcal-1",
    startTime: "2024-01-01T14:00:00Z",
    endTime: "2024-01-01T15:00:00Z",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = diff([item]);

  assertEquals(operations.length, 1);
  assertEquals(operations[0].type, "createLinearIssueAndUpdateGCal");
  assertEquals(
    operations[0].reason,
    "New GCal event needs Linear issue and title update",
  );
  assertEquals(operations[0].item.linearState, "Triage");
});

Deno.test("diff generates createGCalEvent for scheduled linearOnly items", () => {
  const item: CanonicalItem = {
    uid: "test-uid",
    title: "Work on feature",
    phase: "linearOnly",
    linearId: "linear-1",
    linearState: "Scheduled",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = diff([item]);

  assertEquals(operations.length, 1);
  assertEquals(operations[0].type, "createGCalEventAndUpdateLinear");
  assertEquals(
    operations[0].reason,
    "Scheduled Linear issue needs GCal event and metadata linking",
  );
});

Deno.test("diff does not generate operations for non-scheduled linearOnly items", () => {
  const item: CanonicalItem = {
    uid: "test-uid",
    title: "Backlog item",
    phase: "linearOnly",
    linearId: "linear-1",
    linearState: "Triage",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = diff([item]);

  assertEquals(operations.length, 0);
});

Deno.test("diff generates patchGCalEvent for completed items", () => {
  const item: CanonicalItem = {
    uid: "test-uid",
    title: "Completed task",
    phase: "completed",
    linearId: "linear-1",
    gcalId: "gcal-1",
    linearState: "Done",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = diff([item]);

  assertEquals(operations.length, 1);
  assertEquals(operations[0].type, "patchGCalEvent");
  assertEquals(operations[0].reason, "Linear issue marked as Done");
});

Deno.test("diff generates overdue operations", () => {
  const item: CanonicalItem = {
    uid: "test-uid",
    title: "Overdue task",
    phase: "overdue",
    linearId: "linear-1",
    gcalId: "gcal-1",
    linearState: "Scheduled",
    lastModified: "2024-01-01T12:00:00Z",
  };

  const operations = diff([item]);

  assertEquals(operations.length, 2);
  assertEquals(operations[0].type, "patchGCalEvent");
  assertEquals(
    operations[0].reason,
    "Marking original event as worked on (⏳)",
  );
  assertEquals(operations[1].type, "createRescheduledEvent");
  assertEquals(
    operations[1].reason,
    "Creating new event to continue tracking overdue item",
  );
});

Deno.test("validateTransition works correctly", () => {
  // Valid transitions
  assertEquals(validateTransition("eventOnly", "active"), true);
  assertEquals(validateTransition("linearOnly", "active"), true);
  assertEquals(validateTransition("active", "completed"), true);
  assertEquals(validateTransition("active", "overdue"), true);
  assertEquals(validateTransition("active", "active"), true);
  assertEquals(validateTransition("overdue", "active"), true);

  // Invalid transitions
  assertEquals(validateTransition("completed", "active"), false);
  assertEquals(validateTransition("eventOnly", "completed"), false);
  assertEquals(validateTransition("linearOnly", "overdue"), false);
});

Deno.test("diff handles multiple items correctly", () => {
  const items: CanonicalItem[] = [
    {
      uid: "uid-1",
      title: "Event only item",
      phase: "eventOnly",
      gcalId: "gcal-1",
      lastModified: "2024-01-01T12:00:00Z",
    },
    {
      uid: "uid-2",
      title: "Linear only item",
      phase: "linearOnly",
      linearId: "linear-1",
      linearState: "Scheduled",
      lastModified: "2024-01-01T12:00:00Z",
    },
    {
      uid: "uid-3",
      title: "Active item",
      phase: "active",
      linearId: "linear-2",
      gcalId: "gcal-2",
      lastModified: "2024-01-01T12:00:00Z",
    },
  ];

  const operations = diff(items);

  // Should generate operations for eventOnly and linearOnly
  assertEquals(operations.length, 2);

  const types = operations.map((op) => op.type);
  assertEquals(types.includes("createLinearIssueAndUpdateGCal"), true);
  assertEquals(types.includes("createGCalEventAndUpdateLinear"), true);
});
