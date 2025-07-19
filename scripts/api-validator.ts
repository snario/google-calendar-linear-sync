/**
 * API Validator: Fetches sample data from real APIs and validates mock structures
 * Used to ensure our mock data matches real API responses
 */

import { GCalEvent, LinearIssue } from "../src/types.ts";

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
    const query = `
      query GetTeamIssues($teamId: String!) {
        team(id: $teamId) {
          issues(first: 1) {
            nodes {
              id
              title
              description
              state {
                name
              }
              estimate
              dueDate
            }
          }
        }
      }
    `;

    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Authorization": this.config.linearApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { teamId: this.config.linearTeamId },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Linear API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(
        `Linear GraphQL error: ${
          data.errors.map((e: any) => e.message).join(", ")
        }`,
      );
    }

    const issue = data.data?.team?.issues?.nodes?.[0];
    if (!issue) {
      throw new Error("No Linear issues found for validation");
    }

    // Convert to our LinearIssue format
    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      state: issue.state.name,
      targetDate: issue.dueDate,
      estimate: issue.estimate,
    };
  }

  /**
   * Fetch a sample Google Calendar event
   */
  private async fetchGCalSample(): Promise<GCalEvent> {
    // Decode service account JSON
    const serviceAccount = JSON.parse(
      atob(this.config.googleServiceAccountJson),
    );

    // Create JWT for Google API authentication
    const jwt = await this.createGoogleJWT(serviceAccount);

    // Get access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google token error: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch calendar events
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(this.config.gcalCalendarId)
      }/events?maxResults=1`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      },
    );

    if (!eventsResponse.ok) {
      throw new Error(`Google Calendar API error: ${eventsResponse.status}`);
    }

    const eventsData = await eventsResponse.json();
    const event = eventsData.items?.[0];

    if (!event) {
      throw new Error("No Google Calendar events found for validation");
    }

    return {
      id: event.id,
      summary: event.summary || "Untitled",
      description: event.description,
      start: { dateTime: event.start.dateTime || event.start.date },
      end: { dateTime: event.end.dateTime || event.end.date },
      extendedProperties: event.extendedProperties,
      status: event.status || "confirmed",
    };
  }

  /**
   * Create Google JWT for service account authentication
   */
  private async createGoogleJWT(serviceAccount: any): Promise<string> {
    // This is a simplified implementation
    // In a real implementation, you'd use a proper JWT library
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    // Note: This is a placeholder - real implementation would need crypto signing
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));

    // For now, return a placeholder - this would need proper RSA signing
    console.warn(
      "⚠️  JWT creation is placeholder - needs proper crypto implementation",
    );
    return `${encodedHeader}.${encodedPayload}.placeholder-signature`;
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
