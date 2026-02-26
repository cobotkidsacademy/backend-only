import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailtrapClient } from 'mailtrap';

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private client: MailtrapClient | null = null;
  private fromAddress: string;
  private fromName = 'COBOT Parent Portal';

  constructor(private configService: ConfigService) {
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM')?.trim() ||
      'noreply@cobotkids.edutech';
  }

  async onModuleInit() {
    const token = (this.configService.get<string>('MAILTRAP_API_TOKEN') || '').trim();
    if (!token) {
      this.logger.warn(
        'Email not configured. Set MAILTRAP_API_TOKEN (and MAILTRAP_TEST_INBOX_ID for testing). See backend/EMAIL_SETUP.md.',
      );
      return;
    }
    const testInboxIdRaw = (this.configService.get<string>('MAILTRAP_TEST_INBOX_ID') ?? this.configService.get<number>('MAILTRAP_TEST_INBOX_ID'));
    const testInboxId = testInboxIdRaw != null ? Number(testInboxIdRaw) : undefined;
    const useSandbox = testInboxId != null && !Number.isNaN(testInboxId);
    if (useSandbox) {
      this.client = new MailtrapClient({ token, sandbox: true, testInboxId });
      this.logger.log(
        `Mailer initialized with Mailtrap Sandbox (testing). Emails go to your testing inbox (ID ${testInboxId}), not to real recipients.`,
      );
    } else {
      this.client = new MailtrapClient({ token });
      this.logger.log(
        'Mailer initialized with Mailtrap Email API (sending). Parent verification emails will be sent to real addresses.',
      );
    }
  }

  private async sendMail(toEmail: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.client) {
      throw new Error('Email is not configured. Set MAILTRAP_API_TOKEN (see backend/EMAIL_SETUP.md).');
    }
    const from = { name: this.fromName, email: this.fromAddress };
    try {
      await this.client.send({
        from,
        to: [{ email: toEmail }],
        subject,
        text,
        html,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      const status = err?.response?.status ?? err?.status;
      const body = err?.response?.data ?? err?.body;
      this.logger.warn(
        `Mailtrap send failed: ${msg}. from=${from.email}${status != null ? ` status=${status}` : ''}${body ? ` body=${JSON.stringify(body)}` : ''}. See backend/EMAIL_SETUP.md §6 if Unauthorized.`,
      );
      throw err;
    }
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
      const codeErr = err?.code ?? err?.responseCode;
      this.logger.error(`Failed to send verification email to ${toEmail}: ${msg}${codeErr ? ` (code=${codeErr})` : ''}`);
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
