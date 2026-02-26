# Parent Portal – Email configuration (verification codes)

The app sends the **6-digit verification code** to the **email address the user enters**. To actually deliver these emails, you must configure either **Resend** (recommended when hosting) or **SMTP**.

**Important:** When you run the app **locally**, you use `backend/.env`. When you **host** the app (Railway, Render, Fly.io, etc.), the server does **not** use your local `.env` file—you must set the same variables in your hosting platform’s **Environment Variables** (e.g. Railway → your backend service → Variables). If they are not set on the host, verification emails will not be sent.

---

## Option A: Resend (recommended for Railway / Render / hosted backend)

Many cloud platforms **block outbound SMTP** (ports 587/465), which causes “Connection timeout” when using Gmail SMTP. Using **Resend** (HTTP API) avoids that and works from any host.

1. Sign up at [resend.com](https://resend.com) and create an **API key** ([resend.com/api-keys](https://resend.com/api-keys)).
2. In your backend env (local `backend/.env` or Railway/Render Variables), set **only**:
   ```env
   RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
3. Restart (or redeploy) the backend. On startup you should see: `Mailer initialized with Resend (HTTP API). Parent verification emails will be sent.`
4. Emails will be sent from `COBOT Parent Portal <onboarding@resend.dev>` (Resend’s free sender). To use your own domain later, verify it in the Resend dashboard.

If `RESEND_API_KEY` is set, the app uses Resend and **ignores** any SMTP variables.

---

## Option B: SMTP (Gmail, Outlook, etc.)

## 1. Add these variables (locally: `backend/.env`; when hosting: platform Variables)

```env
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password
MAIL_FROM=your-email@domain.com
```

- **SMTP_HOST** – Your provider’s SMTP server (see examples below).  
- **SMTP_PORT** – Usually `587` (TLS) or `465` (SSL).  
- **SMTP_USER** – Full email address used to sign in to SMTP.  
- **SMTP_PASS** – Password or **App Password** (not your normal email password for Gmail/Outlook).  
- **MAIL_FROM** – “From” address recipients see (often same as `SMTP_USER`).

After changing `.env` (local) or platform Variables (hosted), restart or redeploy the backend.

---

## 2. When hosting (Railway, Render, Fly.io, Vercel, etc.)

1. In your hosting dashboard, open your **backend** service/project.
2. Go to **Environment Variables** (or **Variables**, **Env**, **Config**).
3. Add the same SMTP variables as above:
   - `SMTP_HOST` (e.g. `smtp.gmail.com`)
   - `SMTP_PORT` (e.g. `587`)
   - `SMTP_USER` (your full email)
   - `SMTP_PASS` (App Password or SMTP password—no spaces in the value if the platform strips them)
   - `MAIL_FROM` (optional; defaults to SMTP_USER)
4. Save and **redeploy** (or restart) the backend so it picks up the new variables.
5. After deploy, check the backend logs on startup:
   - **Working:** `Mailer initialized with SMTP (smtp.gmail.com:587)...` then `SMTP connection verified. Ready to send parent verification emails.`
   - **Not set:** `SMTP not configured (host=..., user=..., pass=...)`. Add the variables in the host’s Environment Variables.
   - **Wrong credentials / port blocked:** `SMTP verification failed. Parent verification emails may not send. Error: ...` — fix the error (e.g. use Gmail App Password, check firewall). **If you see “Connection timeout” on Railway/Render,** use **Resend** (Option A above) instead of SMTP.

---

## 3. Gmail

1. Use a Gmail account (e.g. `cobot.parents@gmail.com`).
2. Turn on 2-Step Verification: [Google Account → Security → 2-Step Verification](https://myaccount.google.com/security).
3. Create an **App Password**:  
   [Google Account → Security → 2-Step Verification → App passwords](https://myaccount.google.com/apppasswords)  
   - Select “Mail” and your device, then generate.  
   - Copy the **16-character password** (no spaces).
4. In `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=cobot.parents@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
MAIL_FROM=cobot.parents@gmail.com
```

Use the 16-character App Password for `SMTP_PASS` (you can paste it with or without spaces).

---

## 4. Outlook / Microsoft 365

1. Use an Outlook or Microsoft 365 account.
2. Create an app password if you use 2FA: [Microsoft account → Security → Advanced security → App passwords](https://account.microsoft.com/security).
3. In `.env`:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-app-password
MAIL_FROM=your-email@outlook.com
```

---

## 5. Other providers (generic SMTP)

| Provider   | SMTP_HOST           | SMTP_PORT |
|-----------|---------------------|-----------|
| SendGrid  | smtp.sendgrid.net   | 587       |
| Mailgun   | smtp.mailgun.org    | 587       |
| Brevo    | smtp-relay.brevo.com| 587       |
| Yahoo     | smtp.mail.yahoo.com | 587       |

Use the email and password (or API/app password) they give you for SMTP for `SMTP_USER` and `SMTP_PASS`. Set `MAIL_FROM` to the same or your chosen “From” address.

---

## 6. Check that it works

1. Restart the backend.
2. On parent login/register, enter **your own email** and request a code.
3. Check that email’s inbox (and spam) for “Your COBOT Parent Portal verification code”.

If SMTP is not set or wrong, the server will still run but **won’t send email**; it will only log the code in the backend console (e.g. `[No SMTP] Would send verification to ... code=123456`).

---

## 7. If email is still not sending

1. **Restart the backend** after changing `.env` (Config is read on startup).
2. **Check backend console on startup**  
   - You should see: `Mailer initialized with SMTP (smtp.gmail.com)`.  
   - If you see: `SMTP not configured. Have: host=..., user=..., pass=...` then one of `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` is missing or wrong in `.env`.
3. **When you request a code**, check the backend console again:  
   - Success: `Verification email sent to your@email.com`.  
   - Failure: `Failed to send verification email to ...: <error message>`.  
   - Common Gmail errors:  
     - **"Invalid login"** or **"Username and Password not accepted"** → Use a Gmail **App Password**, not your normal password, and ensure 2-Step Verification is on.  
     - **"Connection timeout"** or **ETIMEDOUT** → The server cannot reach the SMTP host. Common causes:
       - **Firewall or network** blocking outbound port 587 or 465 (e.g. office/school Wi‑Fi). Try another network (e.g. mobile hotspot) or ask IT to allow `smtp.gmail.com:587` (or your SMTP host).
       - **Wrong SMTP_HOST** (e.g. typo). For Gmail use exactly `smtp.gmail.com`.
       - **Wrong port**: use `587` (TLS) or `465` (SSL) for Gmail. If 587 times out, try `SMTP_PORT=465` and ensure your host allows it.
       - **Hosting platform** (Railway, Render, etc.) may block SMTP; use their docs or a transactional email API (SendGrid, Mailgun, etc.) instead of direct Gmail SMTP.
4. **App Password**: In `.env`, `SMTP_PASS` must be the **exact 16-character password** Google gives you. Use the **same letters and capitalization** as shown in Google (e.g. if Google shows `abcd efgh ijkl mnop`, use that). You can paste it **with or without spaces**—the app removes spaces before sending, so both `abcd efgh ijkl mnop` and `abcdefghijklmnop` work.

## 8. Security notes

- **Do not commit `.env`** (it should be in `.gitignore`).
- Use an **App Password** or SMTP API key, not your main email password.
- For production, use a dedicated sending domain and provider (e.g. SendGrid, Mailgun) for better deliverability.
