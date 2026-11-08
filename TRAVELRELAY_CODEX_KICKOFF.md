# TravelRelay — First Codex task

Paste the following into Codex from inside your cloned TravelRelay repository, **after placing `TRAVELRELAY_DESIGN.md` in the repository root**.

---

We are building **TravelRelay**, a PayPal AI Hackathon 2026 web application. The complete approved design, product flows, constraints, and milestones are specified in `TRAVELRELAY_DESIGN.md`. Read that file fully before changing code.

**Scope of this run: Milestone 0 and the FOUNDATION portion of Milestone 1 ONLY.** Do not attempt to implement PayPal payments, booking refunds, or the entire agent system in this first run.

1. Inspect the current repository and explain what exists. Preserve existing files and history unless they directly conflict with the new app.
2. Propose a compact implementation plan and initialize or extend a single full-stack Next.js + TypeScript + Tailwind project, with a consistent file structure, accessible UI primitives, lint/typecheck, and scripts. Prefer simple, production-suitable dependencies. Document any deviation from the specification.
3. Implement the approved visual tokens, responsive global top navigation, and premium editorial **landing page**. Use real appropriately licensed/attributed destination imagery with fallbacks; ensure the layout is substantial at 1440px desktop and responsive at 390px mobile. Hero is part of the permanent landing page, not an intro splash. No map-first layout.
4. Scaffold route shells for Dashboard, Explore, Create Trip wizard and Trip Workspace, with visible honest placeholder/empty states only where backend behavior is not yet implemented. Do not depict fake payments as successful transactions.
5. Include `.gitignore` and `.env.example` with variable NAMES but absolutely no secrets. Define and document the necessary PayPal Sandbox, database, auth, FX, and model-provider configuration variables. Ensure all secrets are server-only.
6. Create/refresh README with local setup, development/test commands, planned feature milestones and current limitations. Do not claim integrations are working if not implemented.
7. Run install, lint, typecheck, and build (and tests if created). Fix failures. Provide a concise report containing files changed, tests run, screenshots if your environment supports them, unresolved blockers, and the exact next implementation task. Commit after validation if Git is configured.

**Critical guardrails:** Do not ask me to paste any PayPal Client Secret into the chat or source code. Do not push credentials. Do not fabricate PayPal transactions or arbitrary hotel/flight booking availability. Preserve our core concept: a real full-width travel app, with a docked optional AI assistant—not a popup-centric website. Keep sponsor integrations modular; we will decide Bryntum when implementing the itinerary. Stop after this milestone and report.
