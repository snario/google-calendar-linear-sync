/**
 * Run with: deno run --allow-env --allow-net --env-file=.env scripts/show-canonical.ts
 */

/**
 * Show Canonical Items - See the projector output after processing Linear + GCal data
 */

import { RealGCalApiClient, RealLinearApiClient } from "../src/api-clients.ts";
import { project } from "../src/projector.ts";

const linearClient = new RealLinearApiClient({
  apiKey: Deno.env.get("LINEAR_API_KEY")!,
  teamId: Deno.env.get("LINEAR_TEAM_ID")!,
});

const gcalClient = new RealGCalApiClient({
  serviceAccountJson: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!,
  calendarId: Deno.env.get("GCAL_CALENDAR_ID")!,
});

console.log("🎯 Fetching data and projecting canonical items...\n");

// Fetch GCal events first to get Linear IDs to query
const gcalEvents = await gcalClient.getEvents(
  Deno.env.get("GCAL_CALENDAR_ID")!,
  "",
  "",
);

// Extract Linear IDs referenced by GCal events
const referencedLinearIds = gcalEvents
  .map((event) => event.extendedProperties?.private?.linearIssueId)
  .filter(Boolean) as string[];

console.log(
  `🔍 Found ${referencedLinearIds.length} Linear IDs referenced by GCal events`,
);
console.log(`📅 Found ${gcalEvents.length} GCal events total`);

// Fetch targeted Linear issues (referenced + scheduled)
const linearIssues = await linearClient.getTargetedIssues(
  Deno.env.get("LINEAR_TEAM_ID")!,
  referencedLinearIds,
);

const result = project({
  linearIssues,
  gcalEvents,
  now: new Date(),
});

console.log(`🎯 Canonical Items (${result.items.length} total)\n`);

const tableData = result.items
  .sort((a, b) => {
    // Sort by phase, then by title
    if (a.phase !== b.phase) {
      const phaseOrder = [
        "active",
        "completed",
        "overdue",
        "eventOnly",
        "linearOnly",
      ];
      return phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase);
    }
    return a.title.localeCompare(b.title);
  })
  .map((item) => ({
    Title: item.title?.substring(0, 40) +
      (item.title && item.title.length > 40 ? "..." : ""),
    Phase: item.phase,
    "Has Linear": item.linearId ? "✅" : "",
    "Has GCal": item.gcalId ? "✅" : "",
    "Start Time": item.startTime
      ? new Date(item.startTime).toISOString().substring(0, 16)
      : "",
  }));

console.table(tableData);

const phaseCounts = result.items.reduce((acc, item) => {
  acc[item.phase] = (acc[item.phase] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("\n📊 Phase Summary:");
Object.entries(phaseCounts).forEach(([phase, count]) => {
  console.log(`- ${phase}: ${count}`);
});

console.log("\n🔗 Linking Summary:");
console.log(
  `- Items with both Linear & GCal: ${
    result.items.filter((i) => i.linearId && i.gcalId).length
  }`,
);
console.log(
  `- eventOnly (GCal without Linear): ${
    result.items.filter((i) => i.phase === "eventOnly").length
  }`,
);
console.log(
  `- linearOnly (Linear without GCal): ${
    result.items.filter((i) => i.phase === "linearOnly").length
  }`,
);
console.log(`- Total canonical items: ${result.items.length}`);
