import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getNairobiTime, getNairobiDayOfWeek } from '../utils/timezone.util';
import {
  TakeAwayQuiz,
  TakeAwayQuizQuestion,
  TakeAwayQuizOption,
  TakeAwayQuizAttempt,
  CreateTakeAwayQuizDto,
  UpdateTakeAwayQuizDto,
  CreateTakeAwayQuizQuestionDto,
  UpdateTakeAwayQuizQuestionDto,
  CreateTakeAwayQuizOptionDto,
  UpdateTakeAwayQuizOptionDto,
  SubmitTakeAwayQuizAttemptDto,
} from './dto/take-away-quiz.dto';

@Injectable()
export class TakeAwayQuizService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ==================== QUIZ CRUD ====================

  async create(dto: CreateTakeAwayQuizDto): Promise<TakeAwayQuiz> {
    const { data, error } = await this.supabase
      .from('take_away_quizzes')
      .insert({
        title: dto.title,
        description: dto.description,
        time_limit_minutes: dto.time_limit_minutes || 0,
        passing_score: dto.passing_score || 60,
        shuffle_questions: dto.shuffle_questions || false,
        shuffle_options: dto.shuffle_options || false,
        show_correct_answers: dto.show_correct_answers !== undefined ? dto.show_correct_answers : true,
        allow_retake: dto.allow_retake || false,
        status: dto.status || 'active',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create quiz: ${error.message}`);
    }

    return data;
  }

  async findAll(): Promise<TakeAwayQuiz[]> {
    const { data, error } = await this.supabase
      .from('take_away_quizzes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to fetch quizzes: ${error.message}`);
    }

    return data || [];
  }

  async findOne(id: string): Promise<TakeAwayQuiz> {
    const { data, error } = await this.supabase
      .from('take_away_quizzes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Quiz not found');
    }

    return data;
  }

  async update(id: string, dto: UpdateTakeAwayQuizDto): Promise<TakeAwayQuiz> {
    const { data, error } = await this.supabase
      .from('take_away_quizzes')
      .update({
        title: dto.title,
        description: dto.description,
        time_limit_minutes: dto.time_limit_minutes,
        passing_score: dto.passing_score,
        shuffle_questions: dto.shuffle_questions,
        shuffle_options: dto.shuffle_options,
        show_correct_answers: dto.show_correct_answers,
        allow_retake: dto.allow_retake,
        status: dto.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(`Failed to update quiz: ${error?.message}`);
    }

    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('take_away_quizzes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Failed to delete quiz: ${error.message}`);
    }
  }

  // ==================== QUESTION METHODS ====================

  async createQuestion(dto: CreateTakeAwayQuizQuestionDto): Promise<TakeAwayQuizQuestion> {
    // Enforce required question text (as requested)
    if (!dto.question_text || dto.question_text.trim().length === 0) {
      throw new BadRequestException('Question text is required');
    }

    const { data, error } = await this.supabase
      .from('take_away_quiz_questions')
      .insert({
        quiz_id: dto.quiz_id,
        question_text: dto.question_text,
        question_type: dto.question_type || 'multiple_choice',
        points: dto.points || 10,
        order_position: dto.order_position || 0,
        explanation: dto.explanation,
        question_image_url: (dto as any).question_image_url,
        status: dto.status || 'active',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create question: ${error.message}`);
    }

    // Update quiz questions_count
    await this.updateQuizQuestionsCount(dto.quiz_id);

    return data;
  }

  async updateQuestion(id: string, dto: UpdateTakeAwayQuizQuestionDto): Promise<TakeAwayQuizQuestion> {
    // If question_text is explicitly cleared, reject (required)
    if (dto.question_text === '') {
      throw new BadRequestException('Question text is required');
    }

    const updatePayload: any = {
      question_text: dto.question_text,
      question_type: dto.question_type,
      points: dto.points,
      order_position: dto.order_position,
      explanation: dto.explanation,
      question_image_url: (dto as any).question_image_url,
      status: dto.status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('take_away_quiz_questions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(`Failed to update question: ${error?.message}`);
    }

    return data;
  }

  async deleteQuestion(id: string): Promise<void> {
    // Get question to find quiz_id before deleting
    const { data: question } = await this.supabase
      .from('take_away_quiz_questions')
      .select('quiz_id')
      .eq('id', id)
      .single();

    const { error } = await this.supabase
      .from('take_away_quiz_questions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Failed to delete question: ${error.message}`);
    }

    // Update quiz questions_count
    if (question?.quiz_id) {
      await this.updateQuizQuestionsCount(question.quiz_id);
    }
  }

  async getQuestionsByQuiz(quizId: string): Promise<TakeAwayQuizQuestion[]> {
    const { data: questions, error: questionsError } = await this.supabase
      .from('take_away_quiz_questions')
      .select('*')
      .eq('quiz_id', quizId)
      .eq('status', 'active')
      .order('order_position');

    if (questionsError) {
      throw new BadRequestException(`Failed to fetch questions: ${questionsError.message}`);
    }

    if (!questions || questions.length === 0) {
      return [];
    }

    // Fetch options for all questions
    const questionIds = questions.map(q => q.id);
    const { data: options, error: optionsError } = await this.supabase
      .from('take_away_quiz_options')
      .select('*')
      .in('question_id', questionIds)
      .order('question_id, order_position');

    if (optionsError) {
      console.error('Error fetching options:', optionsError);
    }

    // Attach options to questions
    return questions.map(question => ({
      ...question,
      options: options?.filter(o => o.question_id === question.id) || [],
    }));
  }

  // ==================== OPTION METHODS ====================

  async createOption(dto: CreateTakeAwayQuizOptionDto): Promise<TakeAwayQuizOption> {
    console.log('Creating take-away quiz option with data:', {
      question_id: dto.question_id,
      option_text: dto.option_text,
      option_image_url: dto.option_image_url,
      is_correct: dto.is_correct,
      order_position: dto.order_position,
    });

    // Enforce at least text or image for the option
    const optionImageUrl = dto.option_image_url;
    if (!dto.option_text && !optionImageUrl) {
      throw new BadRequestException('Option must have text, an image, or both');
    }

    const { data, error } = await this.supabase
      .from('take_away_quiz_options')
      .insert({
        question_id: dto.question_id,
        option_text: dto.option_text || null,
        option_image_url: optionImageUrl || null,
        is_correct: dto.is_correct,
        order_position: dto.order_position || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating take-away quiz option:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new BadRequestException(`Failed to create option: ${error.message}`);
    }

    console.log('Take-away quiz option created successfully:', data);
    return data;
  }

  async updateOption(id: string, dto: UpdateTakeAwayQuizOptionDto): Promise<TakeAwayQuizOption> {
    const optionImageUrl = dto.option_image_url;

    // If both text and image are explicitly cleared, reject
    if (dto.option_text === '' && optionImageUrl === '') {
      throw new BadRequestException('Option must have text, an image, or both');
    }

    const { data, error } = await this.supabase
      .from('take_away_quiz_options')
      .update({
        option_text: dto.option_text,
        option_image_url: optionImageUrl,
        is_correct: dto.is_correct,
        order_position: dto.order_position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(`Failed to update option: ${error?.message}`);
    }

    return data;
  }

  async deleteOption(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('take_away_quiz_options')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Failed to delete option: ${error.message}`);
    }
  }

  // ==================== HELPER METHODS ====================

  private async updateQuizQuestionsCount(quizId: string): Promise<void> {
    const { data: questions } = await this.supabase
      .from('take_away_quiz_questions')
      .select('id, points')
      .eq('quiz_id', quizId)
      .eq('status', 'active');

    const questionsCount = questions?.length || 0;
    const totalPoints = questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0;

    await this.supabase
      .from('take_away_quizzes')
      .update({
        questions_count: questionsCount,
        total_points: totalPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quizId);
  }

  // ==================== QUIZ ATTEMPTS ====================

  async startAttempt(studentId: string, quizId: string): Promise<TakeAwayQuizAttempt> {
    // Get quiz
    const { data: quiz, error: quizError } = await this.supabase
      .from('take_away_quizzes')
      .select('id, status, allow_retake')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz.status !== 'active') {
      throw new BadRequestException('This quiz is not available');
    }

    // Find assignment for this quiz to check availability
    const { data: assignment } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id')
      .eq('take_away_quiz_id', quizId)
      .limit(1)
      .single();

    // Check quiz availability (40 minutes after class start) if assignment exists
    if (assignment) {
      const networkTime = getNairobiTime();
      
      // Get class schedule
      const { data: schedule } = await this.supabase
        .from('class_schedules')
        .select('day_of_week, start_time')
        .eq('class_id', assignment.class_id)
        .eq('status', 'active')
        .single();

      if (schedule) {
        const today = getNairobiDayOfWeek(networkTime).toLowerCase();
        const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();

        if (scheduleDay === today) {
          // Calculate class start time for today
          const startTimeStr = schedule.start_time.substring(0, 5);
          const [hours, minutes] = startTimeStr.split(':').map(Number);
          const classStartTime = new Date(networkTime);
          classStartTime.setHours(hours, minutes, 0, 0);

          // Quiz becomes available 40 minutes after class start
          const quizAvailableAt = new Date(classStartTime.getTime() + 40 * 60 * 1000);

          // Check if quiz is available
          if (networkTime < quizAvailableAt) {
            const timeUntilAvailable = Math.floor((quizAvailableAt.getTime() - networkTime.getTime()) / 1000);
            const minutes = Math.floor(timeUntilAvailable / 60);
            const seconds = timeUntilAvailable % 60;
            throw new BadRequestException(
              `Quiz is not yet available. Please wait ${minutes} minutes and ${seconds} seconds. The quiz becomes available 40 minutes after class start time.`
            );
          }
        }
      }
    }

    // Check existing attempts
    const { data: existingAttempts } = await this.supabase
      .from('take_away_quiz_attempts')
      .select('*')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId)
      .eq('status', 'in_progress')
      .limit(1);

    if (existingAttempts && existingAttempts.length > 0) {
      return existingAttempts[0] as TakeAwayQuizAttempt;
    }

    // Check max attempts (3)
    const { data: completedAttempts } = await this.supabase
      .from('take_away_quiz_attempts')
      .select('id')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId)
      .eq('status', 'completed');

    if (completedAttempts && completedAttempts.length >= 3) {
      throw new BadRequestException('Maximum attempts (3) reached for this quiz');
    }

    // Create new attempt
    const { data, error } = await this.supabase
      .from('take_away_quiz_attempts')
      .insert({
        student_id: studentId,
        quiz_id: quizId,
        status: 'in_progress',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create attempt: ${error.message}`);
    }

    return data;
  }

  async submitAttempt(attemptId: string, studentId: string, dto: SubmitTakeAwayQuizAttemptDto): Promise<TakeAwayQuizAttempt> {
    // Get attempt
    const { data: attempt, error: attemptError } = await this.supabase
      .from('take_away_quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (attemptError || !attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status === 'completed') {
      throw new BadRequestException('This attempt has already been submitted');
    }

    // Get quiz and questions
    const { data: quiz, error: quizError } = await this.supabase
      .from('take_away_quizzes')
      .select('id, passing_score, total_points')
      .eq('id', attempt.quiz_id)
      .single();

    if (quizError || !quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const { data: questions, error: questionsError } = await this.supabase
      .from('take_away_quiz_questions')
      .select('id, question_text, question_type, points, order_position')
      .eq('quiz_id', attempt.quiz_id)
      .eq('status', 'active')
      .order('order_position');

    if (questionsError) {
      console.error('[SubmitAttempt] Error fetching questions:', questionsError);
      throw new BadRequestException(`Failed to fetch quiz questions: ${questionsError.message}`);
    }

    console.log(`[SubmitAttempt] Fetched ${questions?.length || 0} questions for quiz ${attempt.quiz_id}`);

    // Get all options for each question (both correct and incorrect)
    const { data: allOptions, error: optionsError } = await this.supabase
      .from('take_away_quiz_options')
      .select('id, question_id, option_text, is_correct, order_position')
      .in('question_id', questions?.map(q => q.id) || [])
      .order('question_id, order_position');

    if (optionsError) {
      console.error('[SubmitAttempt] Error fetching options:', optionsError);
      throw new BadRequestException(`Failed to fetch quiz options: ${optionsError.message}`);
    }

    console.log(`[SubmitAttempt] Fetched ${allOptions?.length || 0} options for ${questions?.length || 0} questions`);
    
    // Log options for debugging
    if (allOptions && allOptions.length > 0) {
      const optionsByQuestion = new Map<string, any[]>();
      allOptions.forEach(opt => {
        const existing = optionsByQuestion.get(opt.question_id) || [];
        existing.push(opt);
        optionsByQuestion.set(opt.question_id, existing);
      });
      
      optionsByQuestion.forEach((opts, qId) => {
        const correctCount = opts.filter(o => o.is_correct === true || o.is_correct === 'true' || o.is_correct === 1).length;
        console.log(`[SubmitAttempt] Question ${qId} has ${opts.length} options (${correctCount} correct)`);
        
        // Log detailed option info for debugging
        opts.forEach(opt => {
          console.log(`[SubmitAttempt]   Option ${opt.id}:`, {
            text: opt.option_text?.substring(0, 30) + '...',
            is_correct: opt.is_correct,
            is_correct_type: typeof opt.is_correct,
            is_correct_value: JSON.stringify(opt.is_correct),
          });
        });
      });
    }

    // Calculate score
    let totalScore = 0;
    let maxScore = 0;
    const answersToCreate: any[] = [];

    for (const question of questions || []) {
      maxScore += question.points || 0;
      const userAnswers = dto.answers.filter(a => a.question_id === question.id && a.selected_option_id);
      const questionOptions = allOptions?.filter(o => o.question_id === question.id) || [];
      // Handle boolean values properly - check for true, 'true', or 1
      const correctOptions = questionOptions.filter(o => 
        o.is_correct === true || o.is_correct === 'true' || o.is_correct === 1
      );
      const incorrectOptions = questionOptions.filter(o => 
        o.is_correct === false || o.is_correct === 'false' || o.is_correct === 0 || o.is_correct === null
      );
      
      let isCorrect = false;
      let pointsEarned = 0;

      console.log(`[SubmitAttempt] Validating question ${question.id} (${question.question_type}):`, {
        questionText: question.question_text?.substring(0, 50) + '...',
        userAnswersCount: userAnswers.length,
        correctOptionsCount: correctOptions.length,
        totalOptionsCount: questionOptions.length,
      });

      if (userAnswers.length > 0) {
        const userSelectedOptionIds = userAnswers.map(a => a.selected_option_id!).filter(Boolean);
        const correctOptionIds = correctOptions.map(o => o.id);
        const incorrectOptionIds = incorrectOptions.map(o => o.id);
        
        console.log(`[SubmitAttempt] Question ${question.id} comparison:`, {
          userSelected: userSelectedOptionIds,
          correctOptions: correctOptionIds,
          incorrectOptions: incorrectOptionIds,
        });

        if (question.question_type === 'multi_select') {
          // For multi-select: must select ALL correct options and NO incorrect options
          const allCorrectSelected = correctOptionIds.length > 0 && 
            correctOptionIds.every(id => userSelectedOptionIds.includes(id));
          const noIncorrectSelected = userSelectedOptionIds.every(id => !incorrectOptionIds.includes(id));
          const exactMatch = userSelectedOptionIds.length === correctOptionIds.length;
          
          isCorrect = allCorrectSelected && noIncorrectSelected && exactMatch;
          
          console.log(`[SubmitAttempt] Multi-select validation for question ${question.id}:`, {
            allCorrectSelected,
            noIncorrectSelected,
            exactMatch,
            userCount: userSelectedOptionIds.length,
            correctCount: correctOptionIds.length,
            isCorrect,
          });
          
          pointsEarned = isCorrect ? (question.points || 0) : 0;
          totalScore += pointsEarned;

          // For multi-select, create one answer record per selected option
          // Also create a summary record with overall correctness
          userSelectedOptionIds.forEach(optionId => {
            const selectedOption = questionOptions.find(o => o.id === optionId);
            // Handle boolean values properly
            const optionIsCorrect = selectedOption?.is_correct === true || 
                                   selectedOption?.is_correct === 'true' || 
                                   selectedOption?.is_correct === 1;
            
            console.log(`[SubmitAttempt] Multi-select option ${optionId} for question ${question.id}:`, {
              optionText: selectedOption?.option_text?.substring(0, 30) + '...',
              isCorrectInDB: selectedOption?.is_correct,
              isCorrectInDBType: typeof selectedOption?.is_correct,
              isCorrect: optionIsCorrect,
            });
            
            answersToCreate.push({
              attempt_id: attemptId,
              question_id: question.id,
              selected_option_id: optionId,
              is_correct: optionIsCorrect, // Individual option correctness
              points_earned: 0, // Points awarded per question, not per option
              answered_at: new Date().toISOString(),
            });
          });
          
          // Create a summary answer record for the question (with null selected_option_id)
          // This stores the overall question correctness and points
          const summaryRecord = {
            attempt_id: attemptId,
            question_id: question.id,
            selected_option_id: null, // Summary record
            is_correct: isCorrect,
            points_earned: Number(pointsEarned), // Ensure it's a number
            answered_at: new Date().toISOString(),
          };
          
          console.log(`[SubmitAttempt] Multi-select summary for question ${question.id}:`, {
            isCorrect,
            pointsEarned: summaryRecord.points_earned,
            questionPoints: question.points,
          });
          
          answersToCreate.push(summaryRecord);
        } else if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
          // For single-select questions (multiple_choice or true_false)
          const selectedOptionId = userAnswers[0]?.selected_option_id || null;
          
          if (!selectedOptionId) {
            console.log(`[SubmitAttempt] Question ${question.id}: No option selected`);
            isCorrect = false;
            pointsEarned = 0;
          } else {
            const selectedOption = questionOptions.find(o => o.id === selectedOptionId);
            
            if (!selectedOption) {
              console.error(`[SubmitAttempt] Question ${question.id}: Selected option ${selectedOptionId} not found in question options`);
              isCorrect = false;
              pointsEarned = 0;
            } else {
              // Compare: check if the selected option is marked as correct in the database
              // Handle boolean values properly (could be true, 'true', 1, etc.)
              const optionIsCorrect = selectedOption.is_correct === true || 
                                     selectedOption.is_correct === 'true' || 
                                     selectedOption.is_correct === 1;
              
              isCorrect = optionIsCorrect;
              
              console.log(`[SubmitAttempt] Single-select validation for question ${question.id}:`, {
                selectedOptionId,
                selectedOptionText: selectedOption.option_text?.substring(0, 30) + '...',
                isCorrectInDB: selectedOption.is_correct,
                isCorrectInDBType: typeof selectedOption.is_correct,
                isCorrect,
                correctOptionIds,
                correctOptionTexts: correctOptions.map(o => o.option_text?.substring(0, 30) + '...'),
                allQuestionOptions: questionOptions.map(o => ({
                  id: o.id,
                  text: o.option_text?.substring(0, 30) + '...',
                  is_correct: o.is_correct,
                  is_correct_type: typeof o.is_correct,
                })),
              });
              
              pointsEarned = isCorrect ? (question.points || 0) : 0;
              totalScore += pointsEarned;
              
              console.log(`[SubmitAttempt] Points calculation for question ${question.id}:`, {
                isCorrect,
                pointsEarned,
                questionPoints: question.points,
                totalScoreSoFar: totalScore,
              });
            }
          }

          // Create one answer record for single-select
          const answerRecord = {
            attempt_id: attemptId,
            question_id: question.id,
            selected_option_id: selectedOptionId,
            is_correct: isCorrect,
            points_earned: Number(pointsEarned), // Ensure it's a number
            answered_at: new Date().toISOString(),
          };
          
          console.log(`[SubmitAttempt] Single-select answer for question ${question.id}:`, {
            isCorrect,
            pointsEarned: answerRecord.points_earned,
            questionPoints: question.points,
          });
          
          answersToCreate.push(answerRecord);
        }
      } else {
        // No answer provided
        answersToCreate.push({
          attempt_id: attemptId,
          question_id: question.id,
          selected_option_id: null,
          is_correct: false,
          points_earned: 0,
          answered_at: new Date().toISOString(),
        });
      }
    }

    // Calculate percentage and passed status
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const passed = percentage >= (quiz?.passing_score || 0);

    console.log(`[SubmitAttempt] Final score calculation:`, {
      totalScore,
      maxScore,
      percentage: percentage.toFixed(2),
      passed,
      passingScore: quiz.passing_score,
    });

    // Debug summary: Show validation results for all questions
    console.log(`[SubmitAttempt] ========== VALIDATION SUMMARY ==========`);
    console.log(`[SubmitAttempt] Total Questions: ${questions?.length || 0}`);
    console.log(`[SubmitAttempt] Questions Answered: ${dto.answers.filter(a => a.selected_option_id).length}`);
    console.log(`[SubmitAttempt] Total Score: ${totalScore} / ${maxScore}`);
    console.log(`[SubmitAttempt] Percentage: ${percentage.toFixed(2)}%`);
    console.log(`[SubmitAttempt] Passed: ${passed}`);
    
    // Show per-question validation results
    const validationSummary = answersToCreate
      .filter(a => a.selected_option_id === null || !answersToCreate.find(a2 => a2.question_id === a.question_id && a2.selected_option_id === null))
      .map(a => {
        const q = questions?.find(q => q.id === a.question_id);
        return {
          questionId: a.question_id,
          questionType: q?.question_type,
          isCorrect: a.is_correct,
          pointsEarned: a.points_earned,
          maxPoints: q?.points || 0,
        };
      });
    
    console.log(`[SubmitAttempt] Per-Question Results:`, validationSummary);
    console.log(`[SubmitAttempt] =========================================`);

    // Create answers
    if (answersToCreate.length > 0) {
      console.log(`[SubmitAttempt] Inserting ${answersToCreate.length} answer records`);
      console.log('[SubmitAttempt] Sample answer record:', answersToCreate[0]);
      
      const { error: answersError, data: insertedAnswers } = await this.supabase
        .from('take_away_quiz_answers')
        .insert(answersToCreate)
        .select();

      if (answersError) {
        console.error('[SubmitAttempt] Error inserting answers:', answersError);
        throw new BadRequestException(`Failed to save answers: ${answersError.message}`);
      }
      
      // Verify points were saved correctly
      if (insertedAnswers && insertedAnswers.length > 0) {
        console.log('[SubmitAttempt] Sample inserted answer:', {
          question_id: insertedAnswers[0].question_id,
          is_correct: insertedAnswers[0].is_correct,
          points_earned: insertedAnswers[0].points_earned,
          points_earned_type: typeof insertedAnswers[0].points_earned,
        });
      }
    }

    // Update attempt
    const completedAt = new Date().toISOString();
    const { data: updatedAttempt, error: updateError } = await this.supabase
      .from('take_away_quiz_attempts')
      .update({
        score: totalScore,
        max_score: maxScore,
        percentage: percentage,
        passed: passed,
        time_spent_seconds: dto.time_spent_seconds,
        completed_at: completedAt,
        status: 'completed',
      })
      .eq('id', attemptId)
      .select()
      .single();

    if (updateError || !updatedAttempt) {
      throw new BadRequestException(`Failed to update attempt: ${updateError?.message}`);
    }

    // Update student points for all assignments linked to this quiz
    // This is done via database trigger, but we can also call it explicitly for immediate update
    try {
      const { data: assignments, error: assignmentsError } = await this.supabase
        .from('take_away_assignments')
        .select('id')
        .eq('take_away_quiz_id', attempt.quiz_id);

      if (assignmentsError) {
        console.error('[SubmitAttempt] Error fetching assignments:', assignmentsError);
      } else if (assignments && assignments.length > 0) {
        console.log(`[SubmitAttempt] Updating points for ${assignments.length} assignment(s)`);
        
        // Call the database function to update points
        for (const assignment of assignments) {
          console.log(`[SubmitAttempt] Updating points for assignment ${assignment.id}, student ${studentId}`);
          
          const { data: rpcResult, error: pointsError } = await this.supabase.rpc(
            'update_take_away_assignment_student_points',
            {
              p_student_id: studentId,
              p_assignment_id: assignment.id,
            }
          );

          if (pointsError) {
            console.error(`[SubmitAttempt] Failed to update points for assignment ${assignment.id}:`, pointsError);
            console.error('[SubmitAttempt] Error details:', JSON.stringify(pointsError, null, 2));
          } else {
            console.log(`[SubmitAttempt] Successfully updated points for assignment ${assignment.id}`);
          }
        }
      } else {
        console.warn(`[SubmitAttempt] No assignments found for quiz ${attempt.quiz_id}`);
      }
    } catch (pointsUpdateError) {
      console.error('[SubmitAttempt] Error updating student points:', pointsUpdateError);
      // Don't throw - points update is not critical for quiz submission
    }

    return updatedAttempt;
  }

  async getStudentAttempts(studentId: string, quizId?: string): Promise<TakeAwayQuizAttempt[]> {
    let query = this.supabase
      .from('take_away_quiz_attempts')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (quizId) {
      query = query.eq('quiz_id', quizId);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to get attempts: ${error.message}`);
    }

    return data || [];
  }

  async getAttemptResults(attemptId: string, studentId: string): Promise<any> {
    // Get attempt with quiz - fetch in parallel
    const [attemptResult, answersResult] = await Promise.all([
      this.supabase
        .from('take_away_quiz_attempts')
        .select('*')
        .eq('id', attemptId)
        .eq('student_id', studentId)
        .single(),
      this.supabase
        .from('take_away_quiz_answers')
        .select('*')
        .eq('attempt_id', attemptId),
    ]);

    const { data: attempt, error: attemptError } = attemptResult;
    const { data: answers, error: answersError } = answersResult;

    if (attemptError || !attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (answersError) {
      console.error('[GetAttemptResults] Error fetching answers:', answersError);
    }

    // Fetch quiz, questions, and options in parallel
    const [quizResult, questionsResult] = await Promise.all([
      this.supabase
        .from('take_away_quizzes')
        .select('*')
        .eq('id', attempt.quiz_id)
        .single(),
      this.supabase
        .from('take_away_quiz_questions')
        .select('*')
        .eq('quiz_id', attempt.quiz_id)
        .eq('status', 'active')
        .order('order_position'),
    ]);

    const { data: quiz } = quizResult;
    const { data: questions } = questionsResult;

    const questionIds = questions?.map(q => q.id) || [];
    
    // Fetch options for all questions at once
    const { data: options } = questionIds.length > 0
      ? await this.supabase
          .from('take_away_quiz_options')
          .select('*')
          .in('question_id', questionIds)
          .order('order_position')
      : { data: [] };
    
    if (answersError) {
      console.error('[GetAttemptResults] Error fetching answers:', answersError);
    }
    
    console.log(`[GetAttemptResults] Found ${answers?.length || 0} answers for attempt ${attemptId}`);
    if (answers && answers.length > 0) {
      console.log('[GetAttemptResults] Sample answer:', {
        question_id: answers[0].question_id,
        is_correct: answers[0].is_correct,
        points_earned: answers[0].points_earned,
        selected_option_id: answers[0].selected_option_id,
      });
    }

    // Combine data
    const questionsWithData = questions?.map(question => {
      const questionAnswers = answers?.filter(a => a.question_id === question.id) || [];
      
      // For multi-select, find the summary record (selected_option_id is null) and include all selected options
      if (question.question_type === 'multi_select') {
        const summaryAnswer = questionAnswers.find(a => a.selected_option_id === null);
        const selectedOptionAnswers = questionAnswers.filter(a => a.selected_option_id !== null);
        
        const answer = summaryAnswer ? {
          ...summaryAnswer,
          selected_option_ids: selectedOptionAnswers.map(a => a.selected_option_id).filter(Boolean),
          // Ensure points_earned is set correctly
          points_earned: summaryAnswer.points_earned ?? (summaryAnswer.is_correct ? (question.points || 0) : 0),
        } : null;
        
        return {
          ...question,
          options: options?.filter(o => o.question_id === question.id) || [],
          answer: answer,
          allAnswers: selectedOptionAnswers, // All selected option answers
        };
      } else {
        // For single-select, get the first (and only) answer
        const answer = questionAnswers[0] || null;
        
        // Ensure points_earned is set correctly if answer exists
        const answerWithPoints = answer ? {
          ...answer,
          // Recalculate points_earned if it's missing or incorrect
          points_earned: answer.points_earned ?? (answer.is_correct ? (question.points || 0) : 0),
        } : null;
        
        return {
          ...question,
          options: options?.filter(o => o.question_id === question.id) || [],
          answer: answerWithPoints,
        };
      }
    }) || [];

    return {
      attempt,
      quiz,
      questions: questionsWithData,
      summary: {
        score: attempt.score,
        maxScore: attempt.max_score,
        percentage: attempt.percentage,
        passed: attempt.passed,
        timeSpent: attempt.time_spent_seconds,
        questionsCount: questions?.length || 0,
        // Count questions as correct/incorrect, not individual answers
        correctAnswers: questionsWithData.filter(q => q.answer?.is_correct).length || 0,
        incorrectAnswers: questionsWithData.filter(q => q.answer && !q.answer.is_correct).length || 0,
      },
    };
  }

  async getTotalPointsEarned(studentId: string, quizId: string): Promise<{
    totalPointsEarned: number;
    maxPossiblePoints: number;
    bestScore: number;
    bestPercentage: number;
    totalAttempts: number;
    completedAttempts: number;
  }> {
    // Get all attempts for this quiz by this student
    const { data: attempts, error: attemptsError } = await this.supabase
      .from('take_away_quiz_attempts')
      .select('id, score, max_score, percentage, status')
      .eq('student_id', studentId)
      .eq('quiz_id', quizId);

    if (attemptsError) {
      console.error('[GetTotalPointsEarned] Error fetching attempts:', attemptsError);
      throw new BadRequestException(`Failed to fetch attempts: ${attemptsError.message}`);
    }

    const completedAttempts = attempts?.filter(a => a.status === 'completed') || [];
    
    // Calculate total points from take_away_quiz_answers
    // Sum points_earned from all completed attempts
    let totalPointsEarned = 0;
    if (completedAttempts.length > 0) {
      const attemptIds = completedAttempts.map(a => a.id);
      
      // Fetch all answers from completed attempts
      const { data: answers, error: answersError } = await this.supabase
        .from('take_away_quiz_answers')
        .select('points_earned, question_id, selected_option_id, attempt_id')
        .in('attempt_id', attemptIds);

      if (answersError) {
        console.error('[GetTotalPointsEarned] Error fetching answers:', answersError);
        // Fallback to best attempt score if answers query fails
        const bestAttempt = completedAttempts.reduce((best, current) => {
          if (!best || current.score > best.score) {
            return current;
          }
          return best;
        }, null as any);
        totalPointsEarned = bestAttempt?.score || 0;
      } else if (answers && answers.length > 0) {
        // For each question, get the maximum points earned across all attempts
        // This gives us the best performance for each question
        const questionPointsMap = new Map<string, number>();
        
        answers.forEach(answer => {
          // For multi-select questions, use summary records (selected_option_id is null)
          // For single-select questions, use all records
          // We want the best points for each question across all attempts
          if (answer.selected_option_id === null) {
            // Multi-select summary record - this has the question's total points
            const points = answer.points_earned || 0;
            const currentMax = questionPointsMap.get(answer.question_id) || 0;
            if (points > currentMax) {
              questionPointsMap.set(answer.question_id, points);
            }
          } else {
            // Single-select answer - this has the question's points
            const points = answer.points_earned || 0;
            const currentMax = questionPointsMap.get(answer.question_id) || 0;
            if (points > currentMax) {
              questionPointsMap.set(answer.question_id, points);
            }
          }
        });
        
        // Sum up the best points for each question
        totalPointsEarned = Array.from(questionPointsMap.values()).reduce((sum, points) => sum + points, 0);
        
        console.log(`[GetTotalPointsEarned] Calculated ${totalPointsEarned} points from ${questionPointsMap.size} questions`);
      } else {
        // No answers found, use best attempt score as fallback
        const bestAttempt = completedAttempts.reduce((best, current) => {
          if (!best || current.score > best.score) {
            return current;
          }
          return best;
        }, null as any);
        totalPointsEarned = bestAttempt?.score || 0;
      }
    }

    // Get max possible points from quiz
    const { data: quiz } = await this.supabase
      .from('take_away_quizzes')
      .select('total_points')
      .eq('id', quizId)
      .single();

    const maxPossiblePoints = quiz?.total_points || 0;

    // Get best score and percentage from attempts
    const bestAttempt = completedAttempts.reduce((best, current) => {
      if (!best || current.score > best.score) {
        return current;
      }
      return best;
    }, null as any);

    const bestScore = bestAttempt?.score || 0;
    const bestPercentage = bestAttempt?.percentage || 0;

    return {
      totalPointsEarned,
      maxPossiblePoints,
      bestScore,
      bestPercentage,
      totalAttempts: attempts?.length || 0,
      completedAttempts: completedAttempts.length,
    };
  }

  /**
   * Validate a single answer - useful for debugging
   */
  async validateAnswer(questionId: string, selectedOptionId: string): Promise<{
    isCorrect: boolean;
    selectedOption: any;
    correctOptions: any[];
    allOptions: any[];
    question: any;
  }> {
    // Get question
    const { data: question, error: questionError } = await this.supabase
      .from('take_away_quiz_questions')
      .select('id, question_text, question_type, points')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      throw new BadRequestException(`Question not found: ${questionError?.message}`);
    }

    // Get all options for this question
    const { data: allOptions, error: optionsError } = await this.supabase
      .from('take_away_quiz_options')
      .select('id, option_text, is_correct, order_position')
      .eq('question_id', questionId)
      .order('order_position');

    if (optionsError) {
      throw new BadRequestException(`Failed to fetch options: ${optionsError.message}`);
    }

    const selectedOption = allOptions?.find(o => o.id === selectedOptionId);
    // Handle boolean values properly
    const correctOptions = allOptions?.filter(o => 
      o.is_correct === true || o.is_correct === 'true' || o.is_correct === 1
    ) || [];

    // Handle boolean values properly for validation
    const isCorrect = selectedOption ? (
      selectedOption.is_correct === true || 
      selectedOption.is_correct === 'true' || 
      selectedOption.is_correct === 1
    ) : false;

    console.log('[ValidateAnswer] Validation result:', {
      questionId,
      selectedOptionId,
      selectedOption: selectedOption ? {
        id: selectedOption.id,
        text: selectedOption.option_text?.substring(0, 30) + '...',
        is_correct: selectedOption.is_correct,
        is_correct_type: typeof selectedOption.is_correct,
      } : null,
      isCorrect,
      correctOptionsCount: correctOptions.length,
      allOptionsCount: allOptions?.length || 0,
    });

    return {
      isCorrect,
      selectedOption: selectedOption || null,
      correctOptions,
      allOptions: allOptions || [],
      question,
    };
  }

  /**
   * Get performance data for all students who attempted a specific assignment
   */
  async getAssignmentPerformance(assignmentId: string): Promise<any[]> {
    console.log(`[GetAssignmentPerformance] Fetching performance for assignment: ${assignmentId}`);

    if (!assignmentId) {
      console.error('[GetAssignmentPerformance] Missing assignmentId');
      throw new BadRequestException('Assignment ID is required');
    }

    // First, get the assignment to find the quiz_id and class_id
    const { data: assignment, error: assignmentError } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id, take_away_quiz_id')
      .eq('id', assignmentId)
      .single();

    if (assignmentError) {
      console.error('[GetAssignmentPerformance] Error fetching assignment:', {
        error: assignmentError,
        code: assignmentError.code,
        message: assignmentError.message,
        details: assignmentError.details,
      });
      throw new BadRequestException(`Failed to fetch assignment: ${assignmentError.message || 'Unknown error'}`);
    }

    if (!assignment) {
      console.error('[GetAssignmentPerformance] Assignment not found for ID:', assignmentId);
      throw new BadRequestException(`Assignment not found with ID: ${assignmentId}`);
    }

    if (!assignment.take_away_quiz_id) {
      console.log('[GetAssignmentPerformance] Assignment has no quiz');
      return [];
    }

    // Get all students in the class
    const { data: students, error: studentsError } = await this.supabase
      .from('students')
      .select('id, first_name, last_name, email, username')
      .eq('class_id', assignment.class_id);

    if (studentsError) {
      console.error('[GetAssignmentPerformance] Error fetching students:', studentsError);
      throw new BadRequestException(`Failed to fetch students: ${studentsError.message}`);
    }

    if (!students || students.length === 0) {
      console.log('[GetAssignmentPerformance] No students found in class');
      return [];
    }

    // Get all attempts for this quiz
    const { data: attempts, error: attemptsError } = await this.supabase
      .from('take_away_quiz_attempts')
      .select('*')
      .eq('quiz_id', assignment.take_away_quiz_id)
      .order('completed_at', { ascending: false });

    if (attemptsError) {
      console.error('[GetAssignmentPerformance] Error fetching attempts:', attemptsError);
      throw new BadRequestException(`Failed to fetch attempts: ${attemptsError.message}`);
    }

    // Get quiz details
    const { data: quiz, error: quizError } = await this.supabase
      .from('take_away_quizzes')
      .select('id, title, total_points, passing_score')
      .eq('id', assignment.take_away_quiz_id)
      .single();

    if (quizError) {
      console.error('[GetAssignmentPerformance] Error fetching quiz:', quizError);
    }

    // Group attempts by student and calculate performance
    const performanceMap = new Map<string, any>();

    // Initialize all students
    students.forEach(student => {
      performanceMap.set(student.id, {
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        student_email: student.email,
        student_code: student.username, // Use username as student code/identifier
        total_attempts: 0,
        completed_attempts: 0,
        best_score: 0,
        best_percentage: 0,
        best_points: 0,
        latest_attempt: null,
        attempts: [],
      });
    });

    // Process attempts
    if (attempts && attempts.length > 0) {
      for (const attempt of attempts) {
        const studentId = attempt.student_id;
        const studentData = performanceMap.get(studentId);

        if (studentData) {
          studentData.total_attempts++;
          studentData.attempts.push({
            id: attempt.id,
            score: attempt.score || 0,
            max_score: attempt.max_score || 0,
            percentage: attempt.percentage || 0,
            passed: attempt.passed || false,
            status: attempt.status,
            completed_at: attempt.completed_at,
            started_at: attempt.started_at,
            time_spent_seconds: attempt.time_spent_seconds || 0,
          });

          if (attempt.status === 'completed') {
            studentData.completed_attempts++;
            
            // Update best score
            if (attempt.score > studentData.best_score) {
              studentData.best_score = attempt.score || 0;
              studentData.best_percentage = attempt.percentage || 0;
              studentData.best_points = attempt.score || 0; // Assuming score is points
            }

            // Update latest attempt
            if (!studentData.latest_attempt || 
                new Date(attempt.completed_at || attempt.started_at) > 
                new Date(studentData.latest_attempt.completed_at || studentData.latest_attempt.started_at)) {
              studentData.latest_attempt = {
                id: attempt.id,
                score: attempt.score || 0,
                max_score: attempt.max_score || 0,
                percentage: attempt.percentage || 0,
                passed: attempt.passed || false,
                completed_at: attempt.completed_at,
                started_at: attempt.started_at,
                time_spent_seconds: attempt.time_spent_seconds || 0,
              };
            }
          }
        }
      }
    }

    // Convert map to array and sort by best score (descending)
    const performanceArray = Array.from(performanceMap.values())
      .sort((a, b) => b.best_score - a.best_score);

    console.log(`[GetAssignmentPerformance] Returning performance for ${performanceArray.length} students`);

    return performanceArray.map(perf => ({
      ...perf,
      quiz_title: quiz?.title || 'Unknown Quiz',
      max_possible_points: quiz?.total_points || 0,
      passing_score: quiz?.passing_score || 0,
    }));
  }
}
