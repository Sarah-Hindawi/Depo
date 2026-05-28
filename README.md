# Depo — AI Deposition Prep · Client Portal

> Built at Lexiden Legal Tech Hack 2026

An AI-powered deposition preparation tool. Upload your case documents, get a plain-language prep guide, then practice answering questions from an AI opposing counsel with real-time coaching after every answer.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Add your API key (get one free at console.groq.com)
cp .env.example .env
# Edit .env → set VITE_GROQ_API_KEY=gsk_...

# 3. Run
npm run dev
# → http://localhost:5173
```

---

## How it works — the 5 phases

### Phase 1 — Upload
Upload up to 5 case documents (PDF, DOCX, TXT). Files are read **entirely client-side** via the FileReader API and `pdfjs-dist`. Nothing touches a server except the Groq API.

Select your case type (wrongful dismissal, personal injury, contract dispute, etc.) and your role (plaintiff / defendant / witness).

### Phase 2 — Case summary
The LLM reads all uploaded documents and returns a plain-language 3–4 sentence summary of the case. You confirm this is accurate before proceeding.

### Phase 3 — Prep guide
The LLM generates case-specific DOs, DON'Ts, and key reminders — grounded in your actual documents, not generic advice. Fallbacks are provided if the API call fails so the app never blocks.

### Phase 4 — Simulation
4 deposition questions driven by a 3-layer state machine:

**Layer 1 — Session phases** (monotonic)
```
BACKGROUND → FOUNDATION → CORE → CROSS_TRAP
```
- `BACKGROUND` — open-ended: who are you, what is your role
- `FOUNDATION` — timeline, relationships, locking in basic facts
- `CORE` — challenging questions on the actual facts and claims
- `CROSS_TRAP` — impeachment, false premises, vexatious absolutes

Early jump: if you contradict yourself in `CORE`, the state machine skips straight to `CROSS_TRAP`.

**Layer 2 — Attorney tactics** (weighted random + promotion rules)

Nine tactics are available across phases:

| Tactic | What it does |
|--------|-------------|
| `open_ended` | Gives you room to over-share — long answers expose unproduced facts |
| `leading_soft` | Gently steers you toward confirming a fact |
| `leading_lockin` | Locks in a specific fact as record evidence using absolutes |
| `compound` | Embeds two sub-questions — "yes" confirms every clause |
| `false_premise` | Treats an unproven fact as already established |
| `speculation_bait` | Invites you to guess — any guess becomes impeachable testimony |
| `emotional_prov` | Tests composure; a defensive reply weakens credibility on the record |
| `impeachment` | Confronts you with a contradiction from your own prior answers |
| `prior_quote` | Quotes your earlier answer verbatim, then probes its consistency |

Promotion rules override the random weights: if you volunteered information, the next tactic is forced to `leading_lockin`. If you speculated, it becomes `speculation_bait`. If you contradicted yourself, it becomes `prior_quote`.

**Layer 3 — Per-turn evaluation**

After every answer the LLM evaluates against a 10-rule witness rubric:

1. Answer only what was asked — do not volunteer
2. "I don't know" / "I don't recall" are valid answers
3. Never speculate
4. Listen to the full question; ask for clarification if needed
5. Keep answers short — yes/no when possible
6. Do not argue with opposing counsel
7. Do not get emotional or defensive
8. Stay consistent with prior statements
9. Watch for compound questions — answer parts separately
10. Watch for false-premise questions — do not accept the premise

Client-side metrics computed before the LLM call: filler word count (`um`, `uh`, `like`, `you know`, etc.), pace classification (Too brief / Rushed / Hesitant / Good pace), word count, elapsed response time.

The `CROSS_TRAP` attorney persona ("Martin P. Forget") must produce a question in one of 4 structural trap forms — Prior-Quote Impeachment, Accusatory False-Premise, Vexatious Leading Absolute, or "You'd Agree" Concession — verified against a 6-item hard checklist enforced in the prompt.

### Phase 5 — Report
Score out of 100, personalised strengths and weaknesses, custom DOs/DON'Ts based on your actual performance, full Q&A review with coach notes. Downloadable as `.txt`.

---

## Tech stack

| | |
|---|---|
| **Framework** | React 18 + Vite 5 |
| **LLM** | Groq API — `llama-3.3-70b-versatile` |
| **PDF parsing** | `pdfjs-dist` v5 (fully client-side) |
| **Voice input** | Web Speech API (`SpeechRecognition`) — Chrome / Safari |
| **Styling** | CSS Modules + CSS custom properties (dark mode) |
| **State** | `useReducer` — single session reducer, no external state lib |
| **Persistence** | `localStorage` (`depo-prep-session`) |
| **Testing** | Playwright (`test-cases/`) |
| **Deploy** | Static SPA — `npm run build` → `/dist` → Vercel / Netlify |

No backend. No database. No auth.

---

## Project structure

```
src/
├── App.jsx                    # Phase router — upload → summary → prep → sim → report
├── main.jsx                   # React entry point
│
├── lib/
│   ├── claude.js              # Groq API caller — thin dispatcher, all prompts imported
│   └── utils.js               # Filler detection, pace classification, scoring, file reading, localStorage
│
├── hooks/
│   ├── useDepoSession.js      # All session state — 3-layer state machine + LLM orchestration
│   └── useVoice.js            # Web Speech API wrapper
│
├── prompts/
│   ├── tactics.js             # 9 attorney tactic instructions
│   ├── attorney/
│   │   ├── background.js      # BACKGROUND phase system + user prompts
│   │   ├── foundation.js      # FOUNDATION phase
│   │   ├── core.js            # CORE phase
│   │   └── cross_trap.js      # CROSS_TRAP phase — 4 trap forms + 6-item hard checklist
│   ├── evaluator/
│   │   └── rubric.js          # 10-rule witness evaluation rubric
│   └── intake/
│       ├── caseSummary.js     # Document → plain-language case summary
│       ├── prepGuide.js       # Documents + summary → DOs / DON'Ts / reminders
│       └── report.js          # Q&A history + scorecards → final debrief report
│
└── components/
    ├── ui.jsx / ui.module.css          # Shared primitives (Button, Card, Badge, Spinner, StepIndicator)
    ├── UploadPhase.jsx                 # Step 1: file upload + case type / role selection
    ├── SummaryPhase.jsx                # Step 2: case summary confirmation
    ├── PrepPhase.jsx                   # Step 3: DOs, DON'Ts, reminders
    ├── SimPhase.jsx                    # Step 4: deposition simulation + per-answer feedback
    ├── ReportPhase.jsx                 # Step 5: final score + download
    └── phases.module.css              # All phase-specific styles
```

---

## LLM call budget

~10 Groq API calls per session:

| Call | When | Prompt file |
|------|------|-------------|
| Case summary | After upload | `intake/caseSummary.js` |
| Prep guide | After summary confirmed | `intake/prepGuide.js` |
| Question gen × 4 | Start of each turn | `attorney/{phase}.js` |
| Answer eval × 4 | After each answer | `evaluator/rubric.js` |
| Final report | After last answer | `intake/report.js` |

All calls use `llama-3.3-70b-versatile` with `max_tokens: 1500`.

---

## Voice input

Voice input uses the browser-native `SpeechRecognition` API — no third-party STT service, no cost.

- Supported: Chrome, Safari (desktop + mobile)
- Language: `en-CA`
- Mode: continuous + interim results (transcript updates live as you speak)
- Not supported: Firefox (falls back to text input with an error message)

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GROQ_API_KEY` | Yes | Groq API key — get one free at console.groq.com |

The key is injected client-side by Vite at build time (`import.meta.env.VITE_GROQ_API_KEY`). Fine for a hackathon. For production, proxy calls through your own backend and keep the key server-side.

---

## Scripts

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build → /dist
npm run preview  # Preview production build locally
```

---

## Production checklist

- [ ] Move API calls to a backend proxy — never ship `VITE_GROQ_API_KEY` in a public bundle
- [ ] Add rate limiting on the proxy endpoint
- [ ] Replace `localStorage` with a real session store if multi-device support is needed
- [ ] Add document size validation (current limit: first 3000 chars per file)
- [ ] Voice input graceful degradation for Firefox users

---

## Adding lawyer-side features

The codebase is structured to add a lawyer view:

1. Add a `role` selector at app entry (`lawyer` | `client`)
2. Add `LawyerPhase` components under `src/components/lawyer/`
3. Add lawyer-specific LLM calls to `src/lib/claude.js`:
   - `analyzeWitnessQuestions(questions)` — evaluate question quality
   - `generateLawyerOutline(documents)` — full depo outline
4. For firm-level RAG: embed firm docs client-side and pass as context to all calls
