// ─── LLM API (Groq) ───────────────────────────────────────────────────────────
// All model calls go through this module.
// WARNING: Never expose API keys in a production/public build.

const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 1500

// ─── Base caller ─────────────────────────────────────────────────────────────
async function callModel(messages, systemPrompt) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.choices[0].message.content
}

// ─── System prompts ───────────────────────────────────────────────────────────

function buildBaseSystem(caseType, witnessRole) {
  return `You are a deposition preparation coach helping a legal client prepare for their deposition.

Your role:
- Speak in plain, everyday language — never use legal jargon without immediately explaining it in parentheses
- Be warm, supportive, and honest — depositions are extremely stressful for clients
- Ground everything strictly in the uploaded case documents — never invent facts or fabricate legal authority
- When uncertain, say so clearly — flag any assumptions you make
- Your goal: help the client feel confident, prepared, and know exactly what to say and what NOT to say

Case type: ${caseType}
Witness role: ${witnessRole}
Jurisdiction: Ontario, Canada (assume unless stated otherwise)`
}

const TACTIC_INSTRUCTIONS = {
  open_ended:      'Ask an open-ended question to gather information. Use "Tell me about…" or "Can you describe…"',
  leading_soft:    'Ask a mildly leading question that gently steers the witness toward confirming a fact.',
  leading_lockin:  'Lock the witness into a specific concession they\'ve already implied. E.g., "So you\'re saying…" or "Let me make sure I understand — you [fact]?"',
  compound:        'Embed two or more sub-questions in a single question so the witness must answer all parts.',
  false_premise:   'Embed a false or unproven premise. E.g., "After you did X…" (where X may not have happened).',
  speculation_bait:'Invite the witness to speculate. E.g., "What do you think he was planning?" or "Why do you suppose…?"',
  emotional_prov:  'Use emotionally challenging framing to test composure. Stay professional but pointed.',
  impeachment:     'Point to a weakness or inconsistency in what the witness has said and press on it.',
  prior_quote:     'Quote or paraphrase something the witness said earlier in this deposition and probe its consistency.',
}

function buildSimSystem(caseType, witnessRole) {
  return `You are playing the role of opposing counsel conducting a civil deposition examination.

Your style:
- Professional, methodical, and sometimes challenging — but never abusive
- Ask exactly ONE question per turn (never multiple)
- Ground every question in the case documents provided
- Follow the tactic instruction precisely

Case type: ${caseType}
Witness role: ${witnessRole}
Jurisdiction: Ontario, Canada`
}

const EVAL_SYSTEM = `You are a deposition prep coach evaluating a witness's answer against a 10-rule rubric.

Rules:
- Plain language only — no legal jargon
- Be direct but kind
- Use prior Q&A history to judge consistency

Return ONLY valid JSON, no markdown, no preamble:
{
  "only_answered_what_asked": boolean,
  "volunteered_info": boolean,
  "speculated": boolean,
  "argued_with_attorney": boolean,
  "emotional": boolean,
  "consistent_with_prior": boolean,
  "walked_into_compound": boolean,
  "accepted_false_premise": boolean,
  "overall_severity": "low" | "medium" | "high",
  "inline_feedback": "one plain-language coaching sentence, max 25 words",
  "coaching_note": "1-2 sentences of specific improvement advice"
}`

const REPORT_SYSTEM = `You are a deposition coach writing a post-session report for a client.

Rules:
- Plain language only — no legal jargon whatsoever
- Be honest but encouraging — this person is anxious and worked hard
- Be specific to their actual answers — not generic advice
- Speak directly to the client as "you"

Return ONLY valid JSON, no markdown, no preamble:
{
  "strengths": "2-3 sentences on what they did well, specific to their answers",
  "weaknesses": "2-3 sentences on what to improve, specific and immediately actionable",
  "personalDos": ["3 specific DOs based on their performance today"],
  "personalDonts": ["3 specific DON'Ts based on their performance today"]
}`

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Analyse uploaded documents and return a plain-language case summary.
 */
export async function analyzeCaseDocuments(fileTexts, fileNames, caseType, witnessRole) {
  const combined = fileTexts
    .map((t, i) => `=== ${fileNames[i]} ===\n${t.slice(0, 3000)}`)
    .join('\n\n')

  return callModel(
    [
      {
        role: 'user',
        content: `Based on these case documents, write a plain-language summary of this case in 3-4 sentences. 
No legal jargon. Write it directly to the client as "your case". 
If information is missing or unclear, say so rather than guessing.

Documents:
${combined}`,
      },
    ],
    buildBaseSystem(caseType, witnessRole)
  )
}

/**
 * Generate case-specific DOs, DON'Ts, and reminders from documents.
 */
export async function generatePrepGuide(fileTexts, fileNames, summary, caseType, witnessRole) {
  const combined = fileTexts
    .map((t, i) => `=== ${fileNames[i]} ===\n${t.slice(0, 3000)}`)
    .join('\n\n')

  const raw = await callModel(
    [
      {
        role: 'user',
        content: `Based on these case documents, generate a deposition prep guide for this specific client.

Case summary: ${summary}
Documents:
${combined}

Return ONLY valid JSON, no markdown:
{
  "dos": ["5-6 specific DOs based on this case, plain language, start with a verb like 'Answer', 'Stay', 'Keep'"],
  "donts": ["5-6 specific DON'Ts based on this case, plain language, start with 'Don't' or 'Never'"],
  "reminders": ["3-4 key things specific to this case the client must remember going in"]
}

Base everything on the actual documents. Be specific — not generic advice.`,
      },
    ],
    buildBaseSystem(caseType, witnessRole)
  )

  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

/**
 * Generate ONE deposition question using a specific attorney tactic.
 * Called once per turn; tactic + phase are selected by the state machine.
 */
export async function generateNextQuestion(tactic, sessionPhase, history, summary, caseType, witnessRole, concededFacts) {
  const combined = history.length
    ? history.slice(-4).map((h, i) => `Q: ${h.q}\nA: ${h.a}`).join('\n\n')
    : 'No prior questions yet — this is the opening question.'

  const concededCtx = concededFacts.length
    ? `Facts the witness has already conceded or volunteered:\n${concededFacts.join('\n')}`
    : ''

  const tacticNote = TACTIC_INSTRUCTIONS[tactic] || 'Ask a clear, professional question.'

  const raw = await callModel(
    [
      {
        role: 'user',
        content: `Generate exactly ONE deposition question.

Tactic to use: ${tactic}
Tactic instruction: ${tacticNote}
Current deposition phase: ${sessionPhase}
Case summary: ${summary}
${concededCtx}

Recent Q&A history:
${combined}

Return ONLY valid JSON, no markdown:
{"question": "the single question text"}

The question must be grounded in the case. Do not add any preamble.`,
      },
    ],
    buildSimSystem(caseType, witnessRole)
  )

  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean).question
}

/**
 * Evaluate a single deposition answer against the 10-rule rubric.
 * history is used for consistency checking.
 */
export async function evaluateAnswer(question, answer, summary, elapsedSeconds, wordCount, history = []) {
  const priorContext = history.length
    ? 'Prior answers for consistency check:\n' + history.slice(-3).map((h, i) => `A${i + 1}: ${h.a}`).join('\n')
    : ''

  const raw = await callModel(
    [
      {
        role: 'user',
        content: `Evaluate this deposition answer against the 10-rule witness rubric.

Question: "${question}"
Answer: "${answer}"
Case context: ${summary}
Response time: ${Math.round(elapsedSeconds)} seconds
Word count: ${wordCount} words
${priorContext}`,
      },
    ],
    EVAL_SYSTEM
  )

  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

/**
 * Generate the final session report.
 * Returns { strengths, weaknesses, personalDos, personalDonts }
 */
export async function generateReport(history, scorecards, avgScore, fillerTotal, volTotal) {
  const qaLog = history
    .map(
      (h, i) =>
        `Q${i + 1}: ${h.q}\nAnswer: ${h.a}\nCoach note: ${scorecards[i]?.inline_feedback || scorecards[i]?.tip || ''}\nSeverity: ${scorecards[i]?.overall_severity || scorecards[i]?.overall || ''}`
    )
    .join('\n\n')

  const raw = await callModel(
    [
      {
        role: 'user',
        content: `A client just completed a deposition simulation. Write their personal report.

Session stats:
- Average score: ${avgScore}/100
- Total filler words used: ${fillerTotal}
- Times they over-shared (volunteered info): ${volTotal}

Full Q&A session:
${qaLog}

Be specific to their actual answers. Encourage them but be honest.`,
      },
    ],
    REPORT_SYSTEM
  )

  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}
