# Export job: from the export call to the MP4

Source: app/serve.ts. The headless page (web/export.ts) sends the start data, then the video chunks, then the end.
The daemon holds one export job at a time. test/export-machine.test.ts drives the daemon through each row.

## Requirements

- R1: The export page sends the start data once, then the video chunks, then the end, and the daemon makes the MP4. Source: web/export.ts:56
- R2: A chunk or an end before the start data gets a 409 answer and changes nothing. Source: app/serve.ts:213
- R3: A second start data gets a 409 answer and does not replace the open video file. Source: owner, review round 2: "guard /export/start so it requires phase waiting"
- R4: Every terminal answer ends the job, or /api/export waits for the timeout. Source: app/serve.ts:227

## Machine export

initial: waiting
final: done

| state | event | guard | next | req | source |
|---|---|---|---|---|---|
| waiting | start | | streaming | R1 | app/serve.ts:204 |
| waiting | chunk | | - | R2 | app/serve.ts:213 |
| waiting | end | | - | R2 | app/serve.ts:225 |
| streaming | start | | - | R3 | app/serve.ts:194 |
| streaming | chunk | | streaming | R1 | app/serve.ts:217 |
| streaming | end | | done | R1 R4 | app/serve.ts:265 |
| * | finish | | done | R4 | app/serve.ts:73 |
