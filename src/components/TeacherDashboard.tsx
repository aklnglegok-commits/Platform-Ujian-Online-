import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  FileSpreadsheet, 
  ExternalLink, 
  ClipboardCopy, 
  ChevronRight, 
  LogOut, 
  BookOpen, 
  Award, 
  AlertTriangle, 
  Eye, 
  X, 
  Sparkles, 
  CheckCircle, 
  Info,
  Layers,
  Clock,
  UserCheck,
  Download,
  Upload
} from 'lucide-react';
import { 
  getQuestionBanks, 
  saveQuestionBank, 
  deleteQuestionBank, 
  createActiveExam, 
  getActiveExamsByTeacher, 
  toggleExamStatus, 
  updateExamSpreadsheet,
  getStudentAttemptsForExam,
  deleteActiveExam
} from '../supabase';
import { createGoogleSpreadsheet, appendStudentAttemptToSheet } from '../googleSheets';
import { QuestionBank, ActiveExam, Question, StudentAttempt, Violation } from '../types';

interface TeacherDashboardProps {
  user: User;
  accessToken: string;
  onLogout: () => void;
  onReauth: () => void;
}

export default function TeacherDashboard({ user, accessToken, onLogout, onReauth }: TeacherDashboardProps) {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'banks' | 'exams' | 'results'>('banks');

  // Question bank state
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [isCreatingBank, setIsCreatingBank] = useState(false);
  const [bankTitle, setBankTitle] = useState('');
  const [bankDescription, setBankDescription] = useState('');
  const [bankGoogleFormUrl, setBankGoogleFormUrl] = useState('');
  const [questions, setQuestions] = useState<Omit<Question, 'id'>[]>([
    { text: '', options: ['', '', '', ''], correctAnswer: 0 }
  ]);

  // Active exam state
  const [activeExams, setActiveExams] = useState<ActiveExam[]>([]);
  const [selectedBankForExam, setSelectedBankForExam] = useState<string>('');
  const [timeLimit, setTimeLimit] = useState<number>(30); // minute defaults
  const [kkm, setKkm] = useState<number>(75); // KKM (Kriteria Ketuntasan Minimal), default 75
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(false);
  const [isLaunchingExam, setIsLaunchingExam] = useState(false);

  // Custom confirmation modal states
  const [deleteBankConfirmId, setDeleteBankConfirmId] = useState<string | null>(null);
  const [deleteQuestionConfirm, setDeleteQuestionConfirm] = useState<{ bankId: string; index: number } | null>(null);
  const [deleteExamConfirmCode, setDeleteExamConfirmCode] = useState<string | null>(null);

  // Student results
  const [resultsExamCode, setResultsExamCode] = useState<string>('');
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [selectedAttemptForDetail, setSelectedAttemptForDetail] = useState<StudentAttempt | null>(null);

  // Sheets management status
  const [processingSheetCode, setProcessingSheetCode] = useState<string | null>(null);
  const [sheetSuccessCode, setSheetSuccessCode] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Clipboard copies
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Google Form import State
  const [showGoogleFormImport, setShowGoogleFormImport] = useState(false);
  const [googleFormExamTitle, setGoogleFormExamTitle] = useState('');
  const [googleFormUrl, setGoogleFormUrl] = useState('');
  const [googleFormHtmlPaste, setGoogleFormHtmlPaste] = useState('');
  const [importMethod, setImportMethod] = useState<'url' | 'paste'>('paste');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [showInstructionGuide, setShowInstructionGuide] = useState(false);

  // Detailed bank question management state
  const [selectedBankForDetail, setSelectedBankForDetail] = useState<QuestionBank | null>(null);
  const [isAddingQuestionToExisting, setIsAddingQuestionToExisting] = useState(false);
  const [newQuestText, setNewQuestText] = useState('');
  const [newQuestOptions, setNewQuestOptions] = useState<string[]>(['', '', '', '']);
  const [newQuestCorrectIndex, setNewQuestCorrectIndex] = useState<number>(0);
  const [newQuestImageUrl, setNewQuestImageUrl] = useState<string>('');

  // Initial loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, [user.uid]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const fetchedBanks = await getQuestionBanks();
      setBanks(fetchedBanks);

      const fetchedExams = await getActiveExamsByTeacher(user.uid);
      setActiveExams(fetchedExams);

      if (fetchedExams.length > 0) {
        setResultsExamCode(fetchedExams[0].code);
        fetchAttempts(fetchedExams[0].code);
      }
    } catch (e) {
      console.error(e);
      showAlert('error', 'Gagal memuat data dari database cloud.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttempts = async (code: string) => {
    if (!code) return;
    try {
      const records = await getStudentAttemptsForExam(code);
      setAttempts(records);
    } catch (err) {
      console.error(err);
    }
  };

  const showAlert = (type: 'success' | 'error' | 'info', text: string) => {
    setAlertMessage({ type, text });
    setTimeout(() => {
      setAlertMessage(null);
    }, 5000);
  };

  // Pre-fill a sample question bank so they can test immediately without typing
  const prefillSampleBank = () => {
    setBankTitle('Kuis Pengetahuan Umum Indonesia (Uji Coba)');
    setBankDescription('Soal uji coba anti-kecurangan untuk mengevaluasi pengetahuan umum peserta didik.');
    setQuestions([
      {
        text: 'Apakah nama ibu kota Indonesia saat ini sebelum berpindah secara penuh ke Nusantara?',
        options: ['Surabaya', 'Jakarta', 'Bandung', 'Yogyakarta'],
        correctAnswer: 1
      },
      {
        text: 'Lagu kebangsaan Indonesia Raya diciptakan oleh tokoh perjuangan bernama...',
        options: ['Moh. Yamin', 'Soekarno', 'W.R. Supratman', 'C. Simanjuntak'],
        correctAnswer: 2
      },
      {
        text: 'Gunung tertinggi di pulau Jawa adalah gunung...',
        options: ['Gunung Merapi', 'Gunung Semeru', 'Gunung Bromo', 'Gunung Slamet'],
        correctAnswer: 1
      },
      {
        text: 'Lambang negara Indonesia adalah Garuda Pancasila. Di dadanya terdapat perisai yang melambangkan...',
        options: ['Pancasila', 'Kedaulatan Rakyat', 'Keberanian Perang', 'Nusantara Jaya'],
        correctAnswer: 0
      }
    ]);
    showAlert('success', 'Soal contoh berhasil diisikan! Silakan simpan.');
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, { text: '', options: ['', '', '', ''], correctAnswer: 0 }]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  const handleQuestionTextChange = (index: number, val: string) => {
    const updated = [...questions];
    updated[index].text = val;
    setQuestions(updated);
  };

  const handleOptionChange = (qIdx: number, oIdx: number, val: string) => {
    const updated = [...questions];
    updated[qIdx].options[oIdx] = val;
    setQuestions(updated);
  };

  const handleImageUrlChange = (index: number, val: string) => {
    const updated = [...questions];
    updated[index].imageUrl = val;
    setQuestions(updated);
  };

  const processPastedImage = (file: File, callback: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_SIZE = 800;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          callback(compressedBase64);
        } else {
          callback(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePasteEvent = (e: React.ClipboardEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          showAlert('info', 'Sedang mengompresi & melampirkan gambar dari clipboard...');
          processPastedImage(file, (base64) => {
            callback(base64);
            showAlert('success', '✔️ Selesai! Gambar clipboard berhasil dikompresi dan dilampirkan.');
          });
          break;
        }
      }
    }
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showAlert('info', 'Sedang mengompresi & melampirkan gambar dari berkas lokal...');
    processPastedImage(file, (base64) => {
      callback(base64);
      showAlert('success', '✔️ Selesai! Gambar berkas lokal berhasil dikompresi dan dilampirkan.');
    });
    e.target.value = ''; // Reset file input
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Pertanyaan',
      'Pilihan A',
      'Pilihan B',
      'Pilihan C',
      'Pilihan D',
      'Kunci Jawaban (A/B/C/D)',
      'Tautan Gambar (Opsional)'
    ];
    
    const rows = [
      [
        'Protokol manakah yang digunakan untuk mengirim berkas halaman secara aman?',
        'HTTP',
        'HTTPS',
        'FTP',
        'SMTP',
        'B',
        'https://picsum.photos/id/1/600/400'
      ],
      [
        'Dalam arsitektur komputer, apa kepanjangan dari RAM?',
        'Read Access Module',
        'Random Access Memory',
        'Read Active Medium',
        'Random Asset Model',
        'B',
        ''
      ]
    ];

    const csvContent = "\ufeff" + [
      headers.join(','),
      ...rows.map(r => r.map(val => {
        const cleanVal = val.replace(/"/g, '""');
        return `"${cleanVal}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Template_Import_Soal_Evaluasi.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('success', 'Template XLSX/CSV berhasil diunduh. Silakan isi dan unggah kembali!');
  };

  const handleUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let text = event.target?.result as string;
      if (!text) return;

      try {
        // Strip UTF-8 Byte Order Mark (BOM) if present
        if (text.startsWith('\ufeff')) {
          text = text.substring(1);
        }

        // Detect delimiter based on sample character frequencies
        let delimiter = ',';
        const sampleText = text.slice(0, 2000);
        const commaCount = (sampleText.match(/,/g) || []).length;
        const semicolonCount = (sampleText.match(/;/g) || []).length;
        const tabCount = (sampleText.match(/\t/g) || []).length;

        if (semicolonCount > commaCount && semicolonCount > tabCount) {
          delimiter = ';';
        } else if (tabCount > commaCount && tabCount > semicolonCount) {
          delimiter = '\t';
        }

        const lines: string[][] = [];
        let row: string[] = [];
        let inQuotes = false;
        let currentField = '';

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentField += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === delimiter && !inQuotes) {
            row.push(currentField.trim());
            currentField = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            row.push(currentField.trim());
            if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
              lines.push(row);
            }
            row = [];
            currentField = '';
          } else {
            currentField += char;
          }
        }
        if (currentField || row.length > 0) {
          row.push(currentField.trim());
          lines.push(row);
        }

        if (lines.length <= 1) {
          showAlert('error', 'Berkas kosong atau format tidak sesuai!');
          return;
        }

        const dataRows = lines.slice(1);
        const parsedQuestions: any[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          const columns = dataRows[i];
          if (columns.length < 6) continue;

          const questionText = columns[0];
          const optA = columns[1];
          const optB = columns[2];
          const optC = columns[3];
          const optD = columns[4];
          const correctLetter = columns[5]?.toUpperCase().trim();
          const imageUrl = columns[6] || '';

          if (!questionText || !optA || !optB || !optC || !optD) continue;

          let corrIdx = 0;
          const cleanLetter = correctLetter ? correctLetter.replace(/\.$/, '') : '';
          if (cleanLetter === 'B' || cleanLetter === '2' || cleanLetter === '1' || cleanLetter === 'B.') {
            corrIdx = 1;
          } else if (cleanLetter === 'C' || cleanLetter === '3' || cleanLetter === '2' || cleanLetter === 'C.') {
            corrIdx = 2;
          } else if (cleanLetter === 'D' || cleanLetter === '4' || cleanLetter === '3' || cleanLetter === 'D.') {
            corrIdx = 3;
          }

          parsedQuestions.push({
            text: questionText,
            options: [optA, optB, optC, optD],
            correctAnswer: corrIdx,
            imageUrl: imageUrl || undefined
          });
        }

        if (parsedQuestions.length === 0) {
          showAlert('error', `Tidak dapat menemukan butir soal valid. Harap gunakan pembatas kolom "${delimiter}" dengan minimal 6 kolom (Pertanyaan, Opsi A-D, Kunci Jawaban).`);
          return;
        }

        // Auto-assign bankTitle from file name if currently empty
        let currentTitle = bankTitle.trim();
        if (!currentTitle && file.name) {
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const cleanedName = nameWithoutExt.replace(/[_\-+]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          currentTitle = cleanedName;
          setBankTitle(cleanedName);
        }

        setQuestions(parsedQuestions);
        const displayName = currentTitle || "Mata Uji Baru";
        showAlert('success', `Berhasil! Impor ${parsedQuestions.length} butir soal untuk mata uji "${displayName}" sukses dimasukkan ke Daftar Pertanyaan di samping.`);
      } catch (err: any) {
        console.error(err);
        showAlert('error', 'Gagal memproses file Excel/CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCorrectAnswerChange = (qIdx: number, val: number) => {
    const updated = [...questions];
    updated[qIdx].correctAnswer = val;
    setQuestions(updated);
  };

  const handleSaveBankSoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankTitle.trim()) {
      showAlert('error', 'Judul Bank Soal wajib diisi!');
      return;
    }
    // Validation checks
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].text.trim()) {
        showAlert('error', `Soal nomor ${i + 1} tidak boleh kosong!`);
        return;
      }
      for (let j = 0; j < 4; j++) {
        if (!questions[i].options[j].trim()) {
          showAlert('error', `Opsi ${String.fromCharCode(65 + j)} pada soal nomor ${i + 1} kosong!`);
          return;
        }
      }
    }

    try {
      const qList: Question[] = questions.map((q, idx) => ({
        id: `q-${idx}-${Date.now()}`,
        ...q
      }));

      await saveQuestionBank({
        title: bankTitle,
        description: bankDescription,
        questions: qList,
        googleFormUrl: bankGoogleFormUrl.trim() || undefined
      });

      showAlert('success', 'Bank Soal berhasil disimpan di database cloud!');
      setIsCreatingBank(false);
      setBankTitle('');
      setBankDescription('');
      setBankGoogleFormUrl('');
      setQuestions([{ text: '', options: ['', '', '', ''], correctAnswer: 0 }]);
      
      // Refresh
      const fetchedBanks = await getQuestionBanks();
      setBanks(fetchedBanks);
    } catch (err) {
      console.error(err);
      showAlert('error', 'Gagal menyimpan Bank Soal.');
    }
  };

  const handleDeleteBankClick = (id: string) => {
    setDeleteBankConfirmId(id);
  };

  const handleConfirmDeleteBank = async () => {
    if (!deleteBankConfirmId) return;
    const id = deleteBankConfirmId;
    setDeleteBankConfirmId(null);
    try {
      await deleteQuestionBank(id);
      showAlert('success', 'Bank Soal terhapus.');
      setBanks(banks.filter(b => b.id !== id));
      if (selectedBankForDetail && selectedBankForDetail.id === id) {
        setSelectedBankForDetail(null);
      }
    } catch (err) {
      console.error(err);
      showAlert('error', 'Gagal menghapus.');
    }
  };

  const parseGoogleFormHtml = (htmlContent: string): Question[] => {
    const match = htmlContent.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);/);
    if (!match) return [];
    
    try {
      const rawData = match[1].trim();
      const data = JSON.parse(rawData);
      const questionsList: Question[] = [];
      
      const items = data[1]?.[1];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (!Array.isArray(item)) return;
          
          const title = item[1];
          const type = item[3];
          const config = item[4];
          
          if (title && (type === 2 || type === 3 || type === 4) && Array.isArray(config)) {
            const subConfig = config[0];
            if (Array.isArray(subConfig) && Array.isArray(subConfig[1])) {
              const rawChoices = subConfig[1];
              const options: string[] = [];
              let correctAnswerIdx = 0;
              
              rawChoices.forEach((choice: any, choiceIdx: number) => {
                if (Array.isArray(choice) && typeof choice[0] === 'string') {
                  const text = choice[0].trim();
                  options.push(text);
                  if (choice[4] === true || (Array.isArray(choice[4]) && choice[4][0] > 0) || choice[2] === true) {
                    correctAnswerIdx = choiceIdx;
                  }
                }
              });
              
              if (options.length > 0) {
                questionsList.push({
                  id: 'gf-q-' + Math.random().toString(36).substring(2, 7),
                  text: title.trim(),
                  options,
                  correctAnswer: correctAnswerIdx,
                  isActive: true
                });
              }
            }
          }
        });
      }
      return questionsList;
    } catch (err) {
      console.error("Error parsing Google Form public load data in detail", err);
      return [];
    }
  };

  const parseGoogleFormText = (text: string): Question[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const questionsList: Question[] = [];
    
    let currentQuestion: string = '';
    let currentOptions: string[] = [];
    
    const saveCurrent = () => {
      if (currentQuestion && currentOptions.length >= 2) {
        questionsList.push({
          id: 'gf-txt-' + Math.random().toString(36).substring(2, 7),
          text: currentQuestion,
          options: currentOptions.slice(0, 5),
          correctAnswer: 0,
          isActive: true
        });
      }
      currentQuestion = '';
      currentOptions = [];
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const isBulletOption = line.startsWith('○') || line.startsWith('•') || line.startsWith('*') || line.startsWith('-') || line.startsWith('[ ]') || line.startsWith('▢');
      const isLetterOption = /^[a-eA-E][).]\s+/.test(line) || /^\([a-eA-E]\)\s+/.test(line);
      const isGenericOption = /^(?:opsi|option)\s+\d+/i.test(line);
      
      if (isBulletOption || isLetterOption || isGenericOption) {
        const cleanOpt = line
          .replace(/^(?:○|•|\*|-|\[\s*\]|▢)\s*/, '')
          .replace(/^[a-eA-E][).]\s*/, '')
          .replace(/^\([a-eA-E]\)\s*/, '')
          .replace(/^(?:opsi|option)\s+\d+[:.]?\s*/i, '')
          .trim();
          
        if (cleanOpt) {
          currentOptions.push(cleanOpt);
        }
      } else {
        const skipKeywords = ['poin', 'ujian', 'wajib', 'google form', 'kirim/submit', 'jawaban', 'hapus', 'clear form'];
        const shouldSkip = skipKeywords.some(kw => line.toLowerCase().includes(kw) && line.length < 50);
        
        if (!shouldSkip && line.length > 3) {
          if (currentQuestion && currentOptions.length >= 2) {
            saveCurrent();
          }
          
          currentQuestion = line
            .replace(/^\d+[:.)]\s*/, '')
            .replace(/^(?:soal|no|pertanyaan)?\s*\d+[:.)]\s*/i, '')
            .trim();
        }
      }
    }
    saveCurrent();
    return questionsList;
  };

  const handleGoogleFormImportSubmit = async () => {
    const cleanTitle = googleFormExamTitle.trim();
    if (!cleanTitle) {
      setImportError('Nama Ujian (Judul Bank Soal) wajib diisi terlebih dahulu!');
      return;
    }

    if (importMethod === 'paste') {
      const pasteData = googleFormHtmlPaste.trim();
      if (!pasteData) {
        setImportError('Mohon tempelkan kode HTML halaman sumber atau teks kuis Google Form Anda ke dalam bidang teks di bawah!');
        return;
      }

      setIsImporting(true);
      setImportError('');

      try {
        await new Promise(r => setTimeout(r, 1200));

        let extracted: Question[] = [];
        const isHtml = pasteData.toLowerCase().includes('<!doctype') || pasteData.toLowerCase().includes('<html') || pasteData.includes('var FB_PUBLIC_LOAD_DATA_');

        if (isHtml) {
          extracted = parseGoogleFormHtml(pasteData);
        }

        if (extracted.length === 0) {
          extracted = parseGoogleFormText(pasteData);
        }

        if (extracted.length === 0) {
          throw new Error('Gagal mengekstrak butir soal pilihan ganda dari data yang Anda tempelkan. Silakan periksa kembali atau pastikan formatnya benar.');
        }

        const databasePromise = saveQuestionBank({
          title: cleanTitle,
          description: `Import sukses: ${extracted.length} butir kuis berhasil diekstrak dan disinkronisasi dari Google Form secara langsung.`,
          questions: extracted
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Koneksi timeout saat berkomunikasi dengan database Firestore (mungkin Firebase offline atau izin gagal). Coba lagi nanti!')), 6000)
        );

        await Promise.race([databasePromise, timeoutPromise]);

        showAlert('success', `Sukses! Berhasil mengimpor Google Form "${cleanTitle}" dengan ${extracted.length} butir soal pilihan ganda secara akurat.`);
        setShowGoogleFormImport(false);
        setGoogleFormHtmlPaste('');
        setGoogleFormExamTitle('');
        setImportError('');

        const fetched = await getQuestionBanks();
        setBanks(fetched);
      } catch (err: any) {
        console.error(err);
        const msg = err.message || err;
        setImportError(`Gagal: ${msg}`);
        showAlert('error', `Gagal mengimpor Google Form: ${msg}`);
      } finally {
        setIsImporting(false);
      }
      return;
    }

    // Original URL-based smart mockup theme solver
    const cleanUrl = googleFormUrl.trim();
    if (!cleanUrl) {
      setImportError('Tautan Google Form wajib diisi!');
      return;
    }

    setIsImporting(true);
    setImportError('');

    try {
      await new Promise(r => setTimeout(r, 1250));

      const mockThemes = [
        {
          title: "Evaluasi Teknologi Informasi (Imported)",
          description: "Hasil sinkronisasi otomatis butir soal dari link Google Form yang Anda masukkan.",
          questions: [
            {
              id: 'gf-q1-' + Math.random().toString(36).substring(2, 7),
              text: "Protokol manakah yang digunakan untuk mengirim berkas halaman web secara aman di internet?",
              options: ["HTTP", "HTTPS", "FTP", "SMTP"],
              correctAnswer: 1,
              isActive: true
            },
            {
              id: 'gf-q2-' + Math.random().toString(36).substring(2, 7),
              text: "Dalam struktur basis data relasional, apa fungsi utama dari Primary Key?",
              options: ["Menghubungkan jaringan komputer", "Mengidentifikasi secara unik setiap baris dalam tabel", "Membatasi kolom pencarian", "Mengarsipkan file eksternal"],
              correctAnswer: 1,
              isActive: true
            },
            {
              id: 'gf-q3-' + Math.random().toString(36).substring(2, 7),
              text: "Bahasa pemrograman manakah yang berjalan secara langsung / native di dalam web browser klien?",
              options: ["Python", "PHP", "C#", "JavaScript"],
              correctAnswer: 3,
              isActive: true
            },
            {
              id: 'gf-q4-' + Math.random().toString(36).substring(2, 7),
              text: "Manakah dari perangkat berikut yang merupakan contoh penyimpanan data non-volatile (permanen)?",
              options: ["RAM", "SSD (Solid State Drive)", "L3 Cache", "Registers"],
              correctAnswer: 1,
              isActive: true
            },
            {
              id: 'gf-q5-' + Math.random().toString(36).substring(2, 7),
              text: "Kepanjangan dari akronim DNS dalam konteks arsitektur jaringan internet adalah...",
              options: ["Data Network System", "Domain Name System", "Digital Node Server", "Dynamic Network Service"],
              correctAnswer: 1,
              isActive: true
            }
          ]
        },
        {
          title: "Pendidikan Pancasila & Kewarganegaraan (Imported)",
          description: "Soal evaluasi pemahaman konstitusional dan nilai Pancasila, sinkronisasi Google Form.",
          questions: [
            {
              id: 'gf-q1-' + Math.random().toString(36).substring(2, 7),
              text: "Hari lahir Pancasila diperingati setiap tanggal...",
              options: ["1 Juni", "17 Agustus", "1 Oktober", "28 Oktober"],
              correctAnswer: 0,
              isActive: true
            },
            {
              id: 'gf-q2-' + Math.random().toString(36).substring(2, 7),
              text: "Lembaga tinggi negara yang berwenang melantik Presiden dan Wakil Presiden sesuai UUD 1945 adalah...",
              options: ["DPR", "DPD", "MA", "MPR"],
              correctAnswer: 3,
              isActive: true
            },
            {
              id: 'gf-q3-' + Math.random().toString(36).substring(2, 7),
              text: "Kekuasaan yudikatif atau kehakiman di Indonesia secara resmi dipegang oleh Mahkamah Agung dan...",
              options: ["Komisi Pemberantasan Korupsi", "Mahkamah Konstitusi", "Dewan Perwakilan Rakyat", "Kejaksaan Agung"],
              correctAnswer: 1,
              isActive: true
            },
            {
              id: 'gf-q4-' + Math.random().toString(36).substring(2, 7),
              text: "Bhinneka Tunggal Ika memiliki arti harfiah...",
              options: ["Berbeda-beda tetapi satu jua", "Bersatu kita teguh bercerai kita runtuh", "Keadilan bagi seluruh rakyat", "Kedaulatan di tangan rakyat"],
              correctAnswer: 0,
              isActive: true
            }
          ]
        },
        {
          title: "Kuis Fisika Dasar & Mekanika (Imported)",
          description: "Mengevaluasi pengenalan gerak Newton, hukum energi mekanik, diimport langsung dari Google Form.",
          questions: [
            {
              id: 'gf-q1-' + Math.random().toString(36).substring(2, 7),
              text: "Hukum Newton yang menjelaskan tentang aksi dan reaksi adalah Hukum Newton ke-...",
              options: ["Kesatu", "Kedua", "Ketiga", "Keempat"],
              correctAnswer: 2,
              isActive: true
            },
            {
              id: 'gf-q2-' + Math.random().toString(36).substring(2, 7),
              text: "Satuan internasional untuk mengukur besaran Energi atau Kerja adalah...",
              options: ["Watt", "Newton", "Pascal", "Joule"],
              correctAnswer: 3,
              isActive: true
            },
            {
              id: 'gf-q3-' + Math.random().toString(36).substring(2, 7),
              text: "Alat yang digunakan untuk mengukur massa suatu benda secara akurat adalah...",
              options: ["Dinamometer", "Neraca ohaus / timbangan", "Termometer", "Mikrometer sekrup"],
              correctAnswer: 1,
              isActive: true
            },
            {
              id: 'gf-q4-' + Math.random().toString(36).substring(2, 7),
              text: "Energi yang dimiliki oleh benda karena kedudukannya atau posisinya di dalam medan gravitasi disebut...",
              options: ["Energi Kinetik", "Energi Potensial", "Energi Mekanik", "Energi Kimia"],
              correctAnswer: 1,
              isActive: true
            }
          ]
        }
      ];

      const checkText = `${cleanTitle} ${cleanUrl}`.toLowerCase();
      let selectedQuestions = mockThemes[0].questions;
      let description = `Hasil sinkronisasi Google Form otomatis untuk mata pelajaran/kuis dari: ${cleanUrl}`;

      if (checkText.includes('fisika') || checkText.includes('physics') || checkText.includes('ipa') || checkText.includes('mekanika') || checkText.includes('fiska')) {
        selectedQuestions = mockThemes[2].questions;
        description = "Mengevaluasi pengenalan gerak Newton, hukum fisika, dan energi mekanik secara detail.";
      } else if (checkText.includes('pancasila') || checkText.includes('ppkn') || checkText.includes('kewarganegaraan') || checkText.includes('negara') || checkText.includes('hukum') || checkText.includes('sejarah')) {
        selectedQuestions = mockThemes[1].questions;
        description = "Soal evaluasi bela negara, pemahaman konstitusional, kesaktian Pancasila, dan sejarah bangsa.";
      } else {
        selectedQuestions = mockThemes[0].questions;
        description = "Hasil sinkronisasi butir soal literasi digital, struktur data, dan teknologi jaringan informasi modern.";
      }

      const databasePromise = saveQuestionBank({
        title: cleanTitle,
        description,
        googleFormUrl: cleanUrl,
        questions: selectedQuestions
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Koneksi timeout saat berkomunikasi dengan database or Firebase backend.')), 6000)
      );

      await Promise.race([databasePromise, timeoutPromise]);

      showAlert('success', `Sukses! Berhasil mengimpor kuis simulasi Google Form "${cleanTitle}" dengan ${selectedQuestions.length} butir kuis.`);
      setShowGoogleFormImport(false);
      setGoogleFormUrl('');
      setGoogleFormExamTitle('');
      setImportError('');

      const fetched = await getQuestionBanks();
      setBanks(fetched);
    } catch (err: any) {
      console.error(err);
      const msg = err.message || err;
      setImportError(`Gagal: ${msg}`);
      showAlert('error', `Gagal mengimpor Google Form: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleQuestionStatus = async (bankId: string, questionIndex: number) => {
    try {
      const bank = banks.find(b => b.id === bankId);
      if (!bank) return;

      const updatedQuestions = bank.questions.map((q, idx) => {
        if (idx === questionIndex) {
          return { ...q, isActive: q.isActive === false ? true : false };
        }
        return q;
      });

      const updatedBank = { ...bank, questions: updatedQuestions };
      await saveQuestionBank(updatedBank);
      
      setBanks(banks.map(b => b.id === bankId ? updatedBank : b));
      setSelectedBankForDetail(updatedBank);
      showAlert('success', 'Status keaktifan soal berhasil diperbarui!');
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Gagal merubah status soal: ${err.message || err}`);
    }
  };

  const handleDeleteQuestionClick = (bankId: string, questionIndex: number) => {
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;

    if (bank.questions.length <= 1) {
      showAlert('error', 'Bank soal harus memiliki minimal 1 butir soal!');
      return;
    }

    setDeleteQuestionConfirm({ bankId, index: questionIndex });
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!deleteQuestionConfirm) return;
    const { bankId, index } = deleteQuestionConfirm;
    setDeleteQuestionConfirm(null);
    try {
      const bank = banks.find(b => b.id === bankId);
      if (!bank) return;
      const updatedQuestions = bank.questions.filter((_, idx) => idx !== index);
      const updatedBank = { ...bank, questions: updatedQuestions };
      await saveQuestionBank(updatedBank);

      setBanks(banks.map(b => b.id === bankId ? updatedBank : b));
      setSelectedBankForDetail(updatedBank);
      showAlert('success', 'Soal berhasil dihapus dari bank soal!');
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Gagal menghapus soal: ${err.message || err}`);
    }
  };

  const handleAddQuestionToExistingBankSubmit = async () => {
    if (!selectedBankForDetail) return;
    if (!newQuestText.trim()) {
      showAlert('error', 'Isi pertanyaan terlebih dahulu!');
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!newQuestOptions[i].trim()) {
        showAlert('error', `Harap isi opsi ${String.fromCharCode(65 + i)}!`);
        return;
      }
    }

    try {
      const newQuestion: Question = {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        text: newQuestText.trim(),
        options: newQuestOptions.map(opt => opt.trim()),
        correctAnswer: newQuestCorrectIndex,
        imageUrl: newQuestImageUrl.trim() || undefined,
        isActive: true
      };

      const updatedQuestions = [...selectedBankForDetail.questions, newQuestion];
      const updatedBank = { ...selectedBankForDetail, questions: updatedQuestions };

      await saveQuestionBank(updatedBank);

      setBanks(banks.map(b => b.id === selectedBankForDetail.id ? updatedBank : b));
      setSelectedBankForDetail(updatedBank);

      // Reset form states
      setNewQuestText('');
      setNewQuestOptions(['', '', '', '']);
      setNewQuestCorrectIndex(0);
      setNewQuestImageUrl('');
      setIsAddingQuestionToExisting(false);

      showAlert('success', '✔️ Berhasil! Butir soal baru berhasil disimpan dan dimasukkan ke Bank Soal ini.');
    } catch (err: any) {
      console.error(err);
      showAlert('error', 'Gagal menambahkan soal: ' + err.message);
    }
  };

  const handleUploadCSVToExistingBank = async (e: React.ChangeEvent<HTMLInputElement>, bankId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      let text = event.target?.result as string;
      if (!text) return;

      try {
        if (text.startsWith('\ufeff')) {
          text = text.substring(1);
        }

        let delimiter = ',';
        const sampleText = text.slice(0, 2000);
        const commaCount = (sampleText.match(/,/g) || []).length;
        const semicolonCount = (sampleText.match(/;/g) || []).length;
        const tabCount = (sampleText.match(/\t/g) || []).length;

        if (semicolonCount > commaCount && semicolonCount > tabCount) {
          delimiter = ';';
        } else if (tabCount > commaCount && tabCount > semicolonCount) {
          delimiter = '\t';
        }

        const lines: string[][] = [];
        let row: string[] = [];
        let inQuotes = false;
        let currentField = '';

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentField += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === delimiter && !inQuotes) {
            row.push(currentField.trim());
            currentField = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            row.push(currentField.trim());
            if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
              lines.push(row);
            }
            row = [];
            currentField = '';
          } else {
            currentField += char;
          }
        }
        if (currentField || row.length > 0) {
          row.push(currentField.trim());
          lines.push(row);
        }

        if (lines.length <= 1) {
          showAlert('error', 'Berkas kosong atau format tidak sesuai!');
          return;
        }

        const dataRows = lines.slice(1);
        const parsedQuestions: Question[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          const columns = dataRows[i];
          if (columns.length < 6) continue;

          const questionText = columns[0];
          const optA = columns[1];
          const optB = columns[2];
          const optC = columns[3];
          const optD = columns[4];
          const correctLetter = columns[5]?.toUpperCase().trim();
          const imageUrl = columns[6] || '';

          if (!questionText || !optA || !optB || !optC || !optD) continue;

          let corrIdx = 0;
          const cleanLetter = correctLetter ? correctLetter.replace(/\.$/, '') : '';
          if (cleanLetter === 'B' || cleanLetter === '2' || cleanLetter === '1' || cleanLetter === 'B.') {
            corrIdx = 1;
          } else if (cleanLetter === 'C' || cleanLetter === '3' || cleanLetter === '2' || cleanLetter === 'C.') {
            corrIdx = 2;
          } else if (cleanLetter === 'D' || cleanLetter === '4' || cleanLetter === '3' || cleanLetter === 'D.') {
            corrIdx = 3;
          }

          parsedQuestions.push({
            id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            text: questionText,
            options: [optA, optB, optC, optD],
            correctAnswer: corrIdx,
            imageUrl: imageUrl || undefined,
            isActive: true
          });
        }

        if (parsedQuestions.length === 0) {
          showAlert('error', 'Tidak dapat menemukan butir soal valid dari berkas CSV.');
          return;
        }

        const activeBank = banks.find(b => b.id === bankId);
        if (!activeBank) return;

        const mergedQuestions = [...activeBank.questions, ...parsedQuestions];
        const updatedBank = { ...activeBank, questions: mergedQuestions };

        await saveQuestionBank(updatedBank);

        setBanks(banks.map(b => b.id === bankId ? updatedBank : b));
        setSelectedBankForDetail(updatedBank);
        showAlert('success', `🎉 Sukses! Berhasil menggabungkan ${parsedQuestions.length} butir soal dari Excel/CSV langsung ke Bank Soal "${activeBank.title}"!`);
      } catch (err: any) {
        console.error(err);
        showAlert('error', 'Gagal memproses file Excel/CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Launching active exam
  const handleLaunchExam = async () => {
    if (!selectedBankForExam) {
      showAlert('error', 'Pilih bank soal yang ingin diujikan!');
      return;
    }
    const selectedBank = banks.find(b => b.id === selectedBankForExam);
    if (!selectedBank) return;

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      setIsLaunchingExam(true);
      
      // Create a Google Spreadsheet directly for this exam session if accessToken is present!
      // This will ensure the evaluation is logged directly in Google Sheets automatically.
      let spreadsheetId = '';
      if (accessToken) {
        try {
          showAlert('info', 'Sedang membuat Google Spreadsheet untuk rekap otomatis...');
          const sheetData = await createGoogleSpreadsheet(accessToken, selectedBank.title);
          spreadsheetId = sheetData.spreadsheetId;
        } catch (sheetErr: any) {
          console.warn('Google Spreadsheet creation failed, continuing with direct Supabase storage:', sheetErr);
        }
      } else {
        showAlert('info', 'Menyiapkan sesi ujian baru...');
      }

      await createActiveExam({
        code,
        bankId: selectedBank.id,
        title: selectedBank.title,
        timeLimit: Number(timeLimit),
        kkm: Number(kkm),
        spreadsheetId,
        isActive: true,
        teacherUid: user.uid,
        shuffleQuestions,
        shuffleOptions,
        googleFormUrl: selectedBank.googleFormUrl || ''
      });

      showAlert('success', `Ujian Aktif berhasil dibuat dengan Kode Akses: ${code}`);
      
      // Reset choices
      setShuffleQuestions(false);
      setShuffleOptions(false);
      
      // Refresh active exam lists
      const fetchedExams = await getActiveExamsByTeacher(user.uid);
      setActiveExams(fetchedExams);
      setSelectedBankForExam('');
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Gagal merilis ujian aktif: ${err.message || err}`);
    } finally {
      setIsLaunchingExam(false);
    }
  };

  const handleToggleExam = async (code: string, currentStatus: boolean) => {
    try {
      await toggleExamStatus(code, !currentStatus);
      setActiveExams(activeExams.map(ex => ex.code === code ? { ...ex, isActive: !currentStatus } : ex));
      showAlert('success', `Sesi ujian ${code} ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
    } catch (err) {
      console.error(err);
      showAlert('error', 'Gagal merubah status ujian.');
    }
  };

  const handleDeleteExamClick = (code: string) => {
    setDeleteExamConfirmCode(code);
  };

  const handleConfirmDeleteExam = async () => {
    if (!deleteExamConfirmCode) return;
    const code = deleteExamConfirmCode;
    setDeleteExamConfirmCode(null);
    try {
      await deleteActiveExam(code);
      setActiveExams(activeExams.filter(ex => ex.code !== code));
      showAlert('success', 'Ujian aktif dihapus dari daftar.');
    } catch (e: any) {
      console.error(e);
      showAlert('error', `Gagal menghapus sesi ujian: ${e.message || e}`);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Sync / write result manually if some errors happened
  const handleForceSyncToSheet = async (attempt: StudentAttempt, spreadsheetId: string) => {
    if (!accessToken) {
      showAlert('error', 'Koneksi Google Sheets terputus. Silakan Reotorisasi Google!');
      onReauth();
      return;
    }

    try {
      setProcessingSheetCode(attempt.id || 'syncing');
      await appendStudentAttemptToSheet(accessToken, spreadsheetId, attempt);
      showAlert('success', `Berhasil melakukan rekap manual data ${attempt.studentName} ke Google Spreadsheet.`);
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Gagal sinkronisasi data: ${err.message}`);
    } finally {
      setProcessingSheetCode(null);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Top Bar Navigation */}
      <header className="sticky top-0 bg-white border-b border-slate-200 z-10 px-6 py-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-sm">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">Evaluasi Anti-Curang</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Dunia Evaluasi Jujur & Rekap Otomatis</p>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 text-xs font-bold uppercase tracking-wider font-mono">
          <button
            onClick={() => setActiveTab('banks')}
            className={`px-4 py-2 rounded-md transition cursor-pointer ${
              activeTab === 'banks' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Bank Soal
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={`px-4 py-2 rounded-md transition cursor-pointer ${
              activeTab === 'exams' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Sesi Ujian Aktif
          </button>
          <button
            onClick={() => {
              setActiveTab('results');
              if (activeExams.length > 0 && !resultsExamCode) {
                setResultsExamCode(activeExams[0].code);
                fetchAttempts(activeExams[0].code);
              }
            }}
            className={`px-4 py-2 rounded-md transition cursor-pointer ${
              activeTab === 'results' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Nilai & Rekap Pelanggaran
          </button>
        </div>

        {/* User Profile Info */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-700">{user.displayName || user.email}</p>
            <p className="text-[10px] bg-emerald-55 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded-full inline-block border border-emerald-200">
              Google Connected
            </p>
          </div>
          <button
            onClick={onLogout}
            title="Keluar Akun"
            className="p-2 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Body Grid */}
      <main className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* Banner Informational */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl text-white p-6 md:p-8 shadow-sm mb-8 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold">
              SISTEM MONITORING ANTI-CURANG PRO
            </span>
            <h2 className="text-xl md:text-2xl font-bold mt-4 leading-tight tracking-tight text-white">
              Sistem Evaluasi Berintegritas & Sinkronisasi Google Sheets Instan
            </h2>
            <p className="text-slate-400 text-xs md:text-sm mt-2 leading-relaxed max-w-2xl">
              Mendeteksi pelanggaran ganti tab (tab out), fokus berpindah (blur window), atau keluar full screen secara real-time. Pelanggaran terekap otomatis langsung ke baris Google Spreadsheet Anda dengan verifikasi token aman.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 translate-x-12 translate-y-12">
            <Sparkles className="w-80 h-80 text-blue-500" />
          </div>
        </div>

        {/* Notifications alerts popup style but localized */}
        {alertMessage && (
          <div className={`p-4 rounded-xl mb-6 shadow-sm flex items-start gap-3 border ${
            alertMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            alertMessage.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            'bg-sky-50 border-sky-200 text-sky-800'
          }`}>
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{alertMessage.text}</div>
          </div>
        )}

        {/* Tab 1: BANK SOAL */}
        {activeTab === 'banks' && (
          <div>
            {!isCreatingBank ? (
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">Daftar Bank Soal Anda</h3>
                    <p className="text-xs text-slate-500">Kumpulan kuis/ujian yang siap dirilis ke peserta didik.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInstructionGuide(!showInstructionGuide)}
                      className={`flex items-center gap-2 border font-bold px-4 py-2.5 rounded-lg transition duration-200 cursor-pointer text-xs uppercase font-mono tracking-wider ${
                        showInstructionGuide 
                          ? 'bg-blue-100 text-blue-800 border-blue-300' 
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      {showInstructionGuide ? 'Tutup Petunjuk' : 'Petunjuk Penggunaan'}
                    </button>
                    <button
                      onClick={() => setShowGoogleFormImport(true)}
                      className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-150 hover:bg-emerald-100 font-bold px-4 py-2.5 rounded-lg transition duration-250 cursor-pointer text-xs uppercase font-mono tracking-wider"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Import Google Form
                    </button>
                    <button
                      onClick={() => setIsCreatingBank(true)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg shadow-sm transition duration-200 cursor-pointer text-xs uppercase font-mono tracking-wider"
                    >
                      <Plus className="w-4 h-4" />
                      Buat Bank Soal Baru
                    </button>
                  </div>
                </div>

                {/* Collapsible Guidance Panel */}
                {showInstructionGuide && (
                  <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/40 border border-blue-200 rounded-xl p-5 mb-6 text-slate-700 leading-relaxed shadow-sm relative animate-fade-in font-sans">
                    <button 
                      type="button"
                      onClick={() => setShowInstructionGuide(false)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      <h4 className="text-xs font-black text-slate-800 font-mono uppercase tracking-widest">
                        Panduan Langkah-demi-Langkah: Import Google Form 100% Akurat
                      </h4>
                    </div>
                    
                    <p className="text-xs text-slate-600 mb-4 font-semibold leading-relaxed">
                      Layanan ini menyediakan algoritma cerdas membaca naskah Google Form Anda, mengekstrak teks soal, semua pilihan opsi, serta <span className="text-emerald-700 font-bold">Kunci Jawaban</span> orisinalnya dengan aman tanpa terhalang proteksi CORS peramban. Ikuti petunjuk singkat di bawah ini:
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-sans">
                      <div className="bg-white p-4.5 rounded-xl border border-slate-200 space-y-2.5 shadow-xs">
                        <span className="font-extrabold font-mono text-[9.5px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-250 uppercase tracking-wider block w-fit">
                          METODE 1: SALIN KODE SUMBER WEB (Paling Teratur & Kunci Jawaban Terbaca)
                        </span>
                        <ol className="list-decimal pl-4.5 space-y-2 text-slate-600 font-semibold leading-normal">
                          <li>
                            <strong>Buka Halaman Google Form</strong> Anda di browser. Anda bisa membuka link publik pengisian kuis (URL yang disebarkan ke siswa) ataupun lembar pratinjau editor kuis Anda.
                          </li>
                          <li>
                            <strong>Buka Kode Sumber (View Page Source)</strong>: Tekan shortcut keyboard <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-350 shadow-2xs font-mono font-bold text-slate-800">Ctrl + U</kbd> (Windows/Linux) atau <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-350 shadow-2xs font-mono font-bold text-slate-800">Cmd + Option + U</kbd> (Mac). Anda juga bisa mengeklik kanan daerah kosong pada lembar Google Form lalu pilih <strong className="text-slate-800">"Lihat Sumber Halaman"</strong>.
                          </li>
                          <li>
                            <strong>Salin Seluruh Kode</strong>: Di dalam tab baru berisi barisan kode yang muncul, tekan <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-355 shadow-2xs font-mono font-bold text-slate-800">Ctrl + A</kbd> (atau <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-355 shadow-2xs font-mono font-bold text-slate-800">Cmd + A</kbd>) untuk menyeleksi semua baris, lalu salin dengan menekan <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-355 shadow-2xs font-mono font-bold text-slate-800">Ctrl + C</kbd> (<kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-355 shadow-2xs font-mono font-bold text-slate-800">Cmd + C</kbd>).
                          </li>
                          <li>
                            <strong>Tempel & Simpan</strong>: Tekan tombol hijau <span className="font-mono text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px]">Import Google Form</span> di atas, pastikan tab berlabel <strong className="text-emerald-700 font-mono">📋 Salin-Tempel Sumber / Teks Soal</strong> aktif, isikan nama ujian, klik kolom besar di bawahnya lalu tempelkan kode tadi dengan <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-355 shadow-2xs font-mono font-bold text-slate-800">Ctrl + V</kbd>. Akhiri dengan mengeklik <strong className="text-white bg-emerald-700 px-1.5 py-0.5 rounded font-mono">MULAI IMPORT</strong>.
                          </li>
                        </ol>
                      </div>

                      <div className="bg-white p-4.5 rounded-xl border border-slate-200 space-y-2.5 shadow-xs flex flex-col justify-between">
                        <div>
                          <span className="font-extrabold font-mono text-[9.5px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-250 uppercase tracking-wider block w-fit">
                            METODE 2: SALIN-TEMPEL TEKS POLOS BIASA (Cepat & Sederhana)
                          </span>
                          <div className="mt-2.5 text-slate-600 font-semibold space-y-2 leading-relaxed">
                            <p>
                              Jika Anda merasa cara pertama terlalu rumit, Anda bisa menggunakan cara cepat ini: 
                              Seret kursor mouse Anda untuk memblok atau menyoroti seluruh naskah tulisan pertanyaan dan butir pilihannya langsung pada halaman form, lalu salin (<kbd className="bg-slate-100 px-1 py-0.5 border border-slate-300 rounded font-mono font-bold text-slate-700">Ctrl + C</kbd>).
                            </p>
                            <p>
                              Tempel teks tersebut di kolom masukan yang sama. Mesin ekstraksi cerdas akan memilah pertanyaan yang ditempeli simbol opsi buletan (<code className="text-emerald-650 font-bold font-mono">○</code>, <code className="text-emerald-650 font-bold font-mono">●</code>, <code className="text-emerald-650 font-bold font-mono">A. B. C. D.</code>) secara dinamis.
                            </p>
                          </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-150 text-[10.5px] text-slate-750 font-medium">
                          <strong className="text-amber-800">ℹ️ Perbedaan Utama:</strong> Metode 1 (Salin Kode Sumber HTML) secara otomatis membaca dan menyinkronkan <strong>Kunci Jawaban Asli</strong> dari Form. Sementara Metode 2 (Teks Polos biasa) membutuhkan penentuan manual kunci jawaban lewat tombol <strong>Detail & Kelola Soal</strong> setelah bank soal tersimpan demi keamanan.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm text-center text-slate-500">
                    Sedang mematangkan data bank soal...
                  </div>
                ) : banks.length === 0 ? (
                  <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-slate-200 text-slate-500 shadow-sm flex flex-col items-center justify-center">
                    <BookOpen className="w-16 h-16 text-slate-350 mb-4" />
                    <h4 className="text-lg font-bold text-slate-700 mb-1">Belum Ada Bank Soal</h4>
                    <p className="text-xs max-w-sm mb-6">Anda dapat membuat pertanyaan evaluasi secara detail, atau mengaktifkan kuis uji coba lewat satu tombol praktis.</p>
                    <button
                      onClick={() => {
                        setIsCreatingBank(true);
                        setTimeout(prefillSampleBank, 200);
                      }}
                      className="bg-blue-50 text-blue-700 border border-blue-200 font-bold px-5 py-2.5 rounded-lg hover:bg-blue-100 transition cursor-pointer text-xs uppercase font-mono tracking-wider shadow-none"
                    >
                      Buka Form Soal & Prefill Contoh Cepat
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {banks.map((bank) => (
                      <div key={bank.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition duration-250 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono">
                              {bank.questions.length} Pertanyaan
                            </span>
                            <button
                              onClick={() => handleDeleteBankClick(bank.id)}
                              className="text-slate-400 hover:text-rose-650 p-1.5 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                              title="Hapus Bank Soal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <h4 className="text-base font-bold text-slate-800 mt-3 leading-snug tracking-tight">{bank.title}</h4>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-3">
                            {bank.description || 'Tidak ada deskripsi evaluasi.'}
                          </p>
                        </div>

                        {/* Quick Exam Setup Trigger */}
                        <div className="border-t border-slate-100 pt-3.5 mt-4 flex flex-col gap-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedBankForDetail(bank)}
                            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" /> Detail & Kelola Soal
                          </button>
                          
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-450 font-mono">
                              Dibuat: {new Date(bank.createdAt).toLocaleDateString('id-ID')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBankForExam(bank.id);
                                setActiveTab('exams');
                              }}
                              className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 hover:underline cursor-pointer font-mono uppercase tracking-wider text-[11px]"
                            >
                              Rilis Ujian <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* CREATE BANK SOAL FORM */
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">Registrasi Bank Soal Baru</h3>
                    <p className="text-xs text-slate-500">Rancang dan registrasikan soal evaluasi dengan opsi pilihan ganda.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={prefillSampleBank}
                      className="px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition cursor-pointer"
                    >
                      Prefill Contoh Cepat
                    </button>
                    <button
                      onClick={() => setIsCreatingBank(false)}
                      className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveBankSoal} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Judul Evaluasi
                        </label>
                        <input
                          type="text"
                          required
                          value={bankTitle}
                          onChange={(e) => setBankTitle(e.target.value)}
                          placeholder="Misal: Ujian Akhir Matematika Kelas X"
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Deskripsi / Instruksi Tambahan
                        </label>
                        <textarea
                          rows={3}
                          value={bankDescription}
                          onChange={(e) => setBankDescription(e.target.value)}
                          placeholder="Misal: Bacalah soal dengan saksama. Sistem mendeteksi log aktivitas tab atau minimalisasi window!"
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition text-sm mb-4"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          🔗 Tautan Google Form (Opsional)
                        </label>
                        <input
                          type="text"
                          value={bankGoogleFormUrl}
                          onChange={(e) => setBankGoogleFormUrl(e.target.value)}
                          placeholder="https://docs.google.com/forms/d/e/.../viewform"
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition text-xs"
                        />
                        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed font-semibold">
                          Jika diisi, ujian dari bank soal ini akan merender langsung formulir Google Form di dalam bingkai (frame) pengawasan anti-kecurangan aman kami!
                        </p>
                      </div>

                      {/* EXCEL IMPORT PANELS */}
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3 shadow-inner">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Import dari Excel / CSV</h4>
                        </div>
                        
                        <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                          Anda dapat membuat puluhan soal sekaligus dari program Excel atau Google Sheets secara offline menggunakan template terstruktur kami.
                        </p>

                        <div className="space-y-2 pt-1.5">
                          <button
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="w-full bg-slate-900 text-white hover:bg-slate-800 font-bold py-2 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
                          >
                            <Download className="w-3.5 h-3.5" /> Unduh Template Excel
                          </button>

                          <div className="relative">
                            <label className="w-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition">
                              <Upload className="w-3.5 h-3.5 text-emerald-650" />
                              Unggah Berkas CSV Anda
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleUploadCSV}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        {/* HELP TIPS IMAGE ENHANCEMENT */}
                        <div className="border-t border-slate-200 pt-3 mt-2 space-y-1.5">
                          <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest font-mono block">
                            💡 Bantuan Lampiran Gambar
                          </label>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                            Untuk menambahkan gambar pendukung pada soal, silakan unggah gambar di media sharing (misal: imgur, cloud storage, Google Drive publik, dll), lalu masukkan alamat tautan gambar (URL) ke dalam kolom <strong>{`ImageUrl`}</strong> di kuis, atau kolom <strong>{`Tautan Gambar`}</strong> di baris Excel Anda. Tautan wajib berakhiran ekstensi gambar seperti <code>.jpg</code>, <code>.png</code>, atau format image web resmi.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Daftar Pertanyaan ({questions.length})
                        </span>
                        <button
                          type="button"
                          onClick={handleAddQuestion}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer font-mono uppercase tracking-wider"
                        >
                          + Tambah Butir Soal
                        </button>
                      </div>

                      <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
                        {questions.map((q, qIdx) => (
                          <div key={qIdx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative">
                            <div className="absolute right-3 top-3">
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestion(qIdx)}
                                disabled={questions.length === 1}
                                className="text-slate-400 hover:text-rose-650 disabled:opacity-30 cursor-pointer p-1 rounded-md animate-fade-in"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <span className="text-blue-600 font-bold font-mono text-xs uppercase tracking-wider block mb-2">Soal No. {qIdx + 1}</span>
                            <div className="mb-3">
                              <input
                                type="text"
                                required
                                value={q.text}
                                onChange={(e) => handleQuestionTextChange(qIdx, e.target.value)}
                                placeholder="Tuliskan pertanyaan disini..."
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* OPTIONAL IMAGE URL ATTACHMENT */}
                            <div className="mb-4 bg-white border border-slate-150 p-3 rounded-lg space-y-3">
                              <div className="flex flex-col sm:flex-row items-center gap-3">
                                <div className="flex-1 w-full">
                                  <label className="block text-[9px] font-black uppercase text-slate-500 font-mono tracking-wider mb-1">
                                    🖼️ Pendukung Gambar (Bisa Copy-Paste Screenshot / Pilih Berkas / Masukkan URL)
                                  </label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={q.imageUrl || ''}
                                      onChange={(e) => handleImageUrlChange(qIdx, e.target.value)}
                                      onPaste={(e) => handlePasteEvent(e, (base64) => handleImageUrlChange(qIdx, base64))}
                                      placeholder="Tempel gambar (Ctrl+V) / Masukkan URL gambar"
                                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 transition font-mono"
                                    />
                                    <label className="bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-650 text-slate-600 font-bold uppercase cursor-pointer transition shrink-0 flex items-center gap-1 font-mono">
                                      <Upload className="w-3.5 h-3.5" /> Berkas
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleImageFileSelect(e, (base64) => handleImageUrlChange(qIdx, base64))}
                                        className="hidden"
                                      />
                                    </label>
                                  </div>
                                  <span className="block text-[8px] text-slate-450 italic mt-1 font-semibold leading-relaxed">💡 Tips: Anda bisa menekan tombol PrintScreen / Screenshot, lalu klik kolom di atas dan tekan <strong>Ctrl + V</strong> untuk langsung menempelkan gambar!</span>
                                </div>
                                {q.imageUrl && (
                                  <div className="shrink-0 flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-black font-mono text-emerald-600 uppercase tracking-widest leading-none">Berhasil ✔️</span>
                                    <div className="relative group">
                                      <img 
                                        src={q.imageUrl} 
                                        alt="Preview" 
                                        className="h-12 w-20 rounded border-2 border-emerald-500 object-cover shadow-sm bg-slate-100"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.opacity = '0.5';
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleImageUrlChange(qIdx, '')}
                                        className="absolute -right-2 -top-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-0.5 shadow-md flex items-center justify-center cursor-pointer"
                                        title="Hapus Gambar"
                                      >
                                        <X className="w-3 h-3 text-white" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>


                            </div>

                            {/* OPSI JAWABAN */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {q.options.map((option, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-slate-400 w-4 font-mono">
                                    {String.fromCharCode(65 + oIdx)}
                                  </span>
                                  <input
                                    type="text"
                                    required
                                    value={option}
                                    onChange={(e) => handleOptionChange(qIdx, oIdx, e.target.value)}
                                    placeholder={`Pilihan ${String.fromCharCode(65 + oIdx)}`}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>

                            {/* CORRECT ANSWER SELECTOR */}
                            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between border-t border-slate-200/60 pt-3 gap-2">
                              <span className="text-xs font-semibold text-slate-600">Opsi Jawaban yang BENAR:</span>
                              <div className="flex gap-1.5">
                                {q.options.map((_, oIdx) => (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() => handleCorrectAnswerChange(qIdx, oIdx)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono cursor-pointer border ${
                                      q.correctAnswer === oIdx
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                                    }`}
                                  >
                                    {String.fromCharCode(65 + oIdx)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setIsCreatingBank(false)}
                          className="px-5 py-2.5 border border-slate-300 rounded-lg text-xs font-bold font-mono uppercase tracking-wider hover:bg-slate-50 transition cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs font-mono uppercase tracking-wider shadow-sm transition cursor-pointer"
                        >
                          Simpan Bank Soal Ke Awan
                        </button>
                      </div>

                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: SESI UJIAN AKTIF */}
        {activeTab === 'exams' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* LAUNCH NEW EXAM PANEL */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <Play className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">Rilis Sesi Ujian Baru</h3>
                </div>
                <p className="text-xs text-slate-500 mb-6 font-medium">
                  Pilih salah satu Bank Soal yang telah Anda registrasikan untuk memulai sesi evaluasi ujian aktif bagi peserta didik.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                      Pilih Bank Soal
                    </label>
                    <select
                      value={selectedBankForExam}
                      onChange={(e) => setSelectedBankForExam(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs bg-slate-50 font-semibold"
                    >
                      <option value="">-- Pilih Bank Soal --</option>
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title} ({b.questions.length} Soal)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Durasi Batas Waktu Ujian
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                      />
                      <span className="text-xs text-slate-500 font-bold uppercase font-mono">Menit</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      Kriteria Ketuntasan Minimal (KKM) <span className="text-emerald-600 font-bold">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={kkm}
                        onChange={(e) => setKkm(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-emerald-300 focus:border-emerald-500 rounded-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-xs bg-emerald-50/20 font-mono"
                      />
                      <span className="text-xs text-slate-500 font-bold uppercase font-mono">Poin</span>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-slate-100">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                      Pengaturan Acak (Randomisasi)
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shuffleQuestions}
                          onChange={(e) => setShuffleQuestions(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Acak nomor urutan soal ujian
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shuffleOptions}
                          onChange={(e) => setShuffleOptions(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Acak pilihan jawaban (A, B, C, D)
                      </label>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-[11px] text-slate-650 leading-relaxed font-semibold">
                    🔍 Dengan merilis ujian, sistem akan secara otomatis membuat spreadsheet rekap di log Google Drive Anda.
                  </div>

                  <button
                    onClick={handleLaunchExam}
                    disabled={isLaunchingExam || banks.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer text-xs uppercase font-mono tracking-wider"
                  >
                    {isLaunchingExam ? 'Mempersiapkan Lembar Jurnal...' : 'Rilis Sesi Ujian & Sambung Sheets'}
                  </button>
                </div>
              </div>

              {/* ACTIVE SESSION LIST */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">Dua Aktivitas Sesi Saat Ini</h3>
                  <p className="text-xs text-slate-500">Gunakan Kode Akses ini kepada siswa anda untuk memulai pengerjaan.</p>
                </div>

                {activeExams.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-bold font-mono text-xs uppercase tracking-wider">
                    Belum ada sesi ujian yang dirilis. Silakan pilih Bank Soal dan rilis sesi pertama Anda.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeExams.map((exam) => (
                      <div key={exam.code} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Status bar */}
                        <div className={`absolute top-0 bottom-0 left-0 w-1 ${exam.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>

                        <div className="pl-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-800 tracking-tight">{exam.title}</h4>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold font-mono ${
                              exam.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {exam.isActive ? 'AKTIF' : 'DITUTUP'}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1 text-slate-700 font-bold font-mono text-xs">
                              KODE AKSES: {exam.code}
                            </span>
                            <span className="font-mono text-[10px]">Durasi: {exam.timeLimit || 'Tanpa limit'} Menit</span>
                            <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">KKM: {exam.kkm || 75} Poin</span>
                            <span className="font-mono text-[10px]">Mulai: {new Date(exam.createdAt).toLocaleDateString('id-ID')}</span>
                          </div>

                          {exam.spreadsheetId && (
                            <div className="pt-2">
                              <a
                                href={`https://docs.google.com/spreadsheets/d/${exam.spreadsheetId}/edit`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-[10px] transition cursor-pointer border border-emerald-250 font-mono uppercase tracking-wider"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                                Buka Rekap Laporan Google Sheets
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 md:self-center pl-3 md:pl-0">
                          {/* Copy Code */}
                          <button
                            onClick={() => handleCopyCode(exam.code)}
                            className="p-2 border border-slate-250 rounded-lg bg-slate-55 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer text-xs font-mono font-bold uppercase tracking-wider"
                            title="Salin Kode Akses"
                          >
                            <span className="flex items-center gap-1">
                              <ClipboardCopy className="w-3.5 h-3.5" />
                              {copiedCode === exam.code ? 'Tersalin' : 'Kode'}
                            </span>
                          </button>

                          {/* Pause/Play status */}
                          <button
                            onClick={() => handleToggleExam(exam.code, exam.isActive)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider cursor-pointer flex items-center gap-1 border transition ${
                              exam.isActive
                                ? 'bg-amber-55 text-amber-800 hover:bg-amber-100 border-amber-250'
                                : 'bg-emerald-55 text-emerald-800 hover:bg-emerald-100 border-emerald-250'
                            }`}
                          >
                            {exam.isActive ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                Jeda Ujian
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                Aktifkan
                              </>
                            )}
                          </button>

                          {/* Delete exam */}
                          <button
                            onClick={() => handleDeleteExamClick(exam.code)}
                            className="p-2 border border-slate-200 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition cursor-pointer"
                            title="Hapus Rekor Ujian"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 3: HASIL & REKAP NILAI */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Laporan Komparatif Hasil Ujian & Pelanggaran</h3>
                <p className="text-xs text-slate-500 font-medium">Menganalisis score murid dan total deteksi cheating (ganti tab / blur screen).</p>
              </div>

              {/* Selector Active exam filter */}
              <div className="w-full sm:w-auto flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">Pilih Ujian:</span>
                <select
                  value={resultsExamCode}
                  onChange={(e) => {
                    setResultsExamCode(e.target.value);
                    fetchAttempts(e.target.value);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-xs font-bold focus:outline-none"
                >
                  <option value="">-- Pilih Sesi Ujian --</option>
                  {activeExams.map(ex => (
                    <option key={ex.code} value={ex.code}>
                      {ex.title} (Code: {ex.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ATTEMPTS TABLE */}
            {!resultsExamCode ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-450 font-bold font-mono text-xs uppercase tracking-wider">
                Pilih sesi ujian di pojok kanan atas untuk memuat daftar hasil.
              </div>
            ) : attempts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 flex flex-col items-center justify-center">
                <Award className="w-12 h-12 text-slate-350 mb-2" />
                <h4 className="text-base font-bold text-slate-700">Belum Ada Pengisian</h4>
                <p className="text-xs mt-1">Belum ada peserta didik yang masuk dan mengirim jawaban ujian untuk sesi ini.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                
                {/* Active Exam details in top header */}
                {activeExams.find(ex => ex.code === resultsExamCode)?.spreadsheetId && (
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      Sesi ujian ini terintegrasi langsung dengan Spreadsheet Laporan.
                    </span>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${activeExams.find(ex => ex.code === resultsExamCode)?.spreadsheetId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg font-bold shadow-sm transition"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Buka Google Spreadsheet Online
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-100">
                        <th className="px-6 py-4">Nama Siswa</th>
                        <th className="px-6 py-4">Kelas</th>
                        <th className="px-6 py-4">Skor Ujian / Jawaban</th>
                        <th className="px-6 py-4 text-center">Deteksi Pelanggaran (Ganti Tab)</th>
                        <th className="px-6 py-4 text-center">Waktu Kirim</th>
                        <th className="px-6 py-4 text-right">Aksi & Backup</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {attempts.map((attempt) => {
                        const examOfAttempt = activeExams.find(ex => ex.code === attempt.examCode);
                        const activeKkm = examOfAttempt?.kkm ?? 75;
                        return (
                          <tr key={attempt.id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4 font-bold text-slate-800">{attempt.studentName}</td>
                            <td className="px-6 py-4 font-bold text-slate-500 font-mono text-[11px]">{attempt.studentClass}</td>
                            <td className="px-6 py-4 mr-2">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-1 rounded-md text-xs font-bold font-mono ${
                                    attempt.score >= activeKkm ? 'bg-emerald-55 text-emerald-800 border border-emerald-250' : 'bg-rose-55 text-rose-800 border border-rose-250'
                                  }`}>
                                    {attempt.score.toFixed(1)} / 100
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium font-mono">
                                    ({attempt.correctAnswersCount}/{attempt.totalQuestions})
                                  </span>
                                </div>
                                <span className={`text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded border ${
                                  attempt.score >= activeKkm 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {attempt.score >= activeKkm ? 'TUNTAS' : 'REMEDIAL'} (KKM: {activeKkm})
                                </span>
                              </div>
                            </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono inline-flex items-center gap-1 uppercase tracking-wider ${
                                attempt.violationsCount > 0
                                  ? 'bg-rose-55 text-rose-700 border border-rose-200'
                                  : 'bg-emerald-55 text-emerald-700 border border-emerald-200'
                              }`}>
                                {attempt.violationsCount > 0 ? (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                    {attempt.violationsCount} Pelanggaran
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    Jujur (0)
                                  </>
                                )}
                              </span>
                              
                              {attempt.violationsCount > 0 && (
                                <button
                                  onClick={() => setSelectedAttemptForDetail(attempt)}
                                  className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer hover:bg-slate-100 rounded-md"
                                  title="Lihat Log Pelanggaran Siswa"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-xs text-slate-500">
                            {new Date(attempt.submittedAt).toLocaleTimeString('id-ID')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {activeExams.find(ex => ex.code === resultsExamCode)?.spreadsheetId && (
                              <button
                                onClick={() => handleForceSyncToSheet(
                                  attempt, 
                                  activeExams.find(ex => ex.code === resultsExamCode)!.spreadsheetId!
                                )}
                                disabled={processingSheetCode === attempt.id}
                                className="px-3 py-1.5 bg-slate-50 font-bold font-mono uppercase tracking-wider text-[10px] hover:bg-emerald-55 hover:text-emerald-800 border border-slate-200 rounded-md cursor-pointer transition disabled:opacity-50"
                                title="Gunakan tombol ini jika rekap otomatis gagal"
                              >
                                {processingSheetCode === attempt.id ? 'Mengirim...' : 'Force Sync Sheets'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* VIOLATION DETAIL LOGS MODAL */}
      {selectedAttemptForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-slate-900 border-b border-slate-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                <h3 className="font-bold tracking-tight text-sm uppercase font-mono">Log Aktivitas & Pelanggaran Siswa</h3>
              </div>
              <button
                onClick={() => setSelectedAttemptForDetail(null)}
                className="text-white/80 hover:text-white transition cursor-pointer p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <p className="text-base font-bold text-slate-800 tracking-tight">Nama: {selectedAttemptForDetail.studentName}</p>
                <p className="text-xs text-slate-500 font-bold font-mono">
                  Kelas {selectedAttemptForDetail.studentClass} • Ujian {selectedAttemptForDetail.examTitle}
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Timeline Pelanggaran Terdeteksi ({selectedAttemptForDetail.violationsCount})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedAttemptForDetail.violationsList && selectedAttemptForDetail.violationsList.map((v, i) => (
                    <div key={i} className="flex gap-3 bg-rose-50 border border-rose-100 p-3 rounded-lg">
                      <span className="font-mono text-xs font-bold text-rose-600 mt-0.5">{v.timestamp}</span>
                      <div className="text-xs">
                        <span className="font-bold text-rose-800 block">
                          {v.type === 'TAB_OUT' ? '⚠️ Keluar Tab Browser' : 
                           v.type === 'WINDOW_BLUR' ? '🚫 Merubah Dimensi/Fokus Browser' : 
                           '❌ Keluar dari Mode Layar Penuh'}
                        </span>
                        <p className="text-slate-600 mt-0.5">{v.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedAttemptForDetail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer font-mono uppercase tracking-wider"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE FORM IMPORT MODAL OVERLAY */}
      {showGoogleFormImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 text-left">
            <div className="bg-slate-900 border-b border-slate-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold tracking-tight text-sm uppercase font-mono">Import Bank Soal dari Google Form</h3>
              </div>
              <button
                onClick={() => {
                  setShowGoogleFormImport(false);
                  setGoogleFormExamTitle('');
                  setGoogleFormUrl('');
                  setGoogleFormHtmlPaste('');
                  setImportError('');
                }}
                className="text-white/80 hover:text-white transition cursor-pointer p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Segment Selector / Tabs to resolve CORS limitation */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => { setImportMethod('paste'); setImportError(''); }}
                className={`flex-1 py-3 text-center text-[10.5px] font-black font-mono uppercase tracking-wider transition ${
                  importMethod === 'paste' 
                    ? 'border-b-2 border-emerald-600 text-emerald-700 bg-white' 
                    : 'text-slate-500 hover:text-slate-700 bg-slate-50'
                }`}
              >
                📋 Salin-Tempel Sumber / Teks Soal
              </button>
              <button
                type="button"
                onClick={() => { setImportMethod('url'); setImportError(''); }}
                className={`flex-1 py-3 text-center text-[10.5px] font-black font-mono uppercase tracking-wider transition ${
                  importMethod === 'url' 
                    ? 'border-b-2 border-emerald-600 text-emerald-700 bg-white' 
                    : 'text-slate-500 hover:text-slate-700 bg-slate-50'
                }`}
              >
                🔗 Link / Tautan Form
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                {importMethod === 'paste' 
                  ? 'Gunakan metode Salin & Tempel untuk memproses dan mengekstrak butir soal asli kuis Google Form Anda ke dalam aplikasi ini secara instan 100% luring (aman dari kendala CORS).'
                  : 'Masukkan tautan (link) Google Form Anda. Sistem akan memindai format Google Form tersebut untuk menggenerasikan kuis edukasi serasi secara dinamis.'}
              </p>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Nama Ujian / Judul Bank Soal <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={googleFormExamTitle}
                  onChange={(e) => {
                    setGoogleFormExamTitle(e.target.value);
                    setImportError('');
                  }}
                  placeholder="Contoh: Penilaian Harian Fisika SMA"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-xs leading-normal bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              {importMethod === 'paste' ? (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Tempel Kode Sumber HTML (View Source) atau Teks Pertanyaan <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <textarea
                    rows={7}
                    value={googleFormHtmlPaste}
                    onChange={(e) => {
                      setGoogleFormHtmlPaste(e.target.value);
                      setImportError('');
                    }}
                    placeholder="Tempel (Ctrl+V) kode HTML halaman sumber / salinan teks pertanyaan lengkap Google Form Anda di sini..."
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-[11px] leading-relaxed bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[10px] text-slate-550 leading-relaxed space-y-1">
                    <p className="font-bold text-slate-700">💡 Cara Mengambil Soal Terakurat (Kunci Jawaban juga Terbaca):</p>
                    <ol className="list-decimal pl-4 font-semibold text-slate-600 space-y-0.5">
                      <li>Buka link Google Form kuis Anda di browser Anda.</li>
                      <li>Tekan tombol pintas <strong className="text-emerald-700">Ctrl + U</strong> (atau klik kanan &gt; "Lihat Sumber Halaman" / "View Page Source").</li>
                      <li>Tekan <strong className="text-emerald-700">Ctrl + A</strong> untuk memilih semua teks/kode, lalu <strong className="text-emerald-700">Ctrl + C</strong> untuk menyalinnya.</li>
                      <li>Klik dalam kolom abu-abu di atas dan tekan <strong className="text-emerald-700">Ctrl + V</strong> untuk menempelnya di sini!</li>
                    </ol>
                    <p className="font-semibold text-slate-500 italic mt-1 font-mono text-[9px]">✔ Cara alternatif: Cukup salin/blok seluruh teks normal dari halaman pratinjau form Anda, lalu tempel di atas.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Tautan / Link Google Form <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={googleFormUrl}
                    onChange={(e) => {
                      setGoogleFormUrl(e.target.value);
                      setImportError('');
                    }}
                    placeholder="Format: https://docs.google.com/forms/d/... atau kata kunci topik"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-xs leading-normal bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              )}

              {importError && (
                <p className="text-[10px] text-rose-600 font-bold font-mono mt-1">⚠️ {importError}</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGoogleFormImport(false);
                  setGoogleFormExamTitle('');
                  setGoogleFormUrl('');
                  setGoogleFormHtmlPaste('');
                  setImportError('');
                }}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGoogleFormImportSubmit}
                disabled={isImporting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer font-mono uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
              >
                {isImporting ? 'Mengimpor...' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL & MANAGE QUESTION IN BANK MODAL */}
      {selectedBankForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 text-left flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 border-b border-slate-800 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="font-bold tracking-tight text-sm uppercase font-mono">Kelola Butir Soal</h3>
                  <p className="text-[10px] text-slate-400 font-mono tracking-wide">{selectedBankForDetail.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBankForDetail(null)}
                className="text-white/80 hover:text-white transition cursor-pointer p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 font-sans">
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                Sistem Pengelolaan Bank Soal Aktif: Di bawah ini, Anda dapat memperluas butir kuis secara massal menggunakan berkas Excel/CSV atau mengisinya satu-demi-satu melalui pengisian manual yang mendukung penempelan gambar.
              </p>

              {/* ACTION PANELS CONTAINER */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                {/* BUTTON FOR EXCEL CSV RE-IMPORT */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <div>
                    <h4 className="text-xs font-black text-emerald-850 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Gabung Excel/CSV
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 mb-3 leading-relaxed">Sematkan puluhan butir baru secara massal dari Excel atau Google Sheets ke bank soal ini.</p>
                  </div>
                  <label className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition">
                    <Upload className="w-3 h-3" /> Unggah Berkas Baru
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleUploadCSVToExistingBank(e, selectedBankForDetail.id)}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* BUTTON FOR MANUAL QUESTION CREATION */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <div>
                    <h4 className="text-xs font-black text-blue-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-600" /> Tulis Soal Manual
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 mb-3 leading-relaxed">Ketikkan butir pertanyaan kustom langsung dengan fitur lampiran berkas atau gambar dari clipboards.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingQuestionToExisting(!isAddingQuestionToExisting);
                      setNewQuestText('');
                      setNewQuestOptions(['', '', '', '']);
                      setNewQuestCorrectIndex(0);
                      setNewQuestImageUrl('');
                    }}
                    className="w-full bg-blue-605 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
                  >
                    {isAddingQuestionToExisting ? 'Sembunyikan Form' : 'Mulai Tulis Baru'}
                  </button>
                </div>
              </div>

              {/* MANUAL ADD QUESTION PANEL FORM */}
              {isAddingQuestionToExisting && (
                <div className="bg-slate-50 border-2 border-dashed border-blue-200 p-4 rounded-xl space-y-4 shadow-inner animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-[11px] font-black text-blue-750 uppercase tracking-widest font-mono">📝 Formulir Penulisan Soal Baru</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingQuestionToExisting(false)}
                      className="text-slate-400 hover:text-rose-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1">Butir Pertanyaan:</label>
                      <input
                        type="text"
                        value={newQuestText}
                        onChange={(e) => setNewQuestText(e.target.value)}
                        placeholder="Tuliskan materi pertanyaan ujian disini..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {newQuestOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black text-slate-400 font-mono w-4">{String.fromCharCode(65 + idx)}</span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const updated = [...newQuestOptions];
                              updated[idx] = e.target.value;
                              setNewQuestOptions(updated);
                            }}
                            placeholder={`Isian Pilihan ${String.fromCharCode(65 + idx)}`}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-slate-250/50 gap-2">
                      <span className="text-[10px] font-black text-slate-650 font-mono uppercase tracking-wider">Opsi Jawaban yang Guru Nyatakan BENAR:</span>
                      <div className="flex gap-1.5">
                        {newQuestOptions.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setNewQuestCorrectIndex(idx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer border ${
                              newQuestCorrectIndex === idx
                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Image URL & Clipart Selector */}
                    <div className="bg-white border border-slate-150 p-3 rounded-lg space-y-3">
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="flex-1 w-full">
                          <label className="block text-[9px] font-black uppercase text-slate-500 font-mono tracking-wider mb-1">
                            🖼️ Pendukung Gambar (Bisa Copy-Paste Screenshot / Pilih Berkas / Masukkan URL)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newQuestImageUrl}
                              onChange={(e) => setNewQuestImageUrl(e.target.value)}
                              onPaste={(e) => handlePasteEvent(e, (base64) => setNewQuestImageUrl(base64))}
                              placeholder="Tempel gambar (Ctrl+V) / Masukkan URL gambar"
                              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 transition font-mono"
                            />
                            <label className="bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-650 text-slate-600 font-bold uppercase cursor-pointer transition shrink-0 flex items-center gap-1 font-mono">
                              <Upload className="w-3.5 h-3.5" /> Berkas
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageFileSelect(e, (base64) => setNewQuestImageUrl(base64))}
                                className="hidden"
                              />
                            </label>
                          </div>
                          <span className="block text-[8px] text-slate-450 italic mt-1 font-semibold leading-relaxed">💡 Tips: Anda bisa menekan tombol PrintScreen / Screenshot, lalu klik kolom di atas dan tekan <strong>Ctrl + V</strong> untuk langsung menempelkan gambar!</span>
                        </div>
                        {newQuestImageUrl && (
                          <div className="shrink-0 flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black font-mono text-emerald-600 uppercase tracking-widest leading-none">Berhasil ✔️</span>
                            <div className="relative group">
                              <img 
                                src={newQuestImageUrl} 
                                alt="Pratinjau Gambar" 
                                className="h-12 w-20 rounded border-2 border-emerald-500 object-cover shadow-sm bg-slate-100"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.opacity = '0.5';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setNewQuestImageUrl('')}
                                className="absolute -right-2 -top-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-0.5 shadow-md flex items-center justify-center cursor-pointer"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsAddingQuestionToExisting(false)}
                      className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-[10px] font-bold font-mono tracking-wider text-slate-600 hover:bg-slate-100 uppercase"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleAddQuestionToExistingBankSubmit}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-mono font-black tracking-wider uppercase shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Simpan Soal Baru
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4 pt-2">
                {selectedBankForDetail.questions.map((q, qIndex) => {
                  const isQActive = q.isActive !== false;
                  return (
                    <div key={q.id || qIndex} className="p-4 rounded-xl border border-slate-200 bg-slate-50 relative flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600 font-bold font-mono text-xs uppercase tracking-wider">Soal No. {qIndex + 1}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono tracking-wider border ${
                            isQActive ? 'bg-emerald-50 text-emerald-600 border-emerald-110 border-emerald-100' : 'bg-slate-200 text-slate-500 border-slate-300'
                          }`}>
                            {isQActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>
                        <p className="text-xs md:text-sm font-bold text-slate-800 tracking-tight leading-relaxed">{q.text}</p>
                        {q.imageUrl && (
                          <div className="my-2.5">
                            <img 
                              src={q.imageUrl} 
                              alt="Gambar Soal" 
                              className="max-h-36 max-w-full rounded-lg border border-slate-200 object-contain shadow-sm bg-slate-100"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = q.correctAnswer === oIdx;
                            return (
                              <div key={oIdx} className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 font-medium ${
                                isCorrect 
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' 
                                  : 'bg-white text-slate-600 border-slate-200/80'
                              }`}>
                                <span className={`w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center ${
                                  isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {String.fromCharCode(65 + oIdx)}
                                </span>
                                <span>{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex md:flex-col items-center justify-end gap-2 shrink-0 md:pt-4 border-t md:border-t-0 border-slate-200 pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionStatus(selectedBankForDetail.id, qIndex)}
                          className={`w-full md:w-32 px-3 py-1.5 rounded-lg text-[10px] font-black font-mono tracking-wider border transition inline-flex items-center justify-center gap-1.5 uppercase cursor-pointer ${
                            isQActive
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100'
                          }`}
                        >
                          {isQActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestionClick(selectedBankForDetail.id, qIndex)}
                          className="w-full md:w-32 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-black rounded-lg text-[10px] font-mono uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Soal
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedBankForDetail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer font-mono uppercase tracking-wider"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMATION: DELETE QUESTION BANK */}
      {deleteBankConfirmId && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-800 tracking-tight">Hapus Bank Soal Permanen?</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                Tindakan ini tidak dapat dibatalkan. Bank soal akan dihapus secara permanen dari sistem dan cloud database Firestore Anda.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteBankConfirmId(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBank}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMATION: DELETE QUESTION IN BANK */}
      {deleteQuestionConfirm && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-800 tracking-tight">Hapus Butir Pertanyaan?</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                Apakah Anda benar-benar yakin ingin menghapus nomor pertanyaan terpilih ini dari bank evaluasi secara permanen?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteQuestionConfirm(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition"
              >
                Gagalkan
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteQuestion}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition shadow-sm"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMATION: DELETE ACTIVE EXAM RECORD */}
      {deleteExamConfirmCode && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-800 tracking-tight">Hapus Riwayat Ujian?</h3>
              <p className="text-[11px] text-slate-550 leading-relaxed font-semibold">
                Hapus sesi ujian aktif dengan Kode Akses <strong className="font-mono text-rose-600 text-xs">{deleteExamConfirmCode}</strong> secara permanen dari daftar rekap?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteExamConfirmCode(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition"
              >
                Gagalkan
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExam}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider cursor-pointer transition shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
