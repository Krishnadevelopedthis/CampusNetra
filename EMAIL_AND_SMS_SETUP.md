# Email and SMS setup

Every OTP flow in this app — sign-up verification, forgot password, the
profile page's email/phone change — goes through `backend/app/services/email.py`
and `backend/app/services/sms.py`. Both fall back to logging the code to the
server console when nothing is configured, so the app never breaks — it just
can't reach a real inbox or phone until you set the values below.

All of these are environment variables. Locally, put them in `backend/.env`
(copy `backend/.env.example` as a starting point). On a host like Render,
set them in that service's dashboard under Environment, then redeploy.

---

## 1. Email — pick one or two providers

You need **at least one** of these for any email to actually send. Most
PaaS free tiers (Render, Railway, Fly, Heroku) block outbound SMTP ports 25/
465/587 to cut down on spam, so if you're deployed on one of those, use
Brevo or Resend (both are plain HTTPS, never blocked) instead of raw SMTP.

### Option A — Brevo (recommended if you're only using one provider)

Brevo's free tier sends real email to any address with no domain
verification needed to get started (300/day on the free plan).

1. Sign up at [brevo.com](https://www.brevo.com).
2. Go to **Settings → SMTP & API → API Keys** → **Generate a new API key**.
3. Set:
   ```
   BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxx
   SMTP_FROM="Campus Netra <no-reply@yourdomain.com>"
   ```
   `SMTP_FROM`'s address should ideally be a sender you've verified in Brevo
   (**Senders, Domains & Dedicated IPs**) — an unverified sender is often
   accepted by the API and then silently dropped, which looks identical to
   "configured" from this app's side. Use `/admin/email/status` (below) to
   check.

### Option B — Resend

Resend's free tier is generous, but **new accounts start in sandbox mode**:
you can only send *from* `onboarding@resend.dev` and only *to* the email
address that owns the Resend account. Anyone else's email will fail with a
403 until you verify a domain.

1. Sign up at [resend.com](https://resend.com).
2. **API Keys** → **Create API Key**.
3. Set:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
   ```
4. To send to real users (not just your own inbox), verify a domain:
   - **Domains** → **Add Domain** → enter a domain you control.
   - Add the SPF/DKIM DNS records Resend gives you, at your domain registrar.
   - Wait for verification (minutes to a few hours for DNS propagation).
   - Set `SMTP_FROM` to an address on that domain, e.g.
     `SMTP_FROM="Campus Netra <no-reply@yourdomain.com>"`.

### Option C — SMTP (only if outbound SMTP isn't blocked)

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASSWORD=your-password
SMTP_FROM="Campus Netra <no-reply@yourdomain.com>"
```

### Using two providers for different flows

If you want, say, Brevo for the flows that email your own registered users
(sign-up, forgot password) and Resend for the profile page's email-change
flow (which emails an address that isn't a Campus Netra user yet — exactly
the case a sandboxed Resend account can't send to reliably once it's a real
domain, or is fine for while it's still sandboxed and testing against your
own address), set **both** API keys and pin each purpose explicitly:

```
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxx
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx

EMAIL_PROVIDER_EMAIL_VERIFY=brevo
EMAIL_PROVIDER_PASSWORD_RESET=brevo
EMAIL_PROVIDER_EMAIL_CHANGE=resend
```

Without the three `EMAIL_PROVIDER_*` lines, all three default to `auto`,
which means "whichever key is set" — and if both are set, Resend always
wins for *everything*, silently. The pins above are what actually splits
the two flows across two providers.

### Checking it's working

As an admin, hit:
- `GET /api/v1/admin/email/status` — confirms the key is valid and reports
  the sender address it would send as.
- `POST /api/v1/admin/email/test` — sends a real test email to your own
  admin account.

Or from a shell with the backend's `.env` loaded:
```bash
./scripts/check_email.py your-real-address@gmail.com
```

---

## 2. SMS — Twilio

Used for: phone-number-change OTP, and "reset password via phone number".
Twilio is the only provider wired in.

1. Sign up at [twilio.com](https://www.twilio.com) (a trial account works
   for testing, see the limitation below).
2. From the [Twilio Console](https://console.twilio.com) dashboard, copy:
   - **Account SID**
   - **Auth Token**
3. Get a Twilio phone number to send *from*: **Phone Numbers → Manage →
   Buy a number** (a trial account gets one free number to start with).
4. Set:
   ```
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_FROM_NUMBER=+15017122661
   ```
   `TWILIO_FROM_NUMBER` must be the Twilio number from step 3, in E.164
   form (`+` followed by the full number, no spaces or dashes) — not a
   personal phone number.

5. `SMS_DEFAULT_COUNTRY_CODE` (default `+91`) is prepended to the 10-digit
   numbers this app stores, to build the full number Twilio needs. Change
   it if your users aren't in India.

### The #1 thing that trips this up: trial account restrictions

**A Twilio trial account can only send SMS to phone numbers you've
manually verified** in the console (**Phone Numbers → Manage → Verified
Caller IDs**). Every other number gets rejected with a 403, which looks
like a configuration problem but isn't — it's Twilio protecting against
spam from unpaid accounts. Either:
- verify the specific numbers you're testing with there, or
- upgrade the account (add a payment method) to send to any number.

`/admin/sms/status` and this app's own error messages both call this out
by name instead of just saying "Twilio rejected it" — if you see that
message, this is almost always why.

### Checking it's working

As an admin:
- `GET /api/v1/admin/sms/status` — confirms the credentials are valid.
- `POST /api/v1/admin/sms/test` — sends a real test text to your own admin
  account's phone number (only works if your admin account has a phone
  number saved).

Or from a shell with the backend's `.env` loaded:
```bash
./scripts/check_sms.py 9876543210
```

---

## 3. What happens with nothing configured

Every OTP falls back to being logged to the server console (or, outside
production, returned directly in the API response as `dev_code` so you can
test the flow from a browser without reading server logs at all). Nothing
crashes — sign-up, password reset, and profile changes all still work
end-to-end for local development. The moment `ENVIRONMENT=production` is
set with no provider configured, `dev_code` stops being returned and those
endpoints report a clear 503 instead of pretending to have sent something.
