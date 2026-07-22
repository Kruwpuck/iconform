import { google } from 'googleapis';

const SHEET_ID = process.env.GDRIVE_SHEET_NOMOR_ID;
const RANGE = 'A:A'; // ponytail: single column, user puts nomor list in col A

function getAuth() {
  const clientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error('GDRIVE OAuth credentials not set');
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

/** Read column A from the nomor sheet, return flat string array (skip blank/header). */
export async function readNomorList(): Promise<string[]> {
  if (!SHEET_ID) return [];
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGE });
  return (res.data.values ?? [])
    .flatMap((row) => row)
    .map((v) => String(v).trim())
    .filter(Boolean);
}
