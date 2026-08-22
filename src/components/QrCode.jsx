import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A real, scannable QR code — the dealer portal's camera decodes this from the
// beneficiary's screen at the shop counter.
export default function QrCode({ value, size = 148, label = 'QR code' }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let alive = true
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: { dark: '#16211C', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setSvg(''))
    return () => {
      alive = false
    }
  }, [value, size])

  if (!svg) {
    return (
      <div
        style={{ width: size, height: size }}
        className="animate-pulse border border-ink-rule bg-paper-light"
        aria-hidden
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
      className="border-[6px] border-white outline outline-1 outline-ink-rule"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
