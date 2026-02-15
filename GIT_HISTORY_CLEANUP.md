# Git History Cleanup - IMPORTANT

## What Happened

On February 15, 2026, we performed a **complete git history rewrite** to remove sensitive files that were accidentally committed in early versions of this repository.

## Files Removed from History

The following files were completely removed from all git commits:

### User Data Directories
- `.memory/config/budget.json`
- `packages/analytics-server/.memory/config/budget.json`

### Build Artifacts (18 files)
- `packages/analytics-server/build/*.js` and `*.d.ts`
- `packages/copilot-server/build/*.js` and `*.d.ts`
- `packages/memory-server/build/*.js` and `*.d.ts`

## Impact

- **All commit hashes changed** - History was rewritten using `git filter-branch`
- **Old commit references are invalid** - Any bookmarks or references to old commits will not work
- **Force push required** - Remote history will be overwritten

## For Contributors

If you had a local clone before this cleanup:

1. **Delete your local clone** and re-clone the repository
2. Or force-reset your local branches:
   ```bash
   git fetch origin
   git reset --hard origin/main  # or your branch name
   ```

## Verification

You can verify the cleanup was successful:

```bash
# Search for any .memory or build files in history (should return empty)
git log --all --pretty=format: --name-only | sort -u | grep -E "(\.memory/|build/)"

# Search for any budget.json files (should return empty)
git rev-list --all --objects | grep budget.json
```

## Why This Was Necessary

These files should never have been committed because:
1. `.memory/` contains user-specific project data that could be sensitive
2. `build/` artifacts are generated files that should not be version controlled
3. Both were security risks when making the repository public

## Current Protection

The following protections are now in place:
- ✅ `.gitignore` properly configured to exclude these paths
- ✅ Complete git history cleaned
- ✅ Documentation updated with security warnings
- ✅ `SECURITY.md` added with best practices

---

**Last Updated**: February 15, 2026
**Cleanup Method**: `git filter-branch` + `git gc --aggressive`
**Commits Before**: 5 commits
**Commits After**: 4 commits
