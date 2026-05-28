import React, { useRef } from 'react'
import { Card, CardTitle, CardDesc, Button, Label, FieldGroup, Row2, BtnRow, ErrorMsg } from './ui.jsx'
import styles from './phases.module.css'

const CASE_TYPES = [
  ['wrongful-dismissal', 'Wrongful dismissal'],
  ['employment',         'Employment & labour dispute'],
  ['insurance',          'Insurance claim / damages'],
  ['personal-injury',    'Personal injury'],
  ['contract',           'Contract dispute'],
  ['other',              'Other civil litigation'],
]

const ROLES = [
  ['plaintiff', 'Plaintiff — I am making the claim'],
  ['defendant', 'Defendant — I am defending the claim'],
  ['witness',   'Witness — I saw or know relevant facts'],
]

export function UploadPhase({ state, set, addFiles, removeFile, onStart }) {
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    addFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <>
      <Card>
        <CardTitle>Upload your case documents</CardTitle>
        <CardDesc>
          Add your factum, memos, court documents, or any materials your lawyer shared.
          The more you upload, the more tailored your preparation will be.
        </CardDesc>

        <div
          className={styles.dropzone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload documents"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--hint)', marginBottom: '0.5rem' }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <p className={styles.dropzoneText}>Click to upload or drag and drop</p>
          <p className={styles.dropzoneHint}>PDF, DOCX, TXT — up to 5 files</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.doc"
            style={{ display: 'none' }}
            onChange={(e) => addFiles(Array.from(e.target.files))}
          />
        </div>

        {state.files.length > 0 && (
          <div className={styles.fileList}>
            {state.files.map((f) => (
              <div key={f.name} className={styles.fileItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"/>
                </svg>
                <span className={styles.fileName}>{f.name}</span>
                <button className={styles.removeBtn} onClick={() => removeFile(f.name)} aria-label={`Remove ${f.name}`}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>About your case</CardTitle>
        <Row2>
          <FieldGroup>
            <Label htmlFor="caseType">Case type</Label>
            <select
              id="caseType"
              value={state.caseType}
              onChange={(e) => set('caseType', e.target.value)}
            >
              {CASE_TYPES.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="witnessRole">Your role</Label>
            <select
              id="witnessRole"
              value={state.witnessRole}
              onChange={(e) => set('witnessRole', e.target.value)}
            >
              {ROLES.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </FieldGroup>
        </Row2>
      </Card>

      <ErrorMsg>{state.error}</ErrorMsg>

      <BtnRow>
        <Button variant="primary" onClick={onStart} disabled={!state.files.length}>
          Analyse documents →
        </Button>
      </BtnRow>
    </>
  )
}
