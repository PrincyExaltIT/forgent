---
name: plan-mode
description: Draft an implementation plan before touching code.
user_invocable: true
---

Produce an implementation plan instead of editing files immediately.

1. Restate the goal in one sentence.
2. List the files that will change and why.
3. List the files that *might* change but you are unsure about — flag them.
4. Call out risks: data migrations, public API changes, irreversible steps.
5. Sketch a test plan: which automated tests cover the change, which manual checks remain.
6. Stop. Do not edit code until the user approves the plan.
