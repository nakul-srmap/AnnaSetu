import { useCallback, useEffect, useState } from 'react'

// Wraps the browser geolocation API with the states a UI actually needs to show:
// unsupported, locating, granted, denied, or failed. Nothing is requested until
// asked for, so no permission prompt appears unprompted.
export default function useGeolocation({ auto = false } = {}) {
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const request = useCallback(() => {
    if (!globalThis.navigator?.geolocation) {
      setStatus('unsupported')
      setMessage('This device cannot share a location.')
      return
    }
    setStatus('locating')
    setMessage('')
    globalThis.navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      (err) => {
        setStatus(err?.code === 1 ? 'denied' : 'failed')
        setMessage(
          err?.code === 1
            ? 'Location permission was refused.'
            : 'Could not determine your location.',
        )
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }, [])

  useEffect(() => {
    if (auto) request()
  }, [auto, request])

  return {
    coords,
    status,
    message,
    request,
    clear: () => {
      setCoords(null)
      setStatus('idle')
    },
  }
}
