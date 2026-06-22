import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { QuestionBank, ActiveExam, StudentAttempt } from './types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

const provider = new GoogleAuthProvider();
// Request Workspace scopes for Google Sheets and Drive
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Persistent token caching in memory during session
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // In a real app setup, we recover token from session or memory.
      // If we don't have token cached yet, we might trigger re-login or use what we got.
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Just report user state. Access token will be set upon login.
        if (onAuthSuccess) {
          // If we have a user but no in-memory token (e.g. page refresh),
          // we can still let client know user is logged, but Sheets API will require re-auth
          // which can be done gracefully by calling signIn again.
          onAuthSuccess(user, '');
        }
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedToken = (): string | null => {
  return cachedAccessToken;
};

export const setCachedToken = (token: string) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// ==========================================
// FIRESTORE DATABASES HELPERS FOR EXAMS
// ==========================================

export function cleanUndefined<T>(obj: T): T {
  if (obj === undefined) {
    return null as any;
  }
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  const constructorName = obj.constructor?.name;
  if (constructorName && constructorName !== 'Object') {
    return obj;
  }
  const result: any = {};
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      result[key] = cleanUndefined(val);
    }
  }
  return result;
}

// --- Question Bank (Bank Soal) ---
export const saveQuestionBank = async (bank: Omit<QuestionBank, 'id' | 'createdAt'> & { id?: string }): Promise<string> => {
  const bankId = bank.id || doc(collection(db, 'question_banks')).id;
  const bankData: QuestionBank = {
    ...bank,
    id: bankId,
    createdAt: Date.now()
  };
  await setDoc(doc(db, 'question_banks', bankId), cleanUndefined(bankData));
  return bankId;
};

export const getQuestionBanks = async (): Promise<QuestionBank[]> => {
  const q = query(collection(db, 'question_banks'));
  const snapshot = await getDocs(q);
  const banks: QuestionBank[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as QuestionBank;
    banks.push({
      ...data,
      id: docSnap.id || data.id
    });
  });
  return banks.sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteQuestionBank = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'question_banks', id));
};

// --- Active Exams (Ujian Aktif) ---
export const createActiveExam = async (exam: Omit<ActiveExam, 'createdAt'>): Promise<string> => {
  await setDoc(doc(db, 'active_exams', exam.code), cleanUndefined({
    ...exam,
    createdAt: Date.now()
  }));
  return exam.code;
};

export const getActiveExamsByTeacher = async (teacherUid: string): Promise<ActiveExam[]> => {
  const q = query(collection(db, 'active_exams'), where('teacherUid', '==', teacherUid));
  const snapshot = await getDocs(q);
  const exams: ActiveExam[] = [];
  snapshot.forEach((doc) => {
    exams.push(doc.data() as ActiveExam);
  });
  return exams.sort((a, b) => b.createdAt - a.createdAt);
};

export const toggleExamStatus = async (code: string, isActive: boolean): Promise<void> => {
  await updateDoc(doc(db, 'active_exams', code), { isActive });
};

export const updateExamSpreadsheet = async (code: string, spreadsheetId: string): Promise<void> => {
  await updateDoc(doc(db, 'active_exams', code), { spreadsheetId });
};

export const getActiveExamByCode = async (code: string): Promise<ActiveExam | null> => {
  const docRef = doc(db, 'active_exams', code);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as ActiveExam;
  }
  return null;
};

export const deleteActiveExam = async (code: string): Promise<void> => {
  await deleteDoc(doc(db, 'active_exams', code));
};

// --- Student Attempt Logs ---
export const saveStudentAttempt = async (attempt: StudentAttempt): Promise<string> => {
  const docRef = await addDoc(collection(db, 'student_attempts'), cleanUndefined(attempt));
  return docRef.id;
};

export const getStudentAttemptsForExam = async (examCode: string): Promise<StudentAttempt[]> => {
  const q = query(collection(db, 'student_attempts'), where('examCode', '==', examCode));
  const snapshot = await getDocs(q);
  const attempts: StudentAttempt[] = [];
  snapshot.forEach((doc) => {
    attempts.push({ id: doc.id, ...doc.data() } as StudentAttempt);
  });
  return attempts.sort((a, b) => b.submittedAt - a.submittedAt);
};
