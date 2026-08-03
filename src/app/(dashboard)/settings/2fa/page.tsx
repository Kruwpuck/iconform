'use client';

import { useEffect, useRef, useState } from 'react';

export default function TwoFAPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingupMode, setSettingUpMode] = useState(false);
  const [disableModal, setDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableErr, setDisableErr] = useState('');
  const disableInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/user/2fa').then(r => r.json()).then(d => setEnabled(d.enabled));
  }, []);

  useEffect(() => {
    if (disableModal) setTimeout(() => disableInputRef.current?.focus(), 50);
  }, [disableModal]);

  function onlyDigits(val: string) { return val.replace(/\D/g, '').slice(0, 6); }

  async function startSetup() {
    setLoading(true); setMsg(null);
    const res = await fetch('/api/user/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup' }),
    });
    const data = await res.json() as { secret: string; qrUrl: string };
    setSecret(data.secret);
    const QRCode = (await import('qrcode')).default;
    setQrDataUrl(await QRCode.toDataURL(data.qrUrl));
    setSettingUpMode(true);
    setLoading(false);
  }

  async function verifyAndSave() {
    if (!/^\d{6}$/.test(code)) { setMsg({ text: 'Kode harus 6 digit angka.', ok: false }); return; }
    setLoading(true); setMsg(null);
    const res = await fetch('/api/user/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', secret, code }),
    });
    if (res.ok) {
      setEnabled(true); setSettingUpMode(false); setMsg({ text: '2FA berhasil diaktifkan.', ok: true });
    } else {
      const d = await res.json() as { error: string };
      setMsg({ text: d.error ?? 'Kode tidak valid.', ok: false });
    }
    setLoading(false);
  }

  async function confirmDisable() {
    if (!/^\d{6}$/.test(disableCode)) { setDisableErr('Kode harus 6 digit angka.'); return; }
    setLoading(true); setDisableErr('');
    const res = await fetch('/api/user/2fa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: disableCode }),
    });
    setLoading(false);
    if (res.ok) {
      setEnabled(false); setDisableModal(false); setDisableCode('');
      setMsg({ text: '2FA dinonaktifkan.', ok: true });
    } else {
      const d = await res.json() as { error: string };
      setDisableErr(d.error ?? 'Kode tidak valid.');
    }
  }

  if (enabled === null) return <div className="p-8 text-slate-500">Memuat…</div>;

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Keamanan Akun</h1>
      <p className="text-slate-500 text-sm mb-6">Autentikasi dua faktor (2FA)</p>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {enabled && !settingupMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            2FA Aktif
          </div>
          <p className="text-sm text-slate-500">Akun Anda dilindungi dengan Google Authenticator.</p>
          <button
            onClick={() => { setDisableModal(true); setDisableCode(''); setDisableErr(''); }}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50 transition-colors"
          >
            Nonaktifkan 2FA
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
          <p className="text-sm text-slate-600">Scan QR code ini dengan aplikasi Google Authenticator:</p>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code 2FA" className="w-48 h-48 border rounded-lg" />}
          <p className="text-xs text-slate-400 break-all">Secret: {secret}</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kode Verifikasi (6 digit)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(onlyDigits(e.target.value))}
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
              onClick={() => { setSettingUpMode(false); setCode(''); setMsg(null); }}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Disable 2FA modal */}
      {disableModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Nonaktifkan 2FA</h2>
            <p className="text-sm text-slate-500">Masukkan kode 6 digit dari Google Authenticator untuk konfirmasi.</p>
            <input
              ref={disableInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={e => { setDisableCode(onlyDigits(e.target.value)); setDisableErr(''); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 tracking-widest text-center text-lg"
              placeholder="000000"
            />
            {disableErr && <p className="text-red-600 text-sm">{disableErr}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setDisableModal(false); setDisableCode(''); setDisableErr(''); }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmDisable}
                disabled={loading || disableCode.length !== 6}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Memproses…' : 'Nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
