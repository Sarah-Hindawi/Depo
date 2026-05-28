// ─── Filler word detection ────────────────────────────────────────────────────
const FILLERS = [
  'um', 'uh', 'like', 'you know', 'i think', 'i believe',
  'probably', 'maybe', 'i guess', 'sort of', 'kind of',
  'i mean', 'basically', 'literally',
]

export function detectFillers(text) {
  const lower = text.toLowerCase()
  return FILLERS.filter((w) => lower.includes(w))
}

// ─── Pace classification ──────────────────────────────────────────────────────
export function classifyPace(seconds, wordCount) {
  if (wordCount < 3)                                 return { label: 'Too brief',   cls: 'bad' }
  if (seconds < 2)                                   return { label: 'Rushed',      cls: 'warn' }
  if (seconds > 25 && wordCount < 15)                return { label: 'Hesitant',    cls: 'warn' }
  if (wordCount / Math.max(seconds, 1) > 4.5)       return { label: 'Very fast',   cls: 'warn' }
  return                                                    { label: 'Good pace',  cls: 'good' }
}

// ─── Session score ────────────────────────────────────────────────────────────
export function scoreAnswer(overall) {
  if (overall === 'good')  return 85
  if (overall === 'warn')  return 60
  return 35
}

export function computeAvgScore(scores) {
  if (!scores.length) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// ─── Grade label ─────────────────────────────────────────────────────────────
export function getGrade(score) {
  if (score >= 80) return { label: 'You are well prepared',          color: 'var(--green)' }
  if (score >= 60) return { label: 'Some areas to strengthen',       color: 'var(--yellow)' }
  return                  { label: 'More practice recommended',      color: 'var(--red)' }
}

// ─── File reading ─────────────────────────────────────────────────────────────
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsText(file)
  })
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
export function saveSession(data) {
  try {
    localStorage.setItem(
      'depo-prep-session',
      JSON.stringify({ ...data, savedAt: new Date().toISOString() })
    )
  } catch (_) {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem('depo-prep-session')
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

// ─── Report download ──────────────────────────────────────────────────────────
export function downloadReport(history, scorecards, report, score, caseType) {
  const lines = [
    'DEPOSITION PREP REPORT',
    '='.repeat(50),
    `Date: ${new Date().toLocaleDateString('en-CA')}`,
    `Case type: ${caseType}`,
    `Overall score: ${score}/100`,
    '',
    'WHAT YOU DID WELL',
    report.strengths,
    '',
    'WHAT TO WORK ON',
    report.weaknesses,
    '',
    'YOUR PERSONAL DOs',
    ...(report.personalDos || []).map((d) => `  • ${d}`),
    '',
    "YOUR PERSONAL DON'Ts",
    ...(report.personalDonts || []).map((d) => `  • ${d}`),
    '',
    'FULL Q&A REVIEW',
    '='.repeat(50),
    ...history.flatMap((h, i) => [
      '',
      `Q${i + 1}: ${h.q}`,
      `Your answer: ${h.a}`,
      `Coach feedback: ${scorecards[i]?.tip || '—'}`,
      `Rating: ${scorecards[i]?.overall || '—'}`,
    ]),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `deposition-prep-report-${Date.now()}.txt`
  a.click()
}
