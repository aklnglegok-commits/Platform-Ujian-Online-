/**
 * SUPABASE BACKEND INTEGRATION
 * This file replaces the Firestore database helper implementations 
 * with the user-provided Supabase instance.
 * 
 * ====================================================================
 * SQL SCHEMA FOR YOUR SUPABASE SQL EDITOR:
 * ====================================================================
 * 
 * -- 1. QUESTION BANKS TABLE
 * create table question_banks (
 *   id text primary key,
 *   title text not null,
 *   description text,
 *   questions jsonb not null default '[]'::jsonb,
 *   created_at bigint not null
 * );
 * 
 * -- 2. ACTIVE EXAMS TABLE
 * create table active_exams (
 *   code text primary key,
 *   bank_id text not null references question_banks(id) on delete cascade,
 *   title text not null,
 *   time_limit integer not null default 30,
 *   kkm integer not null default 75,
 *   spreadsheet_id text,
 *   created_at bigint not null,
 *   is_active boolean not null default true,
 *   teacher_uid text not null
 * );
 * 
 * -- 3. STUDENT ATTEMPTS TABLE
 * create table student_attempts (
 *   id text primary key,
 *   student_name text not null,
 *   student_class text not null,
 *   exam_code text not null references active_exams(code) on delete cascade,
 *   exam_title text not null,
 *   score numeric not null,
 *   total_questions integer not null,
 *   correct_answers_count integer not null,
 *   violations_count integer not null,
 *   violations_list jsonb not null default '[]'::jsonb,
 *   submitted_at bigint not null,
 *   original_score numeric
 * );
 * 
 * -- Optional: Enable Row Level Security (RLS) to permit anonymous read/write accesses
 * alter table question_banks enable row level security;
 * alter table active_exams enable row level security;
 * alter table student_attempts enable row level security;
 * 
 * create policy "Permit all writes and reads to anonymous custom app" on question_banks for all using (true) with check (true);
 * create policy "Permit all writes and reads to anonymous custom app" on active_exams for all using (true) with check (true);
 * create policy "Permit all writes and reads to anonymous custom app" on student_attempts for all using (true) with check (true);
 * 
 */

import { createClient } from '@supabase/supabase-js';
import { QuestionBank, ActiveExam, StudentAttempt } from './types';

// Supabase Connection Information
const rawUrl = (import.meta as any).env.VITE_SUPABASE_URL || "https://zosertcnwuxjmaixuswv.supabase.co/rest/v1/";
// Standard library expects the origin/host without trailing "/rest/v1/" paths
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "");
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpvc2VydGNud3V4am1haXh1c3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzU2NDAsImV4cCI6MjA5NzcxMTY0MH0.H5HclIYITaqnunbFX1xnEW5CKrbjNke9XJeeppflWgM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Mapper helper to convert JavaScript camelCase key structure to PostgreSQL snake_case rows.
 * Only scales outer level structure; json fields are preserved inside JSONB columns.
 */
export function mapToDbRow(obj: any): any {
  if (!obj) return obj;
  const dbRow: any = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    dbRow[snakeKey] = value;
  }
  return dbRow;
}

/**
 * Mapper helper to convert PostgreSQL snake_case key structure to JavaScript camelCase objects.
 * Only scales outer level structure; inner JSON fields are untouched.
 */
export function mapFromDbRow(row: any): any {
  if (!row) return row;
  const camelObj: any = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    camelObj[camelKey] = value;
  }
  return camelObj;
}

// --- Question Bank (Bank Soal) ---
export const saveQuestionBank = async (bank: Omit<QuestionBank, 'id' | 'createdAt'> & { id?: string }): Promise<string> => {
  const bankId = bank.id || Math.random().toString(36).substring(2, 11);
  const dataToSave = {
    ...bank,
    id: bankId,
    createdAt: Date.now()
  };
  const dbRow = mapToDbRow(dataToSave);

  const { error } = await supabase
    .from('question_banks')
    .upsert(dbRow, { onConflict: 'id' });

  if (error) {
    console.error('Error saving question bank to Supabase:', error);
    throw error;
  }
  return bankId;
};

export const getQuestionBanks = async (): Promise<QuestionBank[]> => {
  const { data, error } = await supabase
    .from('question_banks')
    .select('*');

  if (error) {
    console.error('Error getting question banks from Supabase:', error);
    // Return empty array to allow the app to run and prompt table setup
    return [];
  }

  const banks = (data || []).map(row => mapFromDbRow(row) as QuestionBank);
  return banks.sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteQuestionBank = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('question_banks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting question bank from Supabase:', error);
    throw error;
  }
};

// --- Active Exams (Ujian Aktif) ---
export const createActiveExam = async (exam: Omit<ActiveExam, 'createdAt'>): Promise<string> => {
  const dataToSave = {
    ...exam,
    createdAt: Date.now()
  };
  const dbRow = mapToDbRow(dataToSave);

  const { error } = await supabase
    .from('active_exams')
    .insert(dbRow);

  if (error) {
    console.error('Error creating active exam in Supabase:', error);
    throw error;
  }
  return exam.code;
};

export const getActiveExamsByTeacher = async (teacherUid: string): Promise<ActiveExam[]> => {
  const { data, error } = await supabase
    .from('active_exams')
    .select('*')
    .eq('teacher_uid', teacherUid);

  if (error) {
    console.error('Error getting active exams from Supabase:', error);
    return [];
  }

  const exams = (data || []).map(row => mapFromDbRow(row) as ActiveExam);
  return exams.sort((a, b) => b.createdAt - a.createdAt);
};

export const toggleExamStatus = async (code: string, isActive: boolean): Promise<void> => {
  const { error } = await supabase
    .from('active_exams')
    .update({ is_active: isActive })
    .eq('code', code);

  if (error) {
    console.error('Error toggling exam status in Supabase:', error);
    throw error;
  }
};

export const updateExamSpreadsheet = async (code: string, spreadsheetId: string): Promise<void> => {
  const { error } = await supabase
    .from('active_exams')
    .update({ spreadsheet_id: spreadsheetId })
    .eq('code', code);

  if (error) {
    console.error('Error updating exam spreadsheet in Supabase:', error);
    throw error;
  }
};

export const getActiveExamByCode = async (code: string): Promise<ActiveExam | null> => {
  const { data, error } = await supabase
    .from('active_exams')
    .select('*')
    .eq('code', code);

  if (error || !data || data.length === 0) {
    if (error) {
      console.error('Error getting active exam by code from Supabase:', error);
    }
    return null;
  }
  return mapFromDbRow(data[0]) as ActiveExam;
};

export const deleteActiveExam = async (code: string): Promise<void> => {
  const { error } = await supabase
    .from('active_exams')
    .delete()
    .eq('code', code);

  if (error) {
    console.error('Error deleting active exam from Supabase:', error);
    throw error;
  }
};

// --- Student Attempt Logs ---
export const saveStudentAttempt = async (attempt: StudentAttempt): Promise<string> => {
  const attemptId = attempt.id || 'att_' + Math.random().toString(36).substring(2, 11);
  const dbRow = mapToDbRow({ ...attempt, id: attemptId });

  const { error } = await supabase
    .from('student_attempts')
    .insert(dbRow);

  if (error) {
    console.error('Error saving student attempt to Supabase:', error);
    throw error;
  }
  return attemptId;
};

export const getStudentAttemptsForExam = async (examCode: string): Promise<StudentAttempt[]> => {
  const { data, error } = await supabase
    .from('student_attempts')
    .select('*')
    .eq('exam_code', examCode);

  if (error) {
    console.error('Error getting student attempts from Supabase:', error);
    return [];
  }

  const attempts = (data || []).map(row => mapFromDbRow(row) as StudentAttempt);
  return attempts.sort((a, b) => b.submittedAt - a.submittedAt);
};
