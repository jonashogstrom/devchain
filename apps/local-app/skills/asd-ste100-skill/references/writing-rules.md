# Where This Skill Stops Short of the Standard

Read this only to answer "is this output certified ASD-STE100?" The answer is no, and this
file explains the gap. The rules you apply are in `SKILL.md`.

This skill applies STE's rules but not its dictionary — ~900 approved words, each fixed to
one meaning and one part of speech, plus ~1,200 words to avoid. Two failures it cannot catch:

- A word that is plain, common English but is not on the approved list.
- A word used in an approved sense, but in a part of speech the dictionary assigns elsewhere
  ("oil" approved as a noun, used as a verb).

For aircraft maintenance documentation, or anything audited for compliance, a human must
check word by word against the official ASD dictionary. Do not fetch the standard or
search the web for it — tell the user this check is theirs to do.

**Terminology allowance.** The standard lets an organization approve its own technical nouns
and verbs beyond the base dictionary. This is why keeping a domain term and defining it once
is compliant, not an exception to the rules.
