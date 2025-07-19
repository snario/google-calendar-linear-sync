# Google Calendar ↔ Linear Sync Worker

A stateless, deterministic sync worker implementing the **Declarative Reconciliation Loop (DRL)** pattern to bidirectionally sync Google Calendar events and Linear issues.

## Architecture Overview

This refactored implementation follows a strict **Observe → Project → Diff → Actuate** pattern:

1. **Observe**: Fetch current snapshots from Linear and Google Calendar APIs
2. **Project**: Create a canonical truth using deterministic, side-effect-free functions
3. **Diff**: Compare canonical state with external reality to compute minimal operations
4. **Actuate**: Execute idempotent API calls until external systems match canonical truth

### Key Design Principles

- **Stateless**: No database required; all state lives in remote systems via UID linkages
- **Deterministic**: Pure functions ensure identical inputs always produce identical outputs
- **Idempotent**: Operations can be safely retried without side effects
- **Minimal**: Only necessary changes are made to external systems

## Core Data Models

### Google Calendar Event (`GCalEvent`)

```typescript
interface GCalEvent {
  id: string; // Primary key (never edited)
  summary: string; // Prefix + human title
  description?: string; // Freeform notes
  start: { dateTime: string }; // ISO 8601 UTC
  end: { dateTime: string }; // ISO 8601 UTC
  extendedProperties?: {
    private?: {
      uid?: string; // Canonical UID linking to Linear
      linearIssueId?: string; // Back-pointer to Linear issue
    };
  };
  status: "confirmed" | "cancelled";
}
```

### Linear Issue (`LinearIssue`)

```typescript
interface LinearIssue {
  id: string; // Primary key
  title: string; // Prefix + human title
  description?: string; // Long notes + calendar metadata
  state: "Triage" | "Scheduled" | "Done" | "Canceled" | "Failed";
  targetDate?: string; // ISO 8601 datetime
  // Note: Linear API doesn't support custom fields - use description metadata instead
}
```

### Canonical Item (`CanonicalItem`)

The unified representation that bridges both systems:

```typescript
interface CanonicalItem {
  uid: string; // Stable identifier across systems
  title: string; // Clean title (no prefix)
  description?: string;
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  linearId?: string;
  gcalId?: string;
  linearState?: LinearIssue["state"];
  phase: Phase; // Current lifecycle phase
  lastModified: string; // For conflict resolution
}
```

## Phase Transitions

The system recognizes 5 phases with specific transition rules:

| Phase        | Description                        | Triggers                    |
| ------------ | ---------------------------------- | --------------------------- |
| `eventOnly`  | GCal event without Linear match    | New calendar event created  |
| `linearOnly` | Linear issue without GCal match    | Issue marked as "Scheduled" |
| `active`     | Linked and syncing                 | Both systems have records   |
| `completed`  | Linear marked done/canceled/failed | State change in Linear      |
| `overdue`    | Past deadline but still active     | >24h after event end        |

### Transition Actions

| From → To             | Trigger                             | Action                                          | Result Prefix |
| --------------------- | ----------------------------------- | ----------------------------------------------- | ------------- |
| `eventOnly → active`  | GCal event exists                   | Create Linear issue (Triage)                    | 📥            |
| `linearOnly → active` | Linear state = "Scheduled"          | Create GCal event                               | 📅            |
| `active → completed`  | Linear state = Done/Canceled/Failed | Update GCal title                               | ✅/🚫/❌      |
| `active → overdue`    | >24h past event end                 | Mark original as worked (⏳) + create new event | ⏳ + 📅       |

### Prefix Meanings

- **📥 Triage**: New items from Google Calendar awaiting review
- **📅 Scheduled**: Items scheduled for specific times
- **✅ Done**: Completed items
- **🚫 Canceled**: Canceled items
- **❌ Failed**: Failed items
- **⏳ Worked**: Original events that went overdue (shows work was done)

| `active → active` | Title/time/description change | Sync metadata | (unchanged) |

## Bidirectional Linking

The system uses two linking mechanisms:

1. **GCal → Linear**: `extendedProperties.private.linearIssueId` in calendar events
2. **Linear → GCal**: Description metadata `<!-- calendar-sync --> GoogleCalEventId:xyz` in Linear issues

This approach works because:

- Google Calendar API supports `extendedProperties` for metadata storage
- Linear API doesn't support custom fields, so we embed metadata in descriptions
- Both systems preserve their metadata across updates

## Conflict Resolution

- **Title**: Linear wins (source of truth for task names)
- **Start/End Times**: Calendar wins (source of truth for scheduling)
- **Description**: Newest `updatedAt` wins (simplified to Linear in current implementation)

## File Structure

```
src/
├── types.ts          # Core data models and interfaces
├── projector.ts      # Observe → Project (create canonical truth)
├── diff.ts           # Project → Diff (compute operations)
├── actuator.ts       # Diff → Actuate (execute operations)
├── worker.ts         # Main sync orchestrator
├── main.ts           # Entry point with configuration
├── dry-run.ts        # Dry run mode for testing
└── *.test.ts         # Comprehensive test suite

scripts/
├── check.ts          # Environment configuration checker
├── validate.ts       # API structure validator
├── setup.ts          # Val Town setup guide
├── show-*.ts         # Debug scripts for data inspection
├── api-validator.ts  # API structure validation
├── val-town-config.ts # Val Town deployment helpers
└── README.md         # Script documentation
```

## Usage

### Development Tasks

```bash
# Check environment and configuration
deno task check

# Validate API structure
deno task validate

# Test sync logic with real data (no changes)
deno task dry-run

# Show setup guide for Val Town
deno task setup

# Run unit tests
deno task test
```

### Running Tests

```bash
deno task test
```

### Running Sync

```bash
# Create .env file with your credentials
cp .env.example .env
# Edit .env with your actual API keys

# Run sync
deno task sync

# Or run with dry-run mode first
deno task dry-run
```

#### Environment Variables

Create a `.env` file with:

```bash
LINEAR_API_KEY="your-linear-api-key"
LINEAR_TEAM_ID="your-team-id"
GOOGLE_SERVICE_ACCOUNT_JSON="base64-encoded-service-account"
GCAL_CALENDAR_ID="your-calendar-id"
```

### Debug Scripts

```bash
# View Google Calendar events
deno run --allow-env --allow-net scripts/show-gcal.ts

# View Linear issues
deno run --allow-env --allow-net scripts/show-linear.ts

# View canonical projection
deno run --allow-env --allow-net scripts/show-canonical.ts

# Complete data flow analysis
deno run --allow-env --allow-net scripts/show-all.ts
```

### Configuration

The worker is configured via environment variables:

- `LINEAR_API_KEY`: Linear API token
- `LINEAR_TEAM_ID`: Linear team identifier
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Base64-encoded Google service account JSON
- `GCAL_CALENDAR_ID`: Primary calendar ID
- `GCAL_HISTORY_CALENDAR_ID`: (Optional) Calendar for overdue items
- `TIMEZONE`: Timezone for operations (default: America/New_York)
- `LOOKBACK_DAYS`: Days to look back (default: 2)
- `LOOKAHEAD_DAYS`: Days to look ahead (default: 14)

## Performance Characteristics

- **Latency**: < 5 seconds for 10,000 items (per spec requirement)
- **Memory**: Stateless operation, minimal memory footprint
- **Network**: Batched API calls, efficient pagination
- **Reliability**: Idempotent operations survive failures

## Testing Strategy

The test suite covers:

- **Unit tests**: Individual functions (types, projector, diff)
- **Integration tests**: Full sync workflows with mock APIs
- **Determinism**: Identical inputs produce identical outputs
- **Idempotence**: Operations can be safely retried
- **Performance**: Validates < 5s execution time

## Extending the System

The DRL pattern makes it easy to:

1. Add new external systems (e.g., Notion) by implementing new projectors/actuators
2. Add new phase transitions by updating the diff engine
3. Add new conflict resolution rules in the projector
4. Add webhook triggers by replacing the cron scheduler

## Migration from Legacy

The original implementation has been moved to `backup/` and key concepts have been preserved:

- Bidirectional sync logic
- State machine approach (now phase-based)
- Metadata embedding for linkage
- Prefix-based visual indicators

The new implementation is more robust, testable, and maintainable while preserving all original functionality.
