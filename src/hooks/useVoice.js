import { useState, useRef, useCallback } from 'react'

/**
 * useVoice
 * Wraps the Web Speech API for voice input.
 *
 * Usage:
 *   const { recording, toggleVoice, voiceError } = useVoice()
 *   toggleVoice((transcript) => setText(transcript))
 */
export function useVoice() {
  const [recording, setRecording] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const srRef = useRef(null)

  const toggleVoice = useCallback((onTranscript) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SR) {
      setVoiceError('Voice input requires Chrome or Safari.')
      return
    }

    // Stop if already recording
    if (recording) {
      srRef.current?.stop()
      setRecording(false)
      return
    }

    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-CA'

    r.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('')
      onTranscript(transcript)
    }

    r.onend = () => setRecording(false)

    r.onerror = () => {
      setVoiceError('Microphone error — check browser permissions.')
      setRecording(false)
    }

    srRef.current = r
    setVoiceError('')
    setRecording(true)
    r.start()
  }, [recording])

  const stopVoice = useCallback(() => {
    srRef.current?.stop()
    setRecording(false)
  }, [])

  return { recording, toggleVoice, stopVoice, voiceError }
}
