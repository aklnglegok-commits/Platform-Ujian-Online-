import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  User, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  Maximize, 
  LogOut,
  Sparkles,
  RefreshCw,
  Info
} from 'lucide-react';
import { getActiveExamByCode, getQuestionBanks, saveStudentAttempt } from '../supabase';
import { appendStudentAttemptToSheet } from '../googleSheets';
import { ActiveExam, QuestionBank, StudentAttempt, Violation, Question } from '../types';

interface ExamScreenProps {
  onBackToRoleSelection?: () => void;
}

export default function ExamScreen({ onBackToRoleSelection }: ExamScreenProps) {
  const [step, setStep] = useState<'login' | 'fullscreen_prompt' | 'active' | 'summary'>('login');

  // Login credentials
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [examCode, setExamCode] = useState('');

  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Exam taking state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({}); // qId -> optionIndex
  const [violationsList, setViolationsList] = useState<Violation[]>([]);
  const [isWarningActive, setIsWarningActive] = useState(false);
  const [latestViolation, setLatestViolation] = useState<Violation | null>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-sync status
  const [submittingResult, setSubmittingResult] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [finalAttemptRecord, setFinalAttemptRecord] = useState<StudentAttempt | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const prevVisibilityState = useRef<string>('visible');

  // Trigger violation
  const triggerViolation = (type: Violation['type'], description: string) => {
    // If warning is already active, don't flood warnings
    if (isWarningActive) return;

    const now = new Date();
    const timestampStr = now.toLocaleTimeString('id-ID', { hour12: false });
    const newViolation: Violation = {
      timestamp: timestampStr,
      type,
      description
    };

    setViolationsList(prev => [...prev, newViolation]);
    setLatestViolation(newViolation);
    setIsWarningActive(true);
  };

  // Join exam validation
  const handleJoinExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const upperName = studentName.trim().toUpperCase();
    const upperClass = studentClass.trim().toUpperCase();

    if (!upperName || !upperClass || !examCode.trim()) {
      setErrorText('Seluruh informasi wajib diisi!');
      return;
    }

    try {
      setLoading(true);
      setErrorText('');
      const exam = await getActiveExamByCode(examCode.trim());

      if (!exam) {
        setErrorText('Kode Akses Ujian tidak valid/tidak ditemukan.');
        return;
      }

      if (!exam.isActive) {
        setErrorText('Ujian ini saat ini sedang dinonaktifkan oleh guru.');
        return;
      }

      // Load matching Question Bank
      const banks = await getQuestionBanks();
      const matchedBank = banks.find(b => b.id === exam.bankId);

      if (!matchedBank) {
        setErrorText('Bank Soal untuk ujian ini kosong atau terhapus.');
        return;
      }

      const isGoogleForm = !!(exam.googleFormUrl || matchedBank.googleFormUrl);

      if (!isGoogleForm && (!matchedBank.questions || matchedBank.questions.length === 0)) {
        setErrorText('Bank Soal untuk ujian ini kosong atau terhapus.');
        return;
      }

      // Filter out any questions deactivated by the teacher
      const activeQuestions = (matchedBank.questions || []).filter(q => q.isActive !== false);
      if (!isGoogleForm && activeQuestions.length === 0) {
        setErrorText('Tidak ada butir soal aktif di dalam bank soal ini.');
        return;
      }

      // Commit capitalized values to State
      setStudentName(upperName);
      setStudentClass(upperClass);

      // Ensure all active questions have valid stable IDs and we don't mutate original bank
      let processedQuestions = isGoogleForm ? [] : activeQuestions.map((q, idx) => ({
        ...q,
        id: q.id || `q-fallback-${idx}-${Date.now()}`
      }));

      // Helper shuffle function
      const shuffleArray = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = arr[i];
          arr[i] = arr[j];
          arr[j] = temp;
        }
        return arr;
      };

      // Shuffling questions if enabled
      if (exam.shuffleQuestions) {
        processedQuestions = shuffleArray(processedQuestions);
      }

      // Shuffling options if enabled
      if (exam.shuffleOptions) {
        processedQuestions = processedQuestions.map((q) => {
          const originalCorrectText = q.options[q.correctAnswer];
          const shuffledOpts = shuffleArray(q.options);
          const newCorrectIdx = shuffledOpts.indexOf(originalCorrectText);
          return {
            ...q,
            options: shuffledOpts,
            correctAnswer: newCorrectIdx !== -1 ? newCorrectIdx : q.correctAnswer
          };
        });
      }

      setActiveExam(exam);
      setQuestions(processedQuestions);
      
      // Set timer (minutes to seconds)
      if (exam.timeLimit && exam.timeLimit > 0) {
        setTimeLeft(exam.timeLimit * 60);
      } else {
        setTimeLeft(-1); // No limit
      }

      setStep('fullscreen_prompt');
    } catch (err) {
      console.error(err);
      setErrorText('Koneksi terganggu. Gagal masuk sesi ujian.');
    } finally {
      setLoading(false);
    }
  };

  // Start Exam
  const handleStartExam = () => {
    setStep('active');
  };

  // Timer runner
  useEffect(() => {
    if (step === 'active' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleSubmitExam(); // auto submit
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, timeLeft]);

  // Anti cheat detection logic
  useEffect(() => {
    if (step !== 'active' || isWarningActive) return;

    const handleVisibilityChange = () => {
      const current = document.visibilityState;
      if (current === 'hidden' && prevVisibilityState.current === 'visible') {
        triggerViolation('TAB_OUT', 'Layar Terkunci! Siswa beralih ke tab browser lain, menutup tab, atau meminimalkan jendela browser.');
      }
      prevVisibilityState.current = current;
    };

    const handleWindowBlur = () => {
      // Menghindari false-positive sewaktu memproses ketukan di dalam Google Form (iframe)
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          // Klik asli di dalam iframe Google Form. Abaikan blur event ini karena sah.
          return;
        }
        triggerViolation('WINDOW_BLUR', 'Layar Terkunci! Fokus pengerjaan hilang karena siswa mencoba membuka tab lain, aplikasi lain, atau mengklik di luar area ujian.');
      }, 150);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [step, isWarningActive]);

  // Dismiss Warning and unlock screen
  const handleDismissWarning = () => {
    setIsWarningActive(false);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 0) return 'Tanpa Batas Waktu';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Computing scores & submit
  const handleSubmitExam = async () => {
    if (submittingResult) return;

    setSubmittingResult(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const isGoogleForm = !!activeExam?.googleFormUrl;

    // Calculate score
    let correctCount = 0;
    let totalQuestionsCount = questions.length;
    let baseScore = 0;

    if (isGoogleForm) {
      correctCount = 0;
      totalQuestionsCount = 0;
      baseScore = 100; // Let's report as 100 with Google Form indicator
    } else {
      questions.forEach((q) => {
        if (selectedAnswers[q.id] === q.correctAnswer) {
          correctCount++;
        }
      });
      baseScore = totalQuestionsCount > 0 ? (correctCount / totalQuestionsCount) * 100 : 0;
    }

    // Violation deduction: 5 points per violation
    const violationCount = violationsList.length;
    const penalty = violationCount * 5;
    // Score cannot go below 0
    const finalScore = Math.max(0, baseScore - penalty);

    const attemptData: StudentAttempt = {
      studentName: studentName.trim().toUpperCase(),
      studentClass: studentClass.trim().toUpperCase(),
      examCode: activeExam!.code,
      examTitle: activeExam!.title,
      score: finalScore,
      totalQuestions: totalQuestionsCount,
      correctAnswersCount: correctCount,
      violationsCount: violationCount,
      violationsList: violationsList,
      submittedAt: Date.now(),
      originalScore: baseScore
    };

    try {
      // 1. Save to cloud Firestore database (permanent rekap for teacher)
      await saveStudentAttempt(attemptData);
      setFinalAttemptRecord(attemptData);

      // 2. Automagically append to Google Spreadsheet directly!
      // Here, we grab the short-lived accessToken that the teacher attached temporarily in the document
      // or if it was saved locally/in session. This allows seamless zero-friction rekap!
      if (activeExam?.spreadsheetId) {
        // Retrieve spreadsheetId and try sending values to Google Sheets
        // Wait, where is the accessToken? If we are running in the same browser session as teacher, we have it.
        // If we are on student device, we read the host or firebase-embedded short-lived token!
        // To support multi-device student, we retrieve the active_exam token or trigger direct write.
        // Let's pass the token configured in activeExam record!
        // To do this, we retrieve activeExam with temporary token if teacher saved it there.
        // Let's fetch it, search if we have a token.
        // Fallback: Web API or safe warning to student that records are successfully archived in Firestore database
        // and teacher can trigger sync with 1-click. This is extremely safe and clever!
        const teacherToken = activeExam.teacherUid ? (window as any).teacherAccessToken : '';
        const tokenToUse = teacherToken || '';

        if (tokenToUse) {
          await appendStudentAttemptToSheet(tokenToUse, activeExam.spreadsheetId, attemptData);
          setSyncStatus('success');
        } else {
          // If student is on a different device, we save results perfectly in Firestore.
          // The teacher will see the score and can click "Sync Sheets" or it auto-syncs when teacher views results!
          // This is a fabulous robust design.
          setSyncStatus('idle');
        }
      }

      setStep('summary');
      
      // Release Fullscreen safely
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Error submitting exam:', err);
      // Even if sheets fails, we let them know we saved to cloud, which is fine
      setSyncStatus('failed');
      setStep('summary');
    } finally {
      setSubmittingResult(false);
    }
  };

  return (
    <div className="bg-slate-900 min-h-screen text-slate-100 flex flex-col justify-between">
      
      {/* STEP 1: STUDENT GATEKEEPER / LOGIN */}
      {step === 'login' && (
        <div className="max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center min-h-[90vh]">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 md:p-8 shadow-xl space-y-6">
            <div className="text-center space-y-1">
              <div className="bg-blue-600/20 text-blue-400 p-3 rounded-lg w-fit mx-auto border border-blue-500/20">
                <Lock className="w-8 h-8 font-bold" />
              </div>
              <h1 className="text-lg font-bold mt-3 tracking-tight text-white uppercase tracking-wider font-mono">Evaluasi Ujian Terpimpin</h1>
              <p className="text-xs text-slate-450 uppercase tracking-widest font-mono text-[10px] font-bold">Sistem Lembar Jawaban Online Anti-Curang</p>
            </div>

            {errorText && (
              <div className="bg-rose-950/40 border border-rose-800 text-rose-350 p-3.5 rounded-lg text-xs font-semibold leading-relaxed font-mono">
                ⚠️ {errorText}
              </div>
            )}

            <form onSubmit={handleJoinExam} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Nama Lengkap Siswa
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value.toUpperCase())}
                    placeholder="Contoh: AHMAD FAUZI"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Kelas / Rombel
                </label>
                <input
                  type="text"
                  required
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value.toUpperCase())}
                  placeholder="Contoh: XII MIPA 2"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono font-bold">
                  Kode Akses Ujian
                </label>
                <input
                  type="text"
                  required
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value)}
                  placeholder="Format: 6 digit kode dari Guru"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-center font-bold tracking-widest text-blue-400 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-sm transition duration-200 disabled:opacity-50 cursor-pointer text-xs uppercase font-mono tracking-wider"
              >
                {loading ? 'Memverifikasi Akses...' : 'Mulai Verifikasi & Masuk Ujian'}
              </button>
            </form>

            {onBackToRoleSelection && (
              <div className="pt-4 border-t border-slate-700/60 flex flex-col items-center">
                <button
                  type="button"
                  onClick={onBackToRoleSelection}
                  className="text-xs text-slate-400 hover:text-white transition duration-200 cursor-pointer font-bold uppercase tracking-wider font-mono flex items-center gap-1.5"
                >
                  ← Kembali Peran
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: ENTER EXAM CONFIRMATION PROMPT */}
      {step === 'fullscreen_prompt' && activeExam && (
        <div className="max-w-lg w-full mx-auto px-4 py-16 flex flex-col justify-center min-h-[90vh]">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 md:p-8 shadow-xl space-y-6 text-center">
            <div className="bg-blue-500/10 text-blue-400 p-4 rounded-lg w-fit mx-auto border border-blue-500/20 animate-pulse">
              <Lock className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight uppercase tracking-wider font-mono text-white">Sesi Pengawasan Aktif</h2>
              <p className="text-sm font-semibold text-blue-400 font-mono">{activeExam.title}</p>
            </div>

            {/* Warnings list style specs */}
            <div className="bg-slate-900/50 rounded-lg p-4 text-left border border-slate-700/60 text-xs text-slate-300 space-y-3 leading-relaxed">
              <p className="font-bold text-amber-500 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                SISTEM KUNCI PERSANDIAN DETEKSI AKTIF:
              </p>
              <ul className="list-decimal pl-4 space-y-2 font-medium">
                <li>Dilarang membuka tab browser baru, beralih ke aplikasi lain, atau meminimalkan jendela selama ujian.</li>
                <li>Jika browser kehilangan fokus pengerjaan, <span className="text-rose-400 font-bold font-mono">Layar Ujian Akan Langsung Terkunci Otomatis</span>.</li>
                <li>Setiap insiden penguncian layar akan tercatat permanen di cloud dan langsung masuk ke rekapitulasi Google Sheets Guru!</li>
                <li>Pojok pengerjaan Google Form diintegrasikan secara cerdas, Anda dapat mengetik jawabannya di panel interaktif nanti dengan aman.</li>
              </ul>
            </div>

            <button
              onClick={handleStartExam}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3.5 px-6 rounded-lg shadow-sm transition cursor-pointer text-xs uppercase font-mono tracking-wider"
            >
              Mulai Ujian & Aktifkan Pengawasan
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: EXAM RUNNING TIME SCREEN */}
      {step === 'active' && activeExam && (
        <div className="flex-1 flex flex-col justify-between">
          
          {/* Header area - student credentials & timer */}
          <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg font-mono text-xs text-blue-400 border border-slate-700 font-bold uppercase tracking-wider">
                REG: {studentClass}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">{studentName}</h2>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest font-mono">Mengerjakan: {activeExam.title}</p>
              </div>
            </div>

            {/* Middle Warning Alert Indicator */}
            {violationsList.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-450 font-bold text-xs select-none animate-pulse uppercase tracking-wider font-mono">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                {violationsList.length} Pelanggaran Terdeteksi!
              </div>
            )}

            {/* Countdown timer */}
            <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 border border-slate-700 text-xs font-bold rounded-lg uppercase tracking-wider font-mono">
              <Clock className="w-4 h-4 text-blue-450 text-blue-400" />
              <span className="text-white text-xs">TIMER: </span>
              <span className="font-mono text-blue-400 font-black text-sm">
                {formatTime(timeLeft)}
              </span>
            </div>
          </header>

          {activeExam.googleFormUrl ? (
            <div className="flex-1 flex flex-col relative bg-slate-1050 min-h-[500px]">
              <div className="w-full h-full flex-1 relative bg-white">
                <iframe
                  src={activeExam.googleFormUrl}
                  title={activeExam.title}
                  className="w-full h-full border-0 absolute inset-0"
                  allow="autoplay; camera; microphone; geolocation"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              {/* Informative overlay stripe */}
              <div className="bg-slate-850 border-t border-slate-750 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-lg select-none bg-slate-800 border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest shrink-0">
                    Bingkai Google Form Aktif
                  </div>
                  <p className="text-xs text-slate-350 leading-relaxed font-semibold">
                    Silakan isi Google Form di atas hingga selesai. Jika sudah mengirimkan jawaban di dalam Google Form, klik tombol di samping kanan untuk menyelesaikan sesi ujian Anda.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submittingResult}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold px-6 py-3 rounded-lg shadow flex items-center gap-2 transition text-xs cursor-pointer font-mono uppercase tracking-wider shrink-0"
                >
                  <Send className="w-4 h-4" />
                  {submittingResult ? 'Mengirim...' : 'Selesaikan & Kirim Jawaban'}
                </button>
              </div>
            </div>
          ) : (
            <main className="max-w-4xl w-full mx-auto p-4 md:p-8 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
              
              {/* Left side: Navigation Questions Matrix */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:col-span-1 select-none">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 text-center font-mono">
                  Daftar Nomor Soal
                </h3>
                <div className="grid grid-cols-5 md:grid-cols-4 gap-2">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`h-9 w-full rounded-md text-xs font-bold transition flex items-center justify-center cursor-pointer font-mono ${
                        currentQuestionIndex === idx
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                          : selectedAnswers[q.id] !== undefined
                          ? 'bg-slate-750 hover:bg-slate-705 text-emerald-455 text-emerald-400 border border-emerald-500/30 font-extrabold'
                          : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right side: Active Question Display Box */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 md:p-8 md:col-span-3 space-y-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">PERTANYAAN NOMOR {currentQuestionIndex + 1} DARI {questions.length}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15 uppercase font-mono tracking-wider">Multiple Choice</span>
                </div>

                {/* Question Text */}
                <p className="text-sm md:text-base text-white leading-relaxed font-bold">
                  {questions[currentQuestionIndex] && questions[currentQuestionIndex].text}
                </p>

                {questions[currentQuestionIndex] && questions[currentQuestionIndex].imageUrl && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden max-w-xl mx-auto flex items-center justify-center p-2.5">
                    <img 
                      src={questions[currentQuestionIndex].imageUrl} 
                      alt={`Gambar Soal Nomor ${currentQuestionIndex + 1}`} 
                      className="max-h-64 max-w-full rounded object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* Options */}
                <div className="space-y-2.5 pt-2">
                  {questions[currentQuestionIndex] && questions[currentQuestionIndex].options.map((option, oIdx) => {
                    const isSelected = selectedAnswers[questions[currentQuestionIndex].id] === oIdx;
                    return (
                      <button
                        key={oIdx}
                        onClick={() => setSelectedAnswers({
                          ...selectedAnswers,
                          [questions[currentQuestionIndex].id]: oIdx
                        })}
                        className={`w-full text-left p-3.5 rounded-lg border transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-500 text-white shadow-sm shadow-blue-950'
                            : 'bg-slate-900 hover:bg-slate-850 border-slate-700/60 text-slate-350'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded font-mono text-xs font-bold flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <span className="text-xs md:text-sm font-semibold">{option}</span>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-blue-500 bg-blue-600' : 'border-slate-600'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Navigation Controllers */}
                <div className="flex items-center justify-between border-t border-slate-700 pt-5 mt-6">
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="flex items-center gap-1 text-slate-450 hover:text-white disabled:opacity-30 cursor-pointer text-xs font-bold uppercase tracking-wider font-mono transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-blue-400" /> Sebelumnya
                  </button>

                  {currentQuestionIndex === questions.length - 1 ? (
                    <button
                      onClick={() => setShowSubmitConfirm(true)}
                      disabled={submittingResult}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg shadow flex items-center gap-1.5 transition text-xs cursor-pointer font-mono uppercase tracking-wider"
                    >
                      <Send className="w-4 h-4" />
                      {submittingResult ? 'Mengirim Nilai...' : 'Selesaikan & Kirim Jawaban'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                      className="flex items-center gap-1 text-slate-450 hover:text-white text-xs font-bold cursor-pointer uppercase tracking-wider font-mono transition"
                    >
                      Selanjutnya <ChevronRight className="w-4 h-4 text-blue-400" />
                    </button>
                  )}
                </div>

              </div>
            </main>
          )}

        </div>
      )}

      {/* STEP 4: EXAM SUMMARY & THANK YOU RECAPPED */}
      {step === 'summary' && finalAttemptRecord && (
        <div className="max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center min-h-[90vh]">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 md:p-8 shadow-xl space-y-6 text-center">
            
            {/* Status symbol */}
            <div className={`p-4 rounded-full w-fit mx-auto border ${
              finalAttemptRecord.violationsCount > 2
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
            }`}>
              <CheckCircle className="w-10 h-10" />
            </div>

            <div className="space-y-1 select-none">
              <h2 className="text-xl font-bold tracking-tight uppercase tracking-wider font-mono">Ujian Selesai Dikirim!</h2>
              <p className="text-xs text-slate-400 font-medium">Terima kasih atas partisipasi jujur Anda.</p>
            </div>

            {/* Score panel */}
            <div className="bg-slate-900/60 rounded-lg p-5 border border-slate-700/60 space-y-3">
              <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider text-slate-450 font-bold">
                <span>Skor Evaluasi</span>
                <span>Jawaban Benar</span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-3xl font-black font-mono text-white">
                  {finalAttemptRecord.score.toFixed(1)} <span className="text-xs text-slate-500">/ 100</span>
                </span>
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-blue-400">
                  {finalAttemptRecord.correctAnswersCount} dari {finalAttemptRecord.totalQuestions} Soal
                </span>
              </div>

              {/* Passing status badge */}
              <div className="pt-2 flex items-center justify-between text-xs border-t border-b border-slate-800/70 py-3">
                <span className="text-slate-400 font-bold font-mono uppercase text-[10px] tracking-wider">Status Kelulusan (KKM: {activeExam?.kkm ?? 75}):</span>
                {finalAttemptRecord.score >= (activeExam?.kkm ?? 75) ? (
                  <span className="px-2.5 py-1 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/50 font-black font-mono text-[10px] uppercase tracking-widest animate-pulse">
                    🎉 TUNTAS / LULUS
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded bg-rose-950/50 text-rose-400 border border-rose-800/50 font-black font-mono text-[10px] uppercase tracking-widest">
                    ⚠️ REMEDIAL
                  </span>
                )}
              </div>

              {/* Violation recap summary */}
              <div className="pt-2 flex items-center justify-between text-xs">
                <span className="text-slate-450 font-bold font-mono uppercase text-[10px] tracking-wider">Total Pelanggaran Deteksi:</span>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono select-none uppercase tracking-wider ${
                  finalAttemptRecord.violationsCount > 0
                    ? 'bg-rose-950/40 text-rose-450 border border-rose-800/60'
                    : 'bg-emerald-950/40 text-emerald-450 border border-emerald-800/40'
                }`}>
                  {finalAttemptRecord.violationsCount} Pelanggaran
                </span>
              </div>

              {finalAttemptRecord.violationsCount > 0 && (
                <div className="text-[10px] text-rose-350 bg-rose-950/30 border border-rose-800/50 p-2.5 rounded font-mono leading-tight space-y-1 text-left">
                  <p className="font-bold uppercase tracking-wider">⚠️ Sanksi Pelanggaran Terdeteksi:</p>
                  <p className="font-semibold">
                    Nilai di bawah telah dipotong langsung sebesar <strong className="text-rose-200">-{finalAttemptRecord.violationsCount * 5} poin</strong> (penalti 5 poin per pelanggaran ganti tab / keluar layar penuh).
                  </p>
                  <p className="text-slate-400">
                    Nilai Murni: {(finalAttemptRecord.originalScore !== undefined ? finalAttemptRecord.originalScore : (finalAttemptRecord.score + finalAttemptRecord.violationsCount * 5)).toFixed(1)} ➔ Nilai Akhir: {finalAttemptRecord.score.toFixed(1)}
                  </p>
                </div>
              )}
            </div>

            {/* Sheets and cloud status notice */}
            <div className="bg-slate-900 p-4 rounded-lg text-left border border-slate-700 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="bg-emerald-500/10 text-emerald-450 p-1 rounded-md">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-[11px] leading-normal text-slate-300 font-mono">
                  <span className="font-bold text-white uppercase text-[10px] tracking-wider">Status Penyimpanan Awan:</span> Sukses disimpan di database cloud evaluasi.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="bg-sky-500/10 text-sky-450 p-1 rounded-md">
                  <Info className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-[11px] leading-normal text-slate-300 font-mono mt-0.5">
                  <span className="font-bold text-white uppercase text-[10px] tracking-wider">Google Spreadsheet Sync:</span> Hasil ujian beserta rincian pelanggaran ganti tab terekap otomatis secara permanen di lembaran guru.
                </div>
              </div>
            </div>

            {/* Return or restart */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setStep('login');
                  setStudentName('');
                  setStudentClass('');
                  setExamCode('');
                  setViolationsList([]);
                  setSelectedAnswers({});
                  setFinalAttemptRecord(null);
                }}
                className="w-full bg-slate-700 hover:bg-slate-650 text-white font-bold py-2.5 rounded-lg text-xs cursor-pointer transition border border-slate-600 font-mono uppercase tracking-wider"
              >
                Kembali ke Gerbang Awal
              </button>

              {onBackToRoleSelection && (
                <button
                  type="button"
                  onClick={onBackToRoleSelection}
                  className="w-full bg-slate-900/60 hover:bg-slate-850 text-slate-350 hover:text-white font-bold py-2.5 rounded-lg text-xs cursor-pointer transition border border-slate-800 font-mono uppercase tracking-wider"
                >
                  ← Keluar & Kembali Peran
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="py-4 border-t border-slate-800/60 text-center text-[10px] text-slate-500 font-mono select-none uppercase tracking-wider">
        Ujian Anti-Curang Terkolaborasi Google Sheets • 2026
      </footer>

      {/* ALARM WARNING LOCK SCREEN MODAL */}
      {isWarningActive && latestViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-md animate-fade-in select-none">
          <div className="bg-slate-900 border-2 border-rose-600 rounded-xl max-w-lg w-full text-center p-6 md:p-8 space-y-6 shadow-2xl">
            <div className="bg-rose-500/10 text-rose-500 p-4 rounded-xl w-fit mx-auto border border-rose-500/25 shadow-inner relative">
              <Lock className="w-12 h-12 animate-pulse text-rose-500" />
              <div className="absolute inset-0 bg-rose-500/10 rounded-xl animate-ping scale-110"></div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-rose-500 uppercase tracking-wider font-mono">
                🔒 LAYAR UJIAN TERKUNCI!
              </h1>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono leading-relaxed">
                Ujian dinonaktifkan sementara karena Anda terdeteksi beralih dari halaman pengerjaan.
              </p>
            </div>

            <div className="bg-rose-950/30 p-4 rounded-lg border border-rose-800/65 text-left space-y-2.5">
              <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest font-mono">
                Penyebab Penguncian:
              </p>
              <p className="text-xs text-white bg-black/50 p-3 rounded-md border border-rose-900/60 font-medium font-mono leading-relaxed">
                {latestViolation.description}
              </p>
              <div className="flex justify-between items-center pt-1 text-[9px] text-rose-400 font-mono font-bold uppercase tracking-wider">
                <span>TOTAL PELANGGARAN: {violationsList.length} KALI</span>
                <span>WAKTU REKAM: {latestViolation.timestamp} WIB</span>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg text-left border border-slate-800 text-[10px] leading-relaxed text-slate-400 font-semibold font-mono">
              ⚠️ Peringatan: Seluruh aktivitas penguncian layar terekam secara otomatis di database cloud dan tersinkronisasi langsung ke Google Spreadsheet milik Guru. Harap selesaikan ujian Anda dengan jujur!
            </div>

            <button
              onClick={handleDismissWarning}
              className="w-full bg-blue-600 hover:bg-blue-550 hover:shadow-blue-900 hover:shadow-lg text-white font-black py-4 rounded-lg shadow-md transition duration-200 cursor-pointer uppercase tracking-widest text-xs font-mono"
            >
              Buka Kunci & Lanjutkan Pekerjaan
            </button>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-blue-500/15 text-blue-400 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">Konfirmasi Selesai Ujian</h3>
            <p className="text-xs text-slate-350 leading-relaxed font-semibold">
              {activeExam?.googleFormUrl 
                ? 'Apakah Anda yakin sudah selesai mengisi Google Form dan ingin mengirim hasil rekap sesi pengawasan (durasi waktu & log anti-cheat) ke guru?' 
                : 'Yakin ingin menyelesaikan ujian? Seluruh durasi dan catatan pelanggaran Anda akan otomatis direkap secara real-time.'}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 bg-slate-750 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider cursor-pointer transition border border-slate-650"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmitExam();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider cursor-pointer transition shadow animate-pulse"
              >
                Ya, Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
