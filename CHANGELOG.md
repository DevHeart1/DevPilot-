# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Sandbox Build & Run Workflow**: Automated the process of building and executing the project within the sandbox.
- **Sandbox Command API**: New endpoints (`/api/execute`, `/api/execute/start`, `/api/execute/stop`) for programmatic shell access.
- **Background Process Management**: Support for long-running servers in the sandbox with proper cleanup logic.

### Fixed
- **Sandbox Path Resolution**: Implemented recursive upward search for `package.json` to handle containerized environments.
- **Inspection Target Priority**: The agent now correctly prioritizes the locally served application over external URLs during inspection.
- **Workflow Scoping**: Resolved variable hoisting issues in the UI inspection workflow.
