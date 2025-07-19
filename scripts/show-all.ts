/**
 * Run with: deno run --allow-env --allow-net --env-file=.env scripts/show-all.ts
 */

/**
 * Show All Data - Complete overview of GCal → Linear → Canonical flow
 */

import { RealGCalApiClient, RealLinearApiClient } from "../src/api-clients.ts";
import { project } from "../src/projector.ts";
import { parseCalendarMetadataFromDescription } from "../src/metadata-parser.ts";

const linearClient = new RealLinearApiClient({
  apiKey: Deno.env.get("LINEAR_API_KEY")!,
  teamId: Deno.env.get("LINEAR_TEAM_ID")!,
});

const gcalClient = new RealGCalApiClient({
  serviceAccountJson: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!,
  calendarId: Deno.env.get("GCAL_CALENDAR_ID")!,
});

console.log("🔄 Complete Data Flow Analysis\n");

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

// Linking analysis
const gcalWithLinearId = gcalEvents.filter((e) =>
  e.extendedProperties?.private?.linearIssueId
);
const linearWithMetadata = linearIssues.filter((i) =>
  parseCalendarMetadataFromDescription(i.description || "")
);
const linkedCanonical = result.items.filter((i) => i.linearId && i.gcalId);

console.log("🔄 Complete Data Flow Analysis\n");

// Data flow summary
console.log("📊 Data Flow Summary:");
console.log(`📅 Google Calendar: ${gcalEvents.length} events`);
console.log(`📋 Linear Issues: ${linearIssues.length} issues`);
console.log(`🎯 Canonical Items: ${result.items.length} items\n`);

// Linking analysis table
console.log("🔗 Linking Analysis:");
const linkingData = [
  {
    Source: "GCal Events",
    Items: gcalEvents.length,
    "With Links": gcalWithLinearId.length,
    "Link Rate": `${((gcalWithLinearId.length / gcalEvents.length) * 100).toFixed(1)}%`,
  },
  {
    Source: "Linear Issues",
    Items: linearIssues.length,
    "With Links": linearWithMetadata.length,
    "Link Rate": `${((linearWithMetadata.length / linearIssues.length) * 100).toFixed(1)}%`,
  },
  {
    Source: "Canonical Items",
    Items: result.items.length,
    "With Links": linkedCanonical.length,
    "Link Rate": `${((linkedCanonical.length / result.items.length) * 100).toFixed(1)}%`,
  },
];
console.table(linkingData);

// Top linked items
if (linkedCanonical.length > 0) {
  console.log("\n🏆 Top 50 Linked Items:");
  const topLinkedItems = linkedCanonical
    .slice(0, 50)
    .map((item) => ({
      Title: item.title?.substring(0, 35) +
        (item.title && item.title.length > 35 ? "..." : ""),
      Phase: item.phase,
      "Linear State": item.linearState || "",
      "Start Time": item.startTime
        ? new Date(item.startTime).toISOString().substring(0, 16)
        : "",
    }));
  console.table(topLinkedItems);
}

// Phase breakdown
const phaseCounts = result.items.reduce((acc, item) => {
  acc[item.phase] = (acc[item.phase] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("\n📈 Phase Breakdown:");
const phaseData = [
  { Phase: "active", Count: phaseCounts.active || 0, Description: "Linked and syncing" },
  { Phase: "completed", Count: phaseCounts.completed || 0, Description: "Done/Canceled/Failed" },
  { Phase: "overdue", Count: phaseCounts.overdue || 0, Description: "Past deadline" },
  { Phase: "eventOnly", Count: phaseCounts.eventOnly || 0, Description: "GCal event without Linear" },
  { Phase: "linearOnly", Count: phaseCounts.linearOnly || 0, Description: "Linear issue without GCal" },
];
console.table(phaseData);

console.log("\n🎯 Key Metrics:");
console.log(
  `- Linking success rate: ${
    ((linkedCanonical.length / result.items.length) * 100).toFixed(1)
  }%`,
);
console.log(
  `- GCal events needing Linear issues: ${phaseCounts.eventOnly || 0}`,
);
console.log(
  `- Linear issues needing GCal events: ${
    result.items.filter((i) =>
      i.phase === "linearOnly" && i.linearState === "Scheduled"
    ).length
  }`,
);
console.log(`- Active syncing pairs: ${phaseCounts.active || 0}`);