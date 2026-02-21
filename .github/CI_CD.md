# CI/CD Documentation

This repository uses GitHub Actions for continuous integration and continuous delivery. This document describes the workflows and how to use them.

## Workflows

### 1. CI Workflow (`ci.yml`)

**Triggers:**
- Push to `main` or `master` branches
- Pull requests to `main` or `master` branches

**Jobs:**
- **Build and Test**: Runs on Node.js 18.x and 20.x
  - Installs dependencies
  - Builds all packages
  - Runs tests (continues on error since test infrastructure may be incomplete)
  - Verifies build artifacts

- **Lint**: Runs on Node.js 20.x
  - Type checks using TypeScript
  - Validates build process

- **Security**: Runs on Node.js 20.x
  - Runs `npm audit` for high/critical vulnerabilities
  - Reports security issues

### 2. Security Audit Workflow (`security.yml`)

**Triggers:**
- Scheduled: Daily at 9 AM UTC
- Manual trigger via workflow_dispatch
- Push to `main` or `master` branches

**Jobs:**
- **NPM Security Audit**:
  - Runs comprehensive security audit
  - Fails on critical or high severity vulnerabilities
  - Uploads audit results as artifacts (retained for 30 days)

### 3. CodeQL Security Scanning (`codeql.yml`)

**Triggers:**
- Push to `main` or `master` branches
- Pull requests to `main` or `master` branches
- Scheduled: Every Monday at 2 AM UTC

**Jobs:**
- **Code Analysis**:
  - Scans JavaScript/TypeScript code for security vulnerabilities
  - Integrates with GitHub Security tab
  - Provides detailed security advisories

### 4. Release Workflow (`release.yml`)

**Triggers:**
- Push of tags matching `v*.*.*` (e.g., v2.1.0)
- Manual trigger via workflow_dispatch

**Jobs:**
- **Create Release**:
  - Installs dependencies and builds packages
  - Creates GitHub Release from tag
  - **Optional**: Publishes to NPM (currently disabled)

**To create a release:**

```bash
# Tag the release
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin v2.1.0
```

### 5. Dependabot (`dependabot.yml`)

**Configuration:**
- Checks for npm dependency updates weekly (Mondays at 9 AM)
- Checks for GitHub Actions updates weekly
- Groups minor and patch updates together
- Automatically creates PRs for updates

## Setting Up CI/CD

### Required Secrets (for NPM publishing)

If you want to enable NPM publishing, add these secrets in your repository settings:

1. Go to Settings → Secrets and variables → Actions
2. Add `NPM_TOKEN`:
   - Generate a token at https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Select "Automation" token type
   - Add as repository secret

### Enabling NPM Publishing

Edit `.github/workflows/release.yml` and change:

```yaml
- name: Publish to NPM (optional)
  if: false  # Change to true when ready
```

to:

```yaml
- name: Publish to NPM (optional)
  if: true  # Publishing enabled
```

## Workflow Status

You can check the status of workflows:

- **Dashboard**: https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions
- **Per-workflow**: Click on individual workflow names
- **Badges**: Status badges are displayed in the README

## Local Testing

### Test Build Process

```bash
# Clean and rebuild
npm run clean
npm run build

# Verify build artifacts
ls -la packages/*/build/
```

### Test Security

```bash
# Run security audit
npm audit

# Fix automatically (if possible)
npm audit fix
```

### Test TypeScript

```bash
# Type check all packages
npm run build
```

## Troubleshooting

### Build Failures

1. Check Node.js version compatibility (18.x or 20.x)
2. Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
3. Check for TypeScript errors: `npm run build`

### Security Audit Failures

1. Review vulnerabilities: `npm audit`
2. Try automatic fixes: `npm audit fix`
3. For breaking changes: `npm audit fix --force` (use with caution)
4. Update individual packages: `npm update <package-name>`

### CodeQL Failures

1. Check the Security tab for detailed findings
2. Review CodeQL alerts in the workflow output
3. Fix security issues in the code
4. Re-run the workflow after fixes

## Best Practices

### Pull Requests

- All PRs must pass CI checks before merging
- Address any security warnings
- Keep PRs focused and small
- Include tests for new features

### Releases

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Update CHANGELOG.md before releasing
- Test thoroughly before creating release tags
- Tag format: `v2.1.0` (with 'v' prefix)

### Dependencies

- Review Dependabot PRs regularly
- Test dependency updates before merging
- Keep dependencies up to date for security
- Pin critical dependency versions if needed

## Workflow Permissions

All workflows have appropriate permissions:

- **Read**: Source code, actions logs
- **Write**: Only where needed (release creation, security events)
- **Security-events**: For CodeQL analysis results

## Maintenance

### Weekly Tasks

- Review Dependabot PRs
- Check security audit results
- Review CodeQL findings

### Monthly Tasks

- Review workflow efficiency
- Update workflow versions
- Check for new GitHub Actions features

### After Major Changes

- Run full CI locally before pushing
- Verify all workflows pass
- Check security audit results
- Update documentation

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
