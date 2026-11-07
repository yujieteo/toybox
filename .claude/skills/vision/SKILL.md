---
name: vision
description: Write and stress-test a VISION.md for a new or old project. Works with no history. The author answers hard questions on a review board. Use on /vision or at the start of a project.
user-invocable: true
---

# Vision

Source: https://github.com/kunchenguid/vision by Kun Chen, MIT licence, commit 7a20c38181151ec67efdf8fa2cb03a60123a7b83.
The licence is in LICENSE. The original skill is in UPSTREAM-SKILL.md.txt. The review board files in assets are unchanged.

The original refuses to run when a project has no history. A new project has none.
This skill keeps the original method and changes only that: the evidence is the author's own words.

VISION.md is a policy. A reader can use it to accept or resist a change. Nothing else is needed.
VISION.md holds no Musk steps. Those are in the `question-requirements` skill.

## Hard rules

1. The author owns the vision. You draft. You never approve for them.
2. Never invent a value, a PR or a fact. Every line comes from the author's words or from real history.
3. Write rules in the present tense. Name what the project is not.
4. One sentence per line. Plain hyphens. No roadmap. No feature list. No marketing words.
5. VISION.md must pass `bin/mdgrade VISION.md`. Use short words and short sentences.
6. Never keep an answers file or a board transcript in the repository.
7. Use the review board from `assets`. Fill its slots. Do not restyle it.

## Pick the mode

- If VISION.md exists, follow the delta mode in UPSTREAM-SKILL.md.txt.
- If the repository has 30 or more real commits by the author, follow UPSTREAM-SKILL.md.txt.
- Otherwise use the new project mode below.

## New project mode

1. Interview the author. Ask one short question at a time.
   - Who is this for?
   - What does it turn their input into?
   - What is the one thing it owns?
   - What will it refuse to become?
   - Which rules do you want? The starter has them in `rules.conf`. Ask which to keep, change or drop.
2. Keep the author's answers in a private evidence sheet. Each line is a quote and a date.
3. Draft VISION.md with this shape.
   - An opening: the project exists so that something. It serves someone. It owns exactly one thing.
   - Three to six short sections of rules the author stated.
   - A Scope section with named non-goals.
   - A closing pair: a change aligns when, and a change should be resisted when.
   - Keep it to 40 to 70 lines.
4. Write eight to twelve hard cases. Each sits where yes and no are both fair. If you can guess the answer, replace the case.
5. Fill `assets/review-template.html` and `assets/review.css` in a scratch folder, not in the repository.
6. Launch it with `npx -y lavish-axi BOARD.html`. Wait for the verdicts with `npx -y lavish-axi poll BOARD.html`.
7. Fold each verdict into the prose of VISION.md. Reply with one changelog line per verdict.
8. Repeat until the author approves. Silence is not approval.
9. Run `bin/mdgrade VISION.md`. Fix it until it passes.
