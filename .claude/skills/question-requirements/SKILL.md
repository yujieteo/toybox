---
name: question-requirements
description: Question the requirements before you build. Five steps - make each requirement less dumb, delete, simplify, optimize, accelerate. Use at the start of any project and before any big change.
user-invocable: true
---

# Question the requirements

This skill is not part of VISION.md.
It is a habit. Run it at the start, and again before a big change.
The five steps come from Elon Musk. Do them in this order.

1. Make each requirement less dumb.
   - Put a name on every requirement. A person owns it, not a team.
   - Ask why. If nobody can say why, the requirement is a guess.
   - A smart person can still be wrong. Question their requirement too.
2. Delete.
   - Cut the part or the step that is not needed.
   - Less code is better. The best code is no code.
   - If you do not add back at least one tenth of what you cut, you did not cut enough.
3. Simplify.
   - Only now make what is left simpler.
   - Do not simplify a thing you should have deleted.
4. Optimize.
   - Make what is left use less time, memory and cost.
   - Prove it with a benchmark. See the `prove-change` skill.
5. Accelerate.
   - Make the cycle of build, check and fix faster.
   - Do this last. Speed on a wrong thing is waste.

Write the result as a short list for the author: what you cut, what you kept, and why.
Ask the author to confirm before you build.
