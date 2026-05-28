import React from 'react'
import styles from './ui.module.css'

export function Card({ children, className = '' }) {
  return <div className={`${styles.card} ${className}`}>{children}</div>
}

export function CardTitle({ children }) {
  return <h2 className={styles.cardTitle}>{children}</h2>
}

export function CardDesc({ children }) {
  return <p className={styles.cardDesc}>{children}</p>
}

export function Button({ children, variant = 'default', onClick, disabled, type = 'button', className = '' }) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${variant === 'primary' ? styles.btnPrimary : variant === 'ghost' ? styles.btnGhost : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Label({ children, htmlFor }) {
  return <label className={styles.label} htmlFor={htmlFor}>{children}</label>
}

export function FieldGroup({ children }) {
  return <div className={styles.fieldGroup}>{children}</div>
}

export function Row2({ children }) {
  return <div className={styles.row2}>{children}</div>
}

export function BtnRow({ children }) {
  return <div className={styles.btnRow}>{children}</div>
}

export function Spinner({ message }) {
  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <span>{message}</span>
    </div>
  )
}

export function ErrorMsg({ children }) {
  return children ? <div className={styles.err}>{children}</div> : null
}

export function SectionTitle({ children }) {
  return <div className={styles.sectionTitle}>{children}</div>
}

export function Badge({ children, variant = 'neutral' }) {
  const cls = variant === 'good' ? styles.badgeGood
    : variant === 'warn' ? styles.badgeWarn
    : variant === 'bad'  ? styles.badgeBad
    : styles.badgeNeutral
  return <span className={`${styles.badge} ${cls}`}>{children}</span>
}

export function Divider() {
  return <div className={styles.divider} />
}

export function StepIndicator({ steps, current }) {
  return (
    <div className={styles.steps}>
      {steps.map((label, i) => {
        const num = i + 1
        const status = num === current ? 'active' : num < current ? 'done' : 'idle'
        return (
          <div key={i} className={`${styles.step} ${styles['step_' + status]}`}>
            <div className={styles.stepNum}>
              {status === 'done' ? '✓' : num}
            </div>
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}
