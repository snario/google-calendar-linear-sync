/**
 * Run with: deno run --allow-env --allow-net --env-file=.env scripts/show-gcal.ts
 */

/**
 * Show GCal Events - Simple CLI to see what the API returns from Google Calendar
 */

import { RealGCalApiClient } from "../src/api-clients.ts";

const gcalClient = new RealGCalApiClient({
  serviceAccountJson: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!,
  calendarId: Deno.env.get("GCAL_CALENDAR_ID")!,
});

console.log("📅 Fetching Google Calendar Events...\n");

const events = await gcalClient.getEvents(
  Deno.env.get("GCAL_CALENDAR_ID")!,
  "",
  "",
);

console.log(`📅 Google Calendar Events (${events.length} total)\n`);

const tableData = events.map((event) => {
  return {
    Summary: event.summary?.substring(0, 40) +
      (event.summary && event.summary.length > 40 ? "..." : ""),
    Start: event.start.dateTime
      ? new Date(event.start.dateTime).toISOString().substring(0, 16)
      : "N/A",
    "Linear ID": event.extendedProperties?.private?.linearIssueId
      ? event.extendedProperties.private.linearIssueId.substring(0, 8) + "..."
      : "",
    UID: event.extendedProperties?.private?.uid
      ? event.extendedProperties.private.uid.substring(0, 8) + "..."
      : "",
  };
});

console.table(tableData);

console.log("\n🔗 Linking Summary:");
console.log(
  `- Events with linearIssueId: ${
    events.filter((e) => e.extendedProperties?.private?.linearIssueId).length
  }`,
);
console.log(
  `- Events with UID: ${
    events.filter((e) => e.extendedProperties?.private?.uid).length
  }`,
);
console.log(`- Total events: ${events.length}`);
