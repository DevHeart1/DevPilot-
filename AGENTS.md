# DevPilot System - Global Agent Instructions

Welcome to the DevPilot project repository. This document outlines the constraints and guidelines for GitLab Duo Custom Agents operating within this codebase.

## System Architecture

DevPilot is an MVP micro-SaaS orchestrating automated codebase tasks. It consists of:
1. **Frontend UI**: React + TypeScript + Vite. Represents the DevPilot Dashboard and Workspace.
2. **Local Persistence**: IndexedDB via Dexie.js (see `src/lib/db`).
3. **Sandbox Execution**: A mock environment simulating a Cloud Run / remote container for running isolated checks (see `devpilot-sandbox`).
4. **Agent Orchestration Layer**: A custom local flow simulating GitLab Duo Custom Agents, currently broken into:
   - `ui_inspector`: Analyzes the DOM/viewport.
   - `code_fixer`: Recommends and prepares patches.
   - `verifier`: Handles post-fix visual regression checks.

## Global Coding Standards
- **Strict TypeScript**: Do not use `any` unless absolutely necessary. Rely on interfaces defined in `src/types/index.ts`.
- **Minimal Dependencies**: Do not introduce new third-party libraries without explicit reason.
- **Incremental Refactoring**: Prioritize stability. Do not perform sweeping architectural changes or UI redesigns unless explicitly instructed.

## GitLab Duo Custom Flow Mapping
When implementing or modifying agent workflows, ensure interactions route through `gitlabDuoAdapter` for agent assignment/handoffs and `gitlabRepositoryAdapter` for repository state changes (branching, MRs).

**Current Roles & Responsibilities:**
- **UI Inspection (`src/lib/workflows/uiInspection.workflow.ts`)**: Triggers `ui_inspector`.
- **Code Fix (`src/lib/workflows/codeFix.workflow.ts`)**: Triggers `code_fixer`. Emits an Approval Checkpoint before MR handoff.
- **Verification (`src/lib/workflows/postFixVerification.workflow.ts`)**: Triggers `verifier` to validate sandbox state post-patch.
