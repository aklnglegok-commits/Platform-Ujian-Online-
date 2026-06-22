import { StudentAttempt } from './types';

/**
 * Creates a brand new Google Spreadsheet using the Google Sheets API.
 * Returns the spreadsheetId and spreadsheetUrl.
 */
export async function createGoogleSpreadsheet(
  accessToken: string,
  title: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  if (accessToken === 'superadmin-mock-token') {
    const mockId = 'mock-spreadsheet-' + Math.random().toString(36).substring(2, 10);
    return {
      spreadsheetId: mockId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${mockId}/edit`
    };
  }
  try {
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `Hasil Evaluasi Ujian: ${title}`,
        },
        sheets: [
          {
            properties: {
              title: 'Rekap Hasil Ujian',
              gridProperties: {
                rowCount: 1000,
                columnCount: 9,
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gagal membuat spreadsheet: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const spreadsheetId = data.spreadsheetId;
    const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Initialize the headers
    await initializeSpreadsheetHeaders(accessToken, spreadsheetId);

    return { spreadsheetId, spreadsheetUrl };
  } catch (error) {
    console.error('Error creating spreadsheet:', error);
    throw error;
  }
}

/**
 * Writes the header columns in the Google Spreadsheet.
 */
async function initializeSpreadsheetHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const headers = [
    [
      'Waktu Mengisi',
      'Nama Siswa',
      'Kelas',
      'Kode Ujian',
      'Judul Evaluasi',
      'Jawaban Benar',
      'Nilai Evaluasi (0-100)',
      'Total Pelanggaran (Ganti Tab / Exit)',
      'Riwayat & Rincian Deteksi Pelanggaran',
    ],
  ];

  const range = 'Rekap Hasil Ujian!A1:I1';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: headers,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal mengisi header spreadsheet: ${response.status} ${errText}`);
  }
}

/**
 * Appends a student attempt log row to the Google Spreadsheet.
 */
export async function appendStudentAttemptToSheet(
  accessToken: string,
  spreadsheetId: string,
  attempt: StudentAttempt
): Promise<void> {
  if (accessToken === 'superadmin-mock-token') {
    console.log('Utilizing local superadmin, sheets append bypassed.', attempt);
    return;
  }
  const dateStr = new Date(attempt.submittedAt).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  // Convert violation list to readable multiline text
  const violationsStr = attempt.violationsList.length > 0
    ? attempt.violationsList.map((v, idx) => `[${idx + 1}] ${v.timestamp} - ${v.description}`).join('\n')
    : 'Tidak Ada Pelanggaran (Siswa Jujur)';

  const penalty = attempt.violationsCount * 5;
  const originalScore = attempt.originalScore !== undefined ? attempt.originalScore : (attempt.score + penalty);

  const scoreCell = attempt.violationsCount > 0
    ? `${attempt.score.toFixed(1)} (Rumus: ${originalScore.toFixed(1)} Murni - ${penalty} Penalti)`
    : attempt.score.toFixed(1);

  const rowValue = [
    dateStr,
    attempt.studentName,
    attempt.studentClass,
    attempt.examCode,
    attempt.examTitle,
    `${attempt.correctAnswersCount} dari ${attempt.totalQuestions}`,
    scoreCell,
    attempt.violationsCount,
    violationsStr,
  ];

  const range = 'Rekap Hasil Ujian!A2';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [rowValue],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal menambah rekap ke spreadsheet: ${response.status} ${errText}`);
  }
}
