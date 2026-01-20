import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KeepAliveService implements OnModuleInit {
  private readonly logger = new Logger(KeepAliveService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // This service periodically calls a lightweight endpoint to help keep the
    // backend "warm" on some hosting providers and avoid cold-start delays.
    //
    // IMPORTANT: This cannot wake a server that the hosting provider has fully
    // put to sleep. For that, you still need an external uptime monitor
    // (UptimeRobot, BetterStack, cron-job.org, etc.) hitting your public URL.
    //
    // How to configure:
    // - Set KEEP_ALIVE_URL to a lightweight endpoint, e.g.:
    //     KEEP_ALIVE_URL=https://your-app-url/health
    // - Optionally override interval with KEEP_ALIVE_INTERVAL_MS (default 4min).

    const keepAliveUrl =
      this.configService.get<string>('KEEP_ALIVE_URL') ||
      this.configService.get<string>('BACKEND_BASE_URL');

    if (!keepAliveUrl) {
      this.logger.log(
        'KEEP_ALIVE_URL/BACKEND_BASE_URL not set; skipping keep-alive pings.',
      );
      return;
    }

    const rawInterval =
      this.configService.get<string>('KEEP_ALIVE_INTERVAL_MS') ?? '';
    const intervalMs =
      Number(rawInterval) && Number(rawInterval) > 0
        ? Number(rawInterval)
        : 4 * 60 * 1000; // default: 4 minutes

    this.logger.log(
      `Starting keep-alive ping to ${keepAliveUrl} every ${
        intervalMs / 1000
      } seconds`,
    );

    this.intervalId = setInterval(async () => {
      try {
        await axios.get(keepAliveUrl, { timeout: 5000 });
      } catch (error: any) {
        this.logger.warn(
          `Keep-alive ping failed: ${
            error?.message || error?.toString?.() || 'Unknown error'
          }`,
        );
      }
    }, intervalMs);
  }
}

