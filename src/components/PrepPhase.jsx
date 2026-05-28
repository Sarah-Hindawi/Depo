import React from 'react'
import { Card, CardTitle, CardDesc, Button, BtnRow, Divider, SectionTitle } from './ui.jsx'
import styles from './phases.module.css'

export function PrepPhase({ dos, donts, reminders, onStart }) {
  return (
    <Card>
      <CardTitle>Your deposition prep guide</CardTitle>
      <CardDesc>
        Read through this carefully before starting your simulation. Everything here
        is based on your specific case documents.
      </CardDesc>

      <div className={styles.dosDonts}>
        <div className={styles.doCard}>
          <div className={styles.ddTitle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Do
          </div>
          <ul className={styles.ddList}>
            {dos.map((d, i) => (
              <li key={i}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--green)' }}><polyline points="20 6 9 17 4 12"/></svg>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.dontCard}>
          <div className={styles.ddTitle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Don't
          </div>
          <ul className={styles.ddList}>
            {donts.map((d, i) => (
              <li key={i}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--red)' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {reminders.length > 0 && (
        <>
          <Divider />
          <SectionTitle>Key things to remember</SectionTitle>
          <ul className={styles.reminderList}>
            {reminders.map((r, i) => (
              <li key={i} className={styles.reminderItem}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <BtnRow>
        <Button variant="primary" onClick={onStart}>
          ▶ Start simulation
        </Button>
      </BtnRow>
    </Card>
  )
}
