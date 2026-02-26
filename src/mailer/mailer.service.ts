import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;
  /** When set, use Resend (HTTPS) instead of SMTP. Required on Railway/Render where outbound SMTP ports are blocked. */
  private resend: Resend | null = null;

  constructor(private configService: ConfigService) {
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@cobotkids.edutech';

    const resendKey = (this.configService.get<string>('RESEND_API_KEY') || '').trim();
    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.logger.log(
        'Mailer initialized with Resend (HTTPS). Parent verification emails will be sent. Use on Railway/Render where SMTP ports are blocked.',
      );
      return;
    }

    // Support both string and number from env (hosting platforms often give strings)
    const portRaw = this.configService.get<string>('SMTP_PORT') ?? this.configService.get<number>('SMTP_PORT');
    const port = portRaw != null ? Number(portRaw) : 587;
    const host = (this.configService.get<string>('SMTP_HOST') || '').trim();
    const user = (this.configService.get<string>('SMTP_USER') || '').trim();
    const pass = (this.configService.get<string>('SMTP_PASS') || '').trim().replace(/\s/g, ''); // remove spaces (e.g. App Password)

    if (host && user && pass) {
      const isGmail = host.toLowerCase().includes('gmail');
      const connectionTimeout = 20_000; // 20s so requests fail fast instead of ~2 min
      const greetingTimeout = 10_000;
      this.transporter = nodemailer.createTransport(
        isGmail
          ? {
              service: 'gmail',
              auth: { user, pass },
              connectionTimeout,
              greetingTimeout,
            }
          : {
              host,
              port,
              secure: port === 465,
              requireTLS: port === 587,
              auth: { user, pass },
              connectionTimeout,
              greetingTimeout,
            },
      );
      this.logger.log(`Mailer initialized with SMTP (${host}:${port}). Parent verification emails will be sent.`);
    } else {
      this.logger.warn(
        `Email not configured. Set RESEND_API_KEY (recommended on Railway) or SMTP_HOST, SMTP_USER, SMTP_PASS. See backend/EMAIL_SETUP.md.`,
      );
    }
  }

  async onModuleInit() {
    if (this.resend) return;
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified. Ready to send parent verification emails.');
    } catch (err: any) {
      this.logger.error(
        `SMTP verification failed. Parent verification emails may not send. Error: ${err?.message || err}. ` +
          'Use RESEND_API_KEY instead (see backend/EMAIL_SETUP.md) when hosting on Railway/Render where SMTP is often blocked.',
      );
    }
  }

  private async sendMail(toEmail: string, subject: string, html: string, text: string): Promise<void> {
    const fromDisplay = 'COBOT Parent Portal';
    const fromAddr = this.fromAddress;

    if (this.resend) {
      const { error } = await this.resend.emails.send({
        from: `${fromDisplay} <onboarding@resend.dev>`,
        to: [toEmail],
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message);
      return;
    }

    if (!this.transporter) {
      throw new Error('Email is not configured. Set RESEND_API_KEY or SMTP_* (see backend/EMAIL_SETUP.md).');
    }
    await this.transporter.sendMail({
      from: `"${fromDisplay}" <${fromAddr}>`,
      to: toEmail,
      subject,
      text,
      html,
    });
  }

  async sendVerificationCode(toEmail: string, code: string): Promise<void> {
    const subject = 'Your COBOT Parent Portal verification code';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="padding: 32px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
              <h1 style="margin:0; color: #ffffff; font-size: 22px; font-weight: 700;">COBOT Parent Portal</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Verification code</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="margin:0 0 16px; color: #334155; font-size: 15px; line-height: 1.5;">Use this code to sign in to your parent dashboard:</p>
              <p style="margin: 0 0 24px; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${code}</p>
              <p style="margin:0; color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin:0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} COBOT LMS. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Your COBOT Parent Portal verification code is: ${code}. It expires in 10 minutes.`;

    try {
      await this.sendMail(toEmail, subject, html, text);
      this.logger.log(`Verification email sent to ${toEmail}`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const code = err?.code ?? err?.responseCode;
      this.logger.error(`Failed to send verification email to ${toEmail}: ${msg}${code ? ` (code=${code})` : ''}`);
      throw err;
    }
  }

  async sendPinResetCode(toEmail: string, code: string): Promise<void> {
    const subject = 'Your COBOT Parent Portal PIN reset code';
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PIN reset</title></head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
        <tr><td style="padding: 32px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
          <h1 style="margin:0; color: #ffffff; font-size: 22px; font-weight: 700;">COBOT Parent Portal</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">PIN reset code</p>
        </td></tr>
        <tr><td style="padding: 32px 24px;">
          <p style="margin:0 0 16px; color: #334155; font-size: 15px;">Use this code to reset your 4-digit PIN:</p>
          <p style="margin: 0 0 24px; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${code}</p>
          <p style="margin:0; color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
        </td></tr>
        <tr><td style="padding: 0 24px 24px; border-top: 1px solid #e2e8f0;">
          <p style="margin:0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} COBOT LMS.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Your COBOT Parent Portal PIN reset code is: ${code}. It expires in 10 minutes.`;
    try {
      await this.sendMail(toEmail, subject, html, text);
      this.logger.log(`PIN reset email sent to ${toEmail}`);
    } catch (err: any) {
      this.logger.error(`Failed to send PIN reset email to ${toEmail}: ${err?.message || err}`);
      throw err;
    }
  }

  async sendWelcomeCredentials(toEmail: string, firstName: string): Promise<void> {
    const subject = 'Your COBOT Parent Portal account is ready';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="padding: 32px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
              <h1 style="margin:0; color: #ffffff; font-size: 22px; font-weight: 700;">COBOT Parent Portal</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Your account is ready</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <p style="margin:0 0 16px; color: #334155; font-size: 15px; line-height: 1.5;">Hi ${firstName ? firstName : 'there'},</p>
              <p style="margin:0 0 16px; color: #334155; font-size: 15px; line-height: 1.5;">Your parent account has been created. Use these details to sign in:</p>
              <p style="margin: 0 0 8px; color: #0f172a; font-size: 15px;"><strong>Email:</strong> ${toEmail}</p>
              <p style="margin: 0 0 24px; color: #0f172a; font-size: 15px;"><strong>PIN:</strong> Use the 4-digit PIN you set during registration.</p>
              <p style="margin:0; color: #64748b; font-size: 13px;">If you did not create this account, you can ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin:0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} COBOT LMS. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Your COBOT Parent Portal account is ready. Sign in with email: ${toEmail} and the 4-digit PIN you set during registration.`;

    try {
      await this.sendMail(toEmail, subject, html, text);
      this.logger.log(`Welcome email sent to ${toEmail}`);
    } catch (err: any) {
      this.logger.error(`Failed to send welcome email to ${toEmail}: ${err?.message || err}`);
      throw err;
    }
  }
}
