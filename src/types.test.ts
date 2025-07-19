/**
 * Tests for types and utility functions
 */

import { assertEquals } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { addPrefix, PREFIXES, stripPrefix } from "./types.ts";

Deno.test("stripPrefix removes emoji prefixes correctly", () => {
  assertEquals(stripPrefix("📥\u202FMy Task"), "My Task");
  assertEquals(stripPrefix("📅\u202FScheduled Task"), "Scheduled Task");
  assertEquals(stripPrefix("✅\u202FCompleted Task"), "Completed Task");
  assertEquals(stripPrefix("🚫\u202FCanceled Task"), "Canceled Task");
  assertEquals(stripPrefix("❌\u202FFailed Task"), "Failed Task");

  // Should handle tasks without prefixes
  assertEquals(stripPrefix("Plain Task"), "Plain Task");

  // Should handle empty strings
  assertEquals(stripPrefix(""), "");
});

Deno.test("addPrefix adds correct prefixes", () => {
  assertEquals(addPrefix("My Task", PREFIXES.TRIAGE), "📥\u202FMy Task");
  assertEquals(addPrefix("My Task", PREFIXES.SCHEDULED), "📅\u202FMy Task");
  assertEquals(addPrefix("My Task", PREFIXES.DONE), "✅\u202FMy Task");
  assertEquals(addPrefix("My Task", PREFIXES.CANCELED), "🚫\u202FMy Task");
  assertEquals(addPrefix("My Task", PREFIXES.FAILED), "❌\u202FMy Task");
});

Deno.test("addPrefix strips existing prefix before adding new one", () => {
  const taskWithPrefix = "📥\u202FExisting Task";
  assertEquals(
    addPrefix(taskWithPrefix, PREFIXES.DONE),
    "✅\u202FExisting Task",
  );
});

// Import additional functions for testing
import {
  durationToEstimate,
  estimateToDuration,
  estimateToPoints,
  pointsToEstimate,
} from "./types.ts";

Deno.test("durationToEstimate maps correctly", () => {
  assertEquals(durationToEstimate(10), "XS"); // ≤22min → XS
  assertEquals(durationToEstimate(22), "XS");
  assertEquals(durationToEstimate(30), "S"); // ≤45min → S
  assertEquals(durationToEstimate(45), "S");
  assertEquals(durationToEstimate(60), "M"); // ≤90min → M
  assertEquals(durationToEstimate(90), "M");
  assertEquals(durationToEstimate(120), "L"); // ≤180min → L
  assertEquals(durationToEstimate(180), "L");
  assertEquals(durationToEstimate(240), "XL"); // >180min → XL
  assertEquals(durationToEstimate(300), "XL");
});

Deno.test("estimateToDuration maps correctly", () => {
  assertEquals(estimateToDuration("XS"), 15);
  assertEquals(estimateToDuration("S"), 30);
  assertEquals(estimateToDuration("M"), 60);
  assertEquals(estimateToDuration("L"), 120);
  assertEquals(estimateToDuration("XL"), 240);
});

Deno.test("pointsToEstimate maps correctly", () => {
  assertEquals(pointsToEstimate(1), "XS");
  assertEquals(pointsToEstimate(2), "S");
  assertEquals(pointsToEstimate(3), "M");
  assertEquals(pointsToEstimate(5), "L");
  assertEquals(pointsToEstimate(8), "XL");
  assertEquals(pointsToEstimate(99), "S"); // Unknown defaults to S
});

Deno.test("estimateToPoints maps correctly", () => {
  assertEquals(estimateToPoints("XS"), 1);
  assertEquals(estimateToPoints("S"), 2);
  assertEquals(estimateToPoints("M"), 3);
  assertEquals(estimateToPoints("L"), 5);
  assertEquals(estimateToPoints("XL"), 8);
});
