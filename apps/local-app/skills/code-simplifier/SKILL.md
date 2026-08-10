---
name: code-simplifier
displayName: Code Simplifier
description: "Simplify and refine recently modified code for clarity, consistency, and maintainability while preserving exact behavior. Applies the target project's coding standards, reduces nesting and redundancy, and prefers explicit, readable code over compact or clever solutions. Use after writing or changing code, or when asked to simplify, clean up, or polish code. Triggers: simplify this code, clean up, refine, make this more readable, reduce complexity."
version: 0.1.0
license: "Adapted from the @claude-plugins-official code-simplifier agent prompt"
---

# Code Simplifier

Refine code for clarity, consistency, and maintainability while preserving its exact
functionality. Prioritize readable, explicit code over overly compact solutions: the goal
is code that is easier to understand, debug, and extend — not code with fewer lines.

## Scope

Only refine code that was recently modified or touched in the current session, unless
explicitly instructed to review a broader scope. Use the working diff (`git diff`,
`git status`) to find the changed sections.

## Rules

1. **Preserve functionality.** Never change what the code does — only how it does it.
   All original features, outputs, and behaviors must remain intact. If a simplification
   would change observable behavior, do not apply it.

2. **Apply project standards.** Discover and follow the target project's established
   conventions before editing:

   - Read the project's standards documentation if it exists (for example
     `docs/development-standards.md`, `CONTRIBUTING.md`, `CLAUDE.md`, or `AGENTS.md`).
   - Respect lint and formatter configuration (ESLint, Prettier, EditorConfig, or the
     language's equivalent).
   - Match the surrounding code's idiom: import style and ordering, function declaration
     style, type annotations, error-handling patterns, and naming conventions.
   - Where no standard exists, follow the dominant style already present in the file.

3. **Enhance clarity.** Simplify code structure by:

   - Reducing unnecessary complexity and nesting
   - Eliminating redundant code and abstractions
   - Improving readability through clear variable and function names
   - Consolidating related logic
   - Removing comments that describe obvious code
   - IMPORTANT: avoiding nested ternary operators — prefer switch statements or if/else
     chains for multiple conditions
   - Choosing clarity over brevity — explicit code is often better than compact code

4. **Maintain balance.** Avoid over-simplification that could:

   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into a single function or component
   - Remove helpful abstractions that improve code organization
   - Prioritize "fewer lines" over readability (nested ternaries, dense one-liners)
   - Make the code harder to debug or extend

## Process

1. Identify the recently modified code sections.
2. Analyze them for opportunities to improve elegance and consistency.
3. Apply the project's coding standards and the rules above.
4. Verify all functionality remains unchanged; run the project's tests for the touched
   code when they exist.
5. Confirm the refined code is simpler and more maintainable than before — if a change
   does not clearly improve the code, revert it.
6. Report only significant changes that affect understanding; do not narrate mechanical
   cleanups line by line.

## Limits

- This skill improves code quality only. It does not hunt for bugs, add features, or
  perform security review.
- Never "fix" behavior while simplifying, even if it looks wrong — flag suspected bugs
  in the report instead of changing them.
- Do not reformat or restructure untouched files just because they were opened while
  reading context.
