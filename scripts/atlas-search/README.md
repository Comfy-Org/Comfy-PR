# Atlas Search Index Optimization

## Problem

MongoDB Atlas is alerting that the number of search-indexed fields has exceeded 1,000:

```
Atlas Search: Maximum Number of Fields Indexed has gone above 1000
Cluster: comfyorg-prod-cluster-553af61
Current Value: 3,587 fields
```

This happens because Atlas Search is configured with **dynamic mapping**, which automatically indexes every field in documents. Collections like `GithubWebhookEvents` store full GitHub API payloads with hundreds of nested fields, causing massive index bloat.

## Impact

- Slow indexing performance
- Slow search query performance
- Increased storage costs
- Risk of hitting MongoDB limits

## Solution

Replace dynamic mappings with static mappings that only index fields actually used in `$search` queries.

## Quick Fix (Recommended)

### Option 1: Disable Search Indexes Entirely

If you're not using `$search` aggregation stages (which this codebase doesn't appear to use):

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Navigate to: Database → comfyorg-prod-cluster-553af61 → Search Indexes
3. For each search index, click **Delete**
4. Confirm deletion

This immediately resolves the alert with no impact to the application.

### Option 2: Apply Static Mappings via Atlas UI

If search functionality is needed:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Navigate to: Database → comfyorg-prod-cluster-553af61 → Search Indexes
3. For each index:
   - Click **Edit Index**
   - Switch to **JSON Editor** mode
   - Replace the mapping with the corresponding definition from `static-mappings.json`
   - Click **Save Changes**

## Automated Scripts

### Diagnose Current State

```bash
bun scripts/atlas-search/diagnose-search-indexes.ts
```

This script:
- Lists all search indexes across collections
- Identifies indexes with dynamic mapping
- Estimates field counts in problematic collections
- Provides recommendations

### Apply Fix (via MongoDB Driver)

```bash
# Dry run (preview changes)
bun scripts/atlas-search/fix-search-indexes.ts --dry-run

# Apply changes
bun scripts/atlas-search/fix-search-indexes.ts
```

Note: The driver API may not have access to all search index operations depending on cluster configuration. Use the Atlas UI method if the script fails.

## Static Mapping Reference

See `static-mappings.json` for complete mapping definitions.

### Key Principles

1. **Set `dynamic: false`** - Prevents auto-indexing of unmapped fields
2. **Only index queried fields** - Check codebase for actual `$search` usage
3. **Use appropriate analyzers**:
   - `lucene.keyword` for exact match fields (IDs, status, enum values)
   - `lucene.standard` for full-text searchable fields (titles, descriptions)
4. **Nest carefully** - Use `type: "document"` with nested `fields` for subdocuments

### Example: GithubWebhookEvents

Before (dynamic):
```json
{
  "mappings": {
    "dynamic": true
  }
}
```
Field count: ~3,500+

After (static):
```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "eventType": { "type": "string", "analyzer": "lucene.keyword" },
      "receivedAt": { "type": "date" },
      "payload.repository.full_name": { "type": "string", "analyzer": "lucene.keyword" },
      "payload.pull_request.title": { "type": "string", "analyzer": "lucene.standard" }
    }
  }
}
```
Field count: ~15

## Verification

After applying changes:

1. Wait for reindexing to complete (check Status in Atlas UI)
2. The alert should auto-resolve once field count drops below 1,000
3. Verify search queries still work (if any exist)

## Files

- `diagnose-search-indexes.ts` - Diagnostic script
- `fix-search-indexes.ts` - Automated fix script
- `static-mappings.json` - Ready-to-use mapping definitions
- `README.md` - This documentation

## Related Documentation

- [Atlas Search Mappings](https://www.mongodb.com/docs/atlas/atlas-search/define-field-mappings/)
- [Static vs Dynamic Mappings](https://www.mongodb.com/docs/atlas/atlas-search/define-field-mappings/#static-mappings)
- [Field Types](https://www.mongodb.com/docs/atlas/atlas-search/define-field-mappings/#field-types)
