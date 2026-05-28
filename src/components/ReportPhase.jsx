import React from 'react'
import { Card, Button, BtnRow, Divider, SectionTitle } from './ui.jsx'
import { computeAvgScore, getGrade, downloadReport } from '../lib/utils.js'
import styles from './phases.module.css'

export function ReportPhase({ state, onRestart }) {
  const { scorecards, history, report, scores, fillerTotal, volTotal, caseType } = state
  const score = computeAvgScore(scores)
  const { label: gradeLabel, color: gradeColor } = getGrade(score)

  function handleDownload() {
    downloadReport(history, scorecards, report, score, caseType)
  }

  return (
    <Card>
      {/* Header */}
      <div className={styles.reportHdr}>
        <div className={styles.reportEyebrow}>Session complete</div>
        <div className={styles.reportScore}>{score}</div>
        <div className={styles.reportGrade} style={{ color: gradeColor }}>{gradeLabel}</div>
      </div>

      {/* Stats */}
      <div className={styles.statGrid}>
        {[
          { n: history.length,  l: 'Questions answered' },
          { n: fillerTotal,     l: 'Filler words used' },
          { n: volTotal + '×',  l: 'Times over-shared' },
        ].map((s) => (
          <div key={s.l} className={styles.statBox}>
            <div className={styles.statNum}>{s.n}</div>
            <div className={styles.statName}>{s.l}</div>
          </div>
        ))}
      </div>

      <Divider />

      {/* Narrative */}
      <SectionTitle>What you did well</SectionTitle>
      <p className={styles.rText}>{report?.strengths}</p>

      <SectionTitle style={{ marginTop: '1.25rem' }}>What to work on</SectionTitle>
      <p className={styles.rText}>{report?.weaknesses}</p>

      <Divider />

      {/* Personal DOs / DON'Ts */}
      <SectionTitle>Your personal DOs and DON'Ts</SectionTitle>
      <div className={styles.dosDonts}>
        <div className={styles.doCard}>
          <div className={styles.ddTitle}>Do</div>
          <ul className={styles.ddList}>
            {(report?.personalDos || []).map((d, i) => (
              <li key={i}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--green)' }}><polyline points="20 6 9 17 4 12"/></svg>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.dontCard}>
          <div className={styles.ddTitle}>Don't</div>
          <ul className={styles.ddList}>
            {(report?.personalDonts || []).map((d, i) => (
              <li key={i}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--red)' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Divider />

      {/* Q&A review */}
      <SectionTitle>Full Q&A review</SectionTitle>
      {history.map((h, i) => {
        const sc = scorecards[i]
        return (
          <div key={i} className={styles.qaReview}>
            <div className={styles.qaQ}>Q{i + 1}: "{h.q}"</div>
            <div className={styles.qaA}>{h.a}</div>
            {sc && (
              <div className={`${styles.feedbackCard} ${styles['feedback_' + sc.overall]}`} style={{ marginTop: '0.4rem' }}>
                {sc.inline_feedback || sc.tip}
              </div>
            )}
          </div>
        )
      })}

      <BtnRow>
        <Button variant="ghost" onClick={onRestart}>← Start over</Button>
        <Button variant="primary" onClick={handleDownload}>↓ Download report</Button>
      </BtnRow>
    </Card>
  )
}
