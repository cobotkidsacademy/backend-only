import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Quiz,
  QuizQuestion,
  QuizOption,
  StudentQuizAttempt,
  StudentQuizBestScore,
  StudentTotalPoints,
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateOptionDto,
  UpdateOptionDto,
  StartAttemptDto,
  SubmitQuizDto,
  AttemptResult,
  LeaderboardEntry,
  StudentQuizProgress,
} from './dto/quiz.dto';

@Injectable()
export class QuizService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ==================== QUIZ CRUD ====================

  async createQuiz(dto: CreateQuizDto): Promise<Quiz> {
    console.log('Creating quiz with topic_id:', dto.topic_id);
    console.log('Full DTO:', JSON.stringify(dto, null, 2));

    // First try to get the topic
    const { data: topic, error: topicError } = await this.supabase
      .from('topics')
      .select('id, name, level_id')
      .eq('id', dto.topic_id)
      .single();

    console.log('Topic lookup result:', { topic, topicError });

    if (topicError) {
      // Check if it's a "not found" error or a different error
      if (topicError.code === 'PGRST116' || topicError.message?.includes('No rows')) {
        throw new NotFoundException(`Topic with ID ${dto.topic_id} does not exist in the database`);
      }
      console.error('Topic lookup error:', topicError);
      throw new NotFoundException(`Topic lookup failed: ${topicError.message}`);
    }

    if (!topic) {
      throw new NotFoundException(`Topic with ID ${dto.topic_id} not found`);
    }

    console.log('Topic found:', topic);

    const { data, error } = await this.supabase
      .from('quizzes')
      .insert({
        topic_id: dto.topic_id,
        title: dto.title,
        description: dto.description || null,
        time_limit_minutes: dto.time_limit_minutes || 0,
        passing_score: dto.passing_score || 60,
        shuffle_questions: dto.shuffle_questions || false,
        shuffle_options: dto.shuffle_options || false,
        show_correct_answers: dto.show_correct_answers !== false,
        allow_retake: dto.allow_retake !== false,
        status: dto.status || 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Quiz creation error:', error);
      throw new BadRequestException(`Failed to create quiz: ${error.message}`);
    }

    return data;
  }

  async getQuizzesByTopic(topicId: string): Promise<Quiz[]> {
    // First check if the quizzes table exists by doing a simple query
    const { data, error } = await this.supabase
      .from('quizzes')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist, return empty array instead of error
      if (error.message.includes('Could not find the table') || error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('Quiz tables not found - returning empty array');
        return [];
      }
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async getQuizById(quizId: string): Promise<Quiz> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .select(`
        *,
        topic:topics(
          id, name,
          level:course_levels(
            id, name,
            course:courses(id, name)
          )
        ),
        questions:quiz_questions(
          *,
          options:quiz_options(*)
        )
      `)
      .eq('id', quizId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Quiz not found');
    }

    // Sort questions and options by order_position
    if (data.questions) {
      data.questions.sort((a: QuizQuestion, b: QuizQuestion) => a.order_position - b.order_position);
      data.questions.forEach((q: QuizQuestion) => {
        if (q.options) {
          q.options.sort((a: QuizOption, b: QuizOption) => a.order_position - b.order_position);
        }
      });
    }

    return data;
  }

  async updateQuiz(quizId: string, dto: UpdateQuizDto): Promise<Quiz> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quizId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const { error } = await this.supabase
      .from('quizzes')
      .delete()
      .eq('id', quizId);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ==================== QUESTION CRUD ====================

  async createQuestion(dto: CreateQuestionDto): Promise<QuizQuestion> {
    console.log('Creating question with DTO:', JSON.stringify(dto, null, 2));
    console.log('Quiz ID type:', typeof dto.quiz_id, 'Value:', dto.quiz_id);

    if (!dto.quiz_id) {
      throw new BadRequestException('Quiz ID is required');
    }

    // Verify quiz exists
    const { data: quiz, error: quizError } = await this.supabase
      .from('quizzes')
      .select('id, title')
      .eq('id', dto.quiz_id)
      .single();

    if (quizError || !quiz) {
      console.error('Quiz lookup error:', quizError);
      throw new NotFoundException(`Quiz with ID ${dto.quiz_id} not found`);
    }

    console.log('Quiz found:', quiz);

    // Get current max order position
    const { data: existingQuestions } = await this.supabase
      .from('quiz_questions')
      .select('order_position')
      .eq('quiz_id', dto.quiz_id)
      .order('order_position', { ascending: false })
      .limit(1);

    const nextPosition = existingQuestions && existingQuestions.length > 0
      ? existingQuestions[0].order_position + 1
      : 0;

    const insertData = {
      quiz_id: dto.quiz_id,
      question_text: dto.question_text,
      question_type: dto.question_type || 'multiple_choice',
      points: dto.points || 10,
      order_position: dto.order_position ?? nextPosition,
      explanation: dto.explanation || null,
      image_url: dto.image_url || null,
      status: 'active',
    };

    console.log('Inserting question with data:', insertData);

    const { data, error } = await this.supabase
      .from('quiz_questions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Question creation error:', error);
      throw new BadRequestException(`Failed to create question: ${error.message}`);
    }

    // Create options if provided
    if (dto.options && dto.options.length > 0) {
      const optionsToInsert = dto.options.map((opt, index) => ({
        question_id: data.id,
        option_text: opt.option_text,
        is_correct: opt.is_correct,
        order_position: opt.order_position ?? index,
      }));

      await this.supabase
        .from('quiz_options')
        .insert(optionsToInsert);
    }

    return this.getQuestionById(data.id);
  }

  async getQuestionById(questionId: string): Promise<QuizQuestion> {
    const { data, error } = await this.supabase
      .from('quiz_questions')
      .select(`
        *,
        options:quiz_options(*)
      `)
      .eq('id', questionId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Question not found');
    }

    if (data.options) {
      data.options.sort((a: QuizOption, b: QuizOption) => a.order_position - b.order_position);
    }

    return data;
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto): Promise<QuizQuestion> {
    const { data, error } = await this.supabase
      .from('quiz_questions')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', questionId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.getQuestionById(data.id);
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('quiz_questions')
      .delete()
      .eq('id', questionId);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  async reorderQuestions(quizId: string, questionIds: string[]): Promise<void> {
    for (let i = 0; i < questionIds.length; i++) {
      await this.supabase
        .from('quiz_questions')
        .update({ order_position: i })
        .eq('id', questionIds[i])
        .eq('quiz_id', quizId);
    }
  }

  // ==================== OPTIONS CRUD ====================

  async createOption(dto: CreateOptionDto): Promise<QuizOption> {
    const { data, error } = await this.supabase
      .from('quiz_options')
      .insert({
        question_id: dto.question_id,
        option_text: dto.option_text,
        is_correct: dto.is_correct,
        order_position: dto.order_position || 0,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async updateOption(optionId: string, dto: UpdateOptionDto): Promise<QuizOption> {
    const { data, error } = await this.supabase
      .from('quiz_options')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', optionId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async deleteOption(optionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('quiz_options')
      .delete()
      .eq('id', optionId);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ==================== QUIZ TAKING ====================

  async startAttempt(dto: StartAttemptDto): Promise<StudentQuizAttempt> {
    // Get quiz details
    const quiz = await this.getQuizById(dto.quiz_id);

    if (quiz.status !== 'active') {
      throw new BadRequestException('This quiz is not available');
    }

    // Check if student has an in-progress attempt
    const { data: existingAttempts, error: existingError } = await this.supabase
      .from('student_quiz_attempts')
      .select('*')
      .eq('student_id', dto.student_id)
      .eq('quiz_id', dto.quiz_id)
      .eq('status', 'in_progress')
      .limit(1);

    if (existingAttempts && existingAttempts.length > 0) {
      return existingAttempts[0];
    }

    // Check if retake is allowed
    if (!quiz.allow_retake) {
      const { data: completedAttempt } = await this.supabase
        .from('student_quiz_attempts')
        .select('*')
        .eq('student_id', dto.student_id)
        .eq('quiz_id', dto.quiz_id)
        .eq('status', 'completed')
        .single();

      if (completedAttempt) {
        throw new BadRequestException('You have already completed this quiz and retakes are not allowed');
      }
    }

    // Create new attempt
    const { data, error } = await this.supabase
      .from('student_quiz_attempts')
      .insert({
        student_id: dto.student_id,
        quiz_id: dto.quiz_id,
        max_score: quiz.total_points,
        status: 'in_progress',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating attempt:', error);
      throw new BadRequestException(`Failed to create attempt: ${error.message}`);
    }

    if (!data || !data.id) {
      console.error('Attempt created but no ID returned:', data);
      throw new BadRequestException('Failed to create attempt: No ID returned');
    }

    console.log('Attempt created successfully:', data.id);
    return data;
  }

  async getQuizForStudent(quizId: string, shuffle: boolean = false): Promise<any> {
    const quiz = await this.getQuizById(quizId);

    // Remove correct answer info for student view
    if (quiz.questions) {
      let processedQuestions = quiz.questions
        .filter((q: QuizQuestion) => q.status === 'active')
        .map((q: QuizQuestion) => ({
          ...q,
          options: q.options?.map((o: QuizOption) => ({
            id: o.id,
            question_id: o.question_id,
            option_text: o.option_text,
            order_position: o.order_position,
            // Don't include is_correct for student view
          })),
        }));

      // Shuffle if enabled
      if (shuffle || quiz.shuffle_questions) {
        processedQuestions = this.shuffleArray(processedQuestions);
      }

      if (quiz.shuffle_options) {
        processedQuestions.forEach((q: any) => {
          if (q.options) {
            q.options = this.shuffleArray(q.options);
          }
        });
      }

      return {
        ...quiz,
        questions: processedQuestions,
      };
    }

    return quiz;
  }

  async submitQuiz(dto: SubmitQuizDto, studentId?: string): Promise<AttemptResult> {
    if (!dto.attempt_id) {
      throw new BadRequestException('Attempt ID is required');
    }

    // Get the attempt
    const { data: attempt, error: attemptError } = await this.supabase
      .from('student_quiz_attempts')
      .select('*, quiz:quizzes(*)')
      .eq('id', dto.attempt_id)
      .single();

    if (attemptError || !attempt) {
      console.error('Attempt lookup error:', attemptError);
      console.error('Attempt ID:', dto.attempt_id);
      throw new NotFoundException(`Attempt not found: ${dto.attempt_id}`);
    }

    // Verify the attempt belongs to the authenticated student
    if (studentId && attempt.student_id !== studentId) {
      throw new UnauthorizedException('This attempt does not belong to you');
    }

    if (attempt.status === 'completed') {
      throw new BadRequestException('This quiz has already been submitted');
    }

    // Get all questions with correct answers
    const { data: questions } = await this.supabase
      .from('quiz_questions')
      .select(`
        *,
        options:quiz_options(*)
      `)
      .eq('quiz_id', attempt.quiz_id)
      .eq('status', 'active');

    if (!questions) {
      throw new BadRequestException('Quiz has no questions');
    }

    // Calculate score
    let totalScore = 0;
    let correctAnswers = 0;
    const answerResults: AttemptResult['answers'] = [];
    const answersToInsert: any[] = [];

    for (const question of questions) {
      const studentAnswer = dto.answers.find(a => a.question_id === question.id);
      const correctOption = question.options?.find((o: QuizOption) => o.is_correct);
      const selectedOption = studentAnswer
        ? question.options?.find((o: QuizOption) => o.id === studentAnswer.selected_option_id)
        : null;

      const isCorrect = selectedOption?.is_correct === true;
      const pointsEarned = isCorrect ? question.points : 0;

      if (isCorrect) {
        correctAnswers++;
        totalScore += pointsEarned;
      }

      answerResults.push({
        question,
        selected_option: selectedOption || undefined,
        correct_option: correctOption,
        is_correct: isCorrect,
        points_earned: pointsEarned,
      });

      answersToInsert.push({
        attempt_id: dto.attempt_id,
        question_id: question.id,
        selected_option_id: selectedOption?.id || null,
        is_correct: isCorrect,
        points_earned: pointsEarned,
      });
    }

    // Insert all answers
    await this.supabase
      .from('student_quiz_answers')
      .insert(answersToInsert);

    // Calculate percentage
    const maxScore = questions.reduce((sum: number, q: QuizQuestion) => sum + q.points, 0);
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const passed = percentage >= attempt.quiz.passing_score;

    // Update attempt
    const { data: updatedAttempt } = await this.supabase
      .from('student_quiz_attempts')
      .update({
        score: totalScore,
        max_score: maxScore,
        percentage: percentage,
        passed: passed,
        time_spent_seconds: dto.time_spent_seconds,
        completed_at: new Date().toISOString(),
        status: 'completed',
      })
      .eq('id', dto.attempt_id)
      .select()
      .single();

    // Update best score
    console.log('=== Submitting Quiz - Updating Points ===');
    console.log('Attempt student_id:', attempt.student_id);
    console.log('Student ID from token:', studentId);
    console.log('Total score:', totalScore);
    console.log('Percentage:', percentage);
    
    const { isNewHighScore, totalPoints } = await this.updateBestScore(
      attempt.student_id || studentId || attempt.student_id,
      attempt.quiz_id,
      totalScore,
      percentage,
    );
    
    console.log('Points update result - isNewHighScore:', isNewHighScore);
    console.log('Points update result - totalPoints:', totalPoints);

    return {
      attempt: updatedAttempt,
      correct_answers: correctAnswers,
      total_questions: questions.length,
      score: totalScore,
      max_score: maxScore,
      percentage: percentage,
      passed: passed,
      is_new_high_score: isNewHighScore,
      points_earned: isNewHighScore ? totalScore : 0,
      total_points: totalPoints,
      answers: answerResults,
    };
  }

  private async updateBestScore(
    studentId: string,
    quizId: string,
    score: number,
    percentage: number,
  ): Promise<{ isNewHighScore: boolean; totalPoints: number }> {
    // Get current best score
    const { data: currentBest, error: bestScoreError } = await this.supabase
      .from('student_quiz_best_scores')
      .select('*')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId)
      .maybeSingle();

    let isNewHighScore = false;
    let previousBestScore = 0;
    const isNewQuiz = !currentBest; // This is a new quiz if no best score record exists

    if (currentBest) {
      previousBestScore = currentBest.best_score;
      
      if (score > currentBest.best_score) {
        isNewHighScore = true;
        // Update best score
        await this.supabase
          .from('student_quiz_best_scores')
          .update({
            best_score: score,
            best_percentage: percentage,
            attempts_count: currentBest.attempts_count + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', currentBest.id);
      } else {
        // Just update attempts count (not a new high score, but still an attempt)
        await this.supabase
          .from('student_quiz_best_scores')
          .update({
            attempts_count: currentBest.attempts_count + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', currentBest.id);
      }
    } else {
      // First attempt - create best score record (this is both a new quiz and new high score)
      isNewHighScore = true;
      await this.supabase
        .from('student_quiz_best_scores')
        .insert({
          student_id: studentId,
          quiz_id: quizId,
          best_score: score,
          best_percentage: percentage,
          attempts_count: 1,
        });
    }

    // Update total points
    // Points difference: if new high score, add the difference; if new quiz, add the full score
    const pointsDifference = isNewHighScore ? (isNewQuiz ? score : score - previousBestScore) : 0;
    const totalPoints = await this.updateTotalPoints(studentId, pointsDifference, isNewQuiz);

    return { isNewHighScore, totalPoints };
  }

  private async updateTotalPoints(
    studentId: string,
    pointsDifference: number,
    isNewQuiz: boolean,
  ): Promise<number> {
    console.log('=== updateTotalPoints DEBUG ===');
    console.log('Student ID:', studentId);
    console.log('Points difference:', pointsDifference);
    console.log('Is new quiz:', isNewQuiz);
    
    // Get current total points
    const { data: currentPoints, error: pointsError } = await this.supabase
      .from('student_total_points')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    console.log('Current points record:', currentPoints);
    console.log('Points error:', pointsError);

    if (currentPoints) {
      const newTotal = currentPoints.total_points + pointsDifference;
      console.log('Updating existing record. Old total:', currentPoints.total_points, 'New total:', newTotal);
      
      const { data: updated, error: updateError } = await this.supabase
        .from('student_total_points')
        .update({
          total_points: newTotal,
          quizzes_completed: currentPoints.quizzes_completed + (isNewQuiz ? 1 : 0),
          last_quiz_at: new Date().toISOString(),
        })
        .eq('id', currentPoints.id)
        .select()
        .single();

      console.log('Update result:', updated);
      console.log('Update error:', updateError);

      return newTotal;
    } else {
      // Create new record
      console.log('Creating new points record');
      const { data, error: insertError } = await this.supabase
        .from('student_total_points')
        .insert({
          student_id: studentId,
          total_points: pointsDifference,
          quizzes_completed: 1,
          last_quiz_at: new Date().toISOString(),
        })
        .select()
        .single();

      console.log('Insert result:', data);
      console.log('Insert error:', insertError);

      return data?.total_points || 0;
    }
  }

  // ==================== STUDENT PROGRESS ====================

  async getStudentQuizProgress(studentId: string, quizId: string): Promise<StudentQuizProgress> {
    const quiz = await this.getQuizById(quizId);

    const { data: bestScore } = await this.supabase
      .from('student_quiz_best_scores')
      .select('*')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId)
      .single();

    const { data: lastAttempt } = await this.supabase
      .from('student_quiz_attempts')
      .select('*')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let status: StudentQuizProgress['status'] = 'not_started';
    if (lastAttempt) {
      if (lastAttempt.status === 'in_progress') {
        status = 'in_progress';
      } else if (bestScore && bestScore.best_percentage >= quiz.passing_score) {
        status = 'passed';
      } else {
        status = 'completed';
      }
    }

    return {
      quiz,
      best_score: bestScore || undefined,
      last_attempt: lastAttempt || undefined,
      can_retake: quiz.allow_retake || !lastAttempt || lastAttempt.status !== 'completed',
      status,
    };
  }

  async getStudentTotalPoints(studentId: string): Promise<StudentTotalPoints | null> {
    console.log('=== getStudentTotalPoints DEBUG ===');
    console.log('Student ID:', studentId);
    console.log('Student ID type:', typeof studentId);
    
    // First, let's check if student exists
    const { data: studentCheck } = await this.supabase
      .from('students')
      .select('id, username')
      .eq('id', studentId)
      .maybeSingle();
    console.log('Student exists check:', studentCheck);
    
    // Query all points records to see what's in the database
    const { data: allPoints } = await this.supabase
      .from('student_total_points')
      .select('*')
      .limit(10);
    console.log('All points records in DB (first 10):', allPoints);
    
    // Now query for this specific student
    const { data, error } = await this.supabase
      .from('student_total_points')
      .select(`
        *,
        student:students(id, first_name, last_name, username)
      `)
      .eq('student_id', studentId)
      .maybeSingle();

    console.log('Query result - data:', JSON.stringify(data, null, 2));
    console.log('Query result - error:', error);
    console.log('Error code:', error?.code);
    console.log('Error message:', error?.message);

    // If no record exists, return a default record with 0 points
    if (error && error.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is fine
      console.error('Error fetching student total points:', error);
      throw new BadRequestException(`Failed to fetch student points: ${error.message}`);
    }

    // If no record exists, return default values
    if (!data) {
      console.log('⚠️ No points record found for student_id:', studentId);
      console.log('Returning default values with 0 points');
      return {
        id: '',
        student_id: studentId,
        total_points: 0,
        quizzes_completed: 0,
        quizzes_passed: 0,
        average_score: 0,
        last_quiz_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    console.log('✅ Returning points data:', data);
    console.log('✅ Total points:', data.total_points);
    console.log('✅ Student ID in record:', data.student_id);
    return data;
  }

  async getStudentBestScores(studentId: string): Promise<StudentQuizBestScore[]> {
    const { data } = await this.supabase
      .from('student_quiz_best_scores')
      .select(`
        *,
        quiz:quizzes(
          id, title, total_points, passing_score,
          topic:topics(
            id, name,
            level:course_levels(
              id, name,
              course:courses(id, name)
            )
          )
        )
      `)
      .eq('student_id', studentId)
      .order('last_attempt_at', { ascending: false });

    return data || [];
  }

  // ==================== LEADERBOARD ====================

  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const { data } = await this.supabase
      .from('student_total_points')
      .select(`
        *,
        student:students(id, first_name, last_name, username)
      `)
      .order('total_points', { ascending: false })
      .limit(limit);

    if (!data) return [];

    return data.map((entry, index) => ({
      rank: index + 1,
      student: entry.student,
      total_points: entry.total_points,
      quizzes_completed: entry.quizzes_completed,
      quizzes_passed: entry.quizzes_passed,
      average_score: entry.average_score,
    }));
  }

  async getClassLeaderboard(classId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
    // Get students in the class
    const { data: students } = await this.supabase
      .from('students')
      .select('id')
      .eq('class_id', classId)
      .eq('status', 'active');

    if (!students || students.length === 0) return [];

    const studentIds = students.map(s => s.id);

    const { data } = await this.supabase
      .from('student_total_points')
      .select(`
        *,
        student:students(id, first_name, last_name, username)
      `)
      .in('student_id', studentIds)
      .order('total_points', { ascending: false })
      .limit(limit);

    if (!data) return [];

    return data.map((entry, index) => ({
      rank: index + 1,
      student: entry.student,
      total_points: entry.total_points,
      quizzes_completed: entry.quizzes_completed,
      quizzes_passed: entry.quizzes_passed,
      average_score: entry.average_score,
    }));
  }

  // ==================== HELPERS ====================

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ==================== ATTEMPT HISTORY ====================

  async getStudentAttemptHistory(studentId: string, quizId?: string): Promise<StudentQuizAttempt[]> {
    let query = this.supabase
      .from('student_quiz_attempts')
      .select(`
        *,
        quiz:quizzes(id, title, total_points, passing_score)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (quizId) {
      query = query.eq('quiz_id', quizId);
    }

    const { data } = await query;
    return data || [];
  }

  // ==================== QUIZ PERFORMANCE ====================

  async getQuizPerformance(filters: {
    school_id?: string;
    class_id?: string;
    course_id?: string;
    course_level_id?: string;
    topic_id?: string;
    quiz_id?: string;
    date_from?: string;
    date_to?: string;
    status?: 'all' | 'passed' | 'failed' | 'in_progress';
  }): Promise<any> {
    console.log('=== getQuizPerformance ===');
    console.log('Filters:', filters);

    // Build base query for attempts
    let attemptsQuery = this.supabase
      .from('student_quiz_attempts')
      .select(`
        *,
        student:students(
          id,
          first_name,
          last_name,
          username,
          class_id,
          class:classes(
            id,
            name,
            school_id,
            school:schools(id, name)
          )
        ),
        quiz:quizzes(
          id,
          title,
          total_points,
          passing_score,
          topic_id,
          topic:topics(
            id,
            name,
            level_id,
            level:course_levels(
              id,
              name,
              course_id,
              course:courses(
                id,
                name
              )
            )
          )
        )
      `);

    // Apply filters
    if (filters.quiz_id) {
      attemptsQuery = attemptsQuery.eq('quiz_id', filters.quiz_id);
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'passed') {
        attemptsQuery = attemptsQuery.eq('passed', true).eq('status', 'completed');
      } else if (filters.status === 'failed') {
        attemptsQuery = attemptsQuery.eq('passed', false).eq('status', 'completed');
      } else if (filters.status === 'in_progress') {
        attemptsQuery = attemptsQuery.eq('status', 'in_progress');
      }
    } else {
      // Only show completed attempts by default
      attemptsQuery = attemptsQuery.eq('status', 'completed');
    }

    if (filters.date_from) {
      attemptsQuery = attemptsQuery.gte('completed_at', filters.date_from);
    }

    if (filters.date_to) {
      attemptsQuery = attemptsQuery.lte('completed_at', filters.date_to);
    }

    const { data: attempts, error: attemptsError } = await attemptsQuery;

    if (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      throw new BadRequestException(`Failed to fetch quiz attempts: ${attemptsError.message}`);
    }

    console.log('Total attempts found:', attempts?.length || 0);

    // Filter by school/class if provided (after fetching to handle nested relations)
    let filteredAttempts = attempts || [];

    if (filters.school_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.student?.class?.school_id === filters.school_id
      );
    }

    if (filters.class_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.student?.class_id === filters.class_id
      );
    }

    if (filters.topic_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.quiz?.topic_id === filters.topic_id
      );
    }

    if (filters.course_level_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.quiz?.topic?.level?.id === filters.course_level_id
      );
    }

    if (filters.course_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.quiz?.topic?.level?.course_id === filters.course_id
      );
    }

    console.log('Filtered attempts:', filteredAttempts.length);

    // Helper function to categorize percentage
    const categorizeScore = (percentage: number): 'below_expectation' | 'approaching' | 'meeting' | 'exceeding' => {
      if (percentage <= 25) return 'below_expectation';
      if (percentage <= 50) return 'approaching';
      if (percentage <= 75) return 'meeting';
      return 'exceeding';
    };

    // Calculate statistics
    const totalAttempts = filteredAttempts.length;
    const completedAttempts = filteredAttempts.filter((a: any) => a.status === 'completed').length;
    const passedAttempts = filteredAttempts.filter((a: any) => a.passed === true).length;
    const failedAttempts = filteredAttempts.filter((a: any) => a.passed === false && a.status === 'completed').length;
    
    const completedScores = filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .map((a: any) => a.score);
    const averageScore = completedScores.length > 0
      ? completedScores.reduce((sum: number, score: number) => sum + score, 0) / completedScores.length
      : 0;

    const completedPercentages = filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .map((a: any) => a.percentage);
    const averagePercentage = completedPercentages.length > 0
      ? completedPercentages.reduce((sum: number, pct: number) => sum + pct, 0) / completedPercentages.length
      : 0;

    const uniqueStudents = new Set(filteredAttempts.map((a: any) => a.student_id));
    const uniqueQuizzes = new Set(filteredAttempts.map((a: any) => a.quiz_id));

    // Group by quiz
    const quizMap = new Map<string, any>();
    filteredAttempts.forEach((attempt: any) => {
      const quizId = attempt.quiz_id;
      if (!quizMap.has(quizId)) {
        quizMap.set(quizId, {
          quiz_id: quizId,
          quiz_title: attempt.quiz?.title || 'Unknown Quiz',
          topic_name: attempt.quiz?.topic?.name,
          course_name: attempt.quiz?.topic?.level?.course?.name,
          level_name: attempt.quiz?.topic?.level?.name,
          attempts: [],
        });
      }
      quizMap.get(quizId)!.attempts.push(attempt);
    });

    const quizData = Array.from(quizMap.values()).map((quiz: any) => {
      const completed = quiz.attempts.filter((a: any) => a.status === 'completed');
      const passed = completed.filter((a: any) => a.passed === true);
      const failed = completed.filter((a: any) => a.passed === false);
      const scores = completed.map((a: any) => a.score);
      const percentages = completed.map((a: any) => a.percentage);
      const students = new Set(quiz.attempts.map((a: any) => a.student_id));

      // Group by student to get highest score per student
      const studentHighestScores = new Map<string, number>();
      completed.forEach((attempt: any) => {
        const studentId = attempt.student_id;
        const currentHighest = studentHighestScores.get(studentId) || 0;
        if (attempt.percentage > currentHighest) {
          studentHighestScores.set(studentId, attempt.percentage);
        }
      });

      // Categorize highest scores
      const scoreCategories = {
        below_expectation: 0,
        approaching: 0,
        meeting: 0,
        exceeding: 0,
      };

      studentHighestScores.forEach((highestPercentage) => {
        const category = categorizeScore(highestPercentage);
        scoreCategories[category]++;
      });

      return {
        quiz_id: quiz.quiz_id,
        quiz_title: quiz.quiz_title,
        topic_name: quiz.topic_name,
        course_name: quiz.course_name,
        level_name: quiz.level_name,
        total_attempts: quiz.attempts.length,
        completed_attempts: completed.length,
        passed_attempts: passed.length,
        failed_attempts: failed.length,
        average_score: scores.length > 0 ? scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length : 0,
        average_percentage: percentages.length > 0 ? percentages.reduce((sum: number, p: number) => sum + p, 0) / percentages.length : 0,
        pass_rate: completed.length > 0 ? (passed.length / completed.length) * 100 : 0,
        total_students: students.size,
        best_score: scores.length > 0 ? Math.max(...scores) : 0,
        worst_score: scores.length > 0 ? Math.min(...scores) : 0,
        score_categories: scoreCategories,
      };
    });

    // Group by student
    const studentMap = new Map<string, any>();
    filteredAttempts.forEach((attempt: any) => {
      const studentId = attempt.student_id;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          student_name: `${attempt.student?.first_name || ''} ${attempt.student?.last_name || ''}`.trim(),
          student_username: attempt.student?.username || '',
          class_name: attempt.student?.class?.name,
          school_name: attempt.student?.class?.school?.name,
          attempts: [],
        });
      }
      studentMap.get(studentId)!.attempts.push(attempt);
    });

    const studentData = Array.from(studentMap.values()).map((student: any) => {
      const completed = student.attempts.filter((a: any) => a.status === 'completed');
      const passed = completed.filter((a: any) => a.passed === true);
      const scores = completed.map((a: any) => a.score);
      const percentages = completed.map((a: any) => a.percentage);
      const quizzes = new Set(completed.map((a: any) => a.quiz_id));

      // Get highest score across all quizzes
      const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
      const highestPercentage = percentages.length > 0 ? Math.max(...percentages) : 0;
      const scoreCategory = highestPercentage > 0 ? categorizeScore(highestPercentage) : 'below_expectation';

      return {
        student_id: student.student_id,
        student_name: student.student_name,
        student_username: student.student_username,
        class_name: student.class_name,
        school_name: student.school_name,
        total_attempts: student.attempts.length,
        completed_attempts: completed.length,
        passed_attempts: passed.length,
        highest_score: highestScore,
        highest_percentage: highestPercentage,
        score_category: scoreCategory,
        total_points: 0, // Will be fetched from database
        quizzes_completed: quizzes.size, // Count unique quizzes from filtered attempts
      };
    });

    // Fetch accurate quizzes_completed and total_points from database
    const studentIds = studentData.map(s => s.student_id);
    if (studentIds.length > 0) {
      const { data: studentPointsData } = await this.supabase
        .from('student_total_points')
        .select('student_id, quizzes_completed, total_points')
        .in('student_id', studentIds);

      const studentPointsMap = new Map<string, { quizzes_completed: number; total_points: number }>();
      (studentPointsData || []).forEach((sp: any) => {
        studentPointsMap.set(sp.student_id, {
          quizzes_completed: sp.quizzes_completed || 0,
          total_points: sp.total_points || 0,
        });
      });

      // Update student data with accurate database values
      studentData.forEach((student: any) => {
        const dbData = studentPointsMap.get(student.student_id);
        if (dbData) {
          student.total_points = dbData.total_points;
          student.quizzes_completed = dbData.quizzes_completed; // Use database value, not calculated
        }
      });
    }

    // Calculate overall score categories from all student highest scores
    const allStudentHighestScores = new Map<string, number>();
    filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .forEach((attempt: any) => {
        const studentId = attempt.student_id;
        const currentHighest = allStudentHighestScores.get(studentId) || 0;
        if (attempt.percentage > currentHighest) {
          allStudentHighestScores.set(studentId, attempt.percentage);
        }
      });

    const overallScoreCategories = {
      below_expectation: 0,
      approaching: 0,
      meeting: 0,
      exceeding: 0,
    };

    allStudentHighestScores.forEach((highestPercentage) => {
      const category = categorizeScore(highestPercentage);
      overallScoreCategories[category]++;
    });

    return {
      stats: {
        total_attempts: totalAttempts,
        completed_attempts: completedAttempts,
        passed_attempts: passedAttempts,
        failed_attempts: failedAttempts,
        average_score: Math.round(averageScore * 100) / 100,
        average_percentage: Math.round(averagePercentage * 100) / 100,
        total_students: uniqueStudents.size,
        unique_quizzes: uniqueQuizzes.size,
        score_categories: overallScoreCategories,
      },
      quiz_data: quizData.sort((a, b) => b.total_attempts - a.total_attempts),
      student_data: studentData.sort((a, b) => b.highest_percentage - a.highest_percentage),
    };
  }

  async getAttemptDetails(attemptId: string): Promise<StudentQuizAttempt> {
    const { data, error } = await this.supabase
      .from('student_quiz_attempts')
      .select(`
        *,
        quiz:quizzes(*),
        answers:student_quiz_answers(
          *,
          question:quiz_questions(
            *,
            options:quiz_options(*)
          ),
          selected_option:quiz_options(*)
        )
      `)
      .eq('id', attemptId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Attempt not found');
    }

    return data;
  }

  // ==================== CLASS-BASED QUIZZES ====================

  async getQuizzesByClass(
    classId: string,
    filters?: {
      tutor_id?: string;
      course_level_id?: string;
      enrollment_status?: 'enrolled' | 'completed';
    }
  ) {
    // Get tutors assigned to this class
    const { data: tutorAssignments, error: tutorError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        tutor_id,
        role,
        tutor:tutors(
          id,
          first_name,
          middle_name,
          last_name,
          email
        )
      `)
      .eq('class_id', classId)
      .eq('status', 'active');

    if (tutorError) {
      throw new BadRequestException(tutorError.message);
    }

    // Get course level assignments for this class
    const { data: courseLevelAssignments, error: assignmentError } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        id,
        course_level_id,
        enrollment_status,
        course_level:course_levels(
          id,
          name,
          level_number,
          course:courses(id, name, code)
        )
      `)
      .eq('class_id', classId);

    if (assignmentError) {
      throw new BadRequestException(assignmentError.message);
    }

    // Apply enrollment status filter if provided
    let filteredAssignments = courseLevelAssignments || [];
    if (filters?.enrollment_status) {
      filteredAssignments = filteredAssignments.filter(
        (a: any) => a.enrollment_status === filters.enrollment_status
      );
    }

    // Apply course level filter if provided
    if (filters?.course_level_id) {
      filteredAssignments = filteredAssignments.filter((a: any) => {
        const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
        return level.id === filters.course_level_id;
      });
    }

    // Get topics for these course levels
    const courseLevelIds = filteredAssignments.map((a: any) => {
      const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
      return level.id;
    });

    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData, error: topicsError } = await this.supabase
        .from('topics')
        .select(`
          id,
          name,
          order_index,
          level_id,
          course_level:course_levels(
            id,
            name,
            level_number,
            course:courses(id, name, code)
          )
        `)
        .in('level_id', courseLevelIds)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (topicsError) {
        throw new BadRequestException(topicsError.message);
      }
      topics = topicsData || [];
    }

    // Get quizzes for these topics
    const topicIds = topics.map((t: any) => t.id);
    let quizzes: any[] = [];
    if (topicIds.length > 0) {
      const { data: quizzesData, error: quizzesError } = await this.supabase
        .from('quizzes')
        .select(`
          *,
          topic:topics(
            id,
            name,
            level_id,
            course_level:course_levels(
              id,
              name,
              level_number,
              course:courses(id, name, code)
            )
          )
        `)
        .in('topic_id', topicIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (quizzesError) {
        // If quiz table doesn't exist, return empty array
        if (quizzesError.message.includes('Could not find the table') || 
            quizzesError.message.includes('does not exist')) {
          quizzes = [];
        } else {
          throw new BadRequestException(quizzesError.message);
        }
      } else {
        quizzes = quizzesData || [];
      }
    }

    // Filter by tutor if provided
    let filteredTutors = tutorAssignments || [];
    if (filters?.tutor_id) {
      filteredTutors = filteredTutors.filter((t: any) => t.tutor_id === filters.tutor_id);
    }

    // Build response structure: tutor > course level > enrollment status > quizzes
    const result = filteredTutors.map((tutorAssignment: any) => {
      const tutor = Array.isArray(tutorAssignment.tutor) 
        ? tutorAssignment.tutor[0] 
        : tutorAssignment.tutor;

      // Group quizzes by course level and enrollment status
      const courseLevelGroups = filteredAssignments.map((assignment: any) => {
        const level = Array.isArray(assignment.course_level) 
          ? assignment.course_level[0] 
          : assignment.course_level;

        // Get quizzes for topics in this course level
        const levelQuizzes = quizzes.filter((quiz: any) => {
          const quizTopic = Array.isArray(quiz.topic) ? quiz.topic[0] : quiz.topic;
          if (!quizTopic) return false;
          const quizLevel = Array.isArray(quizTopic.course_level) 
            ? quizTopic.course_level[0] 
            : quizTopic.course_level;
          return quizLevel?.id === level.id;
        });

        return {
          course_level: {
            id: level.id,
            name: level.name,
            level_number: level.level_number,
            course: level.course ? (Array.isArray(level.course) ? level.course[0] : level.course) : null,
          },
          enrollment_status: assignment.enrollment_status,
          quizzes: levelQuizzes.map((q: any) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            questions_count: q.questions_count,
            total_points: q.total_points,
            passing_score: q.passing_score,
            status: q.status,
            created_at: q.created_at,
          })),
        };
      });

      return {
        tutor: {
          id: tutor.id,
          first_name: tutor.first_name,
          middle_name: tutor.middle_name,
          last_name: tutor.last_name,
          email: tutor.email,
        },
        role: tutorAssignment.role,
        course_levels: courseLevelGroups,
      };
    });

    return result;
  }
}

