# Scripts

Utilities and tools for the Google Calendar ↔ Linear sync system.

## Prerequisites

Create a `.env` file with your credentials:

```bash
cp .env.example .env
# Edit .env with your actual API keys:

LINEAR_API_KEY="your-api-key"
LINEAR_TEAM_ID="your-team-id"
GOOGLE_SERVICE_ACCOUNT_JSON="base64-encoded-json"
GCAL_CALENDAR_ID="your-calendar-id"
```

## Development Tasks

Use `deno task` commands for all development operations:

```bash
deno task check      # Check environment configuration
deno task validate   # Validate API structure and mock compatibility
deno task dry-run    # Run sync logic with real data (no changes made)
deno task setup      # Show Val Town configuration guide
deno task test       # Run unit tests
deno task sync       # Run production sync
```

## Debug Scripts

### Show Google Calendar Events

```bash
deno run --allow-env --allow-net scripts/show-gcal.ts
```

Shows all GCal events with linking metadata.

### Show Linear Issues

```bash
deno run --allow-env --allow-net scripts/show-linear.ts
```

Shows targeted Linear issues with calendar metadata.

### Show Canonical Items

```bash
deno run --allow-env --allow-net scripts/show-canonical.ts
```

Shows the projector output - canonical items from Linear + GCal data.

### Show Complete Data Flow

```bash
deno run --allow-env --allow-net scripts/show-all.ts
```

Complete analysis showing GCal → Linear → Canonical flow with statistics.

## Utility Tools

### API Validator

```bash
# Used by CLI, can also be imported
import { validateApis } from "./api-validator.ts";
```

Validates that mock data structures match real API responses.

### Val Town Configuration

```bash
# Used by CLI, can also be imported
import { getValTownConfig } from "./val-town-config.ts";
```

Helpers for Val Town environment setup and configuration.

## Debugging Workflow

1. **Environment check**: `deno task check`
2. **API validation**: `deno task validate`
3. **Dry run test**: `deno task dry-run`
4. **Check raw data**: Use `show-gcal.ts` and `show-linear.ts`
5. **Verify linking**: Use `show-canonical.ts`
6. **Full analysis**: Use `show-all.ts`

This helps quickly identify:

- Environment configuration issues
- API structure mismatches
- Missing linking metadata
- Unexpected phase classifications
- Items that should be linked but aren't
- Overall sync system health
