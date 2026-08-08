import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PDL FORM',
  description: 'Sistem Manajemen Dokumen PLN Icon Plus Regional Jawa Barat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
