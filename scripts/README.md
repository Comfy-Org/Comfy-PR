# Database Migration Scripts

This directory contains database migration and maintenance scripts for the Comfy-PR project.

## Performance Index Setup

### setup-performance-indexes.ts

Creates critical indexes identified by MongoDB Performance Advisor to dramatically improve query performance.

**Expected Impact:**

- SlackMsgs queries: **637ms → <50ms** (92% improvement)
- CNRepos queries: **420ms → <100ms** (76% improvement)
- Disk I/O reduction: **~823.8 MB** per query cycle
- Query targeting ratio: **79,841:1 → ~1:1**

**Usage:**

```bash
# Run the migration
bun scripts/setup-performance-indexes.ts

# Or use npm/yarn
npm run db:setup-indexes
```

**What it does:**

1. Creates `idx_status_mtime` index on SlackMsgs collection
2. Creates `idx_states_mtimes` compound index on CNRepos collection
3. Creates supporting `idx_pulls_mtime` index on CNRepos
4. Verifies all indexes were created successfully

**Safety:**

- All indexes are created with `background: true` (non-blocking)
- Script is idempotent (safe to run multiple times)
- Existing indexes are preserved
- No data is modified

**When to run:**

- After initial deployment
- After pulling performance optimization changes
- When Performance Advisor shows index recommendations
- Before major production deployments

**Monitoring:**
After running, monitor:

- MongoDB Atlas Performance Advisor
- Query execution times (should decrease significantly)
- Disk I/O metrics
- Query targeting ratios

**Related Documentation:**

- `../PERFORMANCE-FIXES.md` - Detailed performance fixes and implementation guide
- [MongoDB Index Best Practices](https://www.mongodb.com/docs/manual/indexes/)
- [Query Optimization](https://www.mongodb.com/docs/manual/core/query-optimization/)

---

## Adding New Migration Scripts

When adding new migration scripts:

1. **Naming Convention:** `<verb>-<description>.ts`
   - Examples: `setup-indexes.ts`, `migrate-schema-v2.ts`, `cleanup-old-data.ts`

2. **Script Structure:**

   ```typescript
   #!/usr/bin/env bun
   import { db } from "@/src/db";

   async function migrateSomething() {
     // Migration logic here
   }

   if (import.meta.main) {
     try {
       await migrateSomething();
     } finally {
       await db.close();
     }
   }

   export { migrateSomething };
   ```

3. **Documentation:**
   - Add description header in the script
   - Update this README with usage instructions
   - Include expected impact and safety notes

4. **Best Practices:**
   - Make scripts idempotent (safe to run multiple times)
   - Use `background: true` for index creation
   - Add proper error handling
   - Log progress clearly
   - Export functions for testing

---

## Troubleshooting

### "Index already exists" error

This is normal and safe. The script will detect and skip existing indexes.

### "Insufficient permissions" error

Ensure your MongoDB user has `dbAdmin` or `clusterAdmin` role.

### Script hangs or times out

- Check MongoDB Atlas connectivity
- Verify network access (IP whitelist)
- Large collections may take longer (background indexing is normal)

### How to check index status

```typescript
// Check SlackMsgs indexes
await db.collection("SlackMsgs").listIndexes().toArray();

// Check CNRepos indexes
await db.collection("CNRepos").listIndexes().toArray();

// Check index build progress
await db.admin().command({
  currentOp: 1,
  "command.createIndexes": { $exists: true },
});
```

---

## Support

For issues or questions:

- Check MongoDB Atlas Performance Advisor
- Review `../PERFORMANCE-FIXES.md` documentation
- Open an issue in the repository
