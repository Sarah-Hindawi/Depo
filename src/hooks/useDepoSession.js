import { useReducer, useCallback } from 'react'
import {
  analyzeCaseDocuments,
  generatePrepGuide,
  generateDepoQuestions,
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

// ─── State shape ──────────────────────────────────────────────────────────────
const INITIAL = {
  phase: 'upload',        // upload | summary | prep | sim | report
  loading: false,
  loadingMsg: '',
  error: '',

  // Upload
  files: [],
  fileTexts: [],
  caseType: 'wrongful-dismissal',
  witnessRole: 'plaintiff',

  // Analysis
  summary: '',
  dos: [],
  donts: [],
  reminders: [],

  // Simulation
  questions: [],
  currentQ: 0,
  answer: '',
  answerStart: null,
  history: [],
  scorecards: [],
  flags: [],
  scores: [],
  fillerTotal: 0,
  volTotal: 0,
  lastFeedback: null,

  // Report
  report: null,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'SET':    return { ...state, [action.key]: action.value }
    case 'PATCH':  return { ...state, ...action.payload }
    case 'RESET':  return { ...INITIAL }
    default:       return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useDepoSession() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const set = (key, value) => dispatch({ type: 'SET', key, value })
  const patch = (payload) => dispatch({ type: 'PATCH', payload })

  // ── File management ──────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles) => {
    dispatch((prev) => {
      const combined = [...state.files]
      for (const f of newFiles) {
        if (combined.length >= 5) break
        if (!combined.find((x) => x.name === f.name)) combined.push(f)
      }
      return { type: 'SET', key: 'files', value: combined }
    })
    // Re-read to avoid stale closure
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
        texts,
        state.files.map((f) => f.name),
        state.caseType,
        state.witnessRole
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
        state.fileTexts,
        state.files.map((f) => f.name),
        state.summary,
        state.caseType,
        state.witnessRole
      )
      patch({
        dos: guide.dos || [],
        donts: guide.donts || [],
        reminders: guide.reminders || [],
        loading: false,
        phase: 'prep',
      })
    } catch (e) {
      // Fallback guide if Claude fails
      patch({
        dos: [
          'Answer only the specific question that was asked',
          'Speak slowly, clearly, and confidently',
          'Say "I don\'t know" or "I don\'t recall" when you genuinely don\'t',
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

  // ── Step 3 → 4: Start simulation ─────────────────────────────────────────
  const startSimulation = useCallback(async () => {
    patch({ loading: true, loadingMsg: 'Generating your deposition questions...' })

    try {
      const questions = await generateDepoQuestions(
        state.fileTexts,
        state.files.map((f) => f.name),
        state.summary,
        state.caseType,
        state.witnessRole
      )
      patch({
        questions,
        currentQ: 0,
        answer: '',
        answerStart: null,
        history: [],
        scorecards: [],
        flags: [],
        scores: [],
        fillerTotal: 0,
        volTotal: 0,
        lastFeedback: null,
        loading: false,
        phase: 'sim',
      })
    } catch (e) {
      // Fallback generic questions
      patch({
        questions: [
          'Can you state your full name and current position for the record?',
          'How long have you been involved in this matter and what is your relationship to the key parties?',
          'Can you walk me through the events in chronological order, starting from the beginning?',
          'Were there any other witnesses present during the incidents you described?',
          'Have you made any written complaints or raised concerns about this matter before today?',
          'Is there anything in the documents provided that you believe is inaccurate or incomplete?',
        ],
        currentQ: 0,
        answer: '',
        answerStart: null,
        history: [],
        scorecards: [],
        flags: [],
        scores: [],
        fillerTotal: 0,
        volTotal: 0,
        lastFeedback: null,
        loading: false,
        phase: 'sim',
      })
    }
  }, [state.fileTexts, state.files, state.summary, state.caseType, state.witnessRole])

  // ── Submit answer + evaluate ──────────────────────────────────────────────
  const submitAnswer = useCallback(async (answer, elapsed) => {
    if (!answer.trim()) return

    const words = answer.trim().split(/\s+/).length
    const fillers = detectFillers(answer)
    const pace = classifyPace(elapsed, words)

    patch({ loading: true, loadingMsg: 'Evaluating your answer...' })

    let ev
    try {
      ev = await evaluateAnswer(
        state.questions[state.currentQ],
        answer,
        state.summary,
        elapsed,
        words
      )
    } catch (e) {
      ev = {
        relevance: 'On Point',
        tone: 'Neutral',
        volunteered: false,
        tip: 'Keep your answers focused and concise.',
        overall: 'warn',
      }
    }

    const sc = {
      tone: ev.tone,
      relevance: ev.relevance,
      volunteered: ev.volunteered,
      tip: ev.tip,
      overall: ev.overall,
      pace: pace.cls,
      paceLabel: pace.label,
      fillers,
      elapsed: Math.round(elapsed),
      words,
    }

    const newHistory    = [...state.history,    { q: state.questions[state.currentQ], a: answer }]
    const newScorecards = [...state.scorecards,  sc]
    const newScores     = [...state.scores,      scoreAnswer(ev.overall)]
    const newFillers    = state.fillerTotal + fillers.length
    const newVol        = state.volTotal + (ev.volunteered ? 1 : 0)

    const newFlags =
      ev.volunteered || ev.tone === 'Defensive' || ev.tone === 'Evasive' || fillers.length > 1
        ? [...state.flags, ev.tip]
        : state.flags

    const isLast = state.currentQ + 1 >= state.questions.length

    patch({
      history: newHistory,
      scorecards: newScorecards,
      scores: newScores,
      fillerTotal: newFillers,
      volTotal: newVol,
      flags: newFlags,
      lastFeedback: sc,
      answer: '',
      answerStart: null,
      loading: false,
    })

    if (isLast) {
      // Slight delay so the last feedback renders before report
      setTimeout(() => buildFinalReport(newHistory, newScorecards, newScores, newFillers, newVol), 1200)
    } else {
      set('currentQ', state.currentQ + 1)
    }
  }, [state])

  // ── Generate final report ─────────────────────────────────────────────────
  const buildFinalReport = useCallback(async (history, scorecards, scores, fillerTotal, volTotal) => {
    patch({ loading: true, loadingMsg: 'Generating your personal report...' })

    const avg = computeAvgScore(scores)

    try {
      const report = await generateReport(history, scorecards, avg, fillerTotal, volTotal)
      patch({ report, loading: false, phase: 'report' })
      saveSession({ history, scorecards, report, avg })
    } catch (e) {
      patch({
        report: {
          strengths: 'You completed the full simulation — that itself is great preparation for the real thing.',
          weaknesses: 'Focus on keeping answers brief and avoid adding information that was not directly asked for.',
          personalDos: ['Pause for 2 seconds before each answer', 'Answer in one or two sentences', 'Say "I don\'t recall" when uncertain'],
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
