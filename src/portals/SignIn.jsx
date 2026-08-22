import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useSession } from '../app/SessionContext'
import Button from '../components/ui/Button'
import Field, { TextInput } from '../components/ui/Field'
import Note from '../components/ui/Note'

// The identifier's shape decides how you authenticate: a mobile number gets a
// one-time code, staff identifiers take a password.
function shapeOf(identifier) {
  const v = identifier.trim()
  if (!v) return null
  // Ration card numbers look like 28AP-0417-9930.
  if (/^\d{2}[A-Za-z]{2}/.test(v)) {
    return { kind: 'household', method: 'pin', idLabel: 'Ration card number', accent: 'green' }
  }
  if (/^[A-Za-z]{2}\/[A-Za-z]{2,4}\//.test(v)) return { kind: 'dealer', method: 'password', idLabel: 'Shop licence number', secretLabel: 'Shop PIN', accent: 'navy' }
  if (/^HD-/i.test(v)) return { kind: 'helpline desk', method: 'password', idLabel: 'Desk ID', secretLabel: 'Password', accent: 'stamp' }
  if (/^[A-Za-z]{2,3}-/.test(v)) return { kind: 'officer', method: 'password', idLabel: 'Officer ID', secretLabel: 'Password', accent: 'orange' }
  return null
}

// The four ways into the system, in the order a visitor is likely to need them.
const PORTALS = [
  {
    id: 'household', label: 'Household', hint: 'Ration card number', accent: 'green',
    shape: { kind: 'household', method: 'pin', idLabel: 'Ration card number', accent: 'green' },
  },
  {
    id: 'dealer', label: 'Fair price shop', hint: 'Shop licence', accent: 'navy',
    shape: { kind: 'dealer', method: 'password', idLabel: 'Shop licence number', secretLabel: 'Shop PIN', accent: 'navy' },
  },
  {
    id: 'officer', label: 'Civil Supplies officer', hint: 'Officer ID', accent: 'orange',
    shape: { kind: 'officer', method: 'password', idLabel: 'Officer ID', secretLabel: 'Password', accent: 'orange' },
  },
  {
    id: 'helpline', label: 'Helpline desk', hint: 'Desk ID', accent: 'stamp',
    shape: { kind: 'helpline desk', method: 'password', idLabel: 'Desk ID', secretLabel: 'Password', accent: 'stamp' },
  },
]

export default function SignIn() {
  const { cardSignIn, signIn, busy, error, clearError } = useSession()
  const [identifier, setIdentifier] = useState('')
  const [secret, setSecret] = useState('')
  const [local, setLocal] = useState('')
  const [helpline, setHelpline] = useState(null)
  const [assisted, setAssisted] = useState(false)
  const [portal, setPortal] = useState('household')

  useEffect(() => {
    api.helplineInfo().then(setHelpline).catch(() => {})
  }, [])

  useEffect(() => {
    if (error && /assisted sign-in is not available/i.test(error)) {
      setSecret('')
      setAssisted(false)
    }
  }, [error])

  const chosen = PORTALS.find((p) => p.id === portal)
  const shape = shapeOf(identifier) ?? chosen?.shape ?? null
  const accent = shape?.accent ?? chosen?.accent ?? 'green'


  const submit = async () => {
    setLocal('')
    clearError()
    if (!identifier.trim()) return setLocal('Enter your ration card number, shop licence, officer ID or desk ID.')

    if (shape?.method === 'password') {
      if (!secret) return setLocal('Enter your PIN or password.')
      return signIn(identifier.trim(), secret)
    }

    // Household: card number and the PIN set at the shop counter.
    if (!secret) return setLocal('Enter the PIN set for this card at your fair price shop.')
    return cardSignIn(identifier.trim(), secret.trim(), assisted)
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-2">
      <section>
        {/* The sign-in screen carries the mark too, since it is reached before
            the signed-in header exists. */}
        <div className="mb-5 flex items-center gap-3">
          <img src="/logo.png" alt="" aria-hidden className="h-14 w-14 shrink-0 object-contain" />
          <span className="font-display text-4xl font-extrabold tracking-tight">Anna Setu</span>
        </div>
        <p className="eyebrow mb-3">Department of Consumer Affairs, Food &amp; Civil Supplies</p>
        <h2 className="max-w-lg font-display text-4xl font-extrabold leading-tight tracking-tight">
          Ration collection, booked in advance and recorded as it happens.
        </h2>
        <p className="mt-4 max-w-md text-sm text-ink-soft">
          Households book a slot at a fair price shop near them. Dealers serve a known queue and
          issue against entitlement. The district reads what the shops&apos; devices recorded, with
          no separate reporting chain.
        </p>
        <dl className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            ['Households', 'Sign in with your ration card number.'],
            ['Fair price shops', 'A queue you can plan for, and stock that reconciles itself.'],
            ['District officers', 'Coverage and anomalies computed from real records.'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow mb-1">{k}</dt>
              <dd className="text-[13px] text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>

        {helpline && (
          <div className="mt-8 border border-ink-rule bg-white px-5 py-4">
            <p className="eyebrow mb-2">No smartphone? You do not need one.</p>
            <p className="font-display text-2xl font-extrabold tracking-tight">
              Call {helpline.number}
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">
              Free from any phone, {helpline.hours}, in {helpline.languages.join(', ')}. An operator
              books your slot and reads your token back to you.
            </p>
            <p className="mt-2 font-mono text-[11px] text-ink-soft">
              Or SMS {helpline.smsKeyword} to {helpline.smsShortcode}
            </p>
          </div>
        )}
      </section>

      <section className="border border-ink-rule bg-white px-6 py-6 lg:max-w-md lg:justify-self-end">
        {/* Every way into the system, named. Nobody should have to guess what
            kind of identifier the box wants. */}
        {(
          <>
            <p className="eyebrow mb-2">I am signing in as</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {PORTALS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPortal(p.id); setAssisted(false) }}
                  aria-pressed={portal === p.id}
                  className={`rounded border px-3 py-2.5 text-left transition ${
                    portal === p.id
                      ? `border-brand-${p.accent} bg-brand-${p.accent}/5`
                      : 'border-ink-rule bg-white hover:border-ink-soft'
                  }`}
                >
                  <span className="block text-[13px] font-semibold">{p.label}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-soft">{p.hint}</span>
                </button>
              ))}
            </div>

            {portal === 'household' && (
              <div className="mb-5 grid grid-cols-2 gap-2">
                {[
                  [false, 'Standard', 'Any household'],
                  [true, 'Assisted', 'Senior or disabled member'],
                ].map(([value, label, hint]) => (
                  <button
                    key={label}
                    onClick={() => setAssisted(value)}
                    aria-pressed={assisted === value}
                    className={`rounded border px-3 py-2 text-left transition ${
                      assisted === value
                        ? 'border-brand-green bg-brand-green/5'
                        : 'border-ink-rule bg-white hover:border-ink-soft'
                    }`}
                  >
                    <span className="block text-[12.5px] font-semibold">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-soft">{hint}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <h3 className="font-display text-lg font-bold">
          {assisted ? 'Assisted sign-in' : 'Sign in'}
        </h3>
        <p className="mb-5 mt-1 text-[13px] text-ink-soft">
          {assisted
              ? 'For households with a senior or disabled member on the card. Home delivery is available here.'
              : shape
                ? `Signing in to the ${shape.kind === 'officer' ? 'district console' : `${shape.kind} portal`}.`
                : 'Your account decides which portal opens.'}
        </p>

        <Field label={shape?.idLabel ?? 'Ration card number / licence / ID'}>
          <TextInput
            value={identifier}
            placeholder={
              shape?.kind === 'household'
                ? '28AP-0417-9930'
                : shape?.kind === 'dealer'
                  ? 'AP/GNT/2107'
                  : shape?.kind === 'helpline desk'
                    ? 'HD-AP-1967'
                    : 'JC-GNT-014'
            }
            onChange={(e) => { setIdentifier(e.target.value); setLocal(''); clearError() }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="username"
            autoFocus
          />
        </Field>

        <Field
          label={shape?.kind === 'household' ? 'Card PIN' : (shape?.secretLabel ?? 'PIN or password')}
          hint={shape?.kind === 'household' ? 'Four digits, set for you at your fair price shop.' : undefined}
        >
          <TextInput
            type="password"
            inputMode={shape?.kind === 'household' ? 'numeric' : undefined}
            value={secret}
            onChange={(e) => { setSecret(e.target.value); setLocal('') }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="current-password"
          />
        </Field>

        {(local || error) && (
          <p className="mb-4 border-l-2 border-brand-stamp bg-brand-stamp/5 px-3 py-2 text-xs text-brand-stamp">
            {local || error}
          </p>
        )}

        <Button full size="lg" accent={accent} onClick={submit} disabled={busy}>
          {busy ? 'Please wait…' : 'Sign in'}
        </Button>

        <Note>
          Households sign in with the number printed on the ration card and a four-digit PIN set for
          them at the shop counter. Forgotten it? The shop can set a new one in person. Dealers use the shop licence and PIN. Officer and helpline desk
          accounts are issued by the district.
        </Note>
      </section>
    </div>
  )
}
