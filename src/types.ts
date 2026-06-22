export interface Question {
  id: string;
  text: string;
  options: string[]; // typically 4 options: A, B, C, D
  correctAnswer: number; // Index of correct option (0 to 3)
  isActive?: boolean;
  imageUrl?: string;
}

export interface QuestionBank {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  createdAt: number;
  googleFormUrl?: string;
}

export interface ActiveExam {
  code: string; // 5-6 digit code, e.g., "123456"
  bankId: string;
  title: string;
  timeLimit: number; // in minutes (0 for no limit)
  kkm?: number; // Minimum passing grade (Kriteria Ketuntasan Minimal)
  spreadsheetId?: string; // Google spreadsheet where records go
  createdAt: number;
  isActive: boolean;
  teacherUid: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  googleFormUrl?: string;
}

export interface Violation {
  timestamp: string; // HH:mm:ss format
  type: 'TAB_OUT' | 'WINDOW_BLUR' | 'FULLSCREEN_EXIT';
  description: string;
}

export interface StudentAttempt {
  id?: string;
  studentName: string;
  studentClass: string;
  examCode: string;
  examTitle: string;
  score: number;
  totalQuestions: number;
  correctAnswersCount: number;
  violationsCount: number;
  violationsList: Violation[];
  submittedAt: number;
  originalScore?: number;
}

export interface SheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
}
