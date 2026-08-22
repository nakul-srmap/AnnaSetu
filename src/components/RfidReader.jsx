import { useEffect, useRef, useState } from 'react'
import Button from './ui/Button'
import Note from './ui/Note'

// The card reader at the counter.
//
// Nearly every USB RFID reader is a keyboard-wedge device: it types the card's
// UID and presses Enter, exactly as if someone had typed it. So this is a text
// field that keeps itself focused — tapping a card fills it and submits, with
// no driver, no pairing and no browser permission. The same field accepts a
// UID typed by hand when a reader is not present, which is also how the demo
// runs on a laptop.
export default function RfidReader({ onRead, busy = false, sampleTag = null }) {
  const [value, setValue] = useState('')
  const [tapped, setTapped] = useState(false)
  const [nfc, setNfc] = useState('idle')
  const [nfcNote, setNfcNote] = useState('')
  const inputRef = useRef(null)

  // Chrome on Android can read an NFC tag directly, so a phone is the reader.
  // Everywhere else this stays hidden and the typed field is used instead.
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  // A wedge reader types into whatever holds focus, so the field takes it back
  // whenever the counter clicks elsewhere.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const refocus = () => {
      if (!busy && document.activeElement !== el) el.focus()
    }
    const timer = setInterval(refocus, 800)
    return () => clearInterval(timer)
  }, [busy])

  // Reading a tag with the phone itself. Requires HTTPS, which is why this
  // works on the deployed site but not over a plain-http LAN address.
  const startNfc = async () => {
    if (!nfcSupported) return
    try {
      setNfc('scanning')
      setNfcNote('Hold the card against the back of the phone.')
      const reader = new window.NDEFReader()
      await reader.scan()

      reader.onreading = ({ message, serialNumber }) => {
        // Prefer a text record we wrote ourselves; fall back to the tag's own
        // hardware serial so an unwritten blank card still identifies itself.
        let code = null
        for (const record of message.records) {
          if (record.recordType === 'text') {
            code = new TextDecoder(record.encoding || 'utf-8').decode(record.data).trim()
            break
          }
        }
        if (!code && serialNumber) code = serialNumber.replace(/:/g, '').toUpperCase()
        if (code) {
          setNfcNote(`Read ${code}`)
          submit(code)
        }
      }

      reader.onreadingerror = () => setNfcNote('That tag could not be read. Try again.')
    } catch (err) {
      setNfc('idle')
      setNfcNote(
        err?.name === 'NotAllowedError'
          ? 'Permission denied. Allow NFC for this site and try again.'
          : 'NFC is not available on this device.',
      )
    }
  }

  const submit = (raw) => {
    const uid = String(raw ?? value).trim()
    if (!uid || busy) return
    setTapped(true)
    setValue('')
    onRead(uid)
    setTimeout(() => setTapped(false), 600)
  }

  return (
    <div>
      <div
        className={`rounded border-2 border-dashed p-5 text-center transition-colors ${
          tapped ? 'border-brand-ink bg-brand-wash' : 'border-ink-rule'
        }`}
      >
        <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
          {busy
            ? 'Reading…'
            : nfc === 'scanning'
              ? 'Ready — hold the card to the phone'
              : 'Tap the ration card on the reader'}
        </p>

        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="C2CEDE5A"
          aria-label="Card UID from the reader"
          className="mt-3 w-full bg-transparent text-center font-mono text-2xl tracking-[0.3em] outline-none placeholder:text-ink-rule"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Button size="sm" variant="quiet" disabled={busy || !value.trim()} onClick={() => submit()}>
          Read card
        </Button>

        {/* Without a reader plugged in there is nothing to tap, so a known card
            can be presented instead. */}
        {nfcSupported && nfc !== 'scanning' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={startNfc}>
            Read with phone
          </Button>
        )}

        {sampleTag && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(sampleTag)}>
            Simulate a tap
          </Button>
        )}
      </div>

      {nfcNote && <p className="mt-2 font-mono text-xs text-ink-soft">{nfcNote}</p>}

      <Note>
        The tag identifies the card, not the person holding it, so the cardholder is still confirmed
        on the next screen before anything is issued.
      </Note>
    </div>
  )
}
