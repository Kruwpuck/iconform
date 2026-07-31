'use client';

import { useEffect, useState } from 'react';

export default function TwoFAPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingupMode, setSettingUpMode] = useState(false);

  useEffect(() => {
    fetch('/api/user/2fa').then(r => r.json()).then(d => setEnabled(d.enabled));
  }, []);

  async function startSetup() {
    setLoading(true); setMsg('');
    const res = await fetch('/api/user/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup' }),
    });
    const data = await res.json() as { secret: string; qrUrl: string };
    setSecret(data.secret);
    // generate QR client-side
    const QRCode = (await import('qrcode')).default;
    const url = await QRCode.toDataURL(data.qrUrl);
    setQrDataUrl(url);
    setSettingUpMode(true);
    setLoading(false);
  }

  async function verifyAndSave() {
    setLoading(true); setMsg('');
    const res = await fetch('/api/user/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', secret, code }),
    });
    if (res.ok) {
      setEnabled(true); setSettingUpMode(false); setMsg('2FA berhasil diaktifkan.');
    } else {
      const d = await res.json() as { error: string };
      setMsg(d.error ?? 'Kode tidak valid.');
    }
    setLoading(false);
  }

  async function disable() {
    const confirmCode = prompt('Masukkan kode Google Authenticator untuk menonaktifkan 2FA:');
    if (!confirmCode) return;
    setLoading(true); setMsg('');
    const res = await fetch('/api/user/2fa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: confirmCode.trim() }),
    });
    if (res.ok) {
      setEnabled(false); setMsg('2FA dinonaktifkan.');
    } else {
      const d = await res.json() as { error: string };
      setMsg(d.error ?? 'Kode tidak valid.');
    }
    setLoading(false);
  }

  if (enabled === null) return <div className="p-8 text-slate-500">Memuat…</div>;

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Keamanan Akun</h1>
      <p className="text-slate-500 text-sm mb-6">Autentikasi dua faktor (2FA)</p>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-sky-50 text-sky-700 text-sm">{msg}</div>
      )}

      {enabled && !settingupMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            2FA Aktif
          </div>
          <p className="text-sm text-slate-500">Akun Anda dilindungi dengan Google Authenticator.</p>
          <button
            onClick={disable}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Memproses…' : 'Nonaktifkan 2FA'}
          </button>
        </div>
      )}

      {!enabled && !settingupMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            2FA Tidak Aktif
          </div>
          <p className="text-sm text-slate-500">Tambahkan lapisan keamanan ekstra menggunakan Google Authenticator.</p>
          <button
            onClick={startSetup}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Memuat…' : 'Aktifkan 2FA'}
          </button>
        </div>
      )}

      {settingupMode && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Scan QR code ini dengan aplikasi Google Authenticator:
          </p>
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR Code 2FA" className="w-48 h-48 border rounded-lg" />
          )}
          <p className="text-xs text-slate-400 break-all">Secret: {secret}</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Kode Verifikasi (6 digit)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 tracking-widest text-center"
              placeholder="000000"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={verifyAndSave}
              disabled={loading || code.length !== 6}
              className="flex-1 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button
              onClick={() => { setSettingUpMode(false); setCode(''); setMsg(''); }}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
