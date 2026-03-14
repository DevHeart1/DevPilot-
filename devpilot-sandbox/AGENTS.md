# DevPilot Sandbox Agent Instructions

Welcome to the DevPilot remote execution sandbox root.

## Overview
This environment simulates an isolated, remote container running inside an environment like Google Cloud Run. It executes code tests, runs local servers (like Vite/Next.js/Node), captures terminal logs, and executes Playwright tests to evaluate UI changes before patching.

## Sandbox Constraints
1. **Isolation**: Do not rely on dependencies outside of this directory. Do not use absolute paths pointing to the host machine's root filesystem (e.g. `/home/user/project`). Always use paths relative to `devpilot-sandbox`.
2. **Ports**: When running a local web server (e.g., `npm run dev`), the default port exposed is `3000`. Ensure that verification tools or playright tests target this port.
3. **Statelessness**: Assume the sandbox is ephemeral. Any artifacts generated inside the sandbox (screenshots, logs, build folders) must be explicitly persisted or transmitted out if they are needed by the `sandboxAdapter`.

## Adapter Integration
The `sandbox.adapter.ts` located in the main `src/` directory communicates with this environment via mock network calls. When the DevPilot system needs to:
- Take a screenshot: It triggers a Playwright script inside this directory.
- Apply a patch: It modifies source code in this directory and restarts the local development server.
- Extract logs: It reads standard output from the running processes.

## Playwright UI Verification
The `verify_verification.py` or similar Playwright scripts within this directory should follow web-first assertion patterns (`expect(locator).to_be_visible()`) and utilize headless browsers. Always include wait conditions for network idleness when taking UI snapshots.
