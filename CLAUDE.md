# Peek & Poke

Real-time social networking app (friends, DMs, profiles, payments).
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase · Stripe · Zustand

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build — MUST pass before any PR
npm run lint         # ESLint — run after every file change
```

## References

- `project_overview.md` — architecture, file structure, patterns, API routes
- For DB schema/tables/migrations: use **Supabase MCP** — live data > static docs

## Agent Behavior

IMPORTANT: Staff-level engineer. Every decision reflect that.

- **Simplicity first.** Minimal code impact. Smallest change that solves problem.
- **Find root cause.** No band-aids, no `// TODO: fix later`, no workarounds. Fix properly or explain why not.
- **Only touch what's necessary.** File not relevant to task → don't modify.
- **Read before writing.** Read file before editing. Check similar component exists before creating. Check `package.json` before adding dependency.
- **One example > 100 words.** Similar pattern exists → follow it. Check `src/components/`, `src/hooks/`, `src/stores/`.

## Planning

- Enter **plan mode** for tasks touching 3+ files or architectural decisions.
- Implementation diverges from plan or unexpected complexity: **STOP. Re-plan.** Don't push through broken assumptions.
- After planning, state what you will do and what you will NOT touch.

## Context Management

IMPORTANT: Context most precious resource. Protect aggressively.

- Use subagents (Task/Explore) for research, codebase exploration, multi-file reads. Only summary returns to main context.
- `/compact` proactively at ~50% context usage. Don't wait for degradation.
- One focused task per session. User switches topics → suggest `/clear`.
- Never `@`-import entire files into CLAUDE.md. Use path references.

## Verification

IMPORTANT: Never mark task done without proving it works.

- Run `npm run build` after any change touching types, imports, or exports.
- Run `npm run lint` after every file edit.
- Component changed → verify it renders (check missing imports, broken props).
- Ask: *"Would this pass code review from staff engineer?"*

## Bug Fixing

- Bug flow: reproduce → diagnose → fix → verify. No hand-holding.
- Read error logs/stack traces first. Point at actual failure before proposing fix.
- Can't reproduce → say so. Don't guess fixes.

## Code Standards

- Functional components only. No class components.
- Named exports for components, default exports only for pages.
- Co-locate: component + types + hooks in same directory when scoped.
- Server Components by default. `'use client'` only when state/effects/browser APIs needed.
- Prefer Zustand selectors over full store subscriptions.
- Supabase queries in `src/lib/` or dedicated hooks — never inline in components.
- Type everything. No `any`. No `as` casts unless necessary with comment explaining why.

## Documentation

- Structural change (new routes, components, hooks, stores, removed features) → update `project_overview.md`. Stale docs = wrong assumptions next session.
- User correction → add lesson to `tasks/lessons.md` with pattern so mistake not repeated.

## Don'ts

- No new dependencies without asking.
- No refactoring unrelated to current task.
- No abstractions for one-time use.
- No comments restating what code does. Comment *why*, not *what*.
- No `console.log` in committed code. Use proper error handling.