import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseShapeService } from '../../shared/response/response-shape.service';

/**
 * Response Shaping Interceptor
 * 
 * Automatically shapes responses to minimal payloads
 */
@Injectable()
export class ResponseShapeInterceptor implements NestInterceptor {
  constructor(private responseShapeService: ResponseShapeService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If response is already shaped, return as-is
        if (data && typeof data === 'object' && 'shaped' in data) {
          return data;
        }

        // Auto-shape based on data structure
        return this.autoShape(data);
      }),
    );
  }

  private autoShape(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // If it's an array, shape each item
    if (Array.isArray(data)) {
      return data.map((item) => this.autoShape(item));
    }

    // Shape based on common patterns
    if (data.user) {
      return this.responseShapeService.shapeDashboard(data);
    }

    if (data.id && data.name && data.code) {
      return this.responseShapeService.shapeCourseList(data);
    }

    if (data.id && data.title && data.content !== undefined) {
      return this.responseShapeService.shapeLessonDetail(data);
    }

    // Return as-is if no pattern matches
    return data;
  }
}
