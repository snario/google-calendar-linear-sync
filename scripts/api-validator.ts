/**
 * API Validator: Fetches sample data from real APIs and validates mock structures
 * Used to ensure our mock data matches real API responses
 */

import { GCalEvent, LinearIssue } from "../src/types.ts";
import { RealGCalApiClient, RealLinearApiClient } from "../src/api-clients.ts";

export interface ValidationConfig {
  linearApiKey: string;
  linearTeamId: string;
  googleServiceAccountJson: string; // Base64 encoded service account JSON
  gcalCalendarId: string;
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
  linearSample?: LinearIssue;
  gcalSample?: GCalEvent;
  mockValidation: {
    linearStructureValid: boolean;
    gcalStructureValid: boolean;
    missingLinearFields: string[];
    missingGCalFields: string[];
  };
}

export class ApiValidator {
  constructor(private config: ValidationConfig) {}

  /**
   * Validate both APIs and check mock compatibility
   */
  async validateApis(): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: false,
      errors: [],
      mockValidation: {
        linearStructureValid: true,
        gcalStructureValid: true,
        missingLinearFields: [],
        missingGCalFields: [],
      },
    };

    try {
      console.log("🔍 Validating Linear API...");
      const linearSample = await this.fetchLinearSample();
      result.linearSample = linearSample;

      console.log("🔍 Validating Google Calendar API...");
      const gcalSample = await this.fetchGCalSample();
      result.gcalSample = gcalSample;

      console.log("🔍 Validating mock structures...");
      result.mockValidation = this.validateMockStructures(
        linearSample,
        gcalSample,
      );

      result.success = result.mockValidation.linearStructureValid &&
        result.mockValidation.gcalStructureValid;

      if (result.success) {
        console.log("✅ All API validations passed!");
      } else {
        console.log("❌ API validation failed");
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      console.error("🚨 API validation error:", error);
    }

    return result;
  }

  /**
   * Fetch a sample Linear issue
   */
  private async fetchLinearSample(): Promise<LinearIssue> {
    const linearClient = new RealLinearApiClient({
      apiKey: this.config.linearApiKey,
      teamId: this.config.linearTeamId,
    });

    const issues = await linearClient.getIssues(this.config.linearTeamId);

    if (issues.length === 0) {
      throw new Error("No Linear issues found for validation");
    }

    return issues[0];
  }

  /**
   * Fetch a sample Google Calendar event
   */
  private async fetchGCalSample(): Promise<GCalEvent> {
    const gcalClient = new RealGCalApiClient({
      serviceAccountJson: this.config.googleServiceAccountJson,
      calendarId: this.config.gcalCalendarId,
    });

    const events = await gcalClient.getEvents(
      this.config.gcalCalendarId,
      new Date().toISOString(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );

    if (events.length === 0) {
      throw new Error("No Google Calendar events found for validation");
    }

    return events[0];
  }


  /**
   * Validate that our mock structures match real API responses
   */
  private validateMockStructures(
    linearSample: LinearIssue,
    gcalSample: GCalEvent,
  ): ValidationResult["mockValidation"] {
    const result = {
      linearStructureValid: true,
      gcalStructureValid: true,
      missingLinearFields: [] as string[],
      missingGCalFields: [] as string[],
    };

    // Check Linear issue structure
    const expectedLinearFields = ["id", "title", "state"];
    for (const field of expectedLinearFields) {
      if (!(field in linearSample)) {
        result.missingLinearFields.push(field);
        result.linearStructureValid = false;
      }
    }

    // Check GCal event structure
    const expectedGCalFields = ["id", "summary", "start", "end", "status"];
    for (const field of expectedGCalFields) {
      if (!(field in gcalSample)) {
        result.missingGCalFields.push(field);
        result.gcalStructureValid = false;
      }
    }

    // Log structure comparison
    console.log("📋 Linear API Structure:");
    console.log(JSON.stringify(linearSample, null, 2));

    console.log("📋 Google Calendar API Structure:");
    console.log(JSON.stringify(gcalSample, null, 2));

    return result;
  }

  /**
   * Print detailed API comparison report
   */
  printValidationReport(result: ValidationResult): void {
    console.log("\n📊 API Validation Report");
    console.log("========================");

    console.log(`\n✅ Overall Success: ${result.success}`);

    if (result.errors.length > 0) {
      console.log("\n❌ Errors:");
      result.errors.forEach((error) => console.log(`   - ${error}`));
    }

    console.log(`\n📋 Linear API:`);
    console.log(
      `   Structure Valid: ${result.mockValidation.linearStructureValid}`,
    );
    if (result.mockValidation.missingLinearFields.length > 0) {
      console.log(
        `   Missing Fields: ${
          result.mockValidation.missingLinearFields.join(", ")
        }`,
      );
    }

    console.log(`\n📅 Google Calendar API:`);
    console.log(
      `   Structure Valid: ${result.mockValidation.gcalStructureValid}`,
    );
    if (result.mockValidation.missingGCalFields.length > 0) {
      console.log(
        `   Missing Fields: ${
          result.mockValidation.missingGCalFields.join(", ")
        }`,
      );
    }

    if (result.linearSample) {
      console.log(`\n📝 Sample Linear Issue:`);
      console.log(`   ID: ${result.linearSample.id}`);
      console.log(`   Title: ${result.linearSample.title}`);
      console.log(`   State: ${result.linearSample.state}`);
      console.log(`   Estimate: ${result.linearSample.estimate || "None"}`);
    }

    if (result.gcalSample) {
      console.log(`\n📅 Sample Calendar Event:`);
      console.log(`   ID: ${result.gcalSample.id}`);
      console.log(`   Title: ${result.gcalSample.summary}`);
      console.log(`   Start: ${result.gcalSample.start.dateTime}`);
      console.log(`   Status: ${result.gcalSample.status}`);
    }
  }
}

/**
 * Standalone validation function for easy CLI usage
 */
export async function validateApis(
  config: ValidationConfig,
): Promise<ValidationResult> {
  const validator = new ApiValidator(config);
  const result = await validator.validateApis();
  validator.printValidationReport(result);
  return result;
}
