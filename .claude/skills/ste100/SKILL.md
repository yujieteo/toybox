---
name: ste100
description: Rules of ASD-STE100 Simplified Technical English (STE) for prose that people read. Use when you write a long report, a summary or a PR description, and when you check or rewrite prose for STE.
---

# ASD-STE100 Simplified Technical English

The captain requires every agent to write human-facing prose in ASD-STE100 Simplified Technical English (STE), decided 2026-10-03.
This skill gives the STE writing rules in practical form. Rule 0 of the global CLAUDE.md gives the check to do before you send prose.

## Scope

Apply STE to all prose that a person reads. This includes chat answers, reports, status lines, outcome lines, summaries, escalations and PR descriptions.
Do not apply STE to code, commands, file paths or identifiers.
Do not apply it to log output, tool output, quoted text or the exact words of the captain.
A technical name (a product, a file, a command, an API) stays as it is, even when it is not an approved STE word.

## Words

1. Use simple, common words. Prefer the STE approved word to a synonym. Examples:

   | Write | Do not write |
   | --- | --- |
   | use | `utilize` |
   | start | `initiate` |
   | help | `facilitate` |
   | show | `demonstrate` |

2. Use one word for one meaning, and one meaning for one word. If you call a thing a "worker", do not call it an "agent" or a "helper" in the same text.
3. Use a word only as its approved part of speech. For example, "test" is a noun and a verb. Do not write "a must" or "a fix" when the verb form is clearer.
4. Do not use slang, idioms, jargon, metaphors or humor. Do not use a phrasal verb when a single verb is available. Write "remove", not "take out". Write "continue", not "carry on".
5. Do not use contractions: write "do not", not `don't`. Write "it is", not `it's`.
6. Use technical names and technical verbs only for things that have no simple word.

## Noun clusters

Do not put more than three nouns in a row.
Break a long cluster with a preposition: "the status of the validation run", not "validation run status record update".

## Verbs

1. Use only these verb forms:

   | Form | Example |
   | --- | --- |
   | imperative | "Run the test." |
   | simple present | "The test fails." |
   | simple past | "The test failed." |
   | simple future | "The test will fail." |
   | infinitive | "to run" |
   | past participle as an adjective | "the merged PR" |

2. Do not use the -ing form of a verb. The exception is a technical name, for example "Running Header", or a modifier in a technical name.
3. Use the active voice. Use the passive voice only in descriptive text. Use it when the actor is unknown or not important.
4. Do not use complex tenses such as "has been running" or "would have failed". Write "ran" or "failed".

## Sentences

1. Write one topic in each sentence.
2. Keep instructions (procedural sentences) to a maximum of 20 words.
3. Keep descriptive sentences to a maximum of 25 words.
4. Do not leave out words such as "the", "a", "is" or "that" to make a sentence shorter.
5. Use a vertical list or a table when you give more than two related items.
6. Use connecting words ("but", "because", "then", "thus") to show how sentences relate.

## Instructions and procedures

1. Write one instruction in each sentence, unless two actions occur at the same time.
2. Use the imperative. Write "Merge the PR.", not `The PR should be merged.`
3. Put a condition before the instruction: "If the check fails, stop the deploy."
4. Put a warning or a caution before the instruction it applies to, and start it with a clear command.

## Descriptive text

1. Give the most important information first: the result, then the reason, then the details.
2. Write one topic in each paragraph.
3. Keep paragraphs to a maximum of six sentences.

## Punctuation and numbers

1. Do not use semicolons. Write two sentences.
2. Use a colon only to introduce a list or a table.
3. Use parentheses only for short technical additions, not for full sentences.
4. Write numbers as digits, with units: "3 PRs", "7 minutes", "25 words".

## Relation to other instructions

STE controls the language of prose.
Other instructions continue to control content, structure and safety: for example, firstmate's rules on what to report, translation of internal terms, and full PR URLs.
The direct address "captain" that firstmate's AGENTS.md requires is a name and stays.
Optional nautical words such as "aye", "on deck" or "under way" are slang in STE: do not use them.
