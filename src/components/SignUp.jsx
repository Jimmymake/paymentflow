import { useEffect, useRef, useState } from 'react'
import { getBearerToken } from '../api/token'
import { nanoid }  from 'nanoid';
// Credentials used to request the bearer token
const BASIC_USER = import.meta.env.VITE_BASIC_USER || 'plugin'
const BASIC_PASS = import.meta.env.VITE_BASIC_PASS || 'PluginJimmyX@)_ss:3fkk'
import './SignUp.scss'


const CALLBACK_BASE = (import.meta.env.VITE_CALLBACK_BASE || '').replace(/\/+$/, '')
// Default callback URL sent to the payment provider
const DEFAULT_CALLBACK_URL = import.meta.env.VITE_DEFAULT_CALLBACK_URL || 'https://paymentflow.mam-laka.com/callback'

function SignUp() {

  const [formValues, setFormValues] = useState({
    
      impalaMerchantId:"plugin",
      currency: "KES",
      amount: '',
      customerName: "", 
      customerEmail: "",
      payerPhone: "",
      description: "",
      externalId: nanoid(10),
      callbackUrl: DEFAULT_CALLBACK_URL,
      redirectUrl: "https://webhook.site/b69cf7a1-f6b4-4ca8-a98c-3928b5f716c8"
  
  
  })
  
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [apiResponse, setApiResponse] = useState(null)
  const [callbackData, setCallbackData] = useState(null)
  const [transactionStatus, setTransactionStatus] = useState('idle') // idle | pending | success | failed
  const [transactionRef, setTransactionRef] = useState('')

  const pollIntervalRef = useRef(null)
  const pollStartAtRef = useRef(0)
  const currentExternalIdRef = useRef('')

  function clearPoll() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
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
   // if (!values.payerPhone.trim()) nextErrors.payerPhone = 'Payer phone is required'
  //  else if (!/^\+?[1-9]\d{7,14}$/.test(values.payerPhone.trim())) nextErrors.payerPhone = 'Phone must be E.164 (e.g. +2547...)'
    if (!values.description.trim()) nextErrors.description = 'Description is required'
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate(formValues)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    let bearerToken
    try {

      //request token from the provided credentials
      bearerToken = await getBearerToken({ username: BASIC_USER, password: BASIC_PASS })
    } catch (e) {
      setApiResponse({ error: true, message: 'Failed to get token', details: String(e?.message || e) })
      setSubmitted(true)
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

      const res = await fetch('https://payments.mam-laka.com/api/v1/flutterwave/initiate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          externalId: uniqueExternalId,
          amount: Math.round(Number(payload.amount)),
          payerPhone: String(payload.payerPhone).trim(),
        }),
      })
      
      console.log('Response status:', res.status, res.statusText)
      
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
      
      if (!res.ok) {
        setApiResponse({
          error: true,
          status: res.status,
          statusText: res.statusText,
          message: data.message || data.error || 'Payment initiation failed',
          data: data
        })
        setSubmitted(true)
        setTransactionStatus('failed')
        setSubmitting(false)
        return
      }
      
      setApiResponse(null)
      setTransactionStatus('pending')
      // start fresh poll; clear any existing one
      clearPoll()
      pollStartAtRef.current = Date.now()
      currentExternalIdRef.current = uniqueExternalId
      
      let tries = 0
      const maxTries = 60 // ~60 seconds
      pollIntervalRef.current = setInterval(async () => {
        tries += 1
        try {
          const base = CALLBACK_BASE // '' for same-origin, or e.g. https://paymentflow.mam-laka.com
          const latestUrl = `${base}/api/v1/callback/latest`
          const r = await fetch(latestUrl, { headers: { 'Accept': 'application/json' } })
          const c = await r.json()
          if (c && c.body) {
            // Ignore stale callbacks (before this poll started)
            if (c.receivedAt) {
              const ts = new Date(c.receivedAt).getTime()
              if (Number.isFinite(ts) && ts < pollStartAtRef.current) {
                return
              }
            }
            // If webhook carries externalId, ensure it matches current one
            const cbExternalId = c?.body?.externalId || c?.body?.data?.externalId
            if (cbExternalId && cbExternalId !== currentExternalIdRef.current) {
              return
            }
            setCallbackData(c)

            const status = c?.body?.status || c?.body?.data?.status
            const ref = c?.body?.data?.reference || c?.body?.reference
            if (status === 'success') {
              setTransactionStatus('success')
              setSubmitted(true)
            } else {
              setTransactionStatus('failed')
              setSubmitted(true)
            }
            if (ref) setTransactionRef(ref)
            clearPoll()
            setSubmitting(false)
          }
        } catch {
  setTransactionStatus('failed')

        }
        if (tries >= maxTries) {
          // Timeout without callback -> treat as failed
          clearPoll()
          setTransactionStatus((prev) => (prev === 'pending' ? 'failed' : prev))
          setSubmitted(true)
          setSubmitting(false)
        }
    
      }, 1000)
    } catch (e) {
      console.error('Payment initiation error:', e)
      setApiResponse({ 
        error: true,
        message: 'Network error: ' + e.message,
        details: String(e)
      })
      setSubmitted(true)
      setSubmitting(false)
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
                      return (
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                          {event && <li>Event: <strong>{event}</strong></li>}
                          {status && <li>Status: <strong>{String(status)}</strong></li>}
                          {ref && <li>Reference: <strong>{ref}</strong></li>}
                          {(amount != null || currency) && (
                            <li>Amount: <strong>{amount}</strong> {currency}</li>
                          )}
                          {method && <li>Method: <strong>{method}</strong></li>}
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
                          return (
                            <ul>
                              {ref && <li>Reference: <strong>{ref}</strong></li>}
                              {(amount != null || currency) && (
                                <li>Amount: <strong>{amount}</strong> {currency}</li>
                              )}
                              {method && <li>Method: <strong>{method}</strong></li>}
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
                          return (
                            <ul>
                              {event && <li>Event: <strong>{event}</strong></li>}
                              {ref && <li>Reference: <strong>{ref}</strong></li>}
                              {(amount != null || currency) && (
                                <li>Amount: <strong>{amount}</strong> {currency}</li>
                              )}
                              {method && <li>Method: <strong>{method}</strong></li>}
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
              onClick={() => { clearPoll(); setSubmitted(false); setApiResponse(null); setErrors({}); setCallbackData(null); setTransactionStatus('idle'); setTransactionRef('') }}
              className="signup__submit"
              style={{ marginTop: '16px', width: '100%' }}
            >
              {transactionStatus === 'failed' ? 'Try Again' : 'Done'}
            </button>
          </div>
        ) : (
          <form className="signup__form" onSubmit={handleSubmit} noValidate>

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
                 // <option value="NGN">Nigeria (NGN)</option>
                  <option value="GHS">Ghana (GHS)</option>
                </select>
                {errors.currency && (
                  <span className="signup__error">{errors.currency}</span>
                )}
              </div>

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
                  placeholder="Enter phonenumber
"
                  value={formValues.payerPhone}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.payerPhone) || undefined}
                />
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
              {submitting ? 'waiting transaction to complete...' : 'PAY NOW'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default SignUp


