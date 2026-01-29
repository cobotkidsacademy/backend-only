import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpAdapterHost } from '@nestjs/core';

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private internalIntervalId: NodeJS.Timeout | null = null;
  private externalIntervalId: NodeJS.Timeout | null = null;
  private serverInstance: any = null;
  private port: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  onModuleInit() {
    // Small delay to ensure server is fully initialized
    setTimeout(() => {
      // Get server instance and port for internal keep-alive
      try {
        const httpAdapter = this.httpAdapterHost?.httpAdapter;
        if (httpAdapter) {
          this.serverInstance = httpAdapter.getHttpServer();
          
          // Extract port from server instance
          const address = this.serverInstance?.address();
          if (address && typeof address === 'object') {
            this.port = address.port;
          } else {
            // Fallback: get from environment
            this.port = parseInt(process.env.PORT || '3001', 10);
          }
        } else {
          // Fallback: get from environment
          this.port = parseInt(process.env.PORT || '3001', 10);
        }
      } catch (error) {
        this.logger.warn('Could not get server instance for internal keep-alive, using default port');
        this.port = parseInt(process.env.PORT || '3001', 10);
      }

      // Start internal keep-alive (pings own health endpoint)
      this.startInternalKeepAlive();
    }, 2000); // 2 second delay

    // Start external keep-alive (pings external URL if configured)
    this.startExternalKeepAlive();
  }

  /**
   * Internal keep-alive: Pings the server's own health endpoint
   * This keeps the server process active and prevents it from going idle
   */
  private startInternalKeepAlive() {
    const rawInterval =
      this.configService.get<string>('KEEP_ALIVE_INTERVAL_MS') ?? '';
    const intervalMs =
      Number(rawInterval) && Number(rawInterval) > 0
        ? Number(rawInterval)
        : 60 * 1000; // default: 1 minute (more frequent for internal)

    // Use localhost for internal keep-alive
    const baseUrl = this.port
      ? `http://localhost:${this.port}`
      : 'http://localhost:3001';
    const healthUrl = `${baseUrl}/health`;

    this.logger.log(
      `Starting INTERNAL keep-alive ping to ${healthUrl} every ${
        intervalMs / 1000
      } seconds`,
    );

    // Start immediately
    this.pingInternal(healthUrl);

    this.internalIntervalId = setInterval(() => {
      this.pingInternal(healthUrl);
    }, intervalMs);
  }

  private async pingInternal(url: string) {
    try {
      await axios.get(url, {
        timeout: 3000,
        headers: {
          'User-Agent': 'Internal-KeepAlive/1.0',
          'X-Keep-Alive': 'internal',
        },
      });
      this.logger.debug(`✓ Internal keep-alive ping successful`);
    } catch (error: any) {
      // Don't log as warning if server hasn't started yet
      if (this.serverInstance) {
        this.logger.warn(
          `Internal keep-alive ping failed: ${
            error?.message || error?.toString?.() || 'Unknown error'
          }`,
        );
      }
    }
  }

  /**
   * External keep-alive: Pings an external URL (for hosted deployments)
   * This helps wake up servers on hosting providers that go to sleep
   */
  private startExternalKeepAlive() {
    const keepAliveUrl =
      this.configService.get<string>('KEEP_ALIVE_URL') ||
      this.configService.get<string>('BACKEND_BASE_URL');

    if (!keepAliveUrl) {
      this.logger.log(
        'KEEP_ALIVE_URL/BACKEND_BASE_URL not set; skipping external keep-alive pings.',
      );
      return;
    }

    const rawInterval =
      this.configService.get<string>('EXTERNAL_KEEP_ALIVE_INTERVAL_MS') ?? '';
    const intervalMs =
      Number(rawInterval) && Number(rawInterval) > 0
        ? Number(rawInterval)
        : 4 * 60 * 1000; // default: 4 minutes

    this.logger.log(
      `Starting EXTERNAL keep-alive ping to ${keepAliveUrl} every ${
        intervalMs / 1000
      } seconds`,
    );

    this.externalIntervalId = setInterval(async () => {
      try {
        await axios.get(keepAliveUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'External-KeepAlive/1.0',
            'X-Keep-Alive': 'external',
          },
        });
        this.logger.debug(`✓ External keep-alive ping successful`);
      } catch (error: any) {
        this.logger.warn(
          `External keep-alive ping failed: ${
            error?.message || error?.toString?.() || 'Unknown error'
          }`,
        );
      }
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.internalIntervalId) {
      clearInterval(this.internalIntervalId);
      this.logger.log('Stopped internal keep-alive service');
    }
    if (this.externalIntervalId) {
      clearInterval(this.externalIntervalId);
      this.logger.log('Stopped external keep-alive service');
    }
  }
}



