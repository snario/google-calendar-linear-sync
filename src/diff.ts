/**
 * Diff Engine: Converts phase transitions into minimal idempotent operations
 * Pure function that takes canonical items and produces operations to execute
 */

import {
  addPrefix,
  CanonicalItem,
  estimateToDuration,
  Operation,
  PREFIXES,
} from "./types.ts";
import dayjs from "npm:dayjs@1.11.10";

export function diff(items: CanonicalItem[]): Operation[] {
  const operations: Operation[] = [];

  for (const item of items) {
    const ops = generateOperationsForItem(item);
    operations.push(...ops);
  }

  return operations;
}

function generateOperationsForItem(item: CanonicalItem): Operation[] {
  const operations: Operation[] = [];

  switch (item.phase) {
    case "eventOnly":
      // Transition 1: eventOnly → active
      // GCal event has no UID match in Linear
      operations.push({
        type: "createLinearIssueAndUpdateGCal",
        item: {
          ...item,
          linearState: "Triage",
          title: addPrefix(item.title, PREFIXES.TRIAGE),
        },
        reason: "New GCal event needs Linear issue and title update",
      });
      break;

    case "linearOnly":
      // Transition 2: linearOnly → active
      // Linear issue enters "Scheduled", has no GCal twin
      if (item.linearState === "Scheduled") {
        const startTime = item.startTime || getDefaultStartTime();
        const endTime = getDefaultEndTime(startTime, item.estimate);

        operations.push({
          type: "createGCalEventAndUpdateLinear",
          item: {
            ...item,
            title: addPrefix(item.title, PREFIXES.SCHEDULED),
            startTime,
            endTime,
          },
          reason:
            "Scheduled Linear issue needs GCal event and metadata linking",
        });
      }
      break;

    case "active": {
      // Transition 5: active → active (metadata sync)
      // Check if we need to sync title, description, or time changes
      const syncOps = generateMetadataSyncOperations(item);
      operations.push(...syncOps);
      break;
    }

    case "completed":
      // Transition 3: active → completed
      // Linear state becomes Done/Canceled/Failed
      if (item.gcalId && item.linearState) {
        const prefix = getCompletionPrefix(item.linearState);
        const expectedTitle = addPrefix(item.title, prefix);

        // Only patch if the current GCal title doesn't already have the correct prefix
        if (item.currentGCalTitle !== expectedTitle) {
          operations.push({
            type: "patchGCalEvent",
            item: {
              ...item,
              title: expectedTitle,
            },
            reason: `Linear issue marked as ${item.linearState}`,
          });
        }
      }
      break;

    case "overdue":
      // Transition 4: active → overdue
      // Copy original event to history calendar with ⏳ prefix, then reschedule the original event
      if (item.gcalId) {
        operations.push(
          {
            type: "copyEventToHistory",
            item: {
              ...item,
              title: addPrefix(item.title, PREFIXES.WORKED),
            },
            reason: "Copying overdue event to history calendar with worked on (⏳) prefix",
          },
          {
            type: "patchGCalEvent",
            item: {
              ...item,
              // Reschedule to new time, keep original title based on Linear state
              startTime: getDefaultStartTime(),
              endTime: getDefaultEndTime(getDefaultStartTime(), item.estimate),
              title: item.linearState === "Scheduled"
                ? addPrefix(item.title, PREFIXES.SCHEDULED)
                : item.title,
            },
            reason: "Rescheduling overdue event to new time slot",
          },
        );
      }
      break;

    default:
      // No operation needed
      break;
  }

  return operations;
}

function generateMetadataSyncOperations(item: CanonicalItem): Operation[] {
  const operations: Operation[] = [];

  // For active items, we may need to sync metadata between systems
  // This is a simplified version - in reality we'd need to compare
  // the current state of both systems to detect changes

  // Title conflicts: Linear wins (already resolved in projector)
  // Time conflicts: Calendar wins (already resolved in projector)
  // Description conflicts: newest updatedAt wins (simplified here)

  // For now, we'll generate sync operations based on what's missing
  if (item.linearId && !item.gcalId) {
    // Linear exists but no GCal - should create
    operations.push({
      type: "createGCalEvent",
      item,
      reason: "Sync missing GCal event for Linear issue",
    });
  }

  if (item.gcalId && !item.linearId) {
    // GCal exists but no Linear - should create
    operations.push({
      type: "createLinearIssue",
      item,
      reason: "Sync missing Linear issue for GCal event",
    });
  }

  return operations;
}

function getCompletionPrefix(state: string): string {
  switch (state) {
    case "Done":
      return PREFIXES.DONE;
    case "Canceled":
      return PREFIXES.CANCELED;
    case "Failed":
      return PREFIXES.FAILED;
    default:
      return PREFIXES.DONE; // fallback
  }
}

function getDefaultStartTime(): string {
  // Default to tomorrow at 9 AM
  return dayjs().add(1, "day").hour(9).minute(0).second(0).toISOString();
}

function getDefaultEndTime(startTime: string, estimate: string = "S"): string {
  // Use estimate-based duration instead of fixed 1 hour
  const duration = estimateToDuration(estimate as any) || 30;
  return dayjs(startTime).add(duration, "minutes").toISOString();
}

// Phase transition validator (for testing)
export function validateTransition(
  fromPhase: CanonicalItem["phase"],
  toPhase: CanonicalItem["phase"],
): boolean {
  const validTransitions: Record<
    CanonicalItem["phase"],
    CanonicalItem["phase"][]
  > = {
    eventOnly: ["active"],
    linearOnly: ["active"],
    active: ["active", "completed", "overdue"],
    completed: [], // terminal state
    overdue: ["active"], // can be rescheduled
  };

  return validTransitions[fromPhase]?.includes(toPhase) ?? false;
}
