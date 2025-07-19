# Debug Scripts

Simple CLI utilities to inspect the sync system data flow.

## Prerequisites

Create `.env` file with your credentials:

```bash
cp .env.example .env
# Edit .env with your actual API keys
```

## Available Scripts

### Show Google Calendar Events

```bash
deno run --allow-env --allow-net --env-file=.env scripts/show-gcal.ts
```

Shows all GCal events with linking metadata in a markdown table.

### Show Linear Issues

```bash
deno run --allow-env --allow-net --env-file=.env scripts/show-linear.ts
```

Shows targeted Linear issues (scheduled + referenced) with calendar metadata in a markdown table.

### Show Canonical Items

```bash
deno run --allow-env --allow-net --env-file=.env scripts/show-canonical.ts
```

Shows the projector output - canonical items created from Linear + GCal data using optimized querying.

### Show Complete Data Flow

```bash
deno run --allow-env --allow-net --env-file=.env scripts/show-all.ts
```

Complete analysis showing GCal → Linear → Canonical flow with linking statistics using optimized querying.

## Debugging Workflow

1. **Check raw data**: Use `show-gcal.ts` and `show-linear.ts`
2. **Verify linking**: Use `show-canonical.ts`
3. **Full analysis**: Use `show-all.ts`

This helps quickly identify:

- Missing linking metadata
- Unexpected phase classifications
- Items that should be linked but aren't
- Overall sync system health
