/**
 * API structure validator
 */

import { validateApis } from "./api-validator.ts";
import { getValidationConfig } from "./val-town-config.ts";

async function main() {
  console.log("🔍 Validating API structure and mock compatibility...\n");

  try {
    const config = getValidationConfig();
    const result = await validateApis(config);

    if (result.success) {
      console.log(
        "\n🎉 Validation successful! Your mock data structures are compatible with the real APIs.",
      );
    } else {
      console.log("\n⚠️  Validation issues found. Check the details above.");
      Deno.exit(1);
    }
  } catch (error) {
    console.error(
      "\n❌ Validation failed:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
