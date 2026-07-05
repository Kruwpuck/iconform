'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError('Username atau password salah.');
    } else {
      router.push('/');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-sky-800 to-teal-700 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* PLN Icon Plus badge */}
        <div className="flex items-center justify-center gap-0 mb-6">
          <span className="bg-amber-500 text-black font-bold px-2 py-1 rounded-l text-sm select-none">PLN</span>
          <span className="bg-sky-400 text-black font-semibold px-2 py-1 rounded-r text-sm select-none">iconplus</span>
        </div>

        <h1 className="text-3xl font-bold text-center text-slate-800 mb-1">ICONFORM</h1>
        <p className="text-center text-slate-500 text-sm mb-8">Regional Jawa Barat</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Masukkan username"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? 'Memproses…' : 'Masuk ke Sistem'}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true' && (
          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-500 mb-3">atau</p>
            <button
              onClick={() => signIn('email')}
              className="w-full border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Masuk dengan Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
