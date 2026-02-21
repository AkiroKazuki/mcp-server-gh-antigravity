# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take the security of Antigravity OS seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Create a Public Issue

Please **do not** open a public GitHub issue if the bug is a security vulnerability.

### 2. Report Privately

Send a detailed report to the repository maintainer via GitHub's private vulnerability reporting feature:

1. Go to the [Security tab](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/security)
2. Click "Report a vulnerability"
3. Fill out the advisory form with details

Alternatively, you can contact the maintainers directly through GitHub.

### 3. Include These Details

Your report should include:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Affected versions**
- **Your environment** (Node.js version, OS, etc.)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt of your report within 48 hours
- **Assessment**: We'll assess the vulnerability and determine its severity
- **Fix Timeline**: We'll provide an estimated timeline for a fix
- **Disclosure**: We'll coordinate the disclosure timeline with you

## Security Best Practices for Users

### Environment Variables

Never commit sensitive data to the repository:
- API keys
- Tokens
- Passwords
- Private configuration

Use environment variables and `.env` files (which are in `.gitignore`).

### User Data Directories

The following directories contain user-specific data and should **never** be committed:
- `.memory/` - Contains your memory database, configurations, and usage data
- `.skills/` - Contains your custom skill files

These are already in `.gitignore`, but be careful not to force-add them.

### Budget Configuration

Review budget limits in `.memory/config/budget.json`:
```json
{
  "daily_limit_usd": 2,
  "weekly_limit_usd": 10,
  "monthly_limit_usd": 30
}
```

Adjust these according to your needs to prevent unexpected costs.

### Git History

If you accidentally commit sensitive data:
1. **Do not** just delete the file and commit - it remains in git history
2. Use `git filter-branch` or `git filter-repo` to remove it from history
3. Force push the cleaned history
4. **Immediately rotate** any exposed secrets

### Dependencies

Keep dependencies up to date:
```bash
npm audit
npm audit fix
```

## Known Security Considerations

### 1. Prompt Injection

The Copilot Server executes prompts. While we validate inputs, be cautious:
- Review generated prompts before execution
- Don't blindly trust user-provided templates
- Use the `copilot_preview` tool to inspect before running

### 2. File System Access

Memory and Copilot servers have file system access:
- They operate within `PROJECT_ROOT`
- Use proper path validation
- Don't expose sensitive directories

### 3. SQLite Databases

`.memory/antigravity.db` stores metadata:
- Don't commit this to public repositories
- Ensure proper file permissions (readable only by you)
- Regular backups recommended

### 4. Cost Tracking

Budget enforcement helps prevent runaway costs:
- Set appropriate limits
- Monitor usage via `get_cost_summary`
- Enable alerts via `alert_threshold`

## Disclosure Policy

- We will coordinate disclosure with the reporter
- Fixes will be released before public disclosure
- Credit will be given to the reporter (unless they prefer anonymity)
- CVE IDs will be requested for significant vulnerabilities

## Security Updates

Security updates will be:
- Released as patch versions
- Documented in `CHANGELOG.md`
- Announced in the repository's Security Advisories
- Tagged with `[SECURITY]` in release notes

## Questions?

For general security questions (not vulnerabilities), feel free to:
- Open a GitHub Discussion
- Contact maintainers through GitHub

Thank you for helping keep Antigravity OS secure! 🔒
