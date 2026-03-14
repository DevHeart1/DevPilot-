# Frontend App Instructions (src/)

Welcome to the DevPilot Frontend Directory. This contains the primary React interface for the DevPilot micro-SaaS application.

## UI/UX Guidelines
- **Zero Redesign Principle**: The visual aesthetics of DevPilot are locked for the MVP. Do not modify global CSS styles, Tailwind utility mappings, or existing structural layouts (e.g., the 2-pane workspace, dashboard layout, tabs) unless explicitly instructed to fix a bug.
- **Micro-Interactions**: When adding new functionality (e.g., "Verifying..."), use existing UI patterns, such as standard loading indicators or disabled states on buttons.

## Tech Stack & Conventions
- **Framework**: React 19 + TypeScript.
- **Styling**: Tailwind CSS v4.
- **State Management**: Local React state (`useState`, `useEffect`) and Dexie React Hooks (`useLiveQuery`). Avoid Redux/Zustand for now; keep state co-located or in the IndexedDB via `src/lib/services`.

## Important Concepts
- **`App.tsx`**: The main entry point containing both Page 1 (Dashboard) and Page 2 (Workspace) views. It handles route switching internally via `selectedTaskId`.
- **Services (`src/lib/services`)**: All data fetching/writing should route through these classes. Do not use direct `db.table.put()` calls in components.
- **Orchestrator (`src/lib/orchestrator`)**: Handles the mocking of agent tasks (timeouts, simulated generation).
- **Adapters (`src/lib/adapters`)**: Boundaries for external logic (GitLab repository logic, GitLab Duo agent flows, Vision analysis, Sandbox remote execution).

## Testing
When modifying frontend code, always run the local lint (`npm run lint`).
If your change alters the user interface or requires an explicit verification step, execute the Playwright screenshot test script as specified in the standard prompt instructions.
