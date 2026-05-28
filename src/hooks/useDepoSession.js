import { useReducer, useCallback } from 'react'
import {
  analyzeCaseDocuments,
  generatePrepGuide,
  generateNextQuestion,
  evaluateAnswer,
  generateReport,
} from '../lib/claude.js'
import {
  readFileAsText,
  detectFillers,
  classifyPace,
  scoreAnswer,
  computeAvgScore,
  saveSession,
} from '../lib/utils.js'

// ─── Layer 1: Session phase machine ──────────────────────────────────────────
// BACKGROUND → FOUNDATION → CORE → CROSS_TRAP (monotonic; CORE can early-jump)
const SESSION_PHASES = ['BACKGROUND', 'FOUNDATION', 'CORE', 'CROSS_TRAP']
const PHASE_TURNS    = { BACKGROUND: 2, FOUNDATION: 2, CORE: 3, CROSS_TRAP: 2 }
export const TOTAL_TURNS = Object.values(PHASE_TURNS).reduce((a, b) => a + b, 0) // 9

// ─── Layer 2: Attorney tactic machine ────────────────────────────────────────
// Weights come from DepoSim design doc §6.4
const TACTIC_WEIGHTS = {
  BACKGROUND: { open_ended: 0.6, leading_soft: 0.4 },
  FOUNDATION: { open_ended: 0.4, leading_soft: 0.4, leading_lockin: 0.2 },
  CORE: {
    open_ended: 0.1, leading_soft: 0.2, leading_lockin: 0.3,
    compound: 0.15, false_premise: 0.15, speculation_bait: 0.1,
    emotional_prov: 0.05, impeachment: 0.05,
  },
  CROSS_TRAP: {
    leading_soft: 0.1, leading_lockin: 0.3, compound: 0.1,
    false_premise: 0.1, speculation_bait: 0.1, emotional_prov: 0.05,
    impeachment: 0.15, prior_quote: 0.2,
  },
}

function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [tactic, w] of Object.entries(weights)) {
    r -= w
    if (r <= 0) return tactic
  }
  return Object.keys(weights)[0]
}

// Promotion rules (§6.5): force specific tactic based on last score.
// FOUNDATION special case: if no concessions yet, force leading_lockin to get one.
function selectTactic(sessionPhase, tacticHistory, lastScore, concededFacts = []) {
  // FOUNDATION gate: if no concessions yet, force leading_lockin
  if (sessionPhase === 'FOUNDATION' && concededFacts.length === 0) {
    return 'leading_lockin'
  }
  if (lastScore) {
    if (lastScore.consistent_with_prior === false) return 'prior_quote'
    if (lastScore.volunteered_info === true)       return 'leading_lockin'
    if (lastScore.speculated === true)             return 'speculation_bait'
  }
  const weights = { ...TACTIC_WEIGHTS[sessionPhase] }
  // Exclude tactic used 3 turns in a row
  const last3 = tacticHistory.slice(-3)
  if (last3.length === 3 && last3.every((t) => t === last3[0])) {
    delete weights[last3[0]]
  }
  if (!Object.keys(weights).length) return weightedRandom(TACTIC_WEIGHTS[sessionPhase])
  return weightedRandom(weights)
}

// Map turn index → default session phase by quota
function phaseForTurn(turnIdx) {
  let cum = 0
  for (const phase of SESSION_PHASES) {
    cum += PHASE_TURNS[phase]
    if (turnIdx < cum) return phase
  }
  return 'CROSS_TRAP'
}

// State-diagram transition rules (override default phase-by-turn):
// FOUNDATION exits only when phase_complete AND conceded_facts >= 1
// CORE exits on phase_complete OR inconsistency_detected (early jump)
// CROSS_TRAP exits on phase_complete OR user_recanted
function nextPhase(currentPhase, defaultNextPhase, concededFacts, lastScore, crossTrapConsecutiveClean) {
  if (currentPhase === 'FOUNDATION' && defaultNextPhase === 'CORE' && concededFacts.length < 1) {
    return 'FOUNDATION' // stay until at least 1 concession
  }
  if (currentPhase === 'CORE' && lastScore?.consistent_with_prior === false) {
    return 'CROSS_TRAP' // early jump on inconsistency_detected
  }
  // user_recanted: witness was clean for 2 consecutive CROSS_TRAP turns → exit early
  if (currentPhase === 'CROSS_TRAP' && crossTrapConsecutiveClean >= 2) {
    return 'DEBRIEF'
  }
  return defaultNextPhase
}

// Fallback questions when LLM fails
const FALLBACK_Q = {
  BACKGROUND:  'Can you state your full name and describe your role in this matter for the record?',
  FOUNDATION:  'Can you walk me through the timeline of key events as you experienced them?',
  CORE:        'Can you be more specific about exactly what happened during the incident in question?',
  CROSS_TRAP:  'Earlier you described the events — I want to make sure I understand your position exactly. Can you clarify?',
}

// ─── State shape ──────────────────────────────────────────────────────────────
const INITIAL = {
  phase: 'upload',           // app phase: upload | summary | prep | sim | report
  sessionPhase: 'BACKGROUND',// deposition phase (Layer 1)
  loading: false,
  loadingMsg: '',
  error: '',

  // Upload
  files: [],
  fileTexts: [],
  caseType: 'wrongful-dismissal',
  witnessRole: 'plaintiff',

  // Case analysis
  summary: '',
  dos: [],
  donts: [],
  reminders: [],

  // Simulation — turn-by-turn (Layer 3)
  currentQuestion: null,     // { text, tactic, sessionPhase }
  currentTurnIdx: 0,
  answer: '',
  answerStart: null,
  history: [],               // [{ q, a }] — kept for report compat
  scorecards: [],            // one per turn
  concededFacts: [],         // append-only (Layer 1 state)
  tacticHistory: [],         // tactic used each turn (Layer 2 state)
  crossTrapClean: 0,         // consecutive clean turns in CROSS_TRAP (user_recanted detection)
  lastFeedback: null,
  flags: [],
  scores: [],
  fillerTotal: 0,
  volTotal: 0,

  // Report
  report: null,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'SET':   return { ...state, [action.key]: action.value }
    case 'PATCH': return { ...state, ...action.payload }
    case 'RESET': return { ...INITIAL }
    default:      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useDepoSession() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const set   = (key, value) => dispatch({ type: 'SET', key, value })
  const patch  = (payload)   => dispatch({ type: 'PATCH', payload })

  // ── File management ──────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles) => {
    set('files', (() => {
      const combined = [...state.files]
      for (const f of newFiles) {
        if (combined.length >= 5) break
        if (!combined.find((x) => x.name === f.name)) combined.push(f)
      }
      return combined
    })())
  }, [state.files])

  const removeFile = useCallback((name) => {
    set('files', state.files.filter((f) => f.name !== name))
  }, [state.files])

  // ── Step 1 → 2: Analyse documents ────────────────────────────────────────
  const analyseDocuments = useCallback(async () => {
    if (!state.files.length) {
      set('error', 'Please upload at least one document.')
      return
    }
    patch({ loading: true, loadingMsg: 'Reading your documents...', error: '' })
    try {
      const texts = await Promise.all(state.files.map(readFileAsText))
      patch({ fileTexts: texts, loadingMsg: 'Summarising your case...' })
      const summary = await analyzeCaseDocuments(
        texts, state.files.map((f) => f.name), state.caseType, state.witnessRole
      )
      patch({ summary, loading: false, phase: 'summary' })
      saveSession({ caseType: state.caseType, summary })
    } catch (e) {
      patch({ error: e.message, loading: false })
    }
  }, [state.files, state.caseType, state.witnessRole])

  // ── Step 2 → 3: Generate prep guide ──────────────────────────────────────
  const buildPrepGuide = useCallback(async () => {
    patch({ loading: true, loadingMsg: 'Building your prep guide...' })
    try {
      const guide = await generatePrepGuide(
        state.fileTexts, state.files.map((f) => f.name),
        state.summary, state.caseType, state.witnessRole
      )
      patch({ dos: guide.dos || [], donts: guide.donts || [], reminders: guide.reminders || [], loading: false, phase: 'prep' })
    } catch (e) {
      patch({
        dos: [
          'Answer only the specific question that was asked',
          'Speak slowly, clearly, and confidently',
          "Say \"I don't know\" or \"I don't recall\" when you genuinely don't",
          'Ask for clarification if a question is unclear',
          'Stick strictly to facts you personally know',
        ],
        donts: [
          "Don't guess or speculate about things you don't know for certain",
          "Don't volunteer extra information that wasn't asked for",
          "Don't argue or show frustration with the opposing lawyer",
          "Don't answer a question you didn't fully understand",
          "Don't look to your lawyer for answers — they can only object",
        ],
        reminders: [
          'Every word in this deposition is on the record — pause before answering',
          'You can ask for a break at any time if you feel overwhelmed',
          'There are no trick questions — just answer what was actually asked',
        ],
        loading: false,
        phase: 'prep',
      })
    }
  }, [state.fileTexts, state.files, state.summary, state.caseType, state.witnessRole])

  // ── Step 3 → 4: Start simulation — generate first question ───────────────
  const startSimulation = useCallback(async () => {
    patch({ loading: true, loadingMsg: 'Starting your deposition...' })
    const tactic = selectTactic('BACKGROUND', [], null)
    let questionText
    try {
      questionText = await generateNextQuestion(
        tactic, 'BACKGROUND', [], state.summary, state.caseType, state.witnessRole, []
      )
    } catch (_) {
      questionText = FALLBACK_Q.BACKGROUND
    }
    patch({
      currentQuestion: { text: questionText, tactic, sessionPhase: 'BACKGROUND' },
      currentTurnIdx: 0,
      sessionPhase: 'BACKGROUND',
      history: [], scorecards: [], concededFacts: [],
      tacticHistory: [tactic], crossTrapClean: 0,
      lastFeedback: null, flags: [], scores: [], fillerTotal: 0, volTotal: 0,
      answer: '', answerStart: null,
      loading: false, phase: 'sim',
    })
  }, [state.summary, state.caseType, state.witnessRole])

  // ── Layer 3 turn loop: submit answer → metrics → eval → next question ─────
  const submitAnswer = useCallback(async (answer, elapsed) => {
    if (!answer.trim()) return

    const words  = answer.trim().split(/\s+/).length
    const fillers = detectFillers(answer)
    const pace   = classifyPace(elapsed, words)

    patch({ loading: true, loadingMsg: 'Evaluating your answer...' })

    // Capture current state before async gap
    const currentQ       = state.currentQuestion
    const turnIdx        = state.currentTurnIdx
    const currentHistory = state.history
    const currentTacticH = state.tacticHistory
    const currentFacts   = state.concededFacts

    // ── METRICS_COMPUTED + GRADED ─────────────────────────────────────────
    let ev
    try {
      ev = await evaluateAnswer(
        currentQ.text, answer, state.summary, elapsed, words, currentHistory
      )
    } catch (_) {
      ev = {
        only_answered_what_asked: true, volunteered_info: false,
        speculated: false, argued_with_attorney: false, emotional: false,
        consistent_with_prior: true, walked_into_compound: false,
        accepted_false_premise: false, overall_severity: 'low',
        inline_feedback: 'Keep your answers focused and concise.',
        coaching_note: 'Could not evaluate this turn.',
      }
    }

    // Build scorecard with backward-compat aliases
    const sc = {
      ...ev,
      overall: ev.overall_severity === 'low' ? 'good' : ev.overall_severity === 'medium' ? 'warn' : 'bad',
      tip: ev.inline_feedback,
      volunteered: ev.volunteered_info,
      pace: pace.cls,
      paceLabel: pace.label,
      fillers,
      elapsed: Math.round(elapsed),
      words,
      tactic: currentQ.tactic,
      sessionPhase: currentQ.sessionPhase,
    }

    // ── TURN_COMMIT ───────────────────────────────────────────────────────
    const newHistory    = [...currentHistory,           { q: currentQ.text, a: answer }]
    const newScorecards = [...state.scorecards,          sc]
    const newScores     = [...state.scores,              scoreAnswer(ev.overall_severity)]
    const newFillers    = state.fillerTotal + fillers.length
    const newVol        = state.volTotal + (ev.volunteered_info ? 1 : 0)

    // Append-only conceded facts
    const newFacts = [...currentFacts]
    if (ev.volunteered_info) {
      newFacts.push(`Turn ${turnIdx + 1}: witness volunteered — "${answer.slice(0, 80)}"`)
    }

    const newFlags = [
      ...state.flags,
      ...(ev.volunteered_info || ev.emotional || ev.speculated || fillers.length > 1
        ? [ev.inline_feedback]
        : []),
    ]

    const nextTurnIdx = turnIdx + 1
    const isDone = nextTurnIdx >= TOTAL_TURNS

    if (isDone) {
      patch({
        history: newHistory, scorecards: newScorecards, scores: newScores,
        fillerTotal: newFillers, volTotal: newVol, flags: newFlags,
        concededFacts: newFacts, lastFeedback: sc,
        answer: '', answerStart: null, currentTurnIdx: nextTurnIdx,
      })
      setTimeout(
        () => buildFinalReport(newHistory, newScorecards, newScores, newFillers, newVol),
        1200
      )
      return
    }

    // ── Layer 1 phase advance (state-diagram rules) ───────────────────────
    // Track consecutive clean turns for user_recanted detection in CROSS_TRAP
    const isClean = ev.consistent_with_prior && !ev.volunteered_info && !ev.speculated && !ev.emotional
    const newCrossTrapClean = state.sessionPhase === 'CROSS_TRAP'
      ? (isClean ? state.crossTrapClean + 1 : 0)
      : 0

    const defaultNext = phaseForTurn(nextTurnIdx)
    const nextSessionPhase = nextPhase(
      state.sessionPhase, defaultNext, newFacts, ev, newCrossTrapClean
    )

    // ── Layer 2 tactic selection ──────────────────────────────────────────
    const nextTactic = selectTactic(nextSessionPhase, currentTacticH, ev, newFacts)
    const newTacticHistory = [...currentTacticH, nextTactic]

    // ── Generate next question ────────────────────────────────────────────
    let nextQuestionText
    try {
      nextQuestionText = await generateNextQuestion(
        nextTactic, nextSessionPhase, newHistory,
        state.summary, state.caseType, state.witnessRole, newFacts
      )
    } catch (_) {
      nextQuestionText = FALLBACK_Q[nextSessionPhase]
    }

    patch({
      history: newHistory, scorecards: newScorecards, scores: newScores,
      fillerTotal: newFillers, volTotal: newVol, flags: newFlags,
      concededFacts: newFacts, tacticHistory: newTacticHistory,
      crossTrapClean: newCrossTrapClean,
      currentTurnIdx: nextTurnIdx,
      sessionPhase: nextSessionPhase,
      currentQuestion: { text: nextQuestionText, tactic: nextTactic, sessionPhase: nextSessionPhase },
      lastFeedback: sc,
      answer: '', answerStart: null,
      loading: false,
    })
  }, [state])

  // ── Generate final report ─────────────────────────────────────────────────
  const buildFinalReport = useCallback(async (history, scorecards, scores, fillerTotal, volTotal) => {
    patch({ loading: true, loadingMsg: 'Generating your personal report...' })
    const avg = computeAvgScore(scores)
    try {
      const report = await generateReport(history, scorecards, avg, fillerTotal, volTotal)
      patch({ report, loading: false, phase: 'report' })
      saveSession({ history, scorecards, report, avg })
    } catch (_) {
      patch({
        report: {
          strengths: 'You completed the full simulation — that itself is great preparation for the real thing.',
          weaknesses: 'Focus on keeping answers brief and avoid adding information that was not directly asked for.',
          personalDos: ['Pause 2 seconds before each answer', 'Answer in one or two sentences', "Say \"I don't recall\" when uncertain"],
          personalDonts: ["Don't over-explain your answers", "Don't speculate about things you don't know", "Don't get defensive — stay calm"],
        },
        loading: false,
        phase: 'report',
      })
    }
  }, [])

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    state,
    set,
    patch,
    addFiles,
    removeFile,
    analyseDocuments,
    buildPrepGuide,
    startSimulation,
    submitAnswer,
    reset,
  }
}
