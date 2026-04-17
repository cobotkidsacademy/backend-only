import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpAdapterHost } from '@nestjs/core';

@Injectable()
export class KeepAliveService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
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
    this.startExternalKeepAlive();
  }

  onApplicationBootstrap() {
    this.resolveServerPort();
    this.startInternalKeepAlive();
  }

  /**
   * Internal keep-alive: Pings the server's own health endpoint
   * This keeps the server process active and prevents it from going idle
   */
  private startInternalKeepAlive() {
    const intervalMs = this.parseInterval(
      this.configService.get<string>('KEEP_ALIVE_INTERVAL_MS'),
      60 * 1000,
    );

    const port = this.port ?? this.parsePortFromEnv();
    const healthUrl = `http://localhost:${port}/health`;

    this.logger.log(
      `Starting INTERNAL keep-alive ping to ${healthUrl} every ${intervalMs / 1000} seconds`,
    );

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
      this.logger.debug('✓ Internal keep-alive ping successful');
    } catch (error: any) {
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

    const intervalMs = this.parseInterval(
      this.configService.get<string>('EXTERNAL_KEEP_ALIVE_INTERVAL_MS'),
      4 * 60 * 1000,
    );

    this.logger.log(
      `Starting EXTERNAL keep-alive ping to ${keepAliveUrl} every ${intervalMs / 1000} seconds`,
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
        this.logger.debug('✓ External keep-alive ping successful');
      } catch (error: any) {
        this.logger.warn(
          `External keep-alive ping failed: ${
            error?.message || error?.toString?.() || 'Unknown error'
          }`,
        );
      }
    }, intervalMs);
  }

  private resolveServerPort() {
    try {
      const httpAdapter = this.httpAdapterHost?.httpAdapter;
      if (!httpAdapter) {
        throw new Error('HTTP adapter is unavailable');
      }

      this.serverInstance = httpAdapter.getHttpServer();
      const address = this.serverInstance?.address();
      this.port = this.parsePortFromAddress(address) ?? this.parsePortFromEnv();
    } catch (error) {
      this.logger.warn(
        'Could not resolve server instance for internal keep-alive; using default port.',
      );
      this.port = this.parsePortFromEnv();
    }
  }

  private parsePortFromAddress(address: unknown): number | null {
    if (!address || typeof address !== 'object') {
      return null;
    }

    const port = (address as { port?: number }).port;
    return typeof port === 'number' && port > 0 ? port : null;
  }

  private parsePortFromEnv(): number {
    const port = Number(process.env.PORT || '3001');
    return Number.isInteger(port) && port > 0 ? port : 3001;
  }

  private parseInterval(
    rawInterval: string | undefined,
    defaultMs: number,
  ): number {
    if (!rawInterval || !rawInterval.trim()) {
      return defaultMs;
    }

    const interval = Number(rawInterval);
    return Number.isFinite(interval) && interval > 0
      ? Math.round(interval)
      : defaultMs;
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
