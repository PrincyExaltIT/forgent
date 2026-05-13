---
name: commit
description: Stage and commit with a conventional-commit message.
user_invocable: true
---

Commit the current staged and unstaged changes.

1. Run `git status` and `git diff` (staged + unstaged) in parallel.
2. Run `git log --oneline -5` to learn the project's commit style.
3. Stage only the relevant files (no secrets, no `.env`).
4. Write a conventional-commit message: `type(scope): subject`.
   - Allowed types: feat, fix, refactor, perf, test, docs, build, ci, chore, style.
   - Subject is imperative, present tense, no trailing period, ≤ 72 chars.
5. Do not add any `Co-Authored-By` trailer.
6. Create the commit via HEREDOC.
7. Run `git status` to confirm success.
