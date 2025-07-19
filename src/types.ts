/**
 * Core data models for the sync worker based on spec
 */

// Google Calendar event structure
export interface GCalEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  extendedProperties?: {
    private?: {
      uid?: string;
      linearId?: string;
      linearIssueId?: string;
    };
  };
  status: "confirmed" | "cancelled";
}

// Linear estimate sizes
export type LinearEstimate = "XS" | "S" | "M" | "L" | "XL";

// Linear issue structure
export interface LinearIssue {
  id: string;
  title: string;
  description?: string;
  state: "Triage" | "Scheduled" | "Done" | "Canceled" | "Failed";
  targetDate?: string; // ISO date-time
  estimate?: number; // Points (1=XS, 2=S, 3=M, 5=L, 8=XL)
  // Note: Linear API doesn't support custom fields - use description metadata instead
}

// Canonical item that represents unified state
export interface CanonicalItem {
  uid: string; // Stable identifier that links across systems
  title: string; // Without prefix
  description?: string;
  startTime?: string; // ISO date-time
  endTime?: string; // ISO date-time
  durationMin?: number; // Duration in minutes
  estimate?: LinearEstimate; // XS, S, M, L, XL
  linearId?: string;
  gcalId?: string;
  linearState?: LinearIssue["state"];
  phase: Phase;
  lastModified: string; // For conflict resolution

  // Original titles for idempotency checks
  currentGCalTitle?: string; // Current GCal event title (with any existing prefix)
  currentLinearTitle?: string; // Current Linear issue title (with any existing prefix)
}

// Five phases as per spec
export type Phase =
  | "eventOnly" // GCal event without Linear match
  | "linearOnly" // Linear issue without GCal match
  | "active" // Linked and syncing
  | "completed" // Linear done/canceled/failed
  | "overdue"; // Past deadline but still active

// Operations that can be performed
export interface Operation {
  type: OperationType;
  item: CanonicalItem;
  reason: string;
}

export type OperationType =
  | "createLinearIssue"
  | "createGCalEvent"
  | "patchGCalEvent"
  | "patchLinearIssue"
  | "copyEventToHistory"
  | "createRescheduledEvent" // New operation for overdue items
  | "createLinearIssueAndUpdateGCal" // Combined operation for eventOnly items
  | "createGCalEventAndUpdateLinear" // Combined operation for linearOnly items
  | "noop";

// Title prefixes as per spec
export const PREFIXES = {
  TRIAGE: "📥\u202F", // Narrow no-break space
  SCHEDULED: "📅\u202F",
  DONE: "✅\u202F",
  CANCELED: "🚫\u202F",
  FAILED: "❌\u202F",
  WORKED: "⏳\u202F", // For overdue items that were worked on
} as const;

// Utility to strip any prefix from title
export function stripPrefix(title: string): string {
  // Remove any emoji + narrow no-break space pattern
  // More comprehensive emoji range
  return title.replace(
    /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\u202F/u,
    "",
  ).trim();
}

// Utility to add prefix to title
export function addPrefix(title: string, prefix: string): string {
  const cleanTitle = stripPrefix(title);
  return `${prefix}${cleanTitle}`;
}

// Duration mapping for Linear estimates
export const ESTIMATE_DURATIONS = {
  XS: 15, // 15 minutes
  S: 30, // 30 minutes
  M: 60, // 1 hour
  L: 120, // 2 hours
  XL: 240, // 4 hours
} as const;

// Linear points to estimate mapping
export const POINTS_TO_ESTIMATE: Record<number, LinearEstimate> = {
  1: "XS",
  2: "S",
  3: "M",
  5: "L",
  8: "XL",
};

export const ESTIMATE_TO_POINTS: Record<LinearEstimate, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

// Convert calendar duration to closest Linear estimate
export function durationToEstimate(durationMin: number): LinearEstimate {
  if (durationMin <= 22) return "XS"; // ≤22min → XS (15min)
  if (durationMin <= 45) return "S"; // ≤45min → S (30min)
  if (durationMin <= 90) return "M"; // ≤90min → M (60min)
  if (durationMin <= 180) return "L"; // ≤180min → L (120min)
  return "XL"; // >180min → XL (240min)
}

// Convert Linear estimate to duration in minutes
export function estimateToDuration(estimate: LinearEstimate): number {
  return ESTIMATE_DURATIONS[estimate];
}

// Convert Linear points to estimate
export function pointsToEstimate(points: number): LinearEstimate {
  return POINTS_TO_ESTIMATE[points] || "S"; // Default to S
}

// Convert estimate to Linear points
export function estimateToPoints(estimate: LinearEstimate): number {
  return ESTIMATE_TO_POINTS[estimate];
}

// Working hours configuration
export interface WorkingHours {
  startHour: number; // 24-hour format (e.g., 9 for 9 AM)
  endHour: number; // 24-hour format (e.g., 17 for 5 PM)
  workingDays: number[]; // 0=Sunday, 1=Monday, etc. [1,2,3,4,5] for weekdays
}

// Configuration for the sync worker
export interface SyncConfig {
  linearApiKey: string;
  linearTeamId: string;
  gcalCalendarId: string;
  gcalHistoryCalendarId?: string; // For overdue items
  timezone: string; // e.g., "America/New_York" for EST
  workingHours: WorkingHours;
  lookbackDays: number;
  lookaheadDays: number;
}

// Result of a sync operation
export interface SyncResult {
  timestamp: string;
  itemsProcessed: number;
  operationsExecuted: Operation[];
  errors: string[];
  duration: number; // milliseconds
}
