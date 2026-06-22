import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, setCachedToken } from './firebase';
import TeacherDashboard from './components/TeacherDashboard';
import ExamScreen from './components/ExamScreen';
import GsiButton from './components/GsiButton';

export default function App() {
  const [role, setRole] = useState<'select' | 'teacher' | 'student'>('select');
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Initialize Auth state listener with restricted email check
  useEffect(() => {
    const unsubscribe = initAuth(
      async (currentUser, token) => {
        const authorizedEmail = 'aklnglegok@gmail.com';
        if (currentUser.email?.toLowerCase() === authorizedEmail) {
          setUser(currentUser);
          if (token) {
            setAccessToken(token);
            setCachedToken(token);
            // Set in window so student exam screen can read it if testing on same machine
            (window as any).teacherAccessToken = token;
          }
          setNeedsAuth(false);
          setLoginError('');
        } else {
          // Automatic logout for non-authorized users
          await logout();
          setUser(null);
          setAccessToken('');
          setNeedsAuth(true);
        }
      },
      () => {
        setUser(null);
        setAccessToken('');
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const result = await googleSignIn();
      if (result) {
        const authorizedEmail = 'aklnglegok@gmail.com';
        if (result.user.email?.toLowerCase() === authorizedEmail) {
          setUser(result.user);
          setAccessToken(result.accessToken);
          setCachedToken(result.accessToken);
          (window as any).teacherAccessToken = result.accessToken;
          setNeedsAuth(false);
          setLoginError('');
        } else {
          await logout();
          setUser(null);
          setAccessToken('');
          setLoginError(`Akses Ditolak! Akun ${result.user.email} tidak memiliki hak akses sebagai admin.`);
        }
      }
    } catch (err) {
      console.error('Google Sign In failed:', err);
      setLoginError('Gagal masuk menggunakan Google. Pastikan jaringan stabil dan coba lagi.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken('');
      setNeedsAuth(true);
      setRole('select');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleReauth = () => {
    setUser(null);
    setNeedsAuth(true);
  };

  return (
    <div className="font-sans antialiased min-h-screen bg-slate-50 text-slate-800">
      
      {/* ROLE SELECTOR SCREEN */}
      {role === 'select' && (
        <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-screen">
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex bg-blue-50/80 text-blue-700 border border-blue-200 font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider font-mono">
              Evaluasi Ujian & Rekap Otomatis
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight max-w-2xl">
              Platform Evaluasi Hasil Belajar <span className="text-blue-600">Anti-Curang</span>
            </h1>
            <p className="text-slate-500 text-sm md:text-base max-w-md mx-auto leading-relaxed">
              Mendeteksi perpindahan tab browser secara ketat, memicu alarm visual bervolume tinggi, dan merekap hasil otomatis di Google Spreadsheet.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
            
            {/* CARD 1: TEACHER ROLE */}
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-md hover:border-blue-200 transition duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="bg-blue-50 text-blue-600 p-4 rounded-xl w-fit group-hover:bg-blue-600 group-hover:text-white transition duration-200">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight">Masuk sebagai GURU</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono mt-1">GURU / PENDIDIK / EVALUATOR</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Guru dapat memasukkan & mendaftarkan bank soal pilihan ganda, merilis sesi ujian aktif, 
                  serta mengaitkan pelacakan otomatis ke Google Spreadsheet secara instan.
                </p>
              </div>
              <button
                onClick={() => setRole('teacher')}
                className="w-full bg-slate-900 text-white hover:bg-slate-800 font-bold py-3 px-6 rounded-lg transition mt-8 cursor-pointer shadow-sm text-xs uppercase tracking-wider font-mono"
              >
                Masuk Panel Guru
              </button>
            </div>

            {/* CARD 2: STUDENT ROLE */}
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-md hover:border-blue-200 transition duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="bg-blue-50 text-blue-600 p-4 rounded-xl w-fit group-hover:bg-blue-600 group-hover:text-white transition duration-200">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight">Ikuti sebagai SISWA</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono mt-1">SISWA / PESERTA DIDIK / UJIAN</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Siswa dapat masuk menggunakan 6-digit kode ujian dari Guru. Sistem anti-curang akan 
                  berjalan mengunci layar penuh guna mencegah manipulasi ganti tab.
                </p>
              </div>
              <button
                onClick={() => setRole('student')}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 px-6 rounded-lg transition mt-8 cursor-pointer shadow-sm text-xs uppercase tracking-wider font-mono"
              >
                Mulai Kerjakan Ujian
              </button>
            </div>

          </div>

          {/* Core metadata footer */}
          <footer className="mt-16 text-xs text-slate-400 font-mono flex items-center gap-2 select-none">
            <span>Server Cloud Run Connected</span>
            <span>•</span>
            <span>Evaluasi Anti Ganti Tab v2.4.12-Pro</span>
          </footer>
        </div>
      )}

      {/* TEACHER FLOW */}
      {role === 'teacher' && (
        <div>
          {/* Check Authentication */}
          {(!user || needsAuth) ? (
            <div className="max-w-md w-full mx-auto px-4 py-24 flex flex-col justify-center min-h-[80vh]">
               <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm text-center space-y-6">
                <div className="bg-blue-50 text-blue-600 p-4 rounded-xl w-fit mx-auto border border-blue-150 animate-bounce">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="space-y-2 animate-fade-in">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Otorisasi Akun Guru</h2>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Silakan masuk menggunakan Google untuk mengelola ujian, bank soal, dan sinkronisasi rekap otomatis real-time.
                  </p>
                </div>

                <div className="pt-2 max-w-sm mx-auto">
                  <GsiButton
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    label={isLoggingIn ? 'Menghubungkan ke Google...' : 'Masuk dengan Google'}
                  />
                  {loginError && (
                    <div className="mt-3 bg-rose-50 border border-rose-150 text-rose-700 p-3 rounded-lg text-xs font-medium text-left">
                      ⚠️ {loginError}
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 rounded-lg p-3.5 border border-amber-200 text-[11px] text-amber-800 leading-relaxed max-w-sm mx-auto text-left">
                  <span className="font-bold text-[9px] uppercase font-mono bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded tracking-wider mr-1.5">Kebijakan Keamanan:</span>
                  Sistem dikonfigurasi dengan aman. Hanya email Google <code className="font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded px-1">aklnglegok@gmail.com</code> yang diperbolehkan masuk sebagai admin guru.
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRole('select')}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-bold block mx-auto uppercase tracking-wider font-mono"
                  >
                    kembali ke pemilihan peran
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <TeacherDashboard
              user={user}
              accessToken={accessToken}
              onLogout={handleLogout}
              onReauth={handleReauth}
            />
          )}
        </div>
      )}

      {/* STUDENT FLOW */}
      {role === 'student' && (
        <div className="relative">
          {/* Student screen handles internal exams logic */}
          <ExamScreen onBackToRoleSelection={() => setRole('select')} />
        </div>
      )}

    </div>
  );
}
