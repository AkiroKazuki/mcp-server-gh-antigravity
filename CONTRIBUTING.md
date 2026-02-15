# Contributing to Antigravity OS MCP Server System

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/mcp-server-gh-antigravity.git`
3. Install dependencies: `npm install`
4. Build the project: `npm run build`
5. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build -w @antigravity-os/memory-server

# Watch mode for development
npm run dev -w @antigravity-os/memory-server
```

### Testing

Before submitting a PR, test your changes:

```bash
# Build the project
npm run build

# Test a server manually
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' \
  | node packages/memory-server/build/index.js
```

### Code Style

- Use TypeScript for all new code
- Follow existing code style and patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable and function names

## Submitting Changes

1. Commit your changes with clear, descriptive commit messages
2. Push to your fork
3. Open a Pull Request against the `main` branch
4. Describe your changes in the PR description
5. Link any related issues

### Commit Message Format

Use clear, descriptive commit messages:

```
feat: Add semantic search caching for faster queries
fix: Prevent race condition in file locking
docs: Update installation instructions
refactor: Simplify prompt template generation
```

## Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities. Instead, email the maintainers directly or use GitHub's private security reporting feature.

### Security Guidelines for Contributors

- Never commit secrets, API keys, or credentials
- Never commit user data or personal information
- Validate and sanitize all user inputs
- Be cautious with file system operations
- Review OWASP Top 10 vulnerabilities
- Use parameterized queries for any database operations

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions
- Help maintain a positive community

## Questions?

- Open a discussion in GitHub Discussions
- Check existing issues and PRs
- Review the README.md and SETUP.md documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
