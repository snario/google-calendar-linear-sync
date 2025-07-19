# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Test**: `deno task test`
**Sync**: `deno task sync`
**Dry Run**: `deno task dry-run`
**Check Environment**: `deno task check`
**Validate APIs**: `deno task validate`
**Setup Guide**: `deno task setup`
**Format**: `deno fmt` (configured for 2-space indents, 80-char lines, semicolons)
**Lint**: `deno lint`

Available deno tasks:

- `deno task test` - Run unit tests
- `deno task sync` - Run real sync with production data
- `deno task dry-run` - Run sync with real data in dry-run mode (no changes made)
- `deno task check` - Check environment configuration
- `deno task validate` - Validate API structure and mock compatibility
- `deno task setup` - Show Val Town configuration guide

## Architecture Overview

This is a **bidirectional sync system** between Linear issues and Google Calendar events using the **Declarative Reconciliation Loop (DRL)** pattern. The system follows a strict **Observe → Project → Diff → Actuate** cycle.

### Core Components

- **Worker** (`src/worker.ts`): Main orchestrator that coordinates the sync process
- **Projector** (`src/projector.ts`): Converts external data into canonical items
- **Diff Engine** (`src/diff.ts`): Computes operations needed to reach desired state
- **Actuator** (`src/actuator.ts`): Executes operations against external APIs
- **API Clients** (`src/api-clients.ts`): Handle Linear and Google Calendar API communication

### DRL Pattern Implementation

The sync operates in 4 phases:

1. **Observe**: Fetch current snapshots from Linear and Google Calendar APIs
2. **Project**: Create canonical truth using deterministic, side-effect-free functions
3. **Diff**: Compare canonical state with external reality to compute minimal operations
4. **Actuate**: Execute idempotent API calls until external systems match canonical truth

### Phase Transitions

The system recognizes 5 phases with specific transition rules:

| Phase        | Description                        | Triggers                    |
| ------------ | ---------------------------------- | --------------------------- |
| `eventOnly`  | GCal event without Linear match    | New calendar event created  |
| `linearOnly` | Linear issue without GCal match    | Issue marked as "Scheduled" |
| `active`     | Linked and syncing                 | Both systems have records   |
| `completed`  | Linear marked done/canceled/failed | State change in Linear      |
| `overdue`    | Past deadline but still active     | >24h after event end        |

### Key Technical Details

- **Stateless**: No database required; all state lives in remote systems via UID linkages
- **Metadata Format**: Bidirectional linking via `extendedProperties` (GCal) and description metadata (Linear)
- **Val Town Platform**: Built for Val Town deployment with specific constraints
- **Time Handling**: Uses dayjs with timezone support, 24-hour windows for state transitions
- **Dependencies**: googleapis, graphql-request, dayjs, uuid (imported via deno.json)

### Configuration Structure

The system expects environment variables:

- `LINEAR_API_KEY`: Linear API token
- `LINEAR_TEAM_ID`: Linear team identifier
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Base64-encoded Google service account JSON
- `GCAL_CALENDAR_ID`: Primary calendar ID
- `GCAL_HISTORY_CALENDAR_ID`: (Optional) Calendar for overdue items
- `TIMEZONE`: Timezone for operations (default: America/New_York)

### Testing

All core logic (worker, projector, diff, actuator) has comprehensive unit tests with 31 test cases total. Tests use Deno's built-in test framework with mocked API responses to ensure deterministic behavior.

### File Structure

```
src/
├── types.ts          # Core data models and interfaces
├── projector.ts      # Observe → Project (create canonical truth)
├── diff.ts           # Project → Diff (compute operations)
├── actuator.ts       # Diff → Actuate (execute operations)
├── worker.ts         # Main sync orchestrator
├── api-clients.ts    # Linear and Google Calendar API clients
├── main.ts           # Entry point for sync execution
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

### Debugging and Utilities

- **Development Tasks**: Use `deno task` commands for environment checks, API validation, and testing
- **Debug Scripts**: Helper scripts in `scripts/` directory for data inspection:
  - `show-gcal.ts` - View Google Calendar events
  - `show-linear.ts` - View Linear issues
  - `show-canonical.ts` - View canonical projection
  - `show-all.ts` - Complete data flow analysis
- **Val Town Deployment**: Use `scripts/val-town-config.ts` for deployment helpers
