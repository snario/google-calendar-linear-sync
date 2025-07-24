/**
 * Real API Clients for Linear and Google Calendar
 * Production implementations that talk to actual APIs
 */

import { GCalApiClient, LinearApiClient } from "./actuator.ts";
import { GCalEvent, LinearIssue } from "./types.ts";

export interface RealLinearConfig {
  apiKey: string;
  teamId: string;
}

export interface RealGCalConfig {
  serviceAccountJson: string; // Base64 encoded
  calendarId: string;
}

/**
 * Real Linear API client using GraphQL
 */
export class RealLinearApiClient implements LinearApiClient {
  constructor(private config: RealLinearConfig) {}

  async createIssue(issue: Partial<LinearIssue>): Promise<LinearIssue> {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            title
            description
            state {
              name
            }
            estimate
            dueDate
            team {
              id
            }
          }
        }
      }
    `;

    const input = {
      teamId: this.config.teamId,
      title: issue.title,
      description: issue.description,
      stateId: await this.getStateId(issue.state || "Triage"),
      estimate: issue.estimate,
      dueDate: issue.targetDate,
    };

    const response = await this.graphqlRequest(mutation, { input });

    if (!response.data?.issueCreate?.success) {
      throw new Error("Failed to create Linear issue");
    }

    const createdIssue = response.data.issueCreate.issue;

    // Custom fields not needed - using description metadata instead

    return this.formatLinearIssue(createdIssue);
  }

  async updateIssue(
    id: string,
    updates: Partial<LinearIssue>,
  ): Promise<LinearIssue> {
    const mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            title
            description
            state {
              name
            }
            estimate
            dueDate
            team {
              id
            }
          }
        }
      }
    `;

    const input: any = {};

    if (updates.title) input.title = updates.title;
    if (updates.description !== undefined) {
      input.description = updates.description;
    }
    if (updates.state) input.stateId = await this.getStateId(updates.state);
    if (updates.estimate !== undefined) input.estimate = updates.estimate;
    if (updates.targetDate !== undefined) input.dueDate = updates.targetDate;

    const response = await this.graphqlRequest(mutation, { id, input });

    if (!response.data?.issueUpdate?.success) {
      throw new Error("Failed to update Linear issue");
    }

    // Custom fields not needed - using description metadata instead

    return this.formatLinearIssue(response.data.issueUpdate.issue);
  }

  getIssues(teamId: string): Promise<LinearIssue[]> {
    // Legacy method - use getTargetedIssues instead
    return this.getTargetedIssues(teamId, []);
  }

  async getTargetedIssues(
    teamId: string,
    referencedIds: string[],
  ): Promise<LinearIssue[]> {
    const issues: LinearIssue[] = [];

    // 1. Fetch specific issues referenced by GCal events
    if (referencedIds.length > 0) {
      console.log(
        `🔍 Fetching ${referencedIds.length} issues referenced by GCal events...`,
      );

      for (const issueId of referencedIds) {
        try {
          const issue = await this.getSingleIssue(issueId);
          if (issue) {
            issues.push(issue);
          }
        } catch (error) {
          console.warn(
            `⚠️  Failed to fetch referenced issue ${issueId}:`,
            error,
          );
        }
      }
    }

    // 2. Fetch all "Scheduled" issues
    console.log("🔍 Fetching all Scheduled issues...");
    const scheduledIssues = await this.getScheduledIssues(teamId);

    // Merge, avoiding duplicates
    const existingIds = new Set(issues.map((i) => i.id));
    for (const issue of scheduledIssues) {
      if (!existingIds.has(issue.id)) {
        issues.push(issue);
      }
    }

    console.log(
      `📋 Fetched ${issues.length} targeted Linear issues (${referencedIds.length} referenced + ${scheduledIssues.length} scheduled, ${
        issues.length - referencedIds.length - scheduledIssues.length
      } overlapping)`,
    );

    return issues;
  }

  private async getSingleIssue(issueId: string): Promise<LinearIssue | null> {
    const query = `
      query GetIssue($issueId: String!) {
        issue(id: $issueId) {
          id
          title
          description
          state {
            name
          }
          estimate
          dueDate
          team {
            id
          }
        }
      }
    `;

    const response = await this.graphqlRequest(query, { issueId });
    const issue = response.data?.issue;

    return issue ? this.formatLinearIssue(issue) : null;
  }

  private async getScheduledIssues(_teamId: string): Promise<LinearIssue[]> {
    const query = `
      query GetScheduledIssues {
        issues(first: 100, filter: { state: { name: { eq: "Scheduled" } } }) {
          nodes {
            id
            title
            description
            state {
              name
            }
            estimate
            dueDate
            team {
              id
            }
          }
        }
      }
    `;

    const response = await this.graphqlRequest(query, {});
    const issues = response.data?.issues?.nodes || [];

    return issues.map((issue: any) => this.formatLinearIssue(issue));
  }

  private async graphqlRequest(query: string, variables: any): Promise<any> {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Authorization": this.config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
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

    return data;
  }

  private async getStateId(stateName: string): Promise<string> {
    const query = `
      query GetStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const response = await this.graphqlRequest(query, {
      teamId: this.config.teamId,
    });
    const states = response.data?.team?.states?.nodes || [];
    const state = states.find((s: any) => s.name === stateName);

    if (!state) {
      throw new Error(`State "${stateName}" not found`);
    }

    return state.id;
  }

  private formatLinearIssue(issue: any): LinearIssue {
    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      state: issue.state.name,
      targetDate: issue.dueDate,
      estimate: issue.estimate,
    };
  }
}

/**
 * Real Google Calendar API client
 */
export class RealGCalApiClient implements GCalApiClient {
  private accessToken?: string;
  private tokenExpiry?: number;

  constructor(private config: RealGCalConfig) {}

  async createEvent(event: Partial<GCalEvent>): Promise<GCalEvent> {
    await this.ensureAccessToken();

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(this.config.calendarId)
      }/events`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end,
          extendedProperties: event.extendedProperties,
          status: event.status || "confirmed",
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Calendar API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const createdEvent = await response.json();
    return this.formatGCalEvent(createdEvent);
  }

  async updateEvent(
    id: string,
    updates: Partial<GCalEvent>,
  ): Promise<GCalEvent> {
    await this.ensureAccessToken();

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(this.config.calendarId)
      }/events/${id}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: updates.summary,
          description: updates.description,
          start: updates.start,
          end: updates.end,
          extendedProperties: updates.extendedProperties,
          status: updates.status,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Calendar API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const updatedEvent = await response.json();
    return this.formatGCalEvent(updatedEvent);
  }

  async getEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<GCalEvent[]> {
    await this.ensureAccessToken();

    const params = new URLSearchParams({
      timeMin: timeMin ||
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: timeMax ||
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: "100",
      singleEvents: "true",
      orderBy: "startTime",
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(calendarId)
      }/events?${params}`,
      {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Calendar API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const data = await response.json();
    const events = data.items || [];

    return events.map((event: any) => this.formatGCalEvent(event));
  }

  async copyEventToCalendar(
    eventId: string,
    targetCalendarId: string,
    title?: string,
  ): Promise<GCalEvent> {
    await this.ensureAccessToken();

    // First get the original event
    const getResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(this.config.calendarId)
      }/events/${eventId}`,
      {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
        },
      },
    );

    if (!getResponse.ok) {
      throw new Error(`Failed to get event for copying: ${getResponse.status}`);
    }

    const originalEvent = await getResponse.json();

    // Create a copy in the target calendar
    const copyResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(targetCalendarId)
      }/events`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title || originalEvent.summary, // Use provided title or original
          description: originalEvent.description,
          start: originalEvent.start,
          end: originalEvent.end,
          extendedProperties: originalEvent.extendedProperties,
        }),
      },
    );

    if (!copyResponse.ok) {
      throw new Error(`Failed to copy event: ${copyResponse.status}`);
    }

    const copiedEvent = await copyResponse.json();
    return this.formatGCalEvent(copiedEvent);
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return; // Token is still valid
    }

    // Decode service account - handle both base64 encoded and plain JSON
    let serviceAccountJson: string;
    try {
      // Try to decode as base64 first
      serviceAccountJson = atob(this.config.serviceAccountJson);
    } catch {
      // If base64 decode fails, assume it's already plain JSON
      serviceAccountJson = this.config.serviceAccountJson;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    // Create JWT (simplified - would need proper crypto in production)
    const jwt = await this.createJWT(serviceAccount);

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    const tokenData = await response.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
  }

  private async createJWT(serviceAccount: any): Promise<string> {
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const message = `${encodedHeader}.${encodedPayload}`;

    try {
      // Import the private key
      const privateKeyPem = serviceAccount.private_key;
      const privateKey = await this.importPrivateKey(privateKeyPem);

      // Sign the message
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        privateKey,
        new TextEncoder().encode(message),
      );

      const encodedSignature = this.base64UrlEncode(signature);
      return `${message}.${encodedSignature}`;
    } catch (error) {
      console.error("JWT signing failed:", error);
      throw new Error(
        "Failed to create JWT: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private base64UrlEncode(data: string | ArrayBuffer): string {
    let base64: string;
    if (typeof data === "string") {
      base64 = btoa(data);
    } else {
      base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    }
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    // Remove header and footer and whitespace
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s/g, "");

    // Convert to binary
    const binaryDer = atob(pemContents);
    const der = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      der[i] = binaryDer.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
      "pkcs8",
      der,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );
  }

  private formatGCalEvent(event: any): GCalEvent {
    return {
      id: event.id,
      summary: event.summary || "Untitled",
      description: event.description,
      start: {
        dateTime: event.start.dateTime,
        date: event.start.date,
      },
      end: {
        dateTime: event.end.dateTime,
        date: event.end.date,
      },
      extendedProperties: event.extendedProperties,
      status: event.status || "confirmed",
    };
  }
}
