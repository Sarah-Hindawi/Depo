import React from 'react'
import { useDepoSession } from './hooks/useDepoSession.js'
import { StepIndicator, Spinner } from './components/ui.jsx'
import { UploadPhase }   from './components/UploadPhase.jsx'
import { SummaryPhase }  from './components/SummaryPhase.jsx'
import { PrepPhase }     from './components/PrepPhase.jsx'
import { SimPhase }      from './components/SimPhase.jsx'
import { ReportPhase }   from './components/ReportPhase.jsx'
import styles from './App.module.css'

const STEPS = ['Upload', 'Case summary', 'Prep guide', 'Simulation', 'Report']

const STEP_MAP = { upload: 1, summary: 2, prep: 3, sim: 4, report: 5 }

export default function App() {
  const session = useDepoSession()
  const { state, set, patch, addFiles, removeFile, analyseDocuments, buildPrepGuide, startSimulation, submitAnswer, reset } = session

  const currentStep = STEP_MAP[state.phase] || 1

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Deposition prep · Client portal</div>
        <h1 className={styles.h1}>Prepare for your deposition</h1>
        <p className={styles.sub}>
          Upload your case documents, review your prep guide, then practice with AI-powered coaching.
        </p>
      </header>

      <StepIndicator steps={STEPS} current={currentStep} />

      {state.loading && <Spinner message={state.loadingMsg || 'Loading...'} />}

      {!state.loading && state.phase === 'upload' && (
        <UploadPhase
          state={state}
          set={set}
          addFiles={addFiles}
          removeFile={removeFile}
          onStart={analyseDocuments}
        />
      )}

      {!state.loading && state.phase === 'summary' && (
        <SummaryPhase
          summary={state.summary}
          onConfirm={buildPrepGuide}
          onBack={() => patch({ phase: 'upload', error: '' })}
        />
      )}

      {!state.loading && state.phase === 'prep' && (
        <PrepPhase
          dos={state.dos}
          donts={state.donts}
          reminders={state.reminders}
          onStart={startSimulation}
        />
      )}

      {!state.loading && state.phase === 'sim' && (
        <SimPhase
          state={state}
          set={set}
          patch={patch}
          onSubmit={submitAnswer}
        />
      )}

      {!state.loading && state.phase === 'report' && (
        <ReportPhase
          state={state}
          onRestart={reset}
        />
      )}
    </div>
  )
}
