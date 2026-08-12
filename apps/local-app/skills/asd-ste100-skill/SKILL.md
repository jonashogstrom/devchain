---
name: asd-ste100-skill
displayName: Simplified Technical English (ASD-STE100)
description: "Simplify English into readable, unambiguous text using ASD-STE100 Simplified Technical English rules: one meaning per word, active voice, simple tenses, one instruction per sentence. Use for user-facing messages and reports, tool descriptions, error messages, system prompts, and inter-agent instructions — any text a reader must understand with no follow-up questions. Triggers: STE, ASD-STE100, make this readable, reduce ambiguity, simplify this text."
version: 0.3.0
license: "MIT — adapted from danyuchn/asd-ste100-skill (https://github.com/danyuchn/asd-ste100-skill)"
resources:
  - references/writing-rules.md
  - examples/before-after.md
---

# Simplified Technical English (ASD-STE100)

Apply ASD-STE100 — the aerospace controlled-language standard — to make text simple and
readable. It is built for readers who cannot ask "did you mean X or Y?": human users,
non-native readers, and other agents.

Do not apply this skill to creative, marketing, or persuasive copy. STE is flat and
literal by design.

## Rules

| Rule | Do | Not |
|---|---|---|
| One meaning per word | Pick one verb per action and reuse it everywhere | Rotate `check`/`verify`/`confirm` for the same action |
| One part of speech per word | "Apply oil to the valve" (oil = noun) | "Oil the valve" (oil = verb) |
| Unambiguous verb | "Obey the safety instructions" | "Follow the safety instructions" (obey, or come after?) |
| Active voice | "The agent deletes the file" | "The file is deleted" — passive only in descriptions, and only when the actor is genuinely unknown |
| Simple tenses only | Infinitive, imperative, simple present/past/future, past participle as an adjective. "We received the report" | Present perfect, past perfect, compound tenses. "We have received the report" |
| `-ing` as a noun only | "the bearing", "during processing" | "The tool is processing the queue" |
| One instruction per sentence | "Open the file. Read line 3." | "Open the file and read line 3, then check it matches." |
| Sentence length | ≤20 words for instructions, ≤25 for descriptions | Stacked subordinate clauses |
| Noun clusters ≤3 words | "fuel pump valve" | "high pressure fuel pump inlet valve assembly" |
| No ellipsis | Keep subject, verb, and article explicit even if it reads longer | Drop words to save space ("Files not backed up will be lost" — which files?) |
| Warnings open the sentence | "Warning: a timeout can produce a partial artifact." | Bury the condition mid-sentence |
| Paragraphs and lists | One topic per paragraph, ≤6 sentences; a numbered list for 3+ steps or conditions | A sequence buried in prose |
| Domain terms | Keep the necessary technical term, define it once | Undefined jargon |
| Simple common words | "use", "start", "before"; "validate the file" | "utilize", "initiate", "prior to"; nominalizations ("perform validation of the file") |

## Process

1. Read the whole input for meaning before you rewrite anything.
2. Walk it sentence by sentence and flag each rule the sentence breaks.
3. Rewrite each flagged sentence. Keep the meaning exact.
4. Output the rewritten text only.

## Output format

Output the rewritten text, ready to use, and nothing else. Steps 1 to 3 are your working
method. They are not output.

Do not add any of these:
- a table of the changes you made
- a list of the rules each sentence broke
- a summary, a preamble, or a count of the edits
- a note about text you left unchanged

Keep the format of the input. If the input is a Markdown document, the output is the same
document with the same headings, tables, lists, and code blocks.

There are two exceptions. Each one is a single line, after the text:
- If the input already obeys the rules, say so. Do not force changes onto compliant text.
- If you could not rewrite a sentence and keep every fact, condition, or hedge, name that
  sentence. Report only this type of trade-off.

## Limits

- Never drop a fact, condition, exception, or scope qualifier to shorten a sentence. If a
  rewrite loses precision, keep the long form and flag the trade-off instead.
- If the input already complies, say so. Do not force changes onto compliant text.
- For human readers, readability wins over strictness: you can join two short, related
  sentences with "and" or "if", as long as each part keeps one instruction or claim.
- Keep real uncertainty: do not turn "may", "might", or "we plan to" into certainty — a
  hedge in a plan is a decision not yet made. Never change code blocks, identifiers,
  file paths, or numbers.
- This skill applies STE's *principles*, not its ~900-word approved dictionary. Its
  output is not certified STE. If the user needs certification, tell them to check the
  official standard themselves.
- Work only from this file and its bundled references. Do not search the web or fetch
  external sources about STE or ASD-STE100.

`references/writing-rules.md` — the exact gap between this skill and certified STE.
`examples/before-after.md` — worked rewrites of tool descriptions, errors, and agent instructions.
