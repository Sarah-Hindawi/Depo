import React, { useRef, useEffect } from 'react'
import { Badge, ErrorMsg } from './ui.jsx'
import { useVoice } from '../hooks/useVoice.js'
import { computeAvgScore } from '../lib/utils.js'
import styles from './phases.module.css'

const TOTAL_Q = 6

const QUICK_RULES = [
  'Answer only what was asked',
  "It's OK to say 'I don't know'",
  'Pause before answering',
  'Ask for clarification',
  'Never guess or speculate',
]

export function SimPhase({ state, set, patch, onSubmit }) {
  const { recording, toggleVoice, stopVoice, voiceError } = useVoice()
  const answerStartRef = useRef(null)
  const textareaRef = useRef(null)

  const q = state.questions[state.currentQ]
  const avgScore = computeAvgScore(state.scores)
  const progPct = Math.round((state.currentQ / TOTAL_Q) * 100)

  useEffect(() => {
    answerStartRef.current = null
    set('answer', '')
    textareaRef.current?.focus()
  }, [state.currentQ])

  function handleFocus() {
    if (!answerStartRef.current) answerStartRef.current = Date.now()
  }

  function handleMic() {
    if (!answerStartRef.current) answerStartRef.current = Date.now()
    toggleVoice((transcript) => {
      set('answer', transcript)
      patch({ answerStart: answerStartRef.current })
    })
  }

  function handleSubmit() {
    if (state.loading || !state.answer.trim()) return
    if (recording) stopVoice()
    const elapsed = answerStartRef.current
      ? (Date.now() - answerStartRef.current) / 1000
      : 5
    onSubmit(state.answer, elapsed)
  }

  const sc = state.lastFeedback
  const showFeedback = sc && state.history.length === state.currentQ

  return (
    <div className={styles.simLayout}>
      {/* ── Main column ── */}
      <div>
        {/* History */}
        {state.history.map((h, i) => {
          const hsc = state.scorecards[i]
          return (
            <div key={i} className={styles.histItem}>
              <div className={styles.histQ}>"{h.q}"</div>
              <div className={styles.histA}>{h.a}</div>
              {hsc && (
                <div className={styles.badgeRow}>
                  <Badge variant={hsc.pace === 'good' ? 'good' : 'warn'}>{hsc.paceLabel}</Badge>
                  <Badge variant={hsc.tone === 'Confident' || hsc.tone === 'Neutral' ? 'good' : 'warn'}>{hsc.tone}</Badge>
                  {hsc.volunteered && <Badge variant="bad">Over-shared</Badge>}
                </div>
              )}
            </div>
          )
        })}

        {/* Current question */}
        <div className={styles.qCard}>
          <div className={styles.qMeta}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6l9-4 9 4v6c0 5.25-3.75 9.75-9 11-5.25-1.25-9-5.75-9-11V6z"/></svg>
            Opposing counsel · Question {state.currentQ + 1} of {TOTAL_Q}
          </div>
          <div className={styles.qText}>"{q}"</div>

          <div className={styles.answerLabel}>Your answer — speak or type</div>
          <div className={styles.ansRow}>
            <textarea
              ref={textareaRef}
              value={state.answer}
              onFocus={handleFocus}
              onChange={(e) => set('answer', e.target.value)}
              placeholder="Answer as you would in the actual deposition..."
              disabled={state.loading}
              rows={3}
            />
            <button
              className={`${styles.micBtn} ${recording ? styles.micBtnRec : ''}`}
              onClick={handleMic}
              aria-label={recording ? 'Stop recording' : 'Start voice input'}
              title={recording ? 'Stop recording' : 'Click to speak'}
            >
              {recording
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
              }
            </button>
          </div>

          {recording && <div className={styles.voiceHint}>Recording — speak clearly, then click stop</div>}
          <ErrorMsg>{state.error || voiceError}</ErrorMsg>

          <button
            className={`${styles.submitBtn} ${state.loading || !state.answer.trim() ? styles.submitBtnDisabled : ''}`}
            onClick={handleSubmit}
            disabled={state.loading || !state.answer.trim()}
          >
            {state.loading
              ? 'Evaluating...'
              : state.currentQ + 1 >= TOTAL_Q
              ? 'Submit final answer →'
              : 'Submit answer →'}
          </button>
        </div>

        {/* Per-answer feedback */}
        {showFeedback && (
          <div className={`${styles.feedbackCard} ${styles['feedback_' + sc.overall]}`}>
            <div className={styles.feedbackTitle}>
              {sc.overall === 'good' ? 'Good answer' : sc.overall === 'warn' ? 'Something to work on' : 'Important to fix'}
            </div>
            <div className={styles.feedbackTip}>{sc.tip}</div>
            <div className={styles.badgeRow} style={{ marginTop: '0.6rem' }}>
              <Badge variant={sc.pace === 'good' ? 'good' : 'warn'}>{sc.paceLabel}</Badge>
              <Badge variant={sc.tone === 'Confident' || sc.tone === 'Neutral' ? 'good' : 'warn'}>{sc.tone}</Badge>
              <Badge variant={sc.relevance === 'On Point' ? 'good' : 'warn'}>{sc.relevance}</Badge>
              {sc.fillers.length > 0 && <Badge variant="warn">Filler words: {sc.fillers.join(', ')}</Badge>}
              {sc.volunteered && <Badge variant="bad">Over-shared info</Badge>}
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div>
        <div className={styles.sideCard}>
          <div className={styles.sideTitle}>Progress</div>
          <div className={styles.progBar}>
            <div className={styles.progFill} style={{ width: progPct + '%' }} />
          </div>
          <div className={styles.progLabel}>{state.currentQ} of {TOTAL_Q} answered</div>
          {state.scores.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {[
                ['Score',          avgScore + '/100'],
                ['Filler words',   state.fillerTotal],
                ['Over-shared',    state.volTotal + '×'],
              ].map(([l, v]) => (
                <div key={l} className={styles.statRow}>
                  <span>{l}</span><span className={styles.statVal}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.sideCard}>
          <div className={styles.sideTitle}>Quick rules</div>
          <ul className={styles.ruleList}>
            {QUICK_RULES.map((r) => (
              <li key={r} className={styles.ruleItem}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
                {r}
              </li>
            ))}
          </ul>
        </div>

        {state.flags.length > 0 && (
          <div className={`${styles.sideCard} ${styles.sideCardWarn}`}>
            <div className={styles.sideTitle} style={{ color: 'var(--yellow)' }}>Watch out</div>
            <ul className={styles.ruleList}>
              {state.flags.map((f, i) => (
                <li key={i} className={styles.ruleItem} style={{ color: 'var(--yellow)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
