---
name: review
description: Review the diff on the current branch and report findings.
user_invocable: true
---

Review the current branch against its base.

1. `git fetch` then identify the merge-base with the default branch.
2. Read the full diff `git diff <base>...HEAD` — every hunk, not just a summary.
3. For each file changed, ask:
   - Does the change do what the commit message claims?
   - Are there obvious bugs, dead code, or security issues?
   - Are tests added or updated for new behaviour?
4. Produce a short report grouped by severity (blocker / suggestion / nit).
5. Reference each finding as `<file>:<line>` so the user can jump there.
