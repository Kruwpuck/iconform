# Plan: ICONFORM — Document Management System

## Summary
Full-stack Next.js 15 Document Management System for PLN Icon Plus Regional Jawa Barat. Admins log in, pick one of six letter templates, edit in a `contenteditable` A4 editor, auto-generate filenames from marked fields, then browser-generate PDF+DOCX and upload both to Google Drive via service account, with metadata stored in PostgreSQL.

## User Story
As an ICONFORM admin, I want to create, save, search, edit, and download formal PLN documents (Surat Tugas, BA Pengujian, BAI, BAP, BAKL, UID JABAR) so that document archiving is centralized and auditable.

## Problem → Solution
Manual file management with no central archive → Structured DMS with Drive-backed storage, PostgreSQL metadata, full-text search, and one-click PDF/DOCX export.

## Metadata
- **Complexity**: XL
- **Source PRD**: `project-blueprint.md`
- **PRD Phase**: All phases (1–5) — greenfield build
- **Estimated Files**: ~25 files

---

## UX Design

### Before
```
N/A — greenfield, no prior system
```

### After
```
┌──────────────────────────────────────────────────────┐
│ [bg-blue-950 sidebar]                                │
│  PLN iconplus badge (amber PLN / sky iconplus)       │
│  Dashboard nav | Keluar (bottom)                     │
├──────────────────────────────────────────────────────┤
│  [Dashboard page]                                    │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ Folder Surat    │  │ Folder Berita Acara       │  │
│  │ Tugas  (amber)  │  │ (sky)                    │  │
│  └─────────────────┘  └──────────────────────────┘  │
│                                                      │
│  [6 template cards] → opens EditorModal              │
│                                                      │
│  [DocumentsTable: search | pagination | row actions] │
│   Nama Berkas | Lokasi | Tanggal | ▾ PDF DOCX ✎ 🗑  │
└──────────────────────────────────────────────────────┘

[EditorModal]
┌───────────────────────────────────────────────────┐
│ Title + category badge                            │
│ ┌ - - - - dashed slate frame - - - - - - - - ┐   │
│ │  [white A4 contenteditable, prose]          │   │
│ └ - - - - - - - - - - - - - - - - - - - - -  ┘   │
│ Nama File Hasil Dokumen: [editable input]          │
│ Folder Tujuan: [readonly input]                   │
│ [Batal]  [Simpan ke Folder (emerald)]             │
└───────────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Login | N/A | Gradient card, username+password | signIn('credentials') |
| Template pick | N/A | 6 cards, click → EditorModal | amber=ST, sky=BA |
| Auto-naming | N/A | Live update from marked spans | dirty flag prevents clobber |
| Save | N/A | Browser export → Drive upload → DB | FormData POST |
| Download | N/A | Server proxies Drive stream | service-account auth |
| Edit | N/A | EditorModal seeded with contentHtml | PUT endpoint |
| Delete | N/A | native confirm() → DELETE | cascades Drive+DB |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `project-blueprint.md` | all | Complete spec — naming rules, schema, Docker, template HTML patterns |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| NextAuth v5 | authjs.dev | JWT strategy, Credentials provider, `auth()` helper in route handlers |
| html2pdf.js | npm readme | Must `await import()` client-side — touches `window`, breaks SSR |
| html-docx-js-typescript | npm readme | `asBlob(htmlString)` — wraps in OOXML container |
| googleapis Node.js | npm readme | `google.auth.GoogleAuth`, `drive.files.create` with `Readable.from(buffer)` |
| Prisma v5 | prisma.io/docs | `globalThis` singleton, `migrate deploy` in Docker CMD |

---

## Patterns to Mirror

### NAMING_CONVENTION
```ts
// SOURCE: blueprint §1 folder structure
// Files: PascalCase components, camelCase lib modules, kebab-case routes
export function Sidebar() {}           // components/Sidebar.tsx
export const prisma = ...              // lib/prisma.ts
export async function GET() {}         // app/api/documents/route.ts
```

### ERROR_HANDLING
```ts
// SOURCE: blueprint §4 Phase 4 step 4
// API routes: validate at boundary, throw with descriptive message
if (!filename.trim()) return NextResponse.json({ error: 'filename required' }, { status: 400 });
// Drive cleanup on partial failure:
try { await prisma.document.create(...) } catch { await deleteFile(pdfId); await deleteFile(docxId); throw; }
```

### TEMPLATE_PATTERN
```ts
// SOURCE: blueprint §4
export type TemplateDef = {
  id: TemplateType;
  label: string;
  description: string;
  folder: 'SURAT_TUGAS' | 'BERITA_ACARA';
  allowLogo: boolean;
  html: string;
  suggestName: (root: HTMLElement) => string | null;
};
```

### AUTO_NAMING_DIRTY_FLAG
```ts
// SOURCE: blueprint §4 behavioral contract
const dirtyRef = useRef(false);
const handleFilenameInput = () => { dirtyRef.current = true; };
const handleEditorInput = () => {
  if (!dirtyRef.current) {
    const suggested = template.suggestName(editorRef.current!);
    if (suggested) setFilename(suggested);
  }
};
```

### CONTENTEDITABLE_UNCONTROLLED
```ts
// SOURCE: blueprint §3 Phase 3
// Never re-render contenteditable from state while typing.
const editorRef = useRef<HTMLDivElement>(null);
<div ref={editorRef} contentEditable suppressContentEditableWarning
  dangerouslySetInnerHTML={{ __html: template.html }} />
// On save: editorRef.current!.innerHTML
```

### GDRIVE_CLIENT
```ts
// SOURCE: blueprint §4 Phase 4 step 2
import { google } from 'googleapis';
import { Readable } from 'stream';
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GDRIVE_SERVICE_ACCOUNT_B64!, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });
```

### PRISMA_SINGLETON
```ts
// SOURCE: blueprint §2 Phase 2 step 3
import { PrismaClient } from '@prisma/client';
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### NEXTAUTH_CONFIG
```ts
// SOURCE: blueprint §2 Phase 2 step 4
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      authorize: async ({ username, password }) => {
        const user = await prisma.user.findUnique({ where: { username: String(username) } });
        if (!user || !await bcrypt.compare(String(password), user.passwordHash)) return null;
        return { id: user.id, name: user.name, username: user.username };
      },
    }),
    ...(process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true' ? [Email({ server: '' })] : []),
  ],
  callbacks: {
    jwt: async ({ token, user }) => { if (user) token.id = user.id; return token; },
    session: async ({ session, token }) => { session.user.id = token.id as string; return session; },
  },
});
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `package.json` | CREATE | Next.js 15 + all deps per blueprint |
| `next.config.ts` | CREATE | `output: 'standalone'` |
| `tsconfig.json` | CREATE | Standard Next.js TS config |
| `Dockerfile` | CREATE | 3-stage node:20-alpine build |
| `docker-compose.yml` | CREATE | app + postgres:16-alpine |
| `.env.example` | CREATE | All env vars documented |
| `.dockerignore` | CREATE | node_modules .next .git .env |
| `prisma/schema.prisma` | CREATE | Full schema per blueprint §2 |
| `prisma/seed.ts` | CREATE | Upsert admin from env vars |
| `src/middleware.ts` | CREATE | Protect all routes except /login + /api/auth/* |
| `src/auth.ts` | CREATE | NextAuth v5 config |
| `src/lib/prisma.ts` | CREATE | Singleton PrismaClient |
| `src/lib/gdrive.ts` | CREATE | uploadFile, deleteFile, streamFile |
| `src/lib/templates.ts` | CREATE | All 6 TemplateDef entries + suggestName fns |
| `src/app/layout.tsx` | CREATE | Root layout, globals import |
| `src/app/globals.css` | CREATE | Tailwind directives |
| `src/app/login/page.tsx` | CREATE | Credentials login page |
| `src/app/api/auth/[...nextauth]/route.ts` | CREATE | NextAuth route handler |
| `src/app/api/documents/route.ts` | CREATE | GET list, POST create |
| `src/app/api/documents/[id]/route.ts` | CREATE | GET one, PUT update, DELETE |
| `src/app/api/documents/[id]/download/route.ts` | CREATE | Drive stream proxy |
| `src/app/(dashboard)/layout.tsx` | CREATE | Sidebar + session guard |
| `src/app/(dashboard)/page.tsx` | CREATE | Dashboard composition |
| `src/components/Sidebar.tsx` | CREATE | Blue-950 sidebar, PLN badge, Keluar |
| `src/components/FolderCards.tsx` | CREATE | Amber ST + sky BA folder cards |
| `src/components/DocumentsTable.tsx` | CREATE | Search, pagination, row actions |
| `src/components/TemplateGrid.tsx` | CREATE | 6 template cards |
| `src/components/EditorModal.tsx` | CREATE | Contenteditable + auto-naming + logo + save |
| `src/lib/templates.test.ts` | CREATE | suggestName unit tests per blueprint |

## NOT Building

- Roles/RBAC (single admin, no second user class yet)
- Server-side PDF with Puppeteer
- Drive folder auto-provisioning
- Rate limiting / CSRF beyond NextAuth defaults
- React state management library (useState + fetch only)
- Component library like shadcn (Tailwind direct)
- Test framework (only `npx tsx` smoke test for suggestName)

---

## Step-by-Step Tasks

### Task 1: Project Bootstrap
- **ACTION**: Initialize Next.js 15 app in current directory, install all deps
- **IMPLEMENT**:
  ```bash
  npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint
  npm i lucide-react @prisma/client next-auth@beta bcryptjs googleapis html2pdf.js html-docx-js-typescript
  npm i -D prisma @types/bcryptjs tsx linkedom
  ```
- **MIRROR**: N/A — scaffold step
- **IMPORTS**: N/A
- **GOTCHA**: Use `.` — already in project dir. `create-next-app` may prompt about existing files — confirm overwrite only for config files, preserve `project-blueprint.md` and `.claude/`.
- **VALIDATE**: `npm run dev` starts; `package.json` has all deps listed above

### Task 2: Infrastructure Files
- **ACTION**: Create Dockerfile, docker-compose.yml, .env.example, .dockerignore, next.config.ts
- **IMPLEMENT**:
  - `Dockerfile`: 3-stage node:20-alpine. CMD: `sh -c "npx prisma migrate deploy && npx prisma db seed && node server.js"`
  - `docker-compose.yml`: service names `iconform-db` and `iconform-app`, DB name `iconform`, user `iconform`
  - `.env.example`: all vars, `POSTGRES_PASSWORD`, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `ADMIN_*`, `NEXT_PUBLIC_ENABLE_EMAIL_AUTH`, `GDRIVE_SERVICE_ACCOUNT_B64`, `GDRIVE_FOLDER_SURAT_TUGAS_ID`, `GDRIVE_FOLDER_BERITA_ACARA_ID`
  - `next.config.ts`: `const nextConfig: NextConfig = { output: 'standalone' }; export default nextConfig;`
  - `.dockerignore`: `node_modules`, `.next`, `.git`, `.env`
- **MIRROR**: GDRIVE_CLIENT (base64 env pattern)
- **GOTCHA**: CMD must run seed AFTER migrate. Seed uses upsert — idempotent on restart.
- **VALIDATE**: `docker compose config` validates yaml; `.env.example` has all 9 vars

### Task 3: Prisma Schema & Seed
- **ACTION**: Write `prisma/schema.prisma` and `prisma/seed.ts`
- **IMPLEMENT**:
  - Schema exactly as blueprint §2: User, Session, Document, FolderType enum, TemplateType enum, `@@index([folder, createdAt])`, `@@index([filename])`
  - `seed.ts`: read `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME` from `process.env`; `prisma.user.upsert({ where: { username }, update: {}, create: { ... } })`
  - Add to `package.json`: `"prisma": { "seed": "tsx prisma/seed.ts" }`
- **MIRROR**: PRISMA_SINGLETON
- **IMPORTS**: `import { PrismaClient } from '@prisma/client'; import bcrypt from 'bcryptjs';`
- **GOTCHA**: `email` is nullable (`String?`) — do NOT pass `email: undefined`, omit the field in seed create. Session model required for Auth.js adapter shape even though unused under JWT.
- **VALIDATE**: `npx prisma migrate dev --name init` passes; `npx prisma db seed` creates admin

### Task 4: Auth & Middleware
- **ACTION**: Write `src/auth.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- **IMPLEMENT**:
  - `src/auth.ts`: JWT strategy, Credentials authorize (find by username, bcrypt.compare, return `{id, name, username}`), email provider behind flag, jwt+session callbacks for `token.id`
  - `src/middleware.ts`:
    ```ts
    export { auth as middleware } from './auth';
    export const config = {
      matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
    };
    ```
  - route handler: `export { handlers as GET, handlers as POST } from '@/auth'`
- **MIRROR**: NEXTAUTH_CONFIG
- **GOTCHA**: NextAuth v5 beta uses `auth()` not `getServerSession`. `AUTH_SECRET` env var required at startup. Credentials provider `authorize` must return `null` (not throw) on bad credentials.
- **VALIDATE**: Unauthenticated `/` → `/login`; admin/admin123 → dashboard; wrong password → error shown

### Task 5: Prisma Lib & Google Drive Lib
- **ACTION**: Write `src/lib/prisma.ts` and `src/lib/gdrive.ts`
- **IMPLEMENT**:
  - `prisma.ts`: globalThis singleton
  - `gdrive.ts`:
    ```ts
    export async function uploadFile(name: string, mime: string, buffer: Buffer, folderId: string): Promise<{ id: string; webViewLink: string }>
    export async function deleteFile(fileId: string): Promise<void>  // catch 404, swallow
    export async function streamFile(fileId: string): Promise<import('stream').Readable>
    ```
    For `streamFile`: `const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }); return res.data as Readable;`
- **MIRROR**: PRISMA_SINGLETON, GDRIVE_CLIENT
- **IMPORTS**: `import { google } from 'googleapis'`, `import { Readable } from 'stream'`
- **GOTCHA**: In Next.js App Router, convert Node Readable to Web ReadableStream for Response: `new ReadableStream({ start(controller) { s.on('data', c => controller.enqueue(c)); s.on('end', () => controller.close()); s.on('error', e => controller.error(e)); } })`. deleteFile: catch where `(e as any)?.code === 404` or `(e as any)?.status === 404`.
- **VALIDATE**: TypeScript compiles; signatures match usage in route handlers

### Task 6: Template Registry
- **ACTION**: Write `src/lib/templates.ts` with all 6 TemplateDef entries and `src/lib/templates.test.ts`
- **IMPLEMENT**:
  - Export `TemplateDef` type and `TEMPLATES: TemplateDef[]` array
  - Helper to read field: `function field(root: HTMLElement, name: string): string { return root.querySelector<HTMLElement>('[data-field="'+name+'"]')?.innerText?.trim() ?? ''; }`
  - Helper to check placeholder: `const isPlaceholder = (v: string) => !v || v.startsWith('[');`
  - Naming implementations per blueprint §4:
    - SURAT_TUGAS: `Surat_Tugas_${v.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'')}`
    - BA_PENGUJIAN: `Berita Acara Hasil Pengujian_${v}`
    - BAI: `BAI ${v}`
    - BAP: `BAP_${v}`
    - BAKL: `BAKL_${nomor}_${company}`
    - UID_JABAR: `UID JABAR ${v}`
  - Template HTML strings: Times New Roman header block, `ICONFORM` letterhead, formal Indonesian body, `<span data-field="..." class="bg-amber-100 px-1 rounded font-bold">[placeholder]</span>` for watched fields, right-aligned signature block
  - `templates.test.ts`: use `linkedom` `parseHTML` to build mock DOM, assert each suggestName
- **MIRROR**: TEMPLATE_PATTERN
- **IMPORTS**: `import { TemplateType } from '@prisma/client'` (server-only); for test: `import { parseHTML } from 'linkedom'`
- **GOTCHA**: `suggestName` uses `HTMLElement` DOM API — only valid in browser or linkedom. Template file is imported by both server (API routes for template lookup) and client (EditorModal). The `suggestName` fn body only runs in browser. BAKL needs both `nomor` AND `namaPerusahaan` non-placeholder — return null if either missing.
- **VALIDATE**: `npx tsx src/lib/templates.test.ts` exits 0; all 8 test cases pass

### Task 7: Login Page
- **ACTION**: Write `src/app/login/page.tsx`
- **IMPLEMENT**:
  - `'use client'` page
  - Full-page: `min-h-screen bg-gradient-to-br from-blue-900 via-sky-800 to-teal-700 flex items-center justify-center`
  - Card: `bg-white/95 backdrop-blur rounded-2xl shadow-xl p-8 w-full max-w-md`
  - PLN badge: `<span className="bg-amber-500 text-black font-bold px-2 py-0.5 rounded-l text-sm">PLN</span><span className="bg-sky-400 text-black font-semibold px-2 py-0.5 rounded-r text-sm">iconplus</span>`
  - Title: `<h1>ICONFORM</h1>` + `<p>Regional Jawa Barat</p>`
  - Form: username input, password input, sky-600 submit "Masuk ke Sistem"
  - Error state: inline red text on `CredentialsSignin` error
  - Email section: `{process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true' && <div>...</div>}`
- **MIRROR**: NAMING_CONVENTION
- **IMPORTS**: `import { signIn } from 'next-auth/react'` (client-side)
- **GOTCHA**: For App Router client component, use `signIn('credentials', { username, password, redirect: false })` then check `result.error`. Do NOT use server action for signIn in 'use client' pages — use `next-auth/react`. Handle `callbackUrl` for post-login redirect to `/`.
- **VALIDATE**: Correct creds → dashboard; wrong creds → "Username atau password salah"; ICONFORM title visible

### Task 8: Dashboard Layout & Sidebar
- **ACTION**: Write `src/app/(dashboard)/layout.tsx` and `src/components/Sidebar.tsx`
- **IMPLEMENT**:
  - `layout.tsx` (server component): `const session = await auth(); if (!session) redirect('/login');` — render `<div className="flex min-h-screen"><Sidebar /><main className="flex-1 p-6">{children}</main></div>`
  - `Sidebar.tsx` (`'use client'`): `bg-blue-950 text-white w-64 flex-shrink-0 flex flex-col p-4`. Top: PLN badge + "ICONFORM" text. Middle: Dashboard nav link with `LayoutDashboard` icon. Bottom (`mt-auto`): sign-out form with "Keluar" button + `LogOut` icon.
  - Sign-out: `<form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>`
- **MIRROR**: NAMING_CONVENTION
- **GOTCHA**: Server actions in Client Components require extracting the action to a separate server file or using a Server Component wrapper for the form. Simplest: make `Sidebar.tsx` a Server Component — no client interactivity needed except the form action.
- **VALIDATE**: Dashboard renders sidebar + content; Keluar redirects to login

### Task 9: Template Grid & Folder Cards Components
- **ACTION**: Write `src/components/TemplateGrid.tsx` and `src/components/FolderCards.tsx`
- **IMPLEMENT**:
  - `TemplateGrid` (`'use client'`): props `{ onSelect: (t: TemplateDef) => void }`. Map `TEMPLATES` → cards. Surat Tugas: `bg-amber-50 border-amber-200` accent. Berita Acara: `bg-sky-50 border-sky-200`. Button: "Gunakan Template →".
  - `FolderCards` (`'use client'`): props `{ counts: { ST: number; BA: number }; activeFolder: string|null; onFilter: (f: string|null) => void }`. Two cards. Active card has stronger border. "Tampilkan Semua Folder" link resets filter.
- **MIRROR**: NAMING_CONVENTION
- **IMPORTS**: `import { TEMPLATES, TemplateDef } from '@/lib/templates'`
- **GOTCHA**: `TEMPLATES` contains `suggestName` functions — safe to import client-side, they're just closures. Don't call them during render (only on editor input).
- **VALIDATE**: 6 template cards render; clicking calls `onSelect`; folder filter toggles

### Task 10: Editor Modal
- **ACTION**: Write `src/components/EditorModal.tsx`
- **IMPLEMENT**:
  ```tsx
  'use client'
  type ExistingDoc = { id: string; filename: string; contentHtml: string; logoBase64?: string | null; template: TemplateType; folder: FolderType; };
  type Props = { template: TemplateDef; existingDoc?: ExistingDoc; onClose: () => void; onSaved: () => void; };
  ```
  - Modal overlay: fixed inset-0 z-50 bg-black/60 flex items-center justify-center
  - Inner card: bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6
  - Header: template.label + category badge
  - Logo upload (only if `template.allowLogo`): `<input type="file" accept="image/*">` → FileReader → insert `<div data-logo-slot>` as first child of contenteditable
  - Dashed frame: `border-2 border-dashed border-slate-300 rounded p-2`
  - Contenteditable div: `ref={editorRef}`, `contentEditable`, `suppressContentEditableWarning`, `className="min-h-[350px] p-8 prose max-w-none outline-none"`, seeded once with `dangerouslySetInnerHTML`
  - Filename input: controlled with `filename` state, `onInput={() => dirtyRef.current = true}`
  - Folder input: `readOnly value={template.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara'}`
  - Batal + emerald Simpan buttons
  - `onInput` on contenteditable → suggestName → setFilename if !dirty
  - Save handler: generateBlobs → FormData → POST or PUT → onSaved()
- **MIRROR**: CONTENTEDITABLE_UNCONTROLLED, AUTO_NAMING_DIRTY_FLAG
- **GOTCHA**: Init `dirtyRef.current = !!existingDoc` — existing docs keep their filenames. Only seed contenteditable once (dangerouslySetInnerHTML on initial mount). For logo slot: check if `data-logo-slot` div already exists before inserting.
- **VALIDATE**: New template → live auto-naming; override filename stops updates; logo previews top-left; Batal closes; Simpan calls API

### Task 11: Client Export (PDF + DOCX)
- **ACTION**: Implement `generateBlobs` helper inside EditorModal
- **IMPLEMENT**:
  ```ts
  function exportShell(html: string) {
    return `<div style="font-family:'Times New Roman',serif;font-size:12pt;color:#000;padding:30px">${html}</div>`;
  }
  async function generateBlobs(contentHtml: string): Promise<{ pdfBlob: Blob; docxBlob: Blob }> {
    const shell = exportShell(contentHtml);
    const [{ default: html2pdf }, { asBlob }] = await Promise.all([
      import('html2pdf.js'),
      import('html-docx-js-typescript'),
    ]);
    const pdfBlob: Blob = await html2pdf().set({ margin: 10, jsPDF: { format: 'a4' } }).from(shell).outputPdf('blob');
    const docxBlob = await asBlob(shell) as Blob;
    return { pdfBlob, docxBlob };
  }
  ```
- **MIRROR**: N/A — pure client logic
- **IMPORTS**: Dynamic imports only (`html2pdf.js`, `html-docx-js-typescript`)
- **GOTCHA**: `html2pdf().outputPdf('blob')` returns a native Promise — must await. Both libs touch `window` at module eval time — dynamic import required. Do NOT import at top of file. `asBlob` returns `Promise<Blob | ArrayBuffer>` in some versions — cast to Blob.
- **VALIDATE**: Blobs > 0 bytes; PDF opens with content; DOCX shows formatted document

### Task 12: API Routes — Documents CRUD
- **ACTION**: Write 4 route files
- **IMPLEMENT**:

  **`/api/documents/route.ts`**:
  ```ts
  export async function GET(req: Request) {
    const session = await auth(); if (!session) return NextResponse.json({error:'Unauthorized'},{status:401});
    const { search='', folder='', page='1', pageSize='10' } = Object.fromEntries(new URL(req.url).searchParams);
    const where = { ...(folder ? { folder: folder as FolderType } : {}), filename: { contains: search, mode: 'insensitive' as const } };
    const [items, total] = await Promise.all([
      prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Number(page)-1)*Number(pageSize), take: Number(pageSize) }),
      prisma.document.count({ where }),
    ]);
    return NextResponse.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  }
  export async function POST(req: Request) {
    const session = await auth(); if (!session) return NextResponse.json({error:'Unauthorized'},{status:401});
    const form = await req.formData();
    const filename = (form.get('filename') as string)?.trim();
    const folder = form.get('folder') as string;
    const template = form.get('template') as string;
    const contentHtml = form.get('contentHtml') as string;
    const logoBase64 = form.get('logoBase64') as string | null;
    const pdfFile = form.get('pdf') as File;
    const docxFile = form.get('docx') as File;
    if (!filename || !folder || !template || !contentHtml || !pdfFile || !docxFile)
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    const folderMap: Record<string, string> = { SURAT_TUGAS: process.env.GDRIVE_FOLDER_SURAT_TUGAS_ID!, BERITA_ACARA: process.env.GDRIVE_FOLDER_BERITA_ACARA_ID! };
    const folderId = folderMap[folder];
    if (!folderId) return NextResponse.json({ error: 'invalid folder' }, { status: 400 });
    const [pdfBuf, docxBuf] = await Promise.all([pdfFile.arrayBuffer(), docxFile.arrayBuffer()]);
    const [pdf, docx] = await Promise.all([
      uploadFile(filename+'.pdf', 'application/pdf', Buffer.from(pdfBuf), folderId),
      uploadFile(filename+'.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from(docxBuf), folderId),
    ]);
    try {
      const doc = await prisma.document.create({ data: { filename, folder: folder as FolderType, template: template as TemplateType, contentHtml, logoBase64, driveFileIdPdf: pdf.id, driveFileIdDocx: docx.id, webViewLinkPdf: pdf.webViewLink, webViewLinkDocx: docx.webViewLink, createdById: session.user.id } });
      return NextResponse.json(doc, { status: 201 });
    } catch (e) {
      await Promise.allSettled([deleteFile(pdf.id), deleteFile(docx.id)]);
      throw e;
    }
  }
  ```

  **`/api/documents/[id]/route.ts`**: GET (return row), PUT (upload new, update row, delete old), DELETE (delete Drive files + row). Same auth guard pattern.

  **`/api/documents/[id]/download/route.ts`**: GET → fetch row → streamFile → Web ReadableStream response with Content-Type + Content-Disposition.

- **MIRROR**: ERROR_HANDLING, GDRIVE_CLIENT
- **IMPORTS**: `import { auth } from '@/auth'`, `import { prisma } from '@/lib/prisma'`, `import { uploadFile, deleteFile, streamFile } from '@/lib/gdrive'`, `import { FolderType, TemplateType } from '@prisma/client'`
- **GOTCHA**: FormData binary: `Buffer.from(await file.arrayBuffer())`. Validate folder/template against enum values. Convert Node Readable to Web ReadableStream in download route (see Task 5 gotcha).
- **VALIDATE**: POST → Drive files created + DB row; DELETE → Drive files gone + row gone; download → binary response with correct headers

### Task 13: Documents Table Component
- **ACTION**: Write `src/components/DocumentsTable.tsx`
- **IMPLEMENT**:
  - `'use client'`, `forwardRef` to expose `{ refresh: () => void }`
  - State: `docs`, `total`, `page=1`, `search=''`, `loading=false`
  - Fetch fn: `GET /api/documents?search=&folder=&page=&pageSize=10`
  - Debounced search: `useRef<ReturnType<typeof setTimeout>>`, 300ms delay
  - Table columns: Nama Berkas | Lokasi Folder | Tanggal Diarsip | Aksi
  - Date: `new Date(doc.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' })`
  - Folder display: `doc.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara'`
  - Row actions:
    - Download PDF: `<a href="/api/documents/${doc.id}/download?type=pdf" download>` + FileDown icon
    - Download DOCX: same with `type=docx` + FileText icon
    - Edit: Pencil icon → call `onEditDoc(doc)` prop
    - Delete: Trash2 icon → `window.confirm('Hapus dokumen ini?')` → DELETE fetch → refresh
  - Pagination: Prev/Next buttons + "Halaman X dari Y" text
  - Empty state: `<tr><td colSpan={4} className="text-center text-slate-400 py-8">Belum ada surat yang dibuat…</td></tr>`
- **MIRROR**: NAMING_CONVENTION
- **IMPORTS**: Lucide: `FileDown`, `FileText`, `Pencil`, `Trash2`
- **GOTCHA**: `forwardRef` + `useImperativeHandle` to expose `refresh`. Accept `activeFolder` prop and include in fetch URL. Pass `onEditDoc` prop up so dashboard can open EditorModal with existing doc data.
- **VALIDATE**: Table populates on load; search debounces; pagination navigates; delete removes row; edit callback fires

### Task 14: Dashboard Page Composition
- **ACTION**: Write `src/app/(dashboard)/page.tsx`
- **IMPLEMENT**:
  ```tsx
  'use client'
  export default function DashboardPage() {
    const [activeTemplate, setActiveTemplate] = useState<TemplateDef | null>(null);
    const [editDoc, setEditDoc] = useState<ExistingDoc | null>(null);
    const [activeFolder, setActiveFolder] = useState<FolderType | null>(null);
    const [counts, setCounts] = useState({ ST: 0, BA: 0 });
    const tableRef = useRef<{ refresh: () => void }>(null);
    // fetch counts on mount
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard ICONFORM</h1>
        <FolderCards counts={counts} activeFolder={activeFolder} onFilter={setActiveFolder} />
        <TemplateGrid onSelect={setActiveTemplate} />
        <DocumentsTable ref={tableRef} activeFolder={activeFolder} onEditDoc={setEditDoc} onCountsChange={setCounts} />
        {(activeTemplate || editDoc) && (
          <EditorModal
            template={activeTemplate ?? TEMPLATES.find(t => t.id === editDoc!.template)!}
            existingDoc={editDoc ?? undefined}
            onClose={() => { setActiveTemplate(null); setEditDoc(null); }}
            onSaved={() => { setActiveTemplate(null); setEditDoc(null); tableRef.current?.refresh(); }}
          />
        )}
      </div>
    );
  }
  ```
- **MIRROR**: NAMING_CONVENTION
- **GOTCHA**: Dashboard layout (server) guards session; page itself is client for state. Title shows "ICONFORM" not "SimSurat". Folder counts can come from the list endpoint response or a separate aggregation query.
- **VALIDATE**: All 6 template modals open; table filters by folder; edit opens pre-filled modal; new doc appears after save

### Task 15: Smoke Test
- **ACTION**: Write `src/lib/templates.test.ts`
- **IMPLEMENT**:
  ```ts
  import { parseHTML } from 'linkedom';
  import { TEMPLATES } from './templates';
  function mockDOM(fieldMap: Record<string, string>) {
    const spans = Object.entries(fieldMap).map(([k,v]) => `<span data-field="${k}">${v}</span>`).join('');
    const { document } = parseHTML(`<div>${spans}</div>`);
    return document.querySelector('div')! as unknown as HTMLElement;
  }
  let passed = 0, failed = 0;
  function assert(label: string, actual: string|null, expected: string|null) {
    if (actual === expected) { console.log('✓', label); passed++; }
    else { console.error('✗', label, '| got:', actual, '| expected:', expected); failed++; }
  }
  const ST = TEMPLATES.find(t => t.id === 'SURAT_TUGAS')!;
  assert('ST placeholder→null', ST.suggestName(mockDOM({ namaPenerima: '[Nama Staf Penerima Tugas]' })), null);
  assert('ST real name', ST.suggestName(mockDOM({ namaPenerima: 'Ahmad Fauzi' })), 'Surat_Tugas_Ahmad_Fauzi');
  // ... remaining 6 templates
  if (failed > 0) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`All ${passed} tests passed`);
  ```
- **MIRROR**: N/A
- **IMPORTS**: `import { parseHTML } from 'linkedom'`
- **GOTCHA**: `linkedom` `HTMLElement` is not the browser type — cast with `as unknown as HTMLElement`. The `innerText` property in linkedom returns the text content without HTML tags. Verify `suggestName` uses `innerText` (or `textContent` as fallback) not `innerHTML`.
- **VALIDATE**: `npx tsx src/lib/templates.test.ts` → "All N tests passed", exit 0

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| suggestName ST | `[Nama Staf Penerima Tugas]` | `null` | No — placeholder |
| suggestName ST | `Ahmad Fauzi` | `Surat_Tugas_Ahmad_Fauzi` | No |
| suggestName ST | `Ahmad & Fauzi` | `Surat_Tugas_Ahmad_Fauzi` | Yes — special chars stripped |
| suggestName BA Pengujian | `PT. Maju Bersama` | `Berita Acara Hasil Pengujian_PT. Maju Bersama` | No |
| suggestName BAI | `A121303002XYZ` | `BAI A121303002XYZ` | No |
| suggestName BAP | `SO-2024-0042` | `BAP_SO-2024-0042` | No |
| suggestName BAKL | nomor=`A311601001953`, company=`MSR` | `BAKL_A311601001953_MSR` | No |
| suggestName UID | `A121610ABC` | `UID JABAR A121610ABC` | No |
| suggestName BAKL | nomor=`[nomor]` | `null` | Yes — partial placeholder |

### Edge Cases Checklist
- [ ] Empty filename → blocked by API (400)
- [ ] Watched field = placeholder → suggestName returns null
- [ ] Logo upload on non-allowLogo template → input hidden
- [ ] Drive upload OK but DB write fails → both Drive files deleted
- [ ] Download with invalid type param → 400
- [ ] Unauthenticated API call → 401
- [ ] Delete non-existent Drive file → 404 swallowed, Prisma throws → 404 response

---

## Validation Commands

### Static Analysis
```bash
npx tsc --noEmit
```
EXPECT: Zero type errors

### Smoke Tests
```bash
npx tsx src/lib/templates.test.ts
```
EXPECT: All assertions pass, exit 0

### Full Build
```bash
npm run build
```
EXPECT: Completes, `.next/standalone` generated

### Docker Build
```bash
docker compose build
```
EXPECT: ~200MB image, no Puppeteer/Chromium

### Dev Server
```bash
npm run dev
```
EXPECT: App starts on :3000, no console errors

### Manual E2E (Phase 5 script)
1. `docker compose up --build`
2. `http://localhost:3000` → `/login`
3. Login admin/admin123 → dashboard
4. BAP template → fill No Sales Order → filename = `BAP_<value>`
5. Override filename → further edits don't clobber
6. Simpan → row in table under Folder Berita Acara
7. Search → found
8. Edit → change → save → re-download DOCX has edit
9. Delete → row gone, Drive files gone
10. `docker compose down && docker compose up` → data persists

---

## Acceptance Criteria
- [ ] All 15 tasks completed
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx tsx src/lib/templates.test.ts` → all pass
- [ ] `npm run build` succeeds
- [ ] Docker image ~200MB
- [ ] Login page shows **ICONFORM** (not SimSurat)
- [ ] All 6 templates with correct auto-naming
- [ ] PDF+DOCX download via Drive proxy works
- [ ] Edit re-uploads to Drive + updates DB
- [ ] Delete removes Drive files + DB row
- [ ] Data survives `docker compose down && up`

## Completion Checklist
- [ ] All "SimSurat" references replaced with "ICONFORM"
- [ ] Docker service/DB names use `iconform` prefix
- [ ] `.env.example` uses iconform naming
- [ ] Error handling: validate at boundary, cleanup on partial failure
- [ ] No hardcoded credentials (read from env)
- [ ] `// ponytail:` comments on deliberate shortcuts
- [ ] `allowLogo` flag gates logo UI correctly
- [ ] `dirty` flag prevents filename clobber
- [ ] Email auth gated behind `NEXT_PUBLIC_ENABLE_EMAIL_AUTH`

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `html2pdf.js` SSR crash | High | Build failure | Dynamic import only, never top-level |
| NextAuth v5 beta API changes | Medium | Auth broken | Pin exact beta version at install |
| Drive Readable → Web ReadableStream | Medium | Download broken | Test with small file first |
| contenteditable + React re-render | High | Editor input lost | Uncontrolled pattern mandatory — no state sync |
| `html-docx-js-typescript` DOCX fidelity | Low | Formatting issues | Acceptable per ponytail tradeoff |

## Notes
- Website name: **ICONFORM** everywhere — login title, page metadata, Docker names, env prefixes
- Blueprint directive: "build the laziest thing that works" — mark shortcuts with `// ponytail:` comment
- No shadcn, no react-query, no zod — native fetch + useState + Tailwind direct
- Session table in schema stays (Auth.js adapter shape, future email auth), unused under JWT
- `// ponytail:` required on: client-side PDF, offset pagination, seed-at-boot, replace-not-version for doc edits
