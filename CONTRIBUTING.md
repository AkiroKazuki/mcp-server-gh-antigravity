# Contributing to Antigravity OS

Thank you for your interest in contributing to Antigravity OS! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `npm install`
3. **Build the project**: `npm run build`
4. **Run tests**: `npm test`

## Development Workflow

### Setting Up Your Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-server-gh-antigravity.git
cd mcp-server-gh-antigravity

# Add upstream remote
git remote add upstream https://github.com/AkiroKazuki/mcp-server-gh-antigravity.git

# Install dependencies
npm install

# Build all packages
npm run build
```

### Making Changes

1. **Create a new branch** for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards:
   - Use TypeScript for all new code
   - Follow existing code style and conventions
   - Add comments for complex logic
   - Update documentation as needed

3. **Build and test** your changes:
   ```bash
   npm run build
   npm test
   ```

4. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "feat: add new feature X"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** from your fork to the main repository

## Pull Request Guidelines

### Before Submitting

- Ensure all tests pass
- Update documentation if you're changing functionality
- Add tests for new features
- Keep changes focused - one feature/fix per PR
- Rebase on latest main branch

### PR Description

Please include:
- **Summary** of changes
- **Motivation** for the changes
- **Related issues** (if any)
- **Testing** done
- **Breaking changes** (if any)

## Coding Standards

### TypeScript

- Use strict TypeScript configurations
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` type - use `unknown` if type is truly unknown

### Code Style

- Use 2 spaces for indentation
- Use semicolons
- Use single quotes for strings
- Maximum line length: 100 characters
- Add trailing commas in multiline arrays/objects

### Documentation

- Add JSDoc comments for public APIs
- Update README.md if adding new features
- Update CHANGELOG.md following Keep a Changelog format

## Package-Specific Guidelines

### Memory Server

- All database operations should use transactions
- Implement proper file locking for concurrent access
- Update semantic index after memory changes

### Copilot Server

- Cache responses appropriately
- Validate all prompts before execution
- Handle errors gracefully

### Analytics Server

- Respect budget limits
- Log all cost events
- Provide meaningful performance metrics

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test -w @antigravity-os/memory-server

# Watch mode
npm run dev -w @antigravity-os/memory-server
```

### Writing Tests

- Write unit tests for new functions
- Test edge cases and error conditions
- Mock external dependencies
- Use descriptive test names

## Reporting Issues

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Error messages and stack traces

### Feature Requests

Include:
- Clear description of the feature
- Use cases and motivation
- Proposed API or interface
- Alternatives considered

## Questions?

- Open a [GitHub Discussion](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/discussions) for questions
- Check existing [Issues](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/issues) and [PRs](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/pulls)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🚀
