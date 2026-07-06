// One-time helper: obtain a Google OAuth refresh token for ICONFORM.
// Usage: node scripts/get-refresh-token.mjs <path-to-oauth-client.json>
// The JSON must be an OAuth client of type "Desktop app" (key "installed").
import http from 'http';
import fs from 'fs';
import { google } from 'googleapis';

const keyFile = process.argv[2];
if (!keyFile) {
  console.error('Usage: node scripts/get-refresh-token.mjs <oauth-client.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const cfg = raw.installed ?? raw.web;
if (!cfg?.client_id || !cfg?.client_secret) {
  console.error('File is not an OAuth client JSON (expected "installed" key with client_id/client_secret).');
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force refresh_token issuance even if previously consented
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n1. Open this URL in your browser and approve access:\n');
console.log(authUrl);
console.log('\n2. Waiting for Google redirect on ' + redirectUri + ' ...\n');

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get('code');
    if (!code) {
      res.end('No authorization code in request.');
      return;
    }
    try {
      const { tokens } = await oauth2.getToken(code);
      res.end('Success — refresh token printed in your terminal. You can close this tab.');
      console.log('Add these to your .env:\n');
      console.log('GDRIVE_OAUTH_CLIENT_ID=' + cfg.client_id);
      console.log('GDRIVE_OAUTH_CLIENT_SECRET=' + cfg.client_secret);
      console.log('GDRIVE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
      process.exit(0);
    } catch (err) {
      res.end('Token exchange failed — see terminal.');
      console.error(err);
      process.exit(1);
    }
  })
  .listen(PORT);
