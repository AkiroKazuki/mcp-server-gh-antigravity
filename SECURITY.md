# Security Policy

## Security Considerations

This project provides MCP servers that interact with local file systems and execute git operations. Please review this document carefully before deploying.

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

To report a security vulnerability:
1. Use GitHub's private security reporting feature
2. Or email the maintainers directly (check repository for contact info)
3. Include detailed steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Current Security Status

### ✅ Fixed Issues (v1.0.0)

- **Build artifacts removed from repository**: All `build/` directories now excluded from git
- **Sensitive data protection**: `.memory/` and `.skills/` directories excluded from git to prevent accidental data leaks
- **License and documentation**: Added MIT license and contribution guidelines

### ⚠️ Known Limitations

1. **File System Access**: The servers have full read/write access to the PROJECT_ROOT directory
2. **No Authentication**: MCP servers run locally without authentication (by design)
3. **Input Validation**: Limited validation on file paths and user inputs
4. **Git Operations**: Automatic git commits without signed commits or verification
5. **No Rate Limiting**: Tools can be called repeatedly without throttling
6. **Path Traversal**: Limited protection against directory traversal attacks

## Security Best Practices for Users

### Safe Usage

1. **Isolate PROJECT_ROOT**: Only point `PROJECT_ROOT` at directories you control
2. **Review .memory/ contents**: Regularly audit what's stored in `.memory/` before committing
3. **Use .gitignore**: Ensure `.memory/` and `.skills/` are in your project's `.gitignore`
4. **Limit permissions**: Run with minimal file system permissions necessary
5. **Sandbox environments**: Consider running in containerized environments for production

### What NOT to Do

❌ Do not store API keys, passwords, or credentials in `.memory/` files
❌ Do not point PROJECT_ROOT at system directories
❌ Do not expose MCP server ports to the network
❌ Do not run with root/admin privileges
❌ Do not trust user-provided file paths without validation

## Future Security Improvements

The following improvements are recommended for future versions:

### High Priority

1. **Input Validation & Sanitization**
   - Strict file path validation to prevent directory traversal
   - Sanitize all user inputs before file operations
   - Validate file extensions and content types
   - Maximum file size limits

2. **Path Traversal Protection**
   - Implement path canonicalization
   - Check all paths are within PROJECT_ROOT
   - Block access to hidden files/directories by default
   - Prevent symlink attacks

3. **Git Security**
   - Optional GPG signing for commits
   - Verify git repository integrity before operations
   - Sanitize commit messages
   - Limit automatic commit frequency

### Medium Priority

4. **Rate Limiting**
   - Tool call frequency limits per session
   - File operation throttling
   - Memory/CPU usage monitoring
   - Automatic cooldown periods

5. **Audit Logging**
   - Log all file system operations
   - Track tool usage patterns
   - Security event logging
   - Configurable log retention

6. **Error Handling**
   - Avoid exposing file paths in error messages
   - Sanitize stack traces
   - Generic error responses to external callers
   - Proper exception handling throughout

7. **Configuration Validation**
   - Schema validation for budget.json
   - Secure defaults for all settings
   - Environment variable validation
   - Configuration file permissions check

### Low Priority

8. **Code Quality**
   - Add comprehensive test suite
   - Static code analysis (ESLint security rules)
   - Dependency vulnerability scanning
   - Regular security audits

9. **Documentation**
   - Security architecture diagrams
   - Threat modeling documentation
   - Incident response procedures
   - Security checklist for deployment

10. **Optional Features**
    - Read-only mode for sensitive operations
    - Dry-run mode for testing
    - Operation approval prompts
    - Undo/rollback functionality

## Dependency Security

### Current Dependencies

The project uses these external dependencies:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@xenova/transformers` - Local ML models (no API calls)
- `glob` - File pattern matching
- `simple-git` - Git operations

### Recommendations

1. **Enable Dependabot**: Automatic dependency updates for security patches
2. **Enable GitHub Security Scanning**: CodeQL for vulnerability detection
3. **Regular audits**: Run `npm audit` regularly
4. **Pin versions**: Consider pinning exact versions in production
5. **Minimal dependencies**: Avoid adding unnecessary dependencies

## Threat Model

### Attack Vectors

1. **Malicious file paths**: Crafted paths to access unauthorized files
2. **Code injection**: Through git commit messages or file contents
3. **Resource exhaustion**: Repeated expensive operations
4. **Data exfiltration**: Reading sensitive files via memory operations
5. **Prompt injection**: Malicious content in prompts or templates

### Mitigations

- Strict input validation (to be implemented)
- Sandboxed execution environment (recommended)
- Rate limiting (to be implemented)
- Audit logging (to be implemented)
- User awareness and documentation (current)

## Compliance Considerations

If using this software in regulated environments:

- Review data retention policies for `.memory/` and log files
- Consider data classification requirements
- Implement additional access controls as needed
- Ensure compliance with GDPR, CCPA, or other regulations
- Document security controls and risk assessment

## Security Checklist for Deployment

Before deploying to production:

- [ ] Review all configuration files
- [ ] Ensure `.memory/` and `.skills/` are gitignored
- [ ] Set appropriate file system permissions
- [ ] Configure PROJECT_ROOT to a safe directory
- [ ] Review budget limits in `budget.json`
- [ ] Enable Dependabot and security scanning
- [ ] Document security procedures for your team
- [ ] Set up monitoring and alerting
- [ ] Plan for incident response
- [ ] Regular security updates and patches

## Version History

- **v1.0.0** (2025-02): Initial security review and documentation
  - Added `.gitignore` rules for sensitive directories
  - Removed build artifacts from repository
  - Added security documentation

---

Last Updated: February 2025
Next Review: Recommended quarterly or after major changes
