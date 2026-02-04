# MongoDB Performance Fixes

## Summary

This document tracks the database performance optimizations implemented to fix critical query performance issues identified by MongoDB Atlas Performance Advisor.

**Status:** ✅ Code changes implemented, pending deployment

---

## Issues Fixed

### 1. ✅ SlackMsgs Collection - Missing Index

**Issue:** Queries scanning 80,501 documents to return 1 document
**Impact:** 637ms average query time, 326 MB disk I/O per execution
**Solution:** Added compound index `{ status: 1, mtime: 1 }`
**Expected Improvement:** 637ms → <50ms (92% faster)

**Query Pattern:**

```javascript
db.SlackMsgs.find({
  $or: [
    { status: { $exists: false } },
    { status: { $in: ["pending last", "error"] }, mtime: { $not: { $gt: ... } } }
  ]
})
```

**Files Changed:**

- `lib/slack/SlackMsgs.ts` - Added index creation

### 2. ✅ CNRepos Collection - Missing Compound Index

**Issue:** Queries scanning 4,998 documents to return 25 documents
**Impact:** 420ms average query time, 497.8 MB disk I/O per execution
**Solution:** Added compound index on multiple state and mtime fields
**Expected Improvement:** 420ms → <100ms (76% faster)

**Query Pattern:**

```javascript
db.CNRepos.aggregate([{
  $match: {
    "crPulls.state": "ok",
    "info.state": "ok",
    "crPulls.mtime": { $gte: ... },
    "info.mtime": { $gte: ... },
    "candidate.mtime": { $not: { $gt: ... } }
  }
}])
```

**Files Changed:**

- `src/CNRepos.ts` - Added compound index creation

### 3. ✅ Migration Script Created

**Purpose:** Ensure existing deployments get the new indexes
**Location:** `scripts/setup-performance-indexes.ts`
**Documentation:** `scripts/README.md`

---

## Expected Overall Impact

| Metric                          | Before          | After   | Improvement    |
| ------------------------------- | --------------- | ------- | -------------- |
| **SlackMsgs Query Time**        | 637ms           | <50ms   | 92% faster     |
| **CNRepos Query Time**          | 420ms           | <100ms  | 76% faster     |
| **Disk I/O Reduction**          | ~823.8 MB/cycle | Minimal | 99%+ reduction |
| **Query Targeting (SlackMsgs)** | 79,841:1        | ~1:1    | 99.99% better  |
| **Query Targeting (CNRepos)**   | 2,643:1         | ~2:1    | 99.92% better  |

---

## Deployment Instructions

### For New Deployments

Indexes will be created automatically when the application starts (via collection initialization in `SlackMsgs.ts` and `CNRepos.ts`).

### For Existing Deployments

Run the migration script to create indexes on existing data:

```bash
# Using bun (recommended)
bun scripts/setup-performance-indexes.ts

# Or using npm
npm run db:setup-indexes

# Or using yarn
yarn db:setup-indexes
```

**Timeline:** Indexes are created in the background and won't block the database. Expect:

- Small collections (<10k docs): 1-5 minutes
- Medium collections (10k-100k docs): 5-15 minutes
- Large collections (100k+ docs): 15-60 minutes

**Safety:** The script is:

- ✅ Idempotent (safe to run multiple times)
- ✅ Non-blocking (`background: true`)
- ✅ Non-destructive (only adds indexes)
- ✅ Includes progress logging
- ✅ Includes error handling

---

## Verification

### 1. Check Indexes Were Created

**Via MongoDB Atlas UI:**

1. Navigate to: Database → Collections → SlackMsgs
2. Click "Indexes" tab
3. Verify `idx_status_mtime` exists

Repeat for CNRepos collection to verify `idx_states_mtimes` exists.

**Via mongosh:**

```javascript
// Check SlackMsgs indexes
db.SlackMsgs.getIndexes();

// Check CNRepos indexes
db.CNRepos.getIndexes();
```

### 2. Monitor Performance Improvements

**Within 24 hours:**

- [ ] Performance Advisor shows improvement or clears recommendations
- [ ] Slow query log shows reduced execution times
- [ ] Query Insights shows improved targeting ratios

**Within 1 week:**

- [ ] Disk IOPS metrics decreased
- [ ] Network throughput slightly decreased
- [ ] No new performance alerts triggered

### 3. Performance Advisor Check

Navigate to: MongoDB Atlas → Your Project → Performance Advisor

**Before:**

- 2 "Create Indexes" recommendations
- High impact warnings

**After (expected):**

- 0 critical recommendations
- Previous issues resolved

---

## Monitoring

### Key Metrics to Watch

1. **Query Execution Time**
   - Location: Atlas → Metrics → Query Performance
   - Target: <100ms for most queries
   - Check: Daily for first week, then weekly

2. **Index Usage**
   - Location: Atlas → Performance Advisor → Index Stats
   - Target: >80% usage rate for new indexes
   - Check: Weekly

3. **Disk I/O**
   - Location: Atlas → Metrics → Hardware
   - Target: Decreased IOPS
   - Check: Daily for first week

4. **Active Alerts**
   - Location: Atlas → Alerts
   - Target: 0 performance-related alerts
   - Check: Daily

### Performance Dashboard

Create a custom dashboard tracking:

- Average query execution time (trend)
- Index usage statistics
- Disk I/O metrics
- Query targeting ratios
- Slow query count

---

## Rollback Plan

If performance degrades or issues occur:

### 1. Identify the Problem

```javascript
// Check if specific queries are slower
db.system.profile.find({ millis: { $gt: 1000 } }).sort({ ts: -1 });

// Check index usage
db.SlackMsgs.aggregate([{ $indexStats: {} }]);
```

### 2. Disable Problematic Index

```javascript
// If idx_status_mtime causes issues
db.SlackMsgs.dropIndex("idx_status_mtime");

// If idx_states_mtimes causes issues
db.CNRepos.dropIndex("idx_states_mtimes");
```

### 3. Report Issue

- Document specific queries that regressed
- Capture execution plans (`explain("executionStats")`)
- Check MongoDB logs for warnings
- Open issue in repository with details

---

## Related Documentation

### In This Repository

- `./scripts/README.md` - Migration script documentation and usage guide
- `./scripts/setup-performance-indexes.ts` - Performance index setup script

### External Resources

- [MongoDB Index Best Practices](https://www.mongodb.com/docs/manual/indexes/)
- [Query Optimization](https://www.mongodb.com/docs/manual/core/query-optimization/)
- [Atlas Performance Advisor](https://www.mongodb.com/docs/atlas/performance-advisor/)

---

## Changelog

| Date       | Change                                         | Author           |
| ---------- | ---------------------------------------------- | ---------------- |
| 2026-02-03 | Added missing indexes to SlackMsgs and CNRepos | Performance Team |
| 2026-02-03 | Created migration script                       | Performance Team |
| 2026-02-03 | Added package.json script                      | Performance Team |

---

## Next Steps

- [ ] Deploy code changes to production
- [ ] Run migration script: `bun scripts/setup-performance-indexes.ts`
- [ ] Monitor Performance Advisor (24 hours)
- [ ] Verify query execution improvements (1 week)
- [ ] Update capacity planning based on new metrics (1 month)
- [ ] Review and implement long-term optimization plan (ongoing)

---

**For questions or issues, see:** `./tmp/README-mongodb-performance.md`
