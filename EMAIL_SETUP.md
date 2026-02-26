# Parent Portal – Email (Mailtrap)

The app sends **verification codes**, **PIN reset codes**, and **welcome emails** to parents via **Mailtrap** over HTTPS (works on Railway; no SMTP).

---

## 1. Testing mode (use this for now)

Emails are **not** delivered to real addresses; they appear in your **Mailtrap Email Testing inbox**. No domain verification needed.

1. Sign up at [mailtrap.io](https://mailtrap.io).
2. Open **Email Testing** → your **Inbox** (or create one).
3. **API Token**: go to **Settings** → **API Tokens** (or the inbox **Integrations** tab). Create/copy a token.
4. **Inbox ID**: open the inbox; the ID is in the URL, e.g. `https://mailtrap.io/inboxes/2564102/messages` → ID is **2564102**.
5. In `backend/.env` (or Railway Variables) set:

   ```env
   MAILTRAP_API_TOKEN=your-api-token
   MAILTRAP_TEST_INBOX_ID=2564102
   ```

   (Use your real inbox ID. You can leave `MAIL_FROM` unset for testing.)

6. Restart the backend.

On startup you should see: `Mailer initialized with Mailtrap Sandbox (testing). Emails go to your testing inbox (ID …), not to real recipients.`

Trigger a verification email from the app; it will show up in the Mailtrap testing inbox.

---

## 2. Why Mailtrap (and no SMTP)?

Railway and many cloud platforms **block outbound SMTP** (ports 465 and 587). You get `ETIMEDOUT` when using Gmail/nodemailer. You cannot unblock these ports. The app uses Mailtrap’s **Email API over HTTPS**, which is always allowed.

---

## 3. Production (real sending)

1. **Sign up** at [mailtrap.io](https://mailtrap.io) and open **Email Sending** (or **Sending Domains**).
2. **Add and verify a sending domain** (e.g. `cobotkidsacademy.com`): add the DNS records Mailtrap provides, then verify.
3. **Get an API token**: in Mailtrap go to **Sending Domains** → your domain → **Integration** (or **API Tokens**). Copy the token.
4. **Environment variables** (local: `backend/.env`; Railway: backend service → **Variables**):

   ```env
   MAILTRAP_API_TOKEN=your-api-token
   MAIL_FROM=noreply@yourdomain.com
   ```

   - **MAILTRAP_API_TOKEN** – API token from Mailtrap (Sending Domains → Integration).
   - **MAIL_FROM** – “From” address; must be an email on a **verified** sending domain (e.g. `noreply@cobotkidsacademy.com`).

5. **Restart** (or redeploy) the backend.

Set **only** `MAILTRAP_API_TOKEN` and `MAIL_FROM`; do **not** set `MAILTRAP_TEST_INBOX_ID`. On startup you should see: `Mailer initialized with Mailtrap Email API (sending). Parent verification emails will be sent to real addresses.`

---

## 4. Railway

1. Open your **backend** service on Railway.
2. Go to **Variables**.
3. Add:
   - `MAILTRAP_API_TOKEN` = your Mailtrap API token
   - `MAIL_FROM` =  e.g. `noreply@yourdomain.com` (use a verified sending domain)
4. Save and **redeploy**.

---

## 5. Verify it works

1. Restart the backend after changing `.env` or Railway variables.
2. On parent login/register, request a code to **your own email**.
3. Check inbox (and spam) for the verification or PIN reset email.

If sending fails, check backend logs for the error message and ensure your sending domain is verified and `MAIL_FROM` uses that domain.

---

## 6. Debug: "Unauthorized" from Mailtrap

If you see **`Failed to send verification email to …: Unauthorized`** in backend logs:

1. **Use the correct API token**  
   For **production** sending, the token must be from **Email Sending** (Sending Domains), not from Email Testing. (For testing you use MAILTRAP_TEST_INBOX_ID instead.) In Mailtrap: go to **Sending Domains** → your domain → **Integration** (or **API**), and copy the token. Do **not** use a token from **Email Testing** → Inbox → API.

2. **Check token value**  
   In `.env` or Railway Variables, ensure `MAILTRAP_API_TOKEN` has no extra spaces or line breaks. The value should be a single line.

3. **Verify MAIL_FROM is on a verified domain**  
   `MAIL_FROM` must be an address on a **verified** sending domain (e.g. `noreply@yourdomain.com`). If the domain is not verified or the address is wrong, Mailtrap can return 401 Unauthorized.

4. **Enable debug logs**  
   Set log level to `debug` (e.g. in NestJS set `LOG_LEVEL=debug` or your logger config). The mailer logs `from`, status, and response body on failure to help trace the issue.

---

## 7. Security

- Do not commit `.env` (it should be in `.gitignore`).
- Use a dedicated API token with minimal required permissions in Mailtrap.
