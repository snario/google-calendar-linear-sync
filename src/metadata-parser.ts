/**
 * Metadata parsing utilities for extracting linking information
 * from descriptions and other text fields
 */

export interface ParsedLinearLink {
  issueId: string;
  issueKey: string;
  url: string;
}

export interface ParsedCalendarMetadata {
  gcalId: string;
  startTime: string;
  durationMin: number;
}

/**
 * Extract Linear issue information from calendar event description
 * Looks for patterns like: "Linear issue: https://linear.app/liamhorne/issue/LIAM-1545"
 */
export function parseLinearLinkFromDescription(
  description?: string,
): ParsedLinearLink | null {
  if (!description) return null;

  // Pattern: Linear issue: https://linear.app/{team}/issue/{ISSUE-KEY}
  const linearUrlPattern =
    /Linear issue:\s*https:\/\/linear\.app\/[^\/]+\/issue\/([A-Z]+-\d+)/i;
  const match = description.match(linearUrlPattern);

  if (match) {
    const issueKey = match[1];
    // Extract just the ID part (the number after the dash)
    const idMatch = issueKey.match(/[A-Z]+-(\d+)/);
    const issueId = idMatch ? idMatch[1] : issueKey;

    return {
      issueId,
      issueKey,
      url: match[0].replace("Linear issue: ", "").trim(),
    };
  }

  return null;
}

/**
 * Extract Google Calendar metadata from Linear issue description
 * Looks for patterns like: "<!-- calendar-sync --> GoogleCalEventId:abc123 | Start:2025-07-19T00:45:00.000Z | DurMin:30"
 */
export function parseCalendarMetadataFromDescription(
  description?: string,
): ParsedCalendarMetadata | null {
  if (!description) return null;

  // Pattern: <!-- calendar-sync --> GoogleCalEventId:xxx | Start:xxx | DurMin:xxx
  const metadataPattern =
    /<!--\s*calendar-sync\s*-->\s*GoogleCalEventId:([^\s|]+)\s*\|\s*Start:([^\s|]+)\s*\|\s*DurMin:(\d+)/i;
  const match = description.match(metadataPattern);

  if (match) {
    return {
      gcalId: match[1],
      startTime: match[2],
      durationMin: parseInt(match[3], 10),
    };
  }

  return null;
}

/**
 * Extract ALL Google Calendar metadata entries from Linear issue description
 * Returns array of all calendar sync metadata found
 */
export function parseAllCalendarMetadataFromDescription(
  description?: string,
): ParsedCalendarMetadata[] {
  if (!description) return [];

  const results: ParsedCalendarMetadata[] = [];
  const metadataPattern =
    /<!--\s*calendar-sync\s*-->\s*GoogleCalEventId:([^\s|]+)\s*\|\s*Start:([^\s|]+)\s*\|\s*DurMin:(\d+)/gi;

  let match;
  while ((match = metadataPattern.exec(description)) !== null) {
    results.push({
      gcalId: match[1],
      startTime: match[2],
      durationMin: parseInt(match[3], 10),
    });
  }

  return results;
}

/**
 * Extract Linear issue ID from various description formats
 * Handles both full URLs and simpler formats
 */
export function extractLinearIdFromText(text?: string): string | null {
  if (!text) return null;

  // Try full URL format first
  const linkInfo = parseLinearLinkFromDescription(text);
  if (linkInfo) {
    return linkInfo.issueKey;
  }

  // Try issue key format: LIAM-1545
  const issueKeyPattern = /([A-Z]+-\d+)/;
  const match = text.match(issueKeyPattern);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Extract Google Calendar event ID from Linear description
 */
export function extractGCalIdFromDescription(
  description?: string,
): string | null {
  const metadata = parseCalendarMetadataFromDescription(description);
  return metadata?.gcalId || null;
}

/**
 * Check if a calendar event is linked to a specific Linear issue
 */
export function isEventLinkedToLinearIssue(
  event: { description?: string },
  issueKey: string,
): boolean {
  const linkInfo = parseLinearLinkFromDescription(event.description);
  return linkInfo?.issueKey === issueKey;
}

/**
 * Check if a Linear issue is linked to a specific calendar event
 */
export function isIssueLinkedToCalendarEvent(
  issue: { description?: string },
  eventId: string,
): boolean {
  const metadata = parseCalendarMetadataFromDescription(issue.description);
  return metadata?.gcalId === eventId;
}
