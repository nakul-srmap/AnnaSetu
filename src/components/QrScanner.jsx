import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import Button from './ui/Button'
import Field, { TextInput } from './ui/Field'
import Note from './ui/Note'

// Live camera decode, with keyed entry as the fallback — a shop counter is
// exactly where a camera fails. The raw payload is handed upward so the server
// can verify the shop and card it was issued for.
export default function QrScanner({ onScan, expectedTokens = [], accent = 'navy' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  const [status, setStatus] = useState('idle') // idle | starting | scanning | denied | unsupported | error
  const [keyed, setKeyed] = useState('')
  const [message, setMessage] = useState('')

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const submit = useCallback(
    (payload, manual = false) => {
      const parts = String(payload ?? '').split(':')
      if (parts[0] !== 'ANNASETU' || !parts[1]) {
        setMessage('That code is not an Anna Setu token.')
        return false
      }
      // A local hint only; the server is the authority on whether this token
      // belongs to a booking at this shop.
      if (expectedTokens.length > 0 && !expectedTokens.includes(parts[1])) {
        setMessage(`Scanned ${parts[1]}, which is not in today's queue here. Sending it for a check…`)
      }
      stop()
      setStatus('idle')
      onScan({ payload, token: parts[1], manual })
      return true
    },
    [expectedTokens, onScan, stop],
  )

  const tick = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    const w = video.videoWidth
    const h = video.videoHeight
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, w, h)
    const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
    if (found?.data && submit(found.data)) return
    rafRef.current = requestAnimationFrame(tick)
  }, [submit])

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported')
    setStatus('starting')
    setMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      videoRef.current.setAttribute('playsinline', 'true')
      await videoRef.current.play()
      setStatus('scanning')
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <div className="relative aspect-square w-full overflow-hidden border border-ink-rule bg-ink/90">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${status === 'scanning' ? '' : 'opacity-0'}`}
            muted
            playsInline
          />
          {status !== 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/70">
                {status === 'starting'
                  ? 'Requesting camera…'
                  : status === 'denied'
                    ? 'Camera permission refused'
                    : status === 'unsupported'
                      ? 'No camera on this device'
                      : 'Camera off'}
              </p>
            </div>
          )}
          {status === 'scanning' && (
            <div className="pointer-events-none absolute inset-6 border-2 border-white/70" />
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="mt-3">
          {status === 'scanning' ? (
            <Button variant="quiet" size="sm" full onClick={() => { stop(); setStatus('idle') }}>
              Stop camera
            </Button>
          ) : (
            <Button accent={accent} size="sm" full onClick={start}>
              {status === 'idle' ? 'Start camera' : 'Try camera again'}
            </Button>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm">
          Point the camera at the household&apos;s token QR. The code is decoded on this device and
          verified against today&apos;s bookings.
        </p>

        {message && (
          <p className="mt-3 border-l-2 border-brand-stamp bg-brand-stamp/5 px-3 py-2 text-xs text-brand-stamp">
            {message}
          </p>
        )}

        {expectedTokens.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="eyebrow w-full">Waiting in today&apos;s queue</span>
            {expectedTokens.map((t) => (
              <Button
                key={t}
                variant="outline"
                accent={accent}
                size="sm"
                onClick={() => submit(`ANNASETU:${t}::`, false)}
              >
                {t}
              </Button>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-ink-rule pt-4">
          <p className="eyebrow mb-2">If the camera cannot read it</p>
          <Field label="Key in the token number">
            <TextInput
              value={keyed}
              placeholder="T-001"
              onChange={(e) => { setKeyed(e.target.value); setMessage('') }}
              onKeyDown={(e) => e.key === 'Enter' && submit(`ANNASETU:${keyed.trim()}::`, true)}
            />
          </Field>
          <Button
            variant="quiet"
            size="sm"
            disabled={!keyed.trim()}
            onClick={() => submit(`ANNASETU:${keyed.trim()}::`, true)}
          >
            Look up token
          </Button>
          <Note>
            Keyed entry is recorded as an exception on the transaction, so a shop that never uses the
            scanner is visible to the district.
          </Note>
        </div>
      </div>
    </div>
  )
}
