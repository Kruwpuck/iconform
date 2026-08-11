# project-blueprint.md — SimSurat (PLN Icon Plus Regional Jawa Barat)

> **Audience:** Claude Code (CLI agent). Execute phases sequentially. Each phase ends with a runnable acceptance check — do not proceed until it passes.
>
> **Engineering directive (ponytail):** Build the laziest thing that works. No abstraction with one implementation. Native platform features over libraries. Client-side file generation over server-side headless Chrome. Mark every deliberate shortcut with a `// ponytail:` comment naming the ceiling and upgrade path.

---

## 0. System Summary

Document Management System. Admin logs in → picks a template (Surat Tugas, BAI, BAP, BAKL, UID JABAR, BA Pengujian) → edits document in a `contenteditable` A4-style editor → filename auto-generates from marked fields inside the document (but stays user-editable) → on Save, browser generates `.pdf` + `.docx` blobs → server uploads both to Google Drive via Service Account → metadata + Drive file IDs stored in PostgreSQL → dashboard lists/searches/paginates/edits/deletes/downloads.

**UI reference:** `shania3.html` (uploaded). Replicate its look: blue-950 sidebar, PLN Icon Plus badge (amber "PLN" + sky "iconplus"), folder cards (amber = Surat Tugas, sky = Berita Acara), white table card, editor modal with dashed slate frame around a white contenteditable page, filename + readonly target-folder inputs, emerald "Simpan ke Folder" button. Tailwind + Lucide icons throughout.

**Key architectural decisions (do not relitigate):**

| Decision | Choice | Why (ponytail) |
|---|---|---|
| PDF generation | **Client-side**, `html2pdf.js` | Skips Puppeteer/Chromium → Docker image stays ~200MB not 1.5GB. Ceiling: rasterized PDF. Upgrade path: server-side Puppeteer if print fidelity complaints arrive. |
| DOCX generation | **Client-side**, `html-docx-js-typescript` | Same HTML source as editor, one code path. |
| Editor | Native `contenteditable` div | No Tiptap/Slate. Templates are HTML strings with marked `<span data-field="...">` sync points — exactly the reference file's pattern. |
| Auth | NextAuth v5 (Auth.js), Credentials provider, **JWT session strategy** | Credentials provider doesn't play well with DB sessions. `Session` table exists in schema (required for future email auth) but stays unused under JWT. |
| Email auth | Schema + provider config present, UI hidden behind `NEXT_PUBLIC_ENABLE_EMAIL_AUTH=false` | Feature-flagged as required. No SMTP config needed until flag flips. |
| File storage | Google Drive only, DB stores `fileId`s | No local file writes. Download = server proxies `drive.files.get(alt=media)` (service-account files aren't public). |
| Drive folders | Two pre-created folder IDs in env vars | No find-or-create boot logic. Human creates 2 folders once, shares with service account, pastes IDs into `.env`. |

---

## 1. Project Folder Structure

```
simsurat/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .dockerignore
├── next.config.ts                  # output: 'standalone'
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                     # creates admin user (bcrypt hash)
├── public/
├── src/
│   ├── middleware.ts               # protect everything except /login + auth routes
│   ├── auth.ts                     # NextAuth config (Credentials + flagged Email)
│   ├── lib/
│   │   ├── prisma.ts               # singleton PrismaClient
│   │   ├── gdrive.ts               # service-account drive client: upload, delete, stream
│   │   └── templates.ts            # template HTML strings + naming rules registry
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # sidebar + guard
│   │   │   └── page.tsx            # folder cards + table + template grid
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── documents/
│   │   │   │   ├── route.ts        # GET list (search+pagination), POST create
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts    # GET one, PUT update, DELETE
│   │   │   │       └── download/route.ts  # GET ?type=pdf|docx → stream from Drive
│   │   └── favicon.ico
│   └── components/
│       ├── Sidebar.tsx
│       ├── FolderCards.tsx
│       ├── DocumentsTable.tsx      # search, pagination, edit/delete/download
│       ├── TemplateGrid.tsx
│       └── EditorModal.tsx         # contenteditable + auto-naming + logo upload + save
└── README.md
```

// ponytail: no `services/`, `hooks/`, `types/` directories. Types live next to usage. Add folders when a second consumer appears.

---

## 2. Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String     @id @default(cuid())
  username      String     @unique
  email         String?    @unique      // used only when email auth flag flips
  passwordHash  String
  name          String
  createdAt     DateTime   @default(now())
  sessions      Session[]
  documents     Document[]
}

// Required by spec + future email auth (Auth.js adapter shape).
// Unused under JWT strategy today. ponytail: keep, costs nothing.
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum FolderType {
  SURAT_TUGAS    // "Folder Surat Tugas"
  BERITA_ACARA   // "Folder Berita Acara"
}

enum TemplateType {
  SURAT_TUGAS
  BA_PENGUJIAN
  BAI
  BAP
  BAKL
  UID_JABAR
}

model Document {
  id              String       @id @default(cuid())
  filename        String                       // final (possibly user-overridden) name, no extension
  folder          FolderType
  template        TemplateType
  contentHtml     String       @db.Text        // editor HTML — enables Edit + re-export
  logoBase64      String?      @db.Text        // mitra logo (Berita Acara only)
  driveFileIdPdf  String
  driveFileIdDocx String
  webViewLinkPdf  String
  webViewLinkDocx String
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  createdById     String
  createdBy       User         @relation(fields: [createdById], references: [id])

  @@index([folder, createdAt])
  @@index([filename])
}
```

---

## 3. Docker Configuration

### `Dockerfile`

```dockerfile
# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- run ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER nextjs
EXPOSE 3000
# migrate then start. ponytail: migration-at-boot fine for single instance;
# split into a migrate job if replicas ever appear.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: simsurat
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-simsurat_dev}
      POSTGRES_DB: simsurat
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U simsurat -d simsurat"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://simsurat:${POSTGRES_PASSWORD:-simsurat_dev}@db:5432/simsurat
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

### `.env.example`

```env
POSTGRES_PASSWORD=change_me
DATABASE_URL=postgresql://simsurat:change_me@localhost:5432/simsurat

AUTH_SECRET=generate_with_openssl_rand_base64_32
AUTH_TRUST_HOST=true

# seeded admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_NAME=Administrator SimSurat

# feature flag — email auth UI hidden while false
NEXT_PUBLIC_ENABLE_EMAIL_AUTH=false

# Google Drive service account (single-line JSON, base64-encoded to dodge quoting hell)
GDRIVE_SERVICE_ACCOUNT_B64=
GDRIVE_FOLDER_SURAT_TUGAS_ID=
GDRIVE_FOLDER_BERITA_ACARA_ID=
```

`.dockerignore`: `node_modules`, `.next`, `.git`, `.env`.

---

## 4. Template & Naming Registry (the crucial logic)

All templates and naming rules live in **one file**: `src/lib/templates.ts`. Each entry:

```ts
export type TemplateDef = {
  id: TemplateType;
  label: string;              // card title
  description: string;        // card subtitle
  folder: 'SURAT_TUGAS' | 'BERITA_ACARA';
  allowLogo: boolean;         // true for all Berita Acara templates
  html: string;               // initial contenteditable content
  // reads the live editor DOM, returns suggested filename or null if fields still placeholder
  suggestName: (root: HTMLElement) => string | null;
};
```

Sync fields inside template HTML are marked spans, styled like the reference file:
`<span data-field="namaPenerima" class="bg-amber-100 px-1 rounded font-bold">[Nama Staf Penerima Tugas]</span>`

**Auto-naming rules (from WhatsApp reference screenshots — verbatim contract):**

| Template | Watched field(s) `data-field` | Filename pattern | Notes |
|---|---|---|---|
| Surat Tugas | `namaPenerima` | `Surat_Tugas_<Nama_Penerima>` | spaces→`_`, strip non-alphanumerics (reference file already does this — copy its regex) |
| BA Pengujian | `namaPerusahaan` | `Berita Acara Hasil Pengujian_<nama perusahaan>` | spec typo "acraa" corrected; keep spaces as given |
| BAI | `nomorSeri` | `BAI <nomor seri>` | space separator, per screenshot `BAI A121303002...` |
| BAP | `noSalesOrder` | `BAP_<No Sales Order>` | underscore, per message "format save e BAP_No Sales Order" |
| BAKL | `nomor`, `namaPerusahaan` | `BAKL_<nomor>_<NamaPerusahaan>` | nomor auto-fills from what user typed in the surat; per screenshot `BAKL A311601001953 MSR` where MSR = company |
| UID JABAR | `nomor` | `UID JABAR <nomor>` | spaces, per screenshot `UID JABAR A121610...` |

**Behavioral contract (non-negotiable, from "walaupun ws diomatiskan penulisan di buat save itu tp ttp bisa diedit ya (overall)"):**

1. On every `input` event in the editor, run the template's `suggestName`.
2. Write the suggestion into `<input id="output-filename">` **only if the user has not manually touched it**. Track with a `dirty` boolean set on the input's own `input` event (typing in the editor fires on the contenteditable, not the input — no conflict).
3. The input is always enabled. Whatever is in it at Save time wins. This applies to **all** templates.
4. If watched field still contains its `[placeholder]` text → no suggestion.

Template HTML content: reproduce the document bodies in the style of `shania3.html`'s `templatesData` (Times New Roman header block, nomor line, body paragraphs, right-aligned signature block, Bandung + localized date). For BAI/BAP/BAKL/UID JABAR write plausible PLN Icon Plus formal Indonesian bodies with the watched fields embedded as marked spans — content wording is editable by users anyway; the naming fields are the contract.

---

## 5. Implementation Phases

### Phase 1 — Setup & Docker

1. `npx create-next-app@latest simsurat --typescript --tailwind --app --src-dir --no-eslint` (App Router, src dir).
2. `npm i lucide-react @prisma/client next-auth@beta bcryptjs googleapis html2pdf.js html-docx-js-typescript`
   `npm i -D prisma @types/bcryptjs`
   // ponytail: exactly these. No zod, no react-query, no shadcn. Fetch + useState suffice at this scale.
3. `next.config.ts`: set `output: 'standalone'`.
4. Write `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example` exactly as §3. Copy `.env.example` → `.env`, fill `AUTH_SECRET` (`openssl rand -base64 32`).
5. Global styles: keep Tailwind defaults; fonts = system sans + `'Times New Roman', serif` utility class for document bodies (match reference).

**Accept:** `docker compose up --build` → app answers on `:3000` (default Next page ok), `db` healthy. Also `npm run dev` works locally against compose's Postgres (`docker compose up db`).

### Phase 2 — DB & Auth

1. Write `prisma/schema.prisma` (§2). `npx prisma migrate dev --name init`.
2. `prisma/seed.ts`: upsert admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env, `bcryptjs.hash(pw, 10)`. Wire `"prisma": { "seed": "tsx prisma/seed.ts" }` (add `tsx` devDep) and run seed inside the Docker CMD after `migrate deploy`:
   `npx prisma migrate deploy && npx prisma db seed && node server.js`
   // ponytail: seed is idempotent upsert, safe on every boot.
3. `src/lib/prisma.ts`: standard globalThis singleton.
4. `src/auth.ts` (NextAuth v5):
   - `session: { strategy: 'jwt' }`.
   - **Credentials provider:** authorize = find user by username, `bcrypt.compare`. Return `{ id, name, username }`.
   - **Email provider:** include the provider config **only when** `process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true'` (spread-conditional in the providers array). No SMTP env vars needed while flag is false.
   - Callbacks: put `user.id` on token/session.
5. `src/middleware.ts`: everything requires session except `/login`, `/api/auth/*`, static assets.
6. `/login` page: replicate the reference auth card pixel-for-pixel intent — gradient `from-blue-900 via-sky-800 to-teal-700`, white/95 blur card, PLN iconplus badge, "SimSurat" + "Regional Jawa Barat", Username/Password fields, sky-600 submit "Masuk ke Sistem". `signIn('credentials', ...)`, show inline error on failure.
   - Below the form, render "Masuk dengan Email" section **only if** `process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true'`.
7. Logout button in sidebar → `signOut()`.

**Accept:** wrong password rejected; admin/admin123 lands on dashboard; hitting `/` unauthenticated redirects to `/login`; flag flip to `true` shows email UI (visual only — no SMTP test needed).

### Phase 3 — Editor, Auto-Naming & Logo Upload

1. `src/lib/templates.ts` per §4 — all six templates, HTML strings, `suggestName` fns.
2. Dashboard `(dashboard)/page.tsx` composition per reference: header, `FolderCards`, `DocumentsTable` (stub for now), `TemplateGrid` listing the six templates (amber icon for Surat Tugas card, sky for the five Berita Acara cards), each "Gunakan Template →" opens `EditorModal`.
3. `EditorModal.tsx`:
   - Layout per reference: title + category badge, dashed slate frame, white A4-ish `contenteditable` div (`min-h-[350px] p-8 prose max-w-none`), info caption, blue panel with **Nama File Hasil Dokumen** (`<input>`, mono font, editable) + **Folder Tujuan Otomatis** (readonly input showing "Folder Surat Tugas"/"Folder Berita Acara" from template def), Batal + emerald "Simpan ke Folder".
   - Seed `contenteditable` with `dangerouslySetInnerHTML` from template def. Keep a `ref`, never re-render it from state while typing (uncontrolled — React fights contenteditable otherwise).
   - `onInput` → run `suggestName(ref.current)` → set filename input unless dirty (§4 contract).
   - **Logo Mitra (Berita Acara only, `allowLogo`):** above the frame, `<label>` + native `<input type="file" accept="image/*">`. On change: `FileReader.readAsDataURL` → base64 string → insert/replace `<img data-logo src="..." style="max-height:64px" class="absolute? no — float-left">` as the **first child, top-left** of the contenteditable (wrap document in a container whose first element is a left-aligned logo block: `<div data-logo-slot class="mb-4"><img src=... style="max-height:64px"/></div>`). Because it's inline base64 inside the exported HTML, it survives both PDF and DOCX export with zero extra work.
   - // ponytail: native file input, no dropzone lib. Base64 in DB `logoBase64` + inline in `contentHtml`; dedupe later only if DB size hurts.
4. Save flow (client): read `ref.current.innerHTML` → wrap with export shell (§ Phase 4 step 3) → generate blobs → POST. Wire in Phase 4; for now `console.log` payload.

**Accept:** open each template → typing in the marked span updates filename live per the table in §4; manually editing filename stops auto-overwrite; logo upload previews top-left; placeholder text produces no filename suggestion.

### Phase 4 — Export & Google Drive Integration

1. **One-time human setup (put in README):** GCP project → enable Drive API → create service account → download JSON key → `base64 -w0 key.json` into `GDRIVE_SERVICE_ACCOUNT_B64` → create the two Drive folders → share each with the service-account email as Editor → paste folder IDs into env.
2. `src/lib/gdrive.ts`:
   - Build client: `new google.auth.GoogleAuth({ credentials: JSON.parse(Buffer.from(env.GDRIVE_SERVICE_ACCOUNT_B64,'base64').toString()), scopes:['https://www.googleapis.com/auth/drive'] })` → `google.drive({version:'v3', auth})`. Module-level singleton.
   - `uploadFile(name, mime, buffer, folderId)` → `files.create({ requestBody:{name, parents:[folderId]}, media:{mimeType:mime, body:Readable.from(buffer)}, fields:'id, webViewLink' })`.
   - `deleteFile(fileId)` — swallow 404.
   - `streamFile(fileId)` → `files.get({fileId, alt:'media'}, {responseType:'stream'})`.
3. **Client export shell:** wrap editor HTML in a minimal standalone doc before conversion — `<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; padding:30px">…</div>`. PDF: `html2pdf().set({margin:10, jsPDF:{format:'a4'}}).from(shell).outputPdf('blob')`. DOCX: `asBlob(shellHtml)` from `html-docx-js-typescript`. Import `html2pdf.js` dynamically inside the handler (`await import`) — it touches `window`, must not run during SSR.
4. `POST /api/documents` (multipart `FormData`): fields `filename, folder, template, contentHtml, logoBase64?`, files `pdf, docx`.
   - Validate: filename non-empty (trim), folder/template are known enum values, blobs present. // trust boundary — never skip.
   - Upload both to the folder's Drive ID (`filename + '.pdf' / '.docx'`), then `prisma.document.create` with ids/links/session user id. If DB write fails after upload, delete the two Drive files (try/catch cleanup).
5. `PUT /api/documents/[id]`: same payload. Upload new pdf+docx, update row, then delete the two old Drive files. // ponytail: replace-not-version; add versioning only if asked.
6. `DELETE /api/documents/[id]`: delete both Drive files, then row.
7. `GET /api/documents/[id]/download?type=pdf|docx`: fetch row → `streamFile` → respond with proper `Content-Type` (`application/pdf` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) and `Content-Disposition: attachment; filename="<filename>.<ext>"`.
8. All document routes: reject if no session (`auth()` in route handler).

**Accept:** Save from editor → two files appear in the correct Drive folder → row in DB with both fileIds → download buttons return working PDF and DOCX containing the logo → delete removes Drive files + row.

### Phase 5 — Dashboard, Search & Pagination

1. `GET /api/documents?search=&folder=&page=1&pageSize=10`:
   - `where: { folder?, filename: { contains: search, mode: 'insensitive' } }`, `orderBy: createdAt desc`, `skip/take`, return `{ items, total, page, pageSize }`.
   - // ponytail: offset pagination. Cursor pagination when rows > ~50k, not before.
2. `FolderCards`: two cards per reference (amber ST / sky BA), live document counts (return counts from the list endpoint or a cheap `groupBy`), click filters table + highlights active card, "Tampilkan Semua Folder" reset link.
3. `DocumentsTable`:
   - Columns: Nama Berkas | Lokasi Folder | Tanggal Diarsip (id-ID long date) | Aksi.
   - Search input (debounce 300ms — one `setTimeout`, no lodash), page controls (Prev / `page x of y` / Next).
   - Row actions: **Download PDF**, **Download DOCX** (link to download route), **Edit** (opens `EditorModal` seeded with `contentHtml` + existing filename, dirty=true so auto-name doesn't clobber the saved name; submit hits PUT), **Delete** (native `confirm()` then DELETE, refresh list). Lucide icons: `file-down`, `file-text`, `pencil`, `trash-2`.
   - Empty state row: "Belum ada surat yang dibuat…" per reference.
4. Sidebar per reference: PLN iconplus badge, Dashboard nav item, Keluar button pinned bottom, `bg-blue-950`, responsive (`w-full md:w-64`).
5. Final pass: `docker compose up --build` from clean state → seed admin → full E2E: login → create BAP doc → auto-name `BAP_<sales order>` → override name → save → appears in table under Folder Berita Acara → search finds it → edit changes content → re-download reflects edit → delete cleans Drive + DB.

**Accept:** the Phase 5 step-5 E2E script passes manually; `docker compose down && docker compose up` retains data (pgdata volume).

---

## 6. Explicitly Skipped (add only when the trigger fires)

- Roles/RBAC — single admin role. Trigger: second user class requested.
- Server-side PDF (Puppeteer) — trigger: rasterized PDF quality complaint.
- Drive folder auto-provisioning — trigger: multi-tenant deployment.
- Rate limiting, CSRF beyond NextAuth defaults — internal tool behind login.
- Test framework — leave one smoke script `scripts/smoke.md` documenting the Phase 5 E2E steps. Naming logic gets one tiny unit check: `src/lib/templates.test.ts` executable via `npx tsx` asserting each `suggestName` pattern against a mock DOM string (use `linkedom` devDep or plain regex on innerText extraction — pick the lazier that works).
