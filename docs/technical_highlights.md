# Depo — Technical Highlights

A read-through of the codebase, calling out the engineering choices that make the system work.

---

## 1. Three-layer state machine for dynamic questioning

`src/hooks/useDepoSession.js` — the brain.

```
Layer 1 — Session phase     BACKGROUND → FOUNDATION → CORE → CROSS_TRAP
Layer 2 — Attorney tactic   weighted random + promotion rules + exclusion
Layer 3 — Turn cycle        Q_GENERATED → AWAITING_ANS → A_RECEIVED → GRADED → TURN_COMMIT
```

Three layers communicate by **commands down, events up**. Lower layers don't know upper layers exist. This separation is what lets us swap a tactic prompt without touching state-machine logic, and what makes the system replayable from JSON state.

---

## 2. Deterministic choice + LLM phrasing

The single most important pattern in the codebase. From `selectTactic()`:

```js
function selectTactic(sessionPhase, tacticHistory, lastScore, concededFacts) {
  if (sessionPhase === 'FOUNDATION' && concededFacts.length === 0) {
    return 'leading_lockin'                             // promotion rule
  }
  if (lastScore?.consistent_with_prior === false) return 'prior_quote'
  if (lastScore?.volunteered_info === true)       return 'leading_lockin'
  if (lastScore?.speculated === true)             return 'speculation_bait'
  // ... weighted random with last-3-exclusion
}
```

**Which tactic** is pure code. **How it gets phrased** is the LLM. This is why the AI's "badness" is controllable — the random choice is reproducible from a seed, and the phrasing is auditable per prompt file.

---

## 3. Two-LLM architecture (Attorney + Evaluator)

Two distinct system prompts, two API calls per turn, two different temperatures:

| Agent | System prompt | Temp | Output |
|---|---|---|---|
| **Attorney** | `src/prompts/attorney/<phase>.js` — aggressive opposing counsel persona (Martin P. Forget) | ~0.7 | One natural-language question |
| **Evaluator** | `src/prompts/evaluator/rubric.js` — coach grading on 10 rules | ~0.2 (implicit) | Strict pydantic-shaped JSON |

A single LLM doing both either softens the attorney or biases the grading. Keeping them isolated is what makes scoring stable.

---

## 4. Promotion rules — adaptive escalation

`useDepoSession.js:57-71`. After every evaluator call, the next tactic is decided not just by phase weights but by what the witness just *did*:

```
last answer revealed inconsistency  → force prior_quote next turn
last answer volunteered info        → force leading_lockin (lock it in)
last answer speculated              → force speculation_bait (bait again)
same tactic 3 turns in a row        → drop from candidates
```

This is what makes the attorney feel like it's "watching" — sloppiness is immediately punished by the next question, not by the eval.

---

## 5. Append-only conceded_facts → weaponized in later phases

When the evaluator flags `volunteered_info: true`, a snippet of the witness's answer goes into `state.concededFacts`. That list is then passed verbatim into every subsequent attorney prompt:

```
'Concessions or volunteered statements to weaponize:\n• Turn 2: witness volunteered — "I was wearing canvas sneakers"'
```

This is the mechanic that makes Phase 4 actually a trap — the AI has explicit ammunition from Phase 2's sloppy answers. Without it, "cross-examination" is just generic aggression.

---

## 6. Prompts are data, not code

`src/prompts/` is a flat directory of plain JS modules — one per phase, one per tactic, one per intake step. Updating a tactic = edit one file = no code change. Dev server hot-reloads the change instantly.

```
prompts/
├── tactics.js               (9 tactics × sentence templates)
├── attorney/
│   ├── background.js        (identity opener, 3 permitted forms)
│   ├── foundation.js        (lock-in patterns + range trap)
│   ├── core.js              (distraction stack, awareness, damages probe)
│   └── cross_trap.js        (4 mandated trap forms + hard checklist)
├── evaluator/rubric.js      (10-rule grader)
└── intake/                  (caseSummary, prepGuide, report)
```

Each attorney prompt has a parallel structure: `<phase>System(caseType, role)` for the system message + `<phase>Prompt(tactic, instruction, history, summary, concededFacts)` for the user message. `src/lib/claude.js` is a thin dispatcher that picks the right pair per phase.

---

## 7. Hybrid deterministic + LLM metrics

`src/lib/utils.js`:

```js
detectFillers(text)              // substring match against 14-item list
classifyPace(seconds, wordCount) // pure rule cascade — "rushed" / "hesitant" / etc.
```

These run **client-side, before** the evaluator LLM is called. Filler-word detection overlaps deliberately with the speculation rubric (rule 3) — "I think", "probably", "maybe" are both fillers AND signs of speculation. The mechanical results are surfaced to the user as inline badges while the LLM does the semantic judgment in parallel.

Splitting work this way means the LLM tokens go to **judgment**, not regex.

---

## 8. Document-driven, no backend

`src/lib/utils.js` + `src/components/UploadPhase.jsx`:
- User uploads PDF / DOCX / TXT (`pdfjs-dist` for PDF text extraction, binary-strip for everything else)
- All text → Groq via `caseSummary` → user confirms summary → prep guide → simulation
- localStorage for session persistence (no DB)
- Anthropic-style key injected at Vite build (`import.meta.env.VITE_GROQ_API_KEY`) — documented as **not for production**, hackathon shortcut

The frontend-only pattern is the right call for a demo: no auth, no servers, no deployment friction. The README spells out the proxy-it-for-prod story.

---

## 9. Defensive fallbacks everywhere

Every Claude/Groq call is wrapped in a try/catch with a sensible canned fallback:

- `analyzeCaseDocuments` fails → user sees an error, can re-upload
- `generatePrepGuide` fails → hardcoded 5+5+3 generic prep guide renders (`useDepoSession.js:142-162`)
- `generateNextQuestion` fails → `FALLBACK_Q[phase]` canned question (`useDepoSession.js:101-107`)
- `evaluateAnswer` fails → all-defaults score with `eval_failed: true`
- `generateReport` fails → encouraging-but-generic report

This is what lets the demo survive Groq rate-limit hits — the session continues to completion instead of crashing.

---

## 10. Voice and text input share the same submit path

`src/hooks/useVoice.js` wraps Web Speech API. `SimPhase.jsx` plugs the transcript into the same `state.answer` field that the textarea writes to. Single source of truth, single submit handler, voice as a strict augmentation. The `answerStart` timer starts on either input method to keep pace classification honest.

---

## 11. Three layers of feedback granularity

| When | Where | LLM? |
|---|---|---|
| **Inline (per turn)** | Right under the question card after each answer | Evaluator output |
| **Cumulative (sidebar)** | Score / fillers / over-share count on the right rail | Pure code aggregation |
| **Final report** | `ReportPhase` — strengths, weaknesses, personal DOs/DON'Ts, full Q&A review | Separate LLM call |

Three different LLM prompts, three different temperatures, three different render surfaces. Each layer is independently testable.

---

## 12. State-diagram transitions (not just quotas)

`nextPhase()` in `useDepoSession.js:87-99`:
- FOUNDATION → CORE was originally gated on `conceded_facts >= 1` (removed when phase quota dropped to 1)
- CORE → CROSS_TRAP **early-jumps** on `lastScore.consistent_with_prior === false` (don't waste turns when inconsistency is already on the record)
- CROSS_TRAP → DEBRIEF can early-exit when the witness was "clean" for 2 consecutive turns (user_recanted)

These are state-machine constraints riding on top of quota-based phase advance, not a replacement for them.

---

## 13. The Martin P. Forget persona

`background.js` and `cross_trap.js` are now anchored to a named opposing-counsel persona — "Martin P. Forget — crisp, professional, no warmth. Reads from a prepared outline. Uses pauses strategically." A persona token gives the LLM a consistent voice across phases. Without it, BACKGROUND tends warm and CROSS_TRAP tends abusive; with it, both stay in the same emotional register the way a real depo lawyer does.

---

## 14. The four-form cross-trap mandate

`cross_trap.js` was the highest-leverage prompt fix in this session. Originally CROSS_TRAP produced generic challenge questions. Now it mandates one of four structural forms:

1. **PRIOR-QUOTE IMPEACHMENT** — quote prior answer verbatim, contrast with documents
2. **ACCUSATORY FALSE-PREMISE** — embed unproven motive as accepted fact
3. **VEXATIOUS LEADING ABSOLUTE** — loaded characterization as leading absolute
4. **"YOU'D AGREE" CONCESSION** — frame damaging legal conclusion as common-sense agreement

Plus a 6-item hard checklist the model self-checks before returning. This is what turns a generic "can you clarify" follow-up into a real trap.

---

## What's notable engineering-wise

- The **separation of concerns** is unusually clean for a hackathon project — every layer can be edited in isolation
- The **agent count is small but well-isolated** — two LLM agents, one metrics module, never bleeding into each other
- The **state shape is a single object** managed by useReducer; no nested state, no prop drilling beyond two levels
- The **fallback discipline** is consistent across every external call — the demo never dies mid-session
- **Prompts as files, not strings** — the iteration loop is genuinely seconds, not minutes

## Known limitations

- Llama 3.3 70B on Groq invents specifics (dates, addresses) when source content has placeholders. Mitigate by populating test cases with concrete facts.
- Groq free tier is 12k tokens/minute *per organization*, so consecutive runs throttle. Mitigate by spacing runs or upgrading.
- Frontend-injected API key is fine for demo but is the only thing blocking a real deploy.
- 1 question per phase is a demo simplification; the architecture supports much longer sessions.
