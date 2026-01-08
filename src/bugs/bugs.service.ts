import { Injectable, Logger, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export interface CreateBugDto {
  title: string;
  description?: string;
  reporter?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  status?: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  category?: 'General' | 'Performance' | 'Authentication' | 'UI/UX' | 'Database' | 'API' | 'Load Test';
  test_type?: string;
  total_requests?: number;
  successful_requests?: number;
  failed_requests?: number;
  avg_response_time_ms?: number;
  p95_response_time_ms?: number;
  p99_response_time_ms?: number;
  max_response_time_ms?: number;
  requests_per_second?: number;
  test_duration_seconds?: number;
  error_rate_percentage?: number;
  test_metadata?: any;
}

export interface UpdateBugDto {
  title?: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  status?: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  category?: 'General' | 'Performance' | 'Authentication' | 'UI/UX' | 'Database' | 'API' | 'Load Test';
  resolved_at?: string;
  resolved_by?: string;
}

@Injectable()
export class BugsService {
  private readonly logger = new Logger(BugsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  async createBug(dto: CreateBugDto) {
    this.logger.log(`Creating bug: ${dto.title}`);
    
    const { data, error } = await this.supabase
      .from('bugs')
      .insert([dto])
      .select()
      .single();

    if (error) {
      this.logger.error(`Error creating bug: ${JSON.stringify(error)}`);
      throw new Error(`Failed to create bug: ${error.message}`);
    }

    return data;
  }

  async getAllBugs() {
    const { data, error } = await this.supabase
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error fetching bugs: ${JSON.stringify(error)}`);
      throw new Error(`Failed to fetch bugs: ${error.message}`);
    }

    return data || [];
  }

  async getBugById(id: string) {
    const { data, error } = await this.supabase
      .from('bugs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      this.logger.error(`Error fetching bug: ${JSON.stringify(error)}`);
      throw new Error(`Failed to fetch bug: ${error.message}`);
    }

    return data;
  }

  async updateBug(id: string, dto: UpdateBugDto) {
    const updateData: any = { ...dto };
    
    // If status is being set to Resolved or Closed, set resolved_at
    if ((dto.status === 'Resolved' || dto.status === 'Closed') && !dto.resolved_at) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('bugs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating bug: ${JSON.stringify(error)}`);
      throw new Error(`Failed to update bug: ${error.message}`);
    }

    return data;
  }

  async deleteBug(id: string) {
    const { error } = await this.supabase
      .from('bugs')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Error deleting bug: ${JSON.stringify(error)}`);
      throw new Error(`Failed to delete bug: ${error.message}`);
    }

    return { success: true };
  }

  async createLoadTestBug(testResults: any) {
    const {
      totalRequests,
      successfulRequests,
      failedRequests,
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      maxResponseTime,
      requestsPerSecond,
      testDuration,
      errorRate,
    } = testResults;

    // Determine priority based on error rate and response times
    let priority: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium';
    if (errorRate > 10 || avgResponseTime > 2000) {
      priority = 'Critical';
    } else if (errorRate > 5 || avgResponseTime > 1000) {
      priority = 'High';
    } else if (errorRate > 1 || avgResponseTime > 500) {
      priority = 'Medium';
    } else {
      priority = 'Low';
    }

    // Determine status based on results
    let status: 'Open' | 'In Progress' | 'Resolved' | 'Closed' = 'Open';
    if (errorRate === 0 && avgResponseTime < 500) {
      status = 'Resolved';
    }

    const title = `Load Test: ${testResults.testType || 'Student Login'} - ${failedRequests > 0 ? 'FAILED' : 'PASSED'}`;
    const description = `Load test results for ${testResults.testType || 'Student Login'}.\n\n` +
      `Total Requests: ${totalRequests}\n` +
      `Successful: ${successfulRequests}\n` +
      `Failed: ${failedRequests}\n` +
      `Error Rate: ${errorRate.toFixed(2)}%\n` +
      `Avg Response Time: ${avgResponseTime.toFixed(2)}ms\n` +
      `P95 Response Time: ${p95ResponseTime.toFixed(2)}ms\n` +
      `P99 Response Time: ${p99ResponseTime.toFixed(2)}ms\n` +
      `Max Response Time: ${maxResponseTime.toFixed(2)}ms\n` +
      `Requests/Second: ${requestsPerSecond.toFixed(2)}\n` +
      `Test Duration: ${testDuration.toFixed(2)}s`;

    return this.createBug({
      title,
      description,
      reporter: 'Load Test System',
      priority,
      status,
      category: 'Load Test',
      test_type: testResults.testType || 'Student Login',
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      avg_response_time_ms: avgResponseTime,
      p95_response_time_ms: p95ResponseTime,
      p99_response_time_ms: p99ResponseTime,
      max_response_time_ms: maxResponseTime,
      requests_per_second: requestsPerSecond,
      test_duration_seconds: testDuration,
      error_rate_percentage: errorRate,
      test_metadata: testResults,
    });
  }
}

