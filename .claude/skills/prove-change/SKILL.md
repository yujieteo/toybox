---
name: prove-change
description: Prove or disprove a code change with benchmarks, replay, A/B runs and model evals. Use after any change, and before you say a change is better.
user-invocable: true
---

# Prove a change

A claim that a change is better needs a number. Get the number first.

Run these, cheapest first. The first four cost nothing but time.

1. `./gate` runs every rule, the lint evals and the intent evals.
2. `bin/replay` runs the same inputs through the old code and the new code. It fails if an output changes. If the change is on purpose, read the diff, then run `bin/replay --accept`.
3. `bin/bench NAME` measures latency, throughput, memory, bytes out and error rate. The spec is `evals/bench/NAME.bench`.
4. `bin/ab NAME BASE_REF` runs the old and the new code in turns, then says better, worse or no difference.
5. Model evals spend the author's plan allowance. Run them only when the author asks.
   - `bin/modeleval plan` shows what would run and spends nothing.
   - `bin/modeleval ab BASE_REF --captain-requested` compares tokens and correctness of the old and the new code.

For a hot file, also run `bin/hotescape` for Go and `bin/hotrun` for Go and TypeScript.
Say only what the output proves. A run with no GC does not prove zero GC.

If a benchmark you need does not exist, add one in `evals/bench`.
Tests are evals. Do not add native test files.
