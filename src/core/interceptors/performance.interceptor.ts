import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Performance Monitoring Interceptor
 * 
 * Logs response times and performance metrics
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;

          // Log slow requests (> 500ms)
          if (responseTime > 500) {
            this.logger.warn(
              `Slow request: ${method} ${url} - ${responseTime}ms - ${statusCode}`,
            );
          } else {
            this.logger.debug(
              `Request: ${method} ${url} - ${responseTime}ms - ${statusCode}`,
            );
          }

          // Add performance header
          response.setHeader('X-Response-Time', `${responseTime}ms`);
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `Request error: ${method} ${url} - ${responseTime}ms - ${error.message}`,
          );
        },
      }),
    );
  }
}
