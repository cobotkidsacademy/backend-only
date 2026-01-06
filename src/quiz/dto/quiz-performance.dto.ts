export interface QuizPerformanceFilter {
  school_id?: string;
  class_id?: string;
  course_id?: string;
  course_level_id?: string;
  topic_id?: string;
  quiz_id?: string;
  date_from?: string;
  date_to?: string;
  status?: 'all' | 'passed' | 'failed' | 'in_progress';
}

export interface QuizPerformanceStats {
  total_attempts: number;
  completed_attempts: number;
  passed_attempts: number;
  failed_attempts: number;
  average_score: number;
  average_percentage: number;
  total_students: number;
  unique_quizzes: number;
  score_categories: {
    below_expectation: number; // 0-25%
    approaching: number; // 26-50%
    meeting: number; // 51-75%
    exceeding: number; // 76-100%
  };
}

export interface QuizPerformanceData {
  quiz_id: string;
  quiz_title: string;
  topic_name?: string;
  course_name?: string;
  level_name?: string;
  total_attempts: number;
  completed_attempts: number;
  passed_attempts: number;
  failed_attempts: number;
  average_score: number;
  average_percentage: number;
  pass_rate: number;
  total_students: number;
  best_score: number;
  worst_score: number;
  score_categories: {
    below_expectation: number; // 0-25%
    approaching: number; // 26-50%
    meeting: number; // 51-75%
    exceeding: number; // 76-100%
  };
}

export interface StudentQuizPerformance {
  student_id: string;
  student_name: string;
  student_username: string;
  class_name?: string;
  school_name?: string;
  total_attempts: number;
  completed_attempts: number;
  passed_attempts: number;
  highest_score: number;
  highest_percentage: number;
  score_category: 'below_expectation' | 'approaching' | 'meeting' | 'exceeding';
  total_points: number;
  quizzes_completed: number;
}

export interface QuizPerformanceResponse {
  stats: QuizPerformanceStats;
  quiz_data: QuizPerformanceData[];
  student_data: StudentQuizPerformance[];
}

