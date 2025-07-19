/**
 * Projector: Converts external snapshots into canonical truth
 * This is a pure function that takes Linear issues and GCal events
 * and produces a unified view of all items with stable UIDs
 */

import {
  CanonicalItem,
  durationToEstimate,
  ESTIMATE_DURATIONS,
  GCalEvent,
  LinearEstimate,
  LinearIssue,
  Phase,
  pointsToEstimate,
  stripPrefix,
} from "./types.ts";
import { v4 as uuidv4 } from "npm:uuid@9.0.0";
import dayjs from "npm:dayjs@1.11.10";
import {
  extractLinearIdFromText,
  parseAllCalendarMetadataFromDescription,
  parseLinearLinkFromDescription,
} from "./metadata-parser.ts";

interface ProjectorInput {
  linearIssues: LinearIssue[];
  gcalEvents: GCalEvent[];
  now: Date;
}

interface ProjectorOutput {
  items: CanonicalItem[];
  orphanedLinearIssues: LinearIssue[];
  orphanedGCalEvents: GCalEvent[];
}

export function project(input: ProjectorInput): ProjectorOutput {
  const { linearIssues, gcalEvents, now } = input;
  const items: CanonicalItem[] = [];
  const processedLinearIds = new Set<string>();
  const processedGCalIds = new Set<string>();

  // Index Linear issues by GCal ID (parsed from description)
  const linearByGCalId = new Map<string, LinearIssue>();
  const linearByIssueKey = new Map<string, LinearIssue>();

  for (const issue of linearIssues) {
    // Parse ALL calendar metadata from Linear issue description
    const allCalMetadata = parseAllCalendarMetadataFromDescription(
      issue.description,
    );
    for (const calMetadata of allCalMetadata) {
      linearByGCalId.set(calMetadata.gcalId, issue);
    }

    // Index by issue key for reverse lookup (LIAM-1545, etc.)
    const issueKey = extractLinearIdFromText(issue.id);
    if (issueKey) {
      linearByIssueKey.set(issueKey, issue);
    }

    // Also try extracting from title if it contains issue key
    const titleKey = extractLinearIdFromText(issue.title);
    if (titleKey) {
      linearByIssueKey.set(titleKey, issue);
    }
  }

  // Index GCal events by Linear ID (from extendedProperties)
  const gcalByLinearId = new Map<string, GCalEvent>();
  const gcalByLinearKey = new Map<string, GCalEvent>();

  for (const event of gcalEvents) {
    // Use extendedProperties for GCal→Linear linking
    if (event.extendedProperties?.private?.linearIssueId) {
      gcalByLinearId.set(event.extendedProperties.private.linearIssueId, event);
    }

    // Parse Linear link from description (for backup linking)
    const linearLink = parseLinearLinkFromDescription(event.description);
    if (linearLink) {
      gcalByLinearKey.set(linearLink.issueKey, event);
      gcalByLinearId.set(linearLink.issueId, event);
    }
  }

  // Process paired items: GCal events linked to Linear issues via extendedProperties
  for (const [linearId, gcalEvent] of gcalByLinearId) {
    const linkedLinearIssue = linearIssues.find((i) => i.id === linearId);

    if (
      linkedLinearIssue && !processedLinearIds.has(linkedLinearIssue.id) &&
      !processedGCalIds.has(gcalEvent.id)
    ) {
      processedLinearIds.add(linkedLinearIssue.id);
      processedGCalIds.add(gcalEvent.id);

      const uid = gcalEvent.extendedProperties?.private?.uid || generateUid();

      const item = createCanonicalItem({
        uid,
        linearIssue: linkedLinearIssue,
        gcalEvent: gcalEvent,
        now,
      });

      items.push(item);
    }
  }

  // Process paired items: Linear issues linked to GCal events via description metadata
  for (const [gcalId, linearIssue] of linearByGCalId) {
    const linkedGCalEvent = gcalEvents.find((e) => e.id === gcalId);

    if (
      linkedGCalEvent && !processedLinearIds.has(linearIssue.id) &&
      !processedGCalIds.has(linkedGCalEvent.id)
    ) {
      // Calendar event exists - create paired item
      processedLinearIds.add(linearIssue.id);
      processedGCalIds.add(linkedGCalEvent.id);

      const uid = linkedGCalEvent.extendedProperties?.private?.uid ||
        generateUid();

      const item = createCanonicalItem({
        uid,
        linearIssue: linearIssue,
        gcalEvent: linkedGCalEvent,
        now,
      });

      items.push(item);
    } else if (!linkedGCalEvent && !processedLinearIds.has(linearIssue.id)) {
      // Calendar event was deleted but Linear issue still has metadata - treat as linearOnly
      processedLinearIds.add(linearIssue.id);

      const uid = generateUid();

      const item = createCanonicalItem({
        uid,
        linearIssue: linearIssue,
        gcalEvent: null, // No calendar event
        now,
      });

      items.push(item);
    }
  }

  // Process unpaired Linear issues
  for (const issue of linearIssues) {
    if (!processedLinearIds.has(issue.id)) {
      // Orphaned Linear issue - no GCal event links to it
      const uid = generateUid();
      const item = createCanonicalItem({
        uid,
        linearIssue: issue,
        gcalEvent: null,
        now,
      });

      items.push(item);
      processedLinearIds.add(issue.id);
    }
  }

  // Process unpaired GCal events
  for (const event of gcalEvents) {
    if (!processedGCalIds.has(event.id)) {
      // Orphaned GCal event - no Linear issue links to it
      const uid = event.extendedProperties?.private?.uid || generateUid();
      const item = createCanonicalItem({
        uid,
        linearIssue: null,
        gcalEvent: event,
        now,
      });

      items.push(item);
      processedGCalIds.add(event.id);
    }
  }

  // Collect truly orphaned items (shouldn't happen but defensive)
  const orphanedLinearIssues = linearIssues.filter((i) =>
    !processedLinearIds.has(i.id)
  );
  const orphanedGCalEvents = gcalEvents.filter((e) =>
    !processedGCalIds.has(e.id)
  );

  return {
    items,
    orphanedLinearIssues,
    orphanedGCalEvents,
  };
}

interface CanonicalItemParams {
  uid: string;
  linearIssue: LinearIssue | null;
  gcalEvent: GCalEvent | null;
  now: Date;
}

function createCanonicalItem(params: CanonicalItemParams): CanonicalItem {
  const { uid, linearIssue, gcalEvent, now } = params;

  // Title: Linear wins if present, otherwise GCal
  const title = linearIssue
    ? stripPrefix(linearIssue.title)
    : gcalEvent
    ? stripPrefix(gcalEvent.summary)
    : "Untitled";

  // Description: newest updatedAt wins (not available in current types, so Linear wins)
  const description = linearIssue?.description || gcalEvent?.description;

  // Start/End: Calendar wins if present, handle both date and dateTime formats
  const startTime = gcalEvent?.start.dateTime || gcalEvent?.start.date ||
    linearIssue?.targetDate;
  const endTime = gcalEvent?.end.dateTime || gcalEvent?.end.date;

  // Duration and Estimate handling
  let durationMin: number | undefined;
  let estimate: LinearEstimate | undefined;

  if (gcalEvent && startTime && endTime) {
    // Calculate duration from GCal event
    durationMin = dayjs(endTime).diff(dayjs(startTime), "minutes");
    // Convert GCal duration to Linear estimate (don't change GCal duration)
    estimate = durationToEstimate(durationMin);
  }

  // If Linear has an estimate, use it (Linear wins for estimates)
  if (linearIssue?.estimate) {
    estimate = pointsToEstimate(linearIssue.estimate);
    // If no GCal duration but we have Linear estimate, use estimate duration
    if (!durationMin) {
      durationMin = ESTIMATE_DURATIONS[estimate];
    }
  }

  // Default to 'S' (30 min) if no estimate found
  if (!estimate) {
    estimate = "S";
    durationMin = durationMin || 30;
  }

  // Last modified: use current time as fallback
  const lastModified = dayjs(now).toISOString();

  // Classify phase
  const phase = classifyPhase({
    linearIssue,
    gcalEvent,
    endTime,
    now,
  });

  return {
    uid,
    title,
    description,
    startTime,
    endTime,
    durationMin,
    estimate,
    linearId: linearIssue?.id,
    gcalId: gcalEvent?.id,
    linearState: linearIssue?.state,
    phase,
    lastModified,

    // Store original titles for idempotency checks
    currentGCalTitle: gcalEvent?.summary,
    currentLinearTitle: linearIssue?.title,
  };
}

interface PhaseClassificationParams {
  linearIssue: LinearIssue | null;
  gcalEvent: GCalEvent | null;
  _startTime?: string;
  endTime?: string;
  now: Date;
}

function classifyPhase(params: PhaseClassificationParams): Phase {
  const { linearIssue, gcalEvent, endTime, now } = params;

  // EventOnly: GCal event without Linear match
  if (gcalEvent && !linearIssue) {
    return "eventOnly";
  }

  // LinearOnly: Linear issue without GCal match
  if (linearIssue && !gcalEvent) {
    return "linearOnly";
  }

  // Both exist - check for completion
  if (linearIssue && gcalEvent) {
    // Completed: Linear state is Done/Canceled/Failed
    if (["Done", "Canceled", "Failed"].includes(linearIssue.state)) {
      return "completed";
    }

    // Overdue: event ended more than 24h ago and Linear still active
    if (endTime) {
      const eventEnd = dayjs(endTime);
      const hoursAgo = dayjs(now).diff(eventEnd, "hours");
      if (hoursAgo > 24 && linearIssue.state !== "Done") {
        return "overdue";
      }
    }

    // Active: linked and syncing
    return "active";
  }

  // Default fallback
  return "active";
}

function generateUid(): string {
  return uuidv4();
}
