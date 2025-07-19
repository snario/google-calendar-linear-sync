/**
 * Run with: deno run --allow-env --allow-net --env-file=.env scripts/show-linear.ts
 */

/**
 * Show Linear Issues - Simple CLI to see what the API returns from Linear
 */

import { RealLinearApiClient } from "../src/api-clients.ts";
import { parseCalendarMetadataFromDescription } from "../src/metadata-parser.ts";

const linearClient = new RealLinearApiClient({
  apiKey: Deno.env.get("LINEAR_API_KEY")!,
  teamId: Deno.env.get("LINEAR_TEAM_ID")!,
});

console.log("📋 Fetching Linear Issues...\n");

const issues = await linearClient.getTargetedIssues(
  Deno.env.get("LINEAR_TEAM_ID")!,
  [],
);

console.log(`📋 Linear Issues (${issues.length} total)\n`);

const tableData = issues.map((issue) => {
  const metadata = parseCalendarMetadataFromDescription(
    issue.description || "",
  );
  return {
    Title: issue.title?.substring(0, 40) +
      (issue.title && issue.title.length > 40 ? "..." : ""),
    State: issue.state,
    "Target Date": issue.targetDate
      ? new Date(issue.targetDate).toISOString().substring(0, 10)
      : "",
    "GCal ID": metadata?.gcalId ? metadata.gcalId.substring(0, 12) + "..." : "",
    "Has Metadata": metadata ? "✅" : "",
  };
});

console.table(tableData);

console.log("\n📊 Metadata Summary:");
console.log(
  `- Issues with calendar metadata: ${
    issues.filter((i) =>
      parseCalendarMetadataFromDescription(i.description || "")
    ).length
  }`,
);
console.log(
  `- Scheduled issues: ${issues.filter((i) => i.state === "Scheduled").length}`,
);
console.log(
  `- Done issues: ${issues.filter((i) => i.state === "Done").length}`,
);
console.log(`- Total issues: ${issues.length}`);
