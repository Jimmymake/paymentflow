import { useEffect, useRef, useState } from 'react'
import { getBearerToken } from '../api/token'
import { nanoid }  from 'nanoid';
// Credentials used to request the bearer token
const BASIC_USER = import.meta.env.VITE_BASIC_USER || 'plugin'
const BASIC_PASS = import.meta.env.VITE_BASIC_PASS || 'PluginJimmyX@)_ss:3fkk'
import './SignUp.scss'


const CALLBACK_BASE = (import.meta.env.VITE_CALLBACK_BASE || '').replace(/\/+$/, '')
// Default callback URL sent to the payment provider
const DEFAULT_CALLBACK_URL = import.meta.env.VITE_DEFAULT_CALLBACK_URL || 'https://paymentflow.mam-laka.com/api/v1/callback'
// const DEFAULT_CALLBACK_URL = import.meta.env.VITE_DEFAULT_CALLBACK_URL || 'https://c8e5bc5620e7.ngrok-free.app/callback'
// const DEFAULT_CALLBACK_URL = import.meta.env.VITE_DEFAULT_CALLBACK_URL || 'https://webhook.site/36224084-57fe-42f3-917f-61848d6f6116'

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_CALLBACK_POLL_INTERVAL_MS || 2000) // default 2s
// const POLL_TIMEOUT_MS = Number(import.meta.env.VITE_CALLBACK_POLL_TIMEOUT_MS || 180000) // default 3 minutes

function SignUp() {

  const [formValues, setFormValues] = useState({
    
      impalaMerchantId: 'plugin',
     // country: "KE",
      currency: 'KES',
      amount: '',
      customerName: '',
      customerEmail: '',
      payerPhone: '',
      description: '',
      externalId: nanoid(10),
      callbackUrl: DEFAULT_CALLBACK_URL,
      redirectUrl: 'https://webhook.site/b69cf7a1-f6b4-4ca8-a98c-3928b5f716c8'
  
  
  })
  
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [apiResponse, setApiResponse] = useState(null)
  const [callbackData, setCallbackData] = useState(null)
  const [transactionStatus, setTransactionStatus] = useState('idle') // idle | pending | success | failed
  const [transactionRef, setTransactionRef] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const pollIntervalRef = useRef(null)
  const pollStartAtRef = useRef(0)
  const pollTimeoutRef = useRef(null)
  const submissionLockRef = useRef(false)
  const controllerRef = useRef(null)
  const lastAttemptRef = useRef(null)
  const currentExternalIdRef = useRef('')

  useEffect(() => {
    console.log('SignUp mounted')
    return () => console.log('SignUp unmounted')
  }, [])

  function clearPoll() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearPoll()
    }
  }, [])


  function handleChange(event) {
    const { name, value } = event.target
    setFormValues((prev) => ({
      ...prev,
      [name]: name === 'amount' ? value : value,
    }))

    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  function isValidUrl(url) {
    try { new URL(url); return true } catch { return false }
  }

  function validate(values) {
    const nextErrors = {}
    if (!values.impalaMerchantId.trim()) nextErrors.impalaMerchantId = 'Merchant ID is required'
    if (!values.currency.trim()) nextErrors.currency = 'Currency is required'
    const parsedAmount = Number(values.amount)
    if (!Number.isFinite(parsedAmount) || !(parsedAmount > 9)) nextErrors.amount = 'Amount must be greater than 9'
    if (!values.customerName.trim()) nextErrors.customerName = 'Customer name is required'
    if (!values.customerEmail.trim()) {
      nextErrors.customerEmail = 'Customer email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customerEmail)) {
      nextErrors.customerEmail = 'Enter a valid email address'
    }
  //  if (!values.payerPhone.trim()) nextErrors.payerPhone = 'Payer phone is required'
  //  else if (!/^\+?[1-9]\d{7,14}$/.test(values.payerPhone.trim())) nextErrors.payerPhone = 'Phone must be E.164 (e.g. +2547...)'
    if (!values.description.trim()) nextErrors.description = 'Description is required'
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    // prevent duplicate submissions (clicks/keypress) while one is in-flight
    if (submissionLockRef.current) return
    submissionLockRef.current = true
    setSubmitting(true)
    // create a short attempt id for diagnostics
    const attemptId = nanoid(8)
    lastAttemptRef.current = attemptId
    const nextErrors = validate(formValues)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // release lock when validation fails
      submissionLockRef.current = false
      setSubmitting(false)
      return
    }

    let bearerToken
    try {

      //request token from the provided credentials
      bearerToken = await getBearerToken({ username: BASIC_USER, password: BASIC_PASS })
    } catch (e) {
      setApiResponse({ error: true, message: 'Failed to get token', details: String(e?.message || e) })
      setSubmitted(true)
      // release lock on failure
      submissionLockRef.current = false
      setSubmitting(false)
      return
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    }

    // Normalize callbackUrl to ensure it targets /api/v1/callback
    let normalizedCallbackUrl = formValues.callbackUrl
    try {
      const u = new URL(formValues.callbackUrl)
      if (u.pathname === '/callback' || u.pathname.endsWith('/callback')) {
        u.pathname = '/api/v1/callback'
        u.search = ''
        normalizedCallbackUrl = u.toString()
      }
    } catch {
  
    }

    const payload = {
      impalaMerchantId: formValues.impalaMerchantId,
     // country: formValues.country,
      currency: formValues.currency,
      amount: formValues.amount,
      customerName: formValues.customerName,
      customerEmail: formValues.customerEmail,
      payerPhone: formValues.payerPhone,
      description: formValues.description,
      externalId: formValues.externalId,
      callbackUrl: normalizedCallbackUrl,
      redirectUrl: formValues.redirectUrl,
    }

    console.log('Submitting payment initiation:', payload)
    console.log('Bearer token present:', !!bearerToken)

    try {
      setSubmitting(true)
      setErrors({})
      // ensure a unique externalId on each try to prevent duplicate conflicts
      const uniqueExternalId = nanoid(12)
  // keep it in state for display/debug if needed
  setFormValues(prev => ({ ...prev, externalId: uniqueExternalId }))

      
        // abort any previous in-flight request for safety (shouldn't happen with lock)
        if (controllerRef.current) {
          try { controllerRef.current.abort() } catch {}
        }
        controllerRef.current = new AbortController()
        console.log('Submitting payment initiation:', payload, { attemptId, externalId: uniqueExternalId })
        const res = await fetch('https://payments.mam-laka.com/api/v1/flutterwave/initiate', {
       // const res = await fetch('https://payments.mam-laka.com/api/v1/pay', {
        method: 'POST',
        signal: controllerRef.current.signal,
        // provide an idempotency key header so backends can dedupe
        headers: { ...headers, 'Idempotency-Key': uniqueExternalId },
        body: JSON.stringify({
          ...payload,
          externalId: uniqueExternalId,
          amount: Math.round(Number(payload.amount)),
          payerPhone: String(payload.payerPhone).trim(),
        }),
      })
      
        console.log('Response status:', res.status, res.statusText, { attemptId })
      
      // Safely parse response using clone to avoid "body stream already read" errors
      let data
      const cloned = res.clone()
      try {
        data = await res.json()
      } catch {
        try {
          const text = await cloned.text()
          data = { raw: text, status: res.status, statusText: res.statusText }
        } catch (e) {
          data = { status: res.status, statusText: res.statusText }
        }
      }
      
      console.log('Response body:', data)

      if (!res.ok) {
        const message =
          data.message ||
          data.error ||
          data.statusMessage ||
          data.status_message ||
          'Payment initiation failed'
        setApiResponse({
          error: true,
          status: res.status,
          statusText: res.statusText,
          message,
          data: data
        })
        setStatusMessage(message)
        setSubmitted(true)
        setTransactionStatus('failed')
        setSubmitting(false)
        submissionLockRef.current = false
        return
      }
      
  setApiResponse(null)
      setTransactionStatus('pending')
  setStatusMessage(`Awaiting payment confirmation… (attempt ${attemptId})`)
      // start fresh poll; clear any existing one
      clearPoll()
      pollStartAtRef.current = Date.now()
      currentExternalIdRef.current = uniqueExternalId
      
  // Terminate polling after 25 seconds for this transaction attempt
  const POLL_TERMINATE_MS = 25 * 1000 // 25 seconds
  pollIntervalRef.current = setInterval(async () => {
        try {
          const base = CALLBACK_BASE // '' for same-origin, or e.g. https://paymentflow.mam-laka.com
          const latestUrl = `${base}/api/v1/callback/latest`
          const r = await fetch(latestUrl, { headers: { 'Accept': 'application/json' } })
          const c = await r.json()
          if (c && c.body) {
            // Ignore stale callbacks (before this poll started) and
            // ignore excessively delayed callbacks.
            if (c.receivedAt) {
              const ts = new Date(c.receivedAt).getTime()
              if (Number.isFinite(ts)) {
                // If callback arrived before we started polling, ignore it.
                if (ts < pollStartAtRef.current) {
                  return
                }
                // If the callback was received more than 25s after the poll
                // started, ignore it.
                const MAX_DELAY_MS = 25 * 1000 // 25 seconds
                const delay = ts - pollStartAtRef.current
                if (delay > MAX_DELAY_MS) {
                  return
                }
              }
            }
            const body = c?.body || {}
            const data = body.data || {}

            // If webhook carries externalId, ensure it matches current one
            const cbExternalId =
              body.externalId ||
              body.external_id ||
              data.externalId ||
              data.external_id ||
              data.reference ||
              data.payment_reference ||
              data.tx_ref ||
              body.reference
            if (cbExternalId && cbExternalId !== currentExternalIdRef.current) {
              return
            }
            console.log('Callback payload:', c, { attemptId })
            setCallbackData(c)

            const statusCandidates = [
              body.status,
              data.status,
              data.transaction_status,
              body.transactionStatus,
              body.transaction_status,
              body.transactionReport,
              body.transaction_report,
              body.paymentStatus,
              data.paymentStatus,
              data.statusCode,
              data.status_code,
              body.statusCode,
              data.processor_response,
              data.response_description,
              body.event,
              data.event
            ]
            const statusText = statusCandidates.find(
              (val) => typeof val === 'string' && val.trim().length > 0
            )
            const status = statusText ? statusText.toLowerCase().trim() : ''
            const ref =
              data.reference ||
              data.payment_reference ||
              data.tx_ref ||
              body.reference ||
              body.payment_reference ||
              body.externalId ||
              data.externalId
            // Treat a few canonical status words as success. Use word-boundary
            // regexes to avoid false positives (e.g. don't treat 'incomplete' as success).
            const successRegex = /\b(?:success|complete(?:d)?|approved|paid)\b/
            if (successRegex.test(status)) {
              setTransactionStatus('success')
              setStatusMessage(
                data.status_message ||
                  data.statusMessage ||
                  body.status_message ||
                  body.message ||
                  body.transactionReport ||
                  'Payment confirmed successfully.'
              )
              setSubmitted(true)
            } else {
              setTransactionStatus('failed')
              setStatusMessage(
                (body.message ||
                 data.message ||
                 data.status_message ||
                 data.failure_reason ||
                 data.statusMessage ||
                 data.processor_response ||
                 data.response_description ||
                 body.paymentStatusDescription ||
                 'Payment failed. Please try again.')
              )
              setSubmitted(true)
            }
            if (ref) setTransactionRef(ref)
            clearPoll()
            // abort controller and clear ref
            if (controllerRef.current) {
              try { controllerRef.current.abort() } catch {}
              controllerRef.current = null
            }
            setSubmitting(false)
            // release submission lock now that this attempt is finished
            submissionLockRef.current = false
          }
        } catch {
          setTransactionStatus('failed')
          // stop polling and release lock on unexpected errors inside the poll
          clearPoll()
          if (controllerRef.current) {
            try { controllerRef.current.abort() } catch {}
            controllerRef.current = null
          }
          setSubmitting(false)
          submissionLockRef.current = false
          setSubmitted(true)
        }
      }, POLL_INTERVAL_MS)

    // also terminate polling after a fixed timer in case no callback arrives
    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) clearPoll()
      if (controllerRef.current) {
        try { controllerRef.current.abort() } catch {}
        controllerRef.current = null
      }
      setTransactionStatus((prev) => (prev === 'pending' ? 'failed' : prev))
      setStatusMessage(`Timed out waiting for payment confirmation after ${Math.round(POLL_TERMINATE_MS / 1000)} seconds.`)
      setSubmitted(true)
      setSubmitting(false)
      submissionLockRef.current = false
    }, POLL_TERMINATE_MS)
    } catch (e) {
      console.error('Payment initiation error:', e)
      setApiResponse({ 
        error: true,
        message: 'Network error: ' + e.message,
        details: String(e)
      })
      setStatusMessage('Network error: ' + e.message)
      setSubmitted(true)
      setSubmitting(false)
      submissionLockRef.current = false
    }
  }

  return (
    <div className="signup">
      <div className="signup__card">
        {!submitted && (
          <div className="signup__header">
            <h1 className="signup__title">Initiate Payment</h1>
            <p className="signup__subtitle">Fill the details and submit to create a payment.</p>
          </div>
        )}

        {submitted ? (
          <div className={`signup__success ${transactionStatus === 'failed' ? 'signup__success--error' : ''}`} role="status">
            {statusMessage && (
              <p className="signup__status-message" style={{ marginBottom: '12px' }}>
                {statusMessage}
              </p>
            )}
            {transactionStatus === 'pending' && (
              <>
                <h2>Waiting for payment confirmation…</h2>
                <p style={{ opacity: 0.8 }}>Keep this page open while we confirm your transaction.</p>
                {callbackData && (
                  <div className="signup__details" style={{ marginTop: '10px', textAlign: 'left' }}>
                    {(() => {
                      const b = callbackData?.body || {}
                      const data = b.data || {}
                      const ref = data.payment_reference || data.reference || b.reference
                      const status = b.status || data.status
                      const event = b.event
                      const amount = data.amount
                      const currency = data.currency
                      const method = data.payment_method || data.channel
                      const message =
                        data.status_message ||
                        data.statusMessage ||
                        data.message ||
                        b.message
                      return (
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                          {event && <li>Event: <strong>{event}</strong></li>}
                          {status && <li>Status: <strong>{String(status)}</strong></li>}
                          {ref && <li>Reference: <strong>{ref}</strong></li>}
                          {(amount != null || currency) && (
                            <li>Amount: <strong>{amount}</strong> {currency}</li>
                          )}
                          {method && <li>Method: <strong>{method}</strong></li>}
                          {message && <li>Message: <strong>{message}</strong></li>}
                        </ul>
                      )
                    })()}
                  </div>
                )}
              </>
            )}
            {transactionStatus === 'success' && (
              <>
                <div className="signup__result signup__result--success">
                  <div className="signup__result-icon" aria-hidden="true">✓</div>
                  <div className="signup__result-content">
                    <h2 className="signup__result-title">Payment Successful</h2>
                    {transactionRef && <p className="signup__result-sub">Reference: {transactionRef}</p>}
                    {callbackData && (
                      <div className="signup__details">
                    {(() => {
                      const b = callbackData?.body || {}
                      const data = b.data || {}
                      const ref = data.payment_reference || data.reference || b.reference
                      const amount = data.amount
                      const currency = data.currency
                      const method = data.payment_method || data.channel
                      const message =
                        data.status_message ||
                        data.statusMessage ||
                        data.message ||
                        b.message
                      return (
                        <ul>
                          {ref && <li>Reference: <strong>{ref}</strong></li>}
                          {(amount != null || currency) && (
                            <li>Amount: <strong>{amount}</strong> {currency}</li>
                          )}
                          {method && <li>Method: <strong>{method}</strong></li>}
                          {message && <li>Message: <strong>{message}</strong></li>}
                        </ul>
                      )
                    })()}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {transactionStatus === 'failed' && (
              <>
                <div className="signup__result signup__result--error">
                  <div className="signup__result-icon" aria-hidden="true">✕</div>
                  <div className="signup__result-content">
                    <h2 className="signup__result-title">Payment Failed</h2>
                    <p className="signup__result-sub">Please try again or use a different method.</p>
                    {callbackData && (
                      <div className="signup__details">
                    {(() => {
                      const b = callbackData?.body || {}
                      const data = b.data || {}
                      const ref = data.payment_reference || data.reference || b.reference
                      const event = b.event
                      const amount = data.amount
                      const currency = data.currency
                      const method = data.payment_method || data.channel
                      const status =
                        data.status || b.status
                      const message =
                        data.status_message ||
                        data.statusMessage ||
                        data.message ||
                        b.message
                      const reason =
                        data.reason ||
                        data.failure_reason ||
                        data.failureReason
                      return (
                        <ul>
                          {event && <li>Event: <strong>{event}</strong></li>}
                          {status && <li>Status: <strong>{String(status)}</strong></li>}
                          {ref && <li>Reference: <strong>{ref}</strong></li>}
                          {(amount != null || currency) && (
                            <li>Amount: <strong>{amount}</strong> {currency}</li>
                          )}
                          {method && <li>Method: <strong>{method}</strong></li>}
                          {message && <li>Message: <strong>{message}</strong></li>}
                          {reason && <li>Reason: <strong>{reason}</strong></li>}
                        </ul>
                      )
                    })()}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <button 
              onClick={() => {
                clearPoll()
                setSubmitted(false)
                setApiResponse(null)
                setErrors({})
                setCallbackData(null)
                setTransactionStatus('idle')
                setTransactionRef('')
                setStatusMessage('')
              }}
              className="signup__submit"
              style={{ marginTop: '16px', width: '100%' }}
            >
              {transactionStatus === 'failed' ? 'Try Again' : 'Done'}
            </button>
          </div>
        ) : (
          <form
            className="signup__form"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={submitting}
            style={{ pointerEvents: submitting ? 'none' : undefined, opacity: submitting ? 0.85 : undefined }}
          >

      <div className="signup__field">
                <label htmlFor="customerName">Customer name</label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  placeholder="Enter name"
                  value={formValues.customerName}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.customerName) || undefined}
                />
                {errors.customerName && (
                  <span className="signup__error">{errors.customerName}</span>
                )}
              </div>




    <div className="signup__field">
                <label htmlFor="customerEmail">Customer email</label>
                <input
                  id="customerEmail"
                  name="customerEmail"
                  type="email"
                  placeholder="Enter email"
                  value={formValues.customerEmail}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.customerEmail) || undefined}
                />
                {errors.customerEmail && (
                  <span className="signup__error">{errors.customerEmail}</span>
                )}
              </div>

           <div className="signup__field">
                <label htmlFor="country">Country</label>
                <select
                  id="country"
                  name="country"
                  value={formValues.country}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.country) || undefined}
                >
                  <option value="KE">Kenya</option>
                  <option value="UG">Uganda</option>
                  <option value="TZ">Tanzania</option>
                  <option value="XA">Cameroon</option>
                  <option value="NG">Nigeria</option>
                  <option value="GH">Ghana</option>
                </select>
                {errors.country && (
                  <span className="signup__error">{errors.country}</span>
                )}
              </div>

            {/* <div className="signup__field">
                <label htmlFor="currency">Currency</label>
                <select
                  id="currency"
                  name="currency"
                  value={formValues.currency}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.currency) || undefined}
                >
                  <option value="KES">Kenya (KES)</option>
                  <option value="UGX">Uganda (UGX)</option>
                  <option value="TZS">Tanzania (TZS)</option>
                  <option value="XAF">Cameroon (XAF)</option>
                  <option value="NGN">Nigeria (NGN)</option>
                  <option value="GHS">Ghana (GHS)</option>
                </select>
                {errors.currency && (
                  <span className="signup__error">{errors.currency}</span>
                )}
              </div>*/}

              <div className="signup__field">
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Enter amount"
                  value={formValues.amount}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.amount) || undefined}
                />
                {errors.amount && (
                  <span className="signup__error">{errors.amount}</span>
                )}
              </div>       
         

              <div className="signup__field">
                <label htmlFor="payerPhone">Payer phone</label>
                <input
                  id="payerPhone"
                  name="payerPhone"
                  type="tel"
                  placeholder="Enter phone Number(+254...)"
                  value={formValues.payerPhone}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.payerPhone) || undefined}
                />
                <small style={{ display: 'block', marginTop: '4px', opacity: 0.75 }}>
                  Use full international format, e.g. 254,255(no +).
                </small>
                {errors.payerPhone && (
                  <span className="signup__error">{errors.payerPhone}</span>
                )}
              </div>

              <div className="signup__field">
                <label htmlFor="description">Description</label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="Enter description"
                  value={formValues.description}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.description) || undefined}
                />
                {errors.description && (
                  <span className="signup__error">{errors.description}</span>
                )}
              </div>

          

            <button className="signup__submit" type="submit" disabled={submitting}>
              {submitting ? 'waiting(input pin)...' : 'PAY NOW'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default SignUp


