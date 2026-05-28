// ─── Anthropic API ────────────────────────────────────────────────────────────
// All Claude calls go through this module.
// Add VITE_ANTHROPIC_API_KEY to your .env file.
// WARNING: Never expose API keys in a production/public build.
// For production, proxy all calls through your own backend.

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

function buildSimSystem(caseType, witnessRole) {
  return `You are playing the role of opposing counsel conducting a deposition examination.

Your style:
- Professional, methodical, and sometimes challenging — but never abusive
- Ask one focused question at a time
- Base your questions on the case documents provided
- Probe for weaknesses, lock in testimony, test consistency

Question structure (follow this order):
1. Background (role, timeline, relationships)
2. Establish undisputed facts
3. Probe the core facts and claims
4. Challenge weak points or inconsistencies

Case type: ${caseType}
Witness role: ${witnessRole}`
}

const EVAL_SYSTEM = `You are a deposition coach evaluating a witness's answer.

Rules:
- Respond in plain language — no legal jargon
- Be direct but kind — the client needs honest feedback to improve
- Focus on what they can immediately change

Return ONLY valid JSON, no markdown, no preamble:
{
  "relevance": "On Point" | "Off Track" | "Over-Explained",
  "tone": "Confident" | "Neutral" | "Defensive" | "Evasive",
  "volunteered": boolean,
  "tip": "one coaching sentence, max 20 words, plain language",
  "overall": "good" | "warn" | "bad"
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
 * Generate deposition questions grounded in uploaded documents.
 * Returns array of 6 question strings.
 */
export async function generateDepoQuestions(fileTexts, fileNames, summary, caseType, witnessRole) {
  const combined = fileTexts
    .map((t, i) => `=== ${fileNames[i]} ===\n${t.slice(0, 3000)}`)
    .join('\n\n')

  const raw = await callModel(
    [
      {
        role: 'user',
        content: `Generate exactly 6 deposition questions opposing counsel would ask this witness.

Case type: ${caseType}
Witness role: ${witnessRole}
Case summary: ${summary}
Documents:
${combined}

Question structure:
- Q1-2: Background (role, timeline, key relationships)
- Q3-4: Core facts and claims in the documents
- Q5-6: Challenging questions targeting weak points or inconsistencies

Return ONLY valid JSON, no markdown:
{"questions": ["q1", "q2", "q3", "q4", "q5", "q6"]}

Make questions specific to the documents — not generic deposition questions.`,
      },
    ],
    buildSimSystem(caseType, witnessRole)
  )

  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean).questions
}

/**
 * Evaluate a single deposition answer.
 * Returns { relevance, tone, volunteered, tip, overall }
 */
export async function evaluateAnswer(question, answer, summary, elapsedSeconds, wordCount) {
  const raw = await callModel(
    [
      {
        role: 'user',
        content: `Evaluate this deposition answer.

Question: "${question}"
Answer: "${answer}"
Case context: ${summary}
Response time: ${Math.round(elapsedSeconds)} seconds
Word count: ${wordCount} words`,
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
        `Q${i + 1}: ${h.q}\nAnswer: ${h.a}\nCoach note: ${scorecards[i]?.tip || ''}\nOverall: ${scorecards[i]?.overall || ''}`
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
