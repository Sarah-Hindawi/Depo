// ─── LLM API (Groq) ───────────────────────────────────────────────────────────
// Thin dispatcher — all prompts live in src/prompts/.
// WARNING: Never expose API keys in a production/public build.

import { TACTIC_INSTRUCTIONS }                     from '../prompts/tactics.js'
import { backgroundSystem, backgroundPrompt }       from '../prompts/attorney/background.js'
import { foundationSystem, foundationPrompt }       from '../prompts/attorney/foundation.js'
import { coreSystem, corePrompt }                   from '../prompts/attorney/core.js'
import { crossTrapSystem, crossTrapPrompt }         from '../prompts/attorney/cross_trap.js'
import { RUBRIC_SYSTEM, rubricPrompt }              from '../prompts/evaluator/rubric.js'
import { caseSummarySystem, caseSummaryPrompt }     from '../prompts/intake/caseSummary.js'
import { prepGuidePrompt }                          from '../prompts/intake/prepGuide.js'
import { REPORT_SYSTEM, reportPrompt }              from '../prompts/intake/report.js'

const API_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL     = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 1500

// ─── Base caller ─────────────────────────────────────────────────────────────
async function callModel(messages, systemPrompt) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.choices[0].message.content
}

// ─── Phase → prompt selector ──────────────────────────────────────────────────
function getAttorneyPrompts(sessionPhase) {
  switch (sessionPhase) {
    case 'FOUNDATION':  return { sys: foundationSystem,  user: foundationPrompt  }
    case 'CORE':        return { sys: coreSystem,         user: corePrompt        }
    case 'CROSS_TRAP':  return { sys: crossTrapSystem,    user: crossTrapPrompt   }
    default:            return { sys: backgroundSystem,   user: backgroundPrompt  }
  }
}

// ─── Intake functions ─────────────────────────────────────────────────────────

export async function analyzeCaseDocuments(fileTexts, fileNames, caseType, witnessRole) {
  const combined = fileTexts
    .map((t, i) => `=== ${fileNames[i]} ===\n${t.slice(0, 3000)}`)
    .join('\n\n')
  return callModel(
    [{ role: 'user', content: caseSummaryPrompt(combined) }],
    caseSummarySystem(caseType, witnessRole)
  )
}

export async function generatePrepGuide(fileTexts, fileNames, summary, caseType, witnessRole) {
  const combined = fileTexts
    .map((t, i) => `=== ${fileNames[i]} ===\n${t.slice(0, 3000)}`)
    .join('\n\n')
  const raw = await callModel(
    [{ role: 'user', content: prepGuidePrompt(combined, summary) }],
    caseSummarySystem(caseType, witnessRole)
  )
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

// ─── Simulation functions ─────────────────────────────────────────────────────

/**
 * Generate ONE question for the current phase using a specific tactic.
 * Called once per turn by the state machine.
 */
export async function generateNextQuestion(
  tactic, sessionPhase, history, summary, caseType, witnessRole, concededFacts
) {
  const { sys, user } = getAttorneyPrompts(sessionPhase)
  const tacticInstruction = TACTIC_INSTRUCTIONS[tactic] || 'Ask a clear, professional question.'
  const raw = await callModel(
    [{ role: 'user', content: user(tactic, tacticInstruction, history, summary, concededFacts) }],
    sys(caseType, witnessRole)
  )
  return JSON.parse(raw.replace(/```json|```/g, '').trim()).question
}

/**
 * Evaluate a single answer against the 10-rule rubric.
 * history is used for consistency checking (rule 8).
 */
export async function evaluateAnswer(question, answer, summary, elapsedSeconds, wordCount, history = []) {
  const raw = await callModel(
    [{ role: 'user', content: rubricPrompt(question, answer, summary, elapsedSeconds, wordCount, history) }],
    RUBRIC_SYSTEM
  )
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

// ─── Report (DEBRIEF phase) ───────────────────────────────────────────────────

export async function generateReport(history, scorecards, avgScore, fillerTotal, volTotal) {
  const qaLog = history
    .map(
      (h, i) =>
        `Q${i + 1}: ${h.q}\nAnswer: ${h.a}\nCoach note: ${scorecards[i]?.inline_feedback || ''}\nSeverity: ${scorecards[i]?.overall_severity || ''}`
    )
    .join('\n\n')
  const raw = await callModel(
    [{ role: 'user', content: reportPrompt(qaLog, avgScore, fillerTotal, volTotal) }],
    REPORT_SYSTEM
  )
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}
