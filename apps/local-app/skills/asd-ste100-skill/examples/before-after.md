# Before / After Examples

Worked rewrites for this skill's use case: AI agent output that another agent, a
translation layer, or a non-native reader must parse without ambiguity. The rules
themselves are in `SKILL.md`. These are illustrations, not quotes from any real system.

## Example A — Tool description

**Before:**
> This tool will attempt to synchronize state across the various backends that have been configured, and if a conflict is detected it may resolve it automatically depending on the strategy that has been set, or otherwise it will surface the conflict for manual review.

**Violations flagged:**
- Two instructions in one sentence (sync + resolve/surface).
- Present-perfect and modal stacking ("have been configured", "may resolve", "has been set") — multiple hedges compound ambiguity.
- 55 words, far over the 25-word descriptive cap.

**After:**
> The tool synchronizes state across the configured backends. If it finds a conflict, it checks the current strategy. If the strategy allows automatic resolution, the tool resolves the conflict. If not, the tool reports the conflict for manual review.

## Example B — Error message

**Before:**
> An error may have occurred while processing your request due to a possible mismatch in the expected data format, which could be caused by an outdated client version.

**Violations flagged:**
- Passive voice with unclear actor ("an error may have occurred").
- Present perfect + double hedge ("may have occurred", "could be caused").
- One sentence carrying two separate claims (error occurred; possible cause).

**After:**
> The request failed. The data format did not match what the server expected. Check your client version — an outdated client is the most common cause.

## Example C — Inter-agent instruction

**Before:**
> Once the upstream job has completed and assuming no errors were raised, the downstream agent should proceed to consume the output artifact, though it is worth noting that partial artifacts are sometimes produced under timeout conditions.

**Violations flagged:**
- Present perfect ("has completed") and subordinate-clause stacking ("assuming...", "though it is worth noting...").
- One sentence, three separate facts (completion condition, next action, edge-case warning).
- 42 words, over the 20-word instruction cap.

**After:**
> Wait for the upstream job to finish with no errors. Then read the output artifact. Warning: a timeout can produce a partial artifact. Check the artifact is complete before you use it.
