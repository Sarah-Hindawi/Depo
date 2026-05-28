import React from 'react'
import { Card, CardTitle, CardDesc, Button, BtnRow } from './ui.jsx'
import styles from './phases.module.css'

export function SummaryPhase({ summary, onConfirm, onBack }) {
  return (
    <Card>
      <CardTitle>Your case — plain language summary</CardTitle>
      <CardDesc>
        Here is what we understand about your case. Read this carefully and make sure
        it accurately reflects your situation before continuing.
      </CardDesc>
      <div className={styles.summaryBox}>{summary}</div>
      <BtnRow>
        <Button variant="primary" onClick={onConfirm}>
          This looks right — show my prep guide →
        </Button>
        <Button variant="ghost" onClick={onBack}>
          ← Go back
        </Button>
      </BtnRow>
    </Card>
  )
}
