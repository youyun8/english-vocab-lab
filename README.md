# English Vocabulary Lab

An interactive English vocabulary platform for Traditional Chinese (`zh-TW`) speakers preparing
for TOEFL, GRE or IELTS. The corpus contains **4,120 words**: 120 detailed B2–C2 lessons and
4,000 attributed dictionary entries for recognition and review. Every entry has KK phonetics and
English/Traditional Chinese definitions. The curated lessons additionally explain usage,
collocations, grammar patterns, common mistakes and confusing words.

Dictionary entries are clearly identified; their CEFR bands are frequency-based estimates.
See [corpus sources, content depth and import instructions](docs/corpus.md).

Progress works signed-out (in the browser) and signed-in (synchronised to Cloudflare D1 via GitHub
login).

---

## Table of contents

1. [Features](#1-features)
2. [Screenshots](#2-screenshots)
3. [Technology stack](#3-technology-stack)
4. [Architecture overview](#4-architecture-overview)
5. [Source directory structure](#5-source-directory-structure)
6. [Local development](#6-local-development)
7. [Environment variables and secrets](#7-environment-variables-and-secrets)
8. [GitHub OAuth App setup](#8-github-oauth-app-setup)
9. [Creating the D1 database](#9-creating-the-d1-database)
10. [Migrations](#10-migrations)
11. [Testing](#11-testing)
12. [Vocabulary schema](#12-vocabulary-schema)
13. [Question schema](#13-question-schema)
14. [How to add a vocabulary entry](#14-how-to-add-a-vocabulary-entry)
15. [How to add a quiz question](#15-how-to-add-a-quiz-question)
16. [Data validation](#16-data-validation)
17. [KK phonetic verification](#17-kk-phonetic-verification)
18. [Anonymous vs signed-in progress](#18-anonymous-vs-signed-in-progress)
19. [Progress merge rules](#19-progress-merge-rules)
20. [Spaced-repetition settings](#20-spaced-repetition-settings)
21. [Deployment with Wrangler](#21-deployment-with-wrangler)
22. [Custom domain](#22-custom-domain)
23. [Security notes](#23-security-notes)
24. [Troubleshooting](#24-troubleshooting)
25. [Future architecture](#25-future-architecture)

---

## 1. Features

**Vocabulary**

- 4,120 distinct entries: 120 curated lessons plus 4,000 TOEFL/GRE/IELTS dictionary entries
  (2,791 `toefl`, 2,593 `gre`, 2,186 `ielts`); use the exam filter to study one list at a time.
- 1,907 B2 / 1,429 C1 / 784 C2, including estimated bands on dictionary entries.
- Paginated word browsing (50 results per page), with search and filters over the full corpus.
- A filter rail that counts what each option would leave, keeps applied filters visible as
  removable chips, collapses the sections you are done with, and scrolls independently of the
  results.
- KK phonetic transcription (American English) for every headword, **machine-verified against the
  CMU Pronouncing Dictionary** (see [KK verification](#17-kk-phonetic-verification)), in a font
  stack chosen for IPA coverage.
- Multiple parts of speech and multiple senses per entry.
- Per curated sense: English definition, Traditional Chinese definition, a written Chinese usage explanation,
  grammar patterns, collocations, 2–4 natural example sentences with translations, usage notes and
  common learner mistakes.
- Word families, synonyms, antonyms, and a confusing-word comparison table — present on **every**
  curated entry — that links to the other entry when it is in the corpus.
- Browser speech synthesis for pronunciation (an audio convenience — the KK transcription is the authority).

**Practice**

- Eight quiz types: `meaning_en_to_zh`, `meaning_zh_to_en`, `definition_to_word`, `cloze`, `usage`,
  `collocation`, `grammar`, `confusing_words`.
- 251 hand-written questions with explanations — including cloze, usage, collocation, grammar and
  confusable-word questions written for the imported TOEFL/GRE vocabulary — plus recognition
  questions generated from the corpus, so the question bank covers **every** word that ships.
- A browsable question bank whose options are always visible and whose answers stay hidden until you
  pick one or ask for the answer, so browsing it is practice rather than reading a solutions sheet.
- Quiz modes: random, weak words, mistake review, due review, bookmarked, difficult.
- Answer feedback that explains why the right answer is right *and* why the important distractors are wrong.
- Keyboard shortcuts (`1`–`4`, `Enter`, `Space`, `B`) that never fire while a form control has focus.

**Review and analytics**

- Lightweight spaced repetition with a documented, unit-tested scheduler. The interval ladder is a
  **user setting** (default 1 → 3 → 7 → 14 → 30 days), editable by preset or by hand.
- Deterministic weak-word scoring, driving both `/review` and the weak-word quiz mode.
- A statistics page with status distribution, accuracy by CEFR level and question type, a 14-day
  activity chart and a learning streak — all drawn with CSS/SVG, no chart library.

**Appearance**

- A theme, text-size and content-width picker in the header, applied live to the page you are
  reading and repeated on the settings page.
- Themes: light, dark, or follow the system. The stored choice is applied by a small inline script
  before the first paint, so a dark-theme reader never sees a white flash.
- Text size (15/16/18 px root) and content width (56/72/88 rem) — everything else is expressed in
  `rem` and in `--app-max-width`, so both scale the whole app.
- These preferences are per browser, not per account: the right theme and line length depend on the
  screen, not on who is signed in.

**Accounts and data**

- GitHub OAuth implemented directly in the Cloudflare Worker; opaque, server-side sessions.
- Anonymous progress in `localStorage`; signed-in progress in Cloudflare D1, synchronised across devices.
- An explicit, idempotent first-login merge of local progress into the cloud account.
- JSON import/export, validated with Zod before anything is written.

---

## 2. Screenshots

> _Screenshots go here._
>
> | Page | Placeholder |
> | --- | --- |
> | Dashboard (`/`) | `docs/screenshots/dashboard.png` |
> | Word detail (`/words/consolidate`) | `docs/screenshots/word-detail.png` |
> | Quiz (`/quiz`) | `docs/screenshots/quiz.png` |
> | Statistics (`/stats`) | `docs/screenshots/stats.png` |

---

## 3. Technology stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript (strict) + Vite 8 |
| Routing | React Router 7 (`BrowserRouter`) |
| Styling | Tailwind CSS v4 |
| API | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Auth | GitHub OAuth, implemented in the Worker |
| Validation | Zod v4 (shared by client, Worker and build-time scripts) |
| Tests | Vitest + React Testing Library |
| Deploy | Wrangler + Workers Static Assets |

There is deliberately **no** Supabase, Firebase, Auth0 or Clerk: authentication, sessions and
persistence are all owned by this application.

---

## 4. Architecture overview

```text
Browser
  |
  +-- React / Vite SPA  (static assets, SPA fallback)
  |
  +-- /api/*
        |
        +-- Cloudflare Worker (Hono)
              |
              +-- GitHub OAuth        /api/auth/github, /api/auth/github/callback
              +-- Sessions            /api/auth/me, /api/auth/logout, /api/auth/github/config
              +-- Progress API        /api/progress
              +-- Quiz API            /api/quiz
              +-- Review API          /api/review
              +-- Stats API           /api/stats
              +-- Settings API        /api/settings
              |
              +-- Cloudflare D1
```

Two rules shape the whole design:

1. **Static content stays in git.** The vocabulary corpus and the curated question bank are JSON
   files in `src/data`, so they get history, code review, build-time validation and reproducible
   deployments. They are *not* stored in D1.
2. **D1 holds only user-owned data.** Users, sessions, per-word progress, quiz history and settings.

### Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain | `src/domain` | Types + Zod schemas + pure rules (scheduling, scoring, accuracy). No I/O. |
| Services | `src/services` | Application logic: search, quiz assembly, question generation, merge, stats. |
| Repositories | `src/repositories` | Persistence boundary (`VocabularyRepository`, `ProgressRepository`, `SettingsRepository`). |
| Features | `src/features` | React components, contexts and hooks per domain area. |
| Pages | `src/pages` | Route components. They compose features; they contain no business logic. |
| Worker | `src/worker` | Routes → services → repositories, mirroring the same separation server-side. |

Pages never touch `localStorage`, `fetch` or D1 directly. They call a repository, and the repository
implementation is chosen by auth state — which is what makes anonymous and signed-in mode the same
code path.

### Loading strategy

Routes below the dashboard are code-split, and the corpus is **never loaded whole** for browsing.
Two generated files (see [section 5](#5-source-directory-structure)) sit in front of it:

| File | When it loads | Size at 4,120 words |
| --- | --- | --- |
| `vocabulary-index.json` | Once, on first corpus use | 617 kB raw, **148 kB gzipped** |
| `vocabulary-search.json` | The first time a query is typed | 652 kB raw, 255 kB gzipped |
| `vocabulary/**/*.json` | Only the chunks a page actually needs | ~30 kB per 50-word chunk |

The index carries what a list needs — headword, KK, parts of speech, CEFR, gloss, tags, the chunk
holding the full entry, and which recognition questions the word can produce. Everything else is
fetched per use:

| Page | Vocabulary data files fetched |
| --- | --- |
| Dashboard, review, statistics, word bank | 1 (the index) |
| Word bank with a search query | 2 (index + search text) |
| Word detail | 2 (index + the one chunk holding that word) |
| Quiz | ~12 (index, curated questions, and the chunks of the words it picked) |
| Question bank | ~12 (index, curated questions, and the chunks of the page in view) |

**No page loads the whole corpus** — the repository deliberately offers no "give me everything".

A quiz picks its words from the index *before* downloading anything, and picks them a chunk at a
time: sampling words independently would scatter one quiz across most of the corpus's files.

The question bank does the same for a different reason. The index records which recognition types
each word supports, which is enough to know what the bank *contains* — 12,508 questions, their
order, and what every filter would leave — so the page builds question **references** and turns
only the twenty in view into real questions. Two consequences worth knowing:

- A generated question's query matches its headword and gloss (which is what its prompt is written
  from), not the option texts, which do not exist until the page is built. Curated questions are
  matched in full.
- A generated question's options are stable for a given page of the bank, because the distractor
  pool is derived from that page's own words. Change the filter and the same question may draw
  different distractors; the answer, and the rules that keep exactly one option defensible, never
  vary.

```text
initial JS bundle    234 kB  (75 kB gzipped)
vocabulary index     592 kB  (147 kB gzipped, once)
per data chunk       ~30 kB  (~7 kB gzipped, only when a word needs it)
per route chunk     2–15 kB
```

The point of this shape is that browsing cost tracks the number of *words*, not the depth of their
lessons, and adding a curated lesson with twenty examples costs a browsing learner nothing.

---

## 5. Source directory structure

```text
src/
  app/
    App.tsx                 application root
    router.tsx              routes; code-splits everything below the dashboard
    providers.tsx           appearance → auth → settings → vocabulary → progress
    RouteErrorBoundary.tsx

  components/
    ui/                     Button, Card, Badge, StatTile, Toggle, EmptyState, …
    ui/filters.tsx          filter rail, collapsible groups, counted chips
    layout/AppShell.tsx     header, navigation, Suspense boundary, merge banner

  domain/                   types + Zod schemas + pure rules (no I/O)
    vocabulary.ts  quiz.ts  progress.ts  review.ts  settings.ts  stats.ts  user.ts
    appearance.ts           theme, text size and content width (per browser)

  shared/api.ts             wire contract shared by browser and Worker

  data/
    index.ts                index loader, per-chunk loader, full-corpus loader
    vocabulary-index.json   generated: one row per word, what lists and the
                            question bank need
    vocabulary-search.json  generated: the deeper searchable prose
    vocabulary/b2|c1|c2/    curated lessons, ~6 entries per file
    vocabulary/exam/        dictionary entries, 50 per file (80 files)
    questions/              curated question bank, one file per question type
                            (`exam-*.json` cover the imported TOEFL/GRE words)

  repositories/
    vocabulary-repository.ts
    progress-repository.ts            interfaces
    anonymous-progress-repository.ts  localStorage
    cloud-progress-repository.ts      Worker API

  services/
    search.ts  quiz-engine.ts  question-generator.ts  question-bank.ts
    progress-merge.ts  stats.ts  pronunciation.ts  api-client.ts

  features/
    auth/  vocabulary/  quiz/  review/  stats/  settings/  progress/  appearance/

  pages/                    one component per route

  worker/
    index.ts                Hono app mounted at /api
    routes/                 auth, progress, quiz, review, stats, settings
    middleware/             auth, error-handler
    services/               github-oauth, session, crypto
    repositories/           user, session, progress, quiz, settings

  test/                     D1 adapter, jsdom setup, render helpers
  utils/  styles/

public/                   favicon.ico, icon.svg, apple-touch-icon.png, site.webmanifest
scripts/validate-vocabulary.ts
scripts/build-vocabulary-index.ts
migrations/0001_initial.sql
```

The app icon is authored once as `public/icon.svg`; the PNG sizes and `favicon.ico` are rendered
from it, so the bookmark bar, the browser tab, an iOS home screen and an installed PWA all show the
same mark.

---

## 6. Local development

> **New to Cloudflare Workers?** A Worker is a small server-side function that Cloudflare runs at
> the edge. D1 is Cloudflare's SQLite database. Wrangler is the CLI that creates, migrates and
> deploys both. You do not need any of this running to *read* the code — but you do to sign in.

### Prerequisites

- Node.js 22 or newer
- A Cloudflare account (free tier is enough)
- A GitHub account (to create an OAuth App)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create the local secrets file
cp .dev.vars.example .dev.vars
#    then edit .dev.vars — see section 7

# 3. Create the local D1 database and apply migrations
npx wrangler d1 migrations apply advanced-english-vocabulary --local

# 4. Start the dev server (React + Worker + local D1, all on one port)
npm run dev
```

Open <http://localhost:5173>. A single Vite dev server serves the React app **and** runs the Worker
in the real `workerd` runtime with a local D1 database, so `/api/*` behaves exactly as it will in
production. There is no second process to start.

### Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Worker + local D1 |
| `npm run build` | Typecheck, then build client and Worker into `dist/` |
| `npm run preview` | Build, then serve the built output through `wrangler dev` |
| `npm run deploy` | Build, then `wrangler deploy` |
| `npm run typecheck` | TypeScript across all five project configs |
| `npm run lint` | ESLint |
| `npm test` | Vitest (all suites, once) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run validate:data` | Validate the corpus, and check the generated index is current |
| `npm run build:index` | Regenerate `vocabulary-index.json` and `vocabulary-search.json` |
| `npm run verify:kk` | Check every KK transcription against the CMU Pronouncing Dictionary |
| `npm run verify:kk:report` | The same check, listing conventions, variants and exceptions |
| `npm run kk -- <word…>` | Propose a KK transcription for a headword you are about to add |
| `npm run merge:vocab -- <patch.json>` | Merge extra fields into existing entries (never overwrites) |
| `npm run verify` | Typecheck, lint, test, validate data, verify KK, build — the CI order |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database |

### How OAuth works locally

The Worker runs on the same origin as the SPA (`http://localhost:5173`), so the local callback URL
is `http://localhost:5173/api/auth/github/callback`. That URL is not configured anywhere: the Worker
derives the OAuth `redirect_uri` from the origin of the incoming request, so the same build works on
localhost, on `*.workers.dev` and on a custom domain. `GET /api/auth/github/config` prints the exact
value the running deployment will send to GitHub — the value to register as the callback URL.

**Create a separate GitHub OAuth App for local development.** A GitHub OAuth App has exactly one
callback URL, so sharing one app between localhost and production is not possible. Two apps also
means a leaked local secret cannot be used against production.

With `ENVIRONMENT=development` in `.dev.vars`:

- session cookies omit the `Secure` flag, so they work over plain `http://localhost`;
- API errors include the real reason (for example which secret is missing) instead of a generic message.

---

## 7. Environment variables and secrets

| Name | Purpose | Secret? |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client id | Not strictly — see below |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | **Yes** |
| `SESSION_SECRET` | Key used to sign the OAuth state cookie | **Yes** |
| `APP_URL` | Optional override for the public origin, e.g. `https://vocab.example.com` | No |
| `ENVIRONMENT` | `development` locally; anything else means production | No |

**On `GITHUB_CLIENT_ID`:** a client id is not a credential — it is sent to the browser as a query
parameter on every login and GitHub treats it as public. It could safely live in `wrangler.jsonc`
under `vars`. This project stores it with `wrangler secret put` anyway, for two reasons: the client
id and secret are rotated together, so keeping them in one place avoids a half-updated deployment;
and it keeps a real (if non-sensitive) identifier out of the repository. The trade-off is that a
fresh deployment needs one extra `secret put` before login works.

### Local

`.dev.vars` (git-ignored — never commit it):

```dotenv
GITHUB_CLIENT_ID=Ov23liYourLocalClientId
GITHUB_CLIENT_SECRET=your-local-client-secret
SESSION_SECRET=<openssl rand -hex 32>
ENVIRONMENT=development
```

**`APP_URL` is optional.** Leave it unset and the redirect URI follows the origin the app is served
on. Set it only to pin a canonical origin (a reverse proxy, or a custom domain that should own the
login flow even when the app is also reachable at `*.workers.dev`) — and then register
`APP_URL + /api/auth/github/callback` as the OAuth App callback URL, exactly.

Never put `APP_URL` in the `vars` block of `wrangler.jsonc`: `vars` are re-uploaded on every
`wrangler deploy` and overwrite a secret of the same name, which silently resets a deployed origin
back to whatever the file says.

### Production

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
# Optional — only to pin a canonical origin:
# npx wrangler secret put APP_URL
```

Generate a session secret with:

```bash
openssl rand -hex 32
```

---

## 8. GitHub OAuth App setup

In GitHub:

```text
GitHub
→ Settings
→ Developer settings
→ OAuth Apps
→ New OAuth App
```

### Local development app

```text
Application name:            English Vocabulary Lab (local)
Homepage URL:                http://localhost:5173
Authorization callback URL:  http://localhost:5173/api/auth/github/callback
```

### Production app

```text
Application name:            English Vocabulary Lab
Homepage URL:                https://YOUR_WORKER_OR_CUSTOM_DOMAIN
Authorization callback URL:  https://YOUR_WORKER_OR_CUSTOM_DOMAIN/api/auth/github/callback
```

**Do not confuse these two URLs:**

- The **authorization callback URL** is registered with GitHub. GitHub redirects the browser here
  with `?code=…&state=…`. It must equal the `redirect_uri` the Worker sends — the origin the app is
  served on plus `/api/auth/github/callback`, or `APP_URL + /api/auth/github/callback` when
  `APP_URL` is set — exactly, or GitHub refuses the request with *"The redirect_uri is not
  associated with this application"*. Open `https://YOUR_DEPLOYMENT/api/auth/github/config` to read
  the exact value back from the running app.
- The **post-login application redirect** is where *this app* sends the user once the session cookie
  is set. It is never taken from the query string — it is chosen from a fixed allowlist in
  `src/worker/services/github-oauth.ts`, which is what makes an open redirect impossible.

### Scopes

The app requests **no scopes at all**. That yields public profile information only: numeric id,
login, display name and avatar. No repository access and no email access are requested.

The numeric GitHub id is the external identity, because a GitHub username can be changed and later
re-used by somebody else.

---

## 9. Creating the D1 database

```bash
npx wrangler login
npx wrangler whoami          # confirm the right account
npx wrangler d1 create advanced-english-vocabulary
```

The command prints a `database_id`. Copy it into `wrangler.jsonc`, replacing the placeholder:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "advanced-english-vocabulary",
    "database_id": "PASTE_THE_ID_HERE",
    "migrations_dir": "migrations"
  }
]
```

The local development database needs no id — Wrangler creates it under `.wrangler/state`.

---

## 10. Migrations

Schema lives in `migrations/`, applied in filename order.

```bash
# local
npx wrangler d1 migrations apply advanced-english-vocabulary --local

# production
npx wrangler d1 migrations apply advanced-english-vocabulary --remote
```

Never edit a migration that has been applied to production, and never create tables by hand in the
Cloudflare dashboard — add `migrations/0002_….sql` instead.

### Schema

```sql
users            (id, github_id UNIQUE, github_login, github_name, github_avatar_url,
                  created_at, updated_at)

sessions         (id, session_token_hash UNIQUE, user_id → users, created_at, expires_at)
                 indexes on user_id and expires_at

oauth_states     (state, created_at, expires_at)     -- single-use CSRF state

word_progress    (user_id, word_id) PRIMARY KEY
                 status, bookmarked, difficult, times_seen, quiz_attempts,
                 correct_answers, mistake_count, review_streak,
                 last_reviewed_at, next_review_at, updated_at
                 index on (user_id, next_review_at) for the due-review queue

quiz_attempts    (id, user_id → users, started_at, completed_at,
                  total_questions, correct_answers)

quiz_answers     (id, quiz_attempt_id → quiz_attempts, question_id, word_id,
                  question_type, cefr, selected_option_id, correct, answered_at)

user_settings    (user_id → users, settings_json, updated_at)

progress_imports (user_id, import_id) PRIMARY KEY   -- makes merges idempotent
```

Every child table cascades on user delete, and `CHECK` constraints reject impossible values
(negative counters, unknown statuses, non-boolean flags) at the database level as well as in Zod.

---

## 11. Testing

```bash
npm test            # once
npm run test:watch  # watch mode
```

405 tests across 21 files, in two Vitest projects: `unit` (Node) and `ui` (jsdom).

**Unit tests** cover the spaced-repetition scheduler (mistake, first correct, repeated correct,
reset after a mistake, mastery, overdue, and custom interval ladders), the ARPABET↔KK conversion
(including a 5,000-word round trip against CMUdict), weak-word ranking, progress arithmetic, search behaviour,
quiz assembly and answer evaluation, generated-question ambiguity protection, the local↔cloud merge
(including commutativity and idempotence), session token hashing, OAuth state and redirect helpers,
import validation, and the shipped corpus itself.

**Component tests** cover quiz interaction (including keyboard shortcuts and the fact that feedback
is conveyed by text, not colour alone), word-bank filtering and sorting, word-detail rendering and
bookmark/difficult toggles, mistake review, signed-in vs signed-out rendering, and settings import
validation.

**Worker/API tests** run the real Hono app against the **real migration**, executed on an in-memory
SQLite database through a D1-compatible adapter (`src/test/d1.ts`). That means the `user_id`
predicates which enforce isolation are genuinely exercised rather than mocked. They cover
unauthenticated rejection of every protected endpoint, authenticated access, cross-user isolation
for progress / quizzes / settings / statistics, session expiry, logout invalidating the token
server-side, malformed request validation, import idempotency, and that a hostile word id or GitHub
login is stored as literal data rather than executed as SQL.

---

## 12. Vocabulary schema

Defined in `src/domain/vocabulary.ts`. The Zod schemas are the source of truth; the TypeScript types
are inferred from them, so runtime validation and compile-time types cannot drift apart.

```ts
type CefrLevel = 'B2' | 'C1' | 'C2';

type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'adverb'
  | 'preposition' | 'conjunction' | 'phrase' | 'other';

type Register =
  | 'formal' | 'informal' | 'neutral' | 'academic'
  | 'business' | 'technical' | 'literary' | 'spoken';

interface VocabularyEntry {
  id: string;            // "w_consolidate"
  lemma: string;
  slug: string;          // lowercase kebab-case, used in the URL
  cefr: CefrLevel;

  pronunciation: { kk: string; syllables?: string; stressNote?: string };

  forms?: {
    plural?, past?, pastParticiple?, presentParticiple?,
    thirdPersonSingular?, comparative?, superlative?: string;
  };

  senses: VocabularySense[];          // at least one

  synonyms?: RelatedWord[];
  antonyms?: RelatedWord[];
  commonlyConfusedWith?: ConfusedWord[];
  wordFamily?: WordFamilyItem[];
  tags: string[];
  dictionarySource?: {
    name: 'ECDICT'; revision: string; license: 'MIT'; cefrEstimated: true;
  };
}

interface VocabularySense {
  id: string;                         // unique across the whole corpus
  partOfSpeech: PartOfSpeech;
  register?: Register[];

  definitionEn: string;
  definitionZh: string;
  usageExplanationZh?: string;        // required for curated lessons

  grammarPatterns?: string[];
  collocations?: Collocation[];
  examples: ExampleSentence[];        // at least one for curated lessons
  usageNotes?: string[];
  commonMistakes?: CommonMistake[];
}

interface ExampleSentence { en: string; zh: string; highlight?: string }
interface Collocation     { text: string; meaningZh?: string; example?: ExampleSentence }
interface CommonMistake   { incorrect?: string; correct?: string; explanationZh: string }
interface RelatedWord     { wordId?: string; lemma: string; noteZh?: string }
interface WordFamilyItem  { lemma: string; partOfSpeech: PartOfSpeech; meaningZh?: string }
interface ConfusedWord    { lemma: string; wordId?: string; distinctionZh: string }
```

`pronunciation` is an object rather than a bare string so that IPA, UK pronunciation or audio files
can be added later without a data migration. Only KK is required today — and it is checked against a
real pronunciation database, not taken on trust; see [section 17](#17-kk-phonetic-verification).

Optional fields should be **absent when they are not pedagogically useful**. Do not invent a
collocation or a "common mistake" to fill a field.

---

## 13. Question schema

Defined in `src/domain/quiz.ts`.

```ts
type QuestionType =
  | 'meaning_en_to_zh' | 'meaning_zh_to_en' | 'definition_to_word'
  | 'cloze' | 'usage' | 'collocation' | 'grammar' | 'confusing_words';

interface QuizQuestion {
  id: string;                   // "q_cw_infer_imply_01"
  type: QuestionType;
  cefr: CefrLevel;
  wordIds: string[];            // must reference real entries
  prompt: string;
  context?: string;             // the sentence or scenario above the options
  options: { id: string; text: string }[];   // exactly 4, unique ids and texts
  correctOptionId: string;      // must be one of the option ids
  explanation: string;
  distractorExplanations?: Record<string, string>;   // keyed by option id
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  source: 'curated' | 'generated';
}
```

Correctness is encoded by `correctOptionId`, never by array position, so options can be shuffled
freely without corrupting the answer key.

### Curated vs generated

- **Curated** questions are hand-written and live in `src/data/questions/`. Everything that depends
  on nuance — usage, collocation, grammar, confusing words, and any non-trivial cloze — is curated,
  because a generator cannot guarantee that exactly one option is defensible. The `exam-*.json`
  files carry these nuanced types for the imported TOEFL/GRE words, which ship with dictionary
  definitions but no example sentences, collocations or usage notes of their own.
- **Generated** questions are derived from the corpus at runtime, and only for the three simple
  recognition types (`meaning_en_to_zh`, `meaning_zh_to_en`, `definition_to_word`). Every one of
  them reads fields the schema guarantees on *every* entry — headword, Chinese gloss, English
  definition — so imported dictionary words get practice too. Ids are derived from `entry.id` +
  type, so duplicates are impossible.

  Four rules keep a generated question fair, each of them a test in
  `src/services/question-generator.test.ts` that runs over every question the corpus produces:

  | Rule | What it prevents |
  | --- | --- |
  | Distractors prefer the answer's part of speech | Guessing from grammar alone |
  | A declared synonym, in either direction, is never a distractor | Two defensible answers |
  | A gloss identical to, **containing**, or contained by the answer's is never a distractor | 走失的家畜 next to 家畜 |
  | An English definition that spells out its own headword is masked | The prompt giving the answer away |

  What they cannot do is prove that two dictionary meanings differ. Near-synonyms worded
  differently in the source — 驅逐 against 消滅 — still get through, and the imported glosses are
  machine-converted rather than edited. Generated questions are labelled as such on the card, in
  quiz feedback and in the bank's own filter, and the app says plainly that usage and nuance belong
  to the hand-written questions.
- `definition_to_word` shows the English definition and asks for the word. Any form of the headword
  inside that definition is masked to `___`, and an entry whose masked definition no longer
  identifies a single word (an imported stub such as "become brisk") simply gets no definition
  question — so this type covers most of the corpus rather than all of it.

### The browsable bank

`src/services/question-bank.ts` assembles what `/question-bank` shows: the curated questions plus
generated questions for every entry, ordered so a word's questions sit together, curated first.
Generation there uses a **fixed seed** instead of `Math.random`, so a word's options are the same on
every render, page turn and reload — a bank that reshuffled under the reader would be unstudyable.
Answers are per-card state that resets whenever a filter changes or the page turns.

---

## 14. How to add a vocabulary entry

For dictionary batch imports, see [the reproducible exam corpus workflow](docs/corpus.md).
The steps below create a full curated lesson; its example and usage requirements remain enforced.

1. Pick the right file: `src/data/vocabulary/<b2|c1|c2>/`. Files hold roughly 6 entries each; create
   a new file whenever one grows unwieldy — the loader globs the directory, so no code changes.
2. Get the KK transcription from the pronunciation database rather than writing it from memory:

   ```bash
   npm run kk -- scrutinize
   # scrutinize   /ˈskrutnˌaɪz/   3 syl  skru·tn·aɪz
   ```

3. Add an object to the JSON array:

```json
{
  "id": "w_scrutinize",
  "lemma": "scrutinize",
  "slug": "scrutinize",
  "cefr": "C1",
  "pronunciation": { "kk": "/ˈskrutnˌaɪz/", "syllables": "scru·ti·nize" },
  "senses": [
    {
      "id": "s_scrutinize_1",
      "partOfSpeech": "verb",
      "register": ["formal"],
      "definitionEn": "to examine something very carefully in order to find problems",
      "definitionZh": "仔細審查；詳細檢視",
      "usageExplanationZh": "scrutinize 強調……",
      "grammarPatterns": ["scrutinize + noun"],
      "collocations": [{ "text": "scrutinize the data", "meaningZh": "仔細檢視資料" }],
      "examples": [
        {
          "en": "Reviewers scrutinize every change to the payment code.",
          "zh": "審查者會仔細檢視付款程式碼的每一項變更。",
          "highlight": "scrutinize"
        }
      ]
    }
  ],
  "tags": ["academic", "evaluation"]
}
```

4. Run `npm run build:index` to regenerate the two index files, then
   `npm run validate:data` **and** `npm run verify:kk`. (`validate:data` fails if you forget the
   first step: the app reads the index, so a stale one would show the wrong list.)

Rules the validator enforces: unique `id`, `slug` and sense id; kebab-case slug; KK wrapped in
slashes; at least one sense with at least one example; every `highlight` must actually occur in its
English sentence; and every `wordId` cross-reference must resolve (and not point at itself).
`verify:kk` separately checks the transcription itself against CMUdict — see
[section 17](#17-kk-phonetic-verification).

Two quality bars are enforced by tests rather than the validator: at least 90 % of entries carry a
confusing-word comparison, and at least 60 % carry a usage note or a common mistake. New entries are
expected to hold that line.

### Enriching entries in bulk

To add fields to many existing entries at once, write a patch keyed by entry id and run:

```bash
npm run merge:vocab -- patch.json
```

The tool refuses to overwrite any field that already exists and exits non-zero if it had to skip
something, so it cannot silently clobber curated content.

Common usage phrases, including phrasal verbs such as **abide by the rules**, belong in the
matching sense's `collocations` array, with a Traditional Chinese `meaningZh`. Related words
belong in entry-level `synonyms` and `antonyms`; use `noteZh` to identify the applicable meaning
or explain a difference in usage. Leave antonyms empty when there is no natural opposite.

For bilingual lessons, keep phrases in the authored TSV under `scripts/data/bilingual-lessons/`
as well as the vocabulary JSON. These TSV files support an optional final `collocations` column
containing a JSON array (for example, `[{"text":"abide by the rules","meaningZh":"遵守規則"}]`).
`npm run edit:bilingual` reads this column, so rebuilding lessons preserves the phrases.
Validate an edited TSV with `npm run validate:bilingual-file -- <path-to-tsv>`, then regenerate
the indexes with `npm run build:index` and run `npm run validate:data`.
See [vocabulary enrichment review notes](docs/vocabulary-enrichment-review.md) for original
rare or questionable senses that still need editorial attention.

---

## 15. How to add a quiz question

1. Pick the file matching the type: `src/data/questions/{cloze,collocation,confusing-words,grammar,meaning,usage}.json`
   for the curated lessons, or the matching `exam-*.json` file when the question is about an imported
   TOEFL/GRE word. Numbered suffixes (`-2`) are just size splits; the loader globs the directory.
2. Add an object:

```json
{
  "id": "q_cl_scrutinize_01",
  "type": "cloze",
  "cefr": "C1",
  "wordIds": ["w_scrutinize"],
  "prompt": "Choose the word that best completes the sentence.",
  "context": "Auditors ____ every transaction above ten thousand dollars.",
  "options": [
    { "id": "a", "text": "scrutinize" },
    { "id": "b", "text": "summarize" },
    { "id": "c", "text": "standardize" },
    { "id": "d", "text": "subsidize" }
  ],
  "correctOptionId": "a",
  "explanation": "……",
  "distractorExplanations": { "b": "……", "c": "……", "d": "……" },
  "difficulty": 3,
  "tags": ["cloze", "business"],
  "source": "curated"
}
```

3. Run `npm run validate:data`.

Write distractors that test a real distinction — semantic, register, collocational, grammatical or
near-synonym choice. A question like `consolidate = 整合 / 香蕉 / 游泳 / 星期二` teaches nothing.
Each question must have exactly one defensible answer; if a distinction is genuinely ambiguous,
rewrite the question rather than pretending the ambiguity is not there.

---

## 16. Data validation

```bash
npm run validate:data
```

`scripts/validate-vocabulary.ts` reads the JSON straight from disk and reports **file, entry, field
and reason** for every problem, then exits non-zero.

It detects: missing or duplicate ids, slugs and sense ids; malformed slugs; invalid CEFR levels;
missing KK; empty English or Chinese definitions; senses with no examples; malformed parts of speech
and registers; highlights that do not occur in their sentence; unresolvable or self-referential word
links; malformed questions; duplicate question ids; duplicate option ids or option texts; a
`correctOptionId` that is not among the options; the wrong option count; a `distractorExplanations`
key that is not an option id or that describes the correct answer; questions referencing unknown
word ids; and correct options more than three times longer than every distractor (which would give
the answer away by shape alone). It also rebuilds `vocabulary-index.json` and
`vocabulary-search.json` in memory and fails when the committed files differ, so a corpus change
without `npm run build:index` cannot ship. It does **not** check the phonetics themselves — that is
`npm run verify:kk`, described in [section 17](#17-kk-phonetic-verification).

Example output:

```text
✓ Content validation passed
  vocabulary entries : 4120
      B2   1907
      C1   1429
      C2   784
  curated questions  : 251
      cloze              52
      collocation        48
      confusing_words    50
      grammar            43
      meaning_en_to_zh   10
      meaning_zh_to_en   10
      usage              38
```

The counts above are the *curated* questions only — the questions kept in git. The bank the app
shows also contains the recognition questions generated from all 4,120 entries.

---

## 17. KK phonetic verification

Every KK transcription in the corpus is checked against the **CMU Pronouncing Dictionary** (135,000
entries of ARPABET derived from real American English pronunciation data), not hand-checked and
hoped for.

```bash
npm run verify:kk           # fails the build on a genuine disagreement
npm run verify:kk:report    # also lists conventions, variants and exceptions
```

```text
✓ KK verification passed
  checked      : 120
  exact match  : 89
  convention   : 17
  variant      : 12
  exception    : 2 (of 2 declared)
  unverifiable : 0
  mismatch     : 0
```

### How it works

`scripts/lib/kk.ts` converts ARPABET to KK, syllabifies by the maximal onset principle in order to
place stress marks, and compares the result with the transcription in the corpus. Three
normalisations stop it reporting differences that are purely notational:

- `ɚ` is expanded to `ə` + `r`, so `/kəˈrɑbəˌret/` and `/kɚˈɑbɚˌret/` — the same sounds,
  syllabified differently — compare equal;
- `n` before `k`/`g` becomes `ŋ`, because CMUdict writes the unassimilated form and dictionaries
  write the assimilated one;
- stress is compared as *which syllable* carries it, not as raw character position.

### The four outcomes

| Outcome | Meaning | Build |
| --- | --- | --- |
| **match** | Segments and stress agree exactly. | passes |
| **convention** | Differs only by the house convention: unstressed `/i/` is written `/ɪ/`, as KK is taught in Taiwan (`/dɪˈskrɛpənsɪ/`, not `/dɪˈskrɛpənsi/`). | passes |
| **variant** | Differs only in an unstressed vowel that reputable dictionaries also disagree about (the weak-vowel merger: `ə` ~ `ɪ` ~ `i`), or in a secondary stress mark. | passes |
| **exception** | A declared, reasoned departure from CMUdict — see below. | passes |
| **mismatch** | A real disagreement: wrong vowel, wrong consonant, missing phoneme, or stress on the wrong syllable. | **fails** |

### Declared exceptions

CMUdict stores one pronunciation per word, and it is occasionally a less common variant than the one
every learner dictionary prints. Where that happens, `scripts/lib/kk-exceptions.ts` records the
departure with the **exact** transcription it licenses and a reason, so an exception can never
silently cover a later, different change:

- **undermine** `/ˌʌndɚˈmaɪn/` — CMUdict records initial stress, but Merriam-Webster, Cambridge and
  Longman all give final-syllable stress for the verb, which is the only part of speech this entry
  teaches.
- **tenuous** `/ˈtɛnjuəs/` — CMUdict writes the glide explicitly (`/ˈtɛnjəwəs/`); the American
  Heritage and Cambridge form denotes the same sequence and is far easier for a learner to read.

A test asserts that every declared exception still genuinely disagrees with CMUdict, so a stale
exception fails the build rather than rotting.

### Adding a word

```bash
npm run kk -- scrutinize elucidate
```

```text
scrutinize         /ˈskrutnˌaɪz/               3 syl  skru·tn·aɪz
elucidate          /ɪˈlusəˌdet/                4 syl  ɪ·lu·sə·det
```

Paste the suggestion into the JSON, then run `npm run verify:kk`. Treat the output as a proposal:
if your entry teaches a part of speech with different stress (`attribute` the verb vs the noun),
list both transcriptions — the checker passes an entry if **any** of them matches.

This pass found and fixed three genuine errors in the original corpus: `reinforce` (`/o/` → `/ɔ/`
before `r`), `paradigm` (`/æ/` → `/ɛ/`, the Mary–marry–merry merger) and `subsequent`
(`/ˌkwɛnt/` → `/kwənt/`, an unstressed final syllable).

---

## 18. Anonymous vs signed-in progress

The site is fully usable without an account.

| | Anonymous | Signed in |
| --- | --- | --- |
| Browse, search, pronounce | ✅ | ✅ |
| Take quizzes, see explanations | ✅ | ✅ |
| Bookmark / mark difficult | ✅ (this browser) | ✅ (synced) |
| Spaced-repetition schedule | ✅ (this browser) | ✅ (synced) |
| Quiz history, accuracy by question type | ➖ | ✅ |
| Cross-device sync | ➖ | ✅ |

Both modes go through the same `ProgressRepository` interface, so the only difference is which
implementation the provider selects:

```ts
interface ProgressRepository {
  getAll(): Promise<WordProgress[]>;
  getByWordId(wordId: string): Promise<WordProgress | null>;
  upsert(progress: WordProgress): Promise<void>;
  upsertMany(progress: WordProgress[]): Promise<void>;
  clear(): Promise<void>;
}
```

`AnonymousProgressRepository` (localStorage, validated on every read) or `CloudProgressRepository`
(the Worker API). Page components are identical in both modes.

If the API cannot be reached at all, the UI shows an "offline" indicator and falls back to local
storage rather than failing.

---

## 19. Progress merge rules

When you sign in for the first time on a browser that already has anonymous progress, a banner
offers to merge it. **Nothing is merged without an explicit click, and neither side is ever silently
overwritten.**

Per word id (`src/services/progress-merge.ts`):

| Field | Rule | Why |
| --- | --- | --- |
| `bookmarked`, `difficult` | logical **OR** | a flag set on either device is never lost |
| `timesSeen`, `quizAttempts`, `correctAnswers`, `mistakeCount`, `reviewStreak` | **max**, never a sum | the two datasets usually describe the same learner studying in two places; summing would double-count shared history |
| `status` | the more advanced of the two, then capped | see below |
| `lastReviewedAt` | the **later** timestamp | the more recent fact wins |
| `nextReviewAt` | the **earlier** timestamp | reviewing slightly early is harmless; skipping a due review is not |
| `updatedAt` | the later timestamp | the merged record supersedes both |

Two invariants are enforced after merging: `correctAnswers` is clamped to `quizAttempts`, and a
`mastered` claim is demoted to `reviewing` unless the *merged* counters actually justify it
(streak ≥ 4 and accuracy ≥ 80 %). That stops a stale local record from promoting a word the learner
is still getting wrong.

Because every rule is `max`, `min`, `OR` or "later timestamp", the merge is **commutative and
idempotent**: merging twice produces exactly the same record as merging once. On top of that:

- the browser stores a stable `importId` for its dataset (`evl.localDatasetId.v1`);
- the server records `(user_id, import_id)` in `progress_imports` and refuses a second import of the
  same dataset, returning `{ imported: false, alreadyImported: true }`;
- the browser records which accounts it has already merged into, so the banner does not reappear.

A retried or duplicated request therefore cannot double-count anything. See
`src/services/progress-merge.test.ts` and the import tests in `src/worker/api.test.ts`.

---

## 20. Spaced-repetition settings

The review ladder is the list of intervals, in days, to wait after each consecutive correct answer.
Index 0 applies to a word with no streak (a fresh mistake), index 1 after one correct answer, and so
on; the last entry repeats for ever. A mistake resets the streak to 0.

The default is `[1, 3, 7, 14, 30]`. Learners can change it on `/settings`, by preset or by typing an
exact ladder:

| Preset | Ladder |
| --- | --- |
| 密集 (intensive) | 1, 2, 4, 8, 16 |
| 標準 (standard) | 1, 3, 7, 14, 30 |
| 寬鬆 (relaxed) | 2, 5, 12, 30, 60 |

A custom ladder must be strictly increasing (a schedule that shrinks as you improve would review
mastered words more often than new ones), with 1–10 stages each between 1 and 365 days. Input is
validated before it is applied, so a half-typed value never reaches the scheduler.

### Where it lives

`reviewIntervalsDays` is part of `UserSettings`, so it syncs to D1 like every other preference. The
domain layer stays pure: `intervalDaysForStreak`, `applyReviewOutcome` and `markSeen` all take the
ladder as an argument and default to the standard one, and `ProgressProvider` passes the learner's
choice in.

The Zod field carries `.default([1, 3, 7, 14, 30])`, so settings saved — or exported — before the
ladder existed still parse: they simply pick up the standard schedule. No export version bump is
needed.

### Mastery

Mastery is **derived** from the ladder rather than hard-coded: a word counts as mastered once its
streak reaches the longest interval (`intervals.length - 1`) *and* its overall accuracy is at least
80 %. That keeps the definition meaningful — "you have got this right often enough to wait the
maximum gap" — whichever ladder the learner picks. For the default ladder this is a streak of 4,
exactly matching the original hard-coded constant.

---

## 21. Deployment with Wrangler

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Authenticate Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

### Step 3 — Create the D1 database

```bash
npx wrangler d1 create advanced-english-vocabulary
```

Copy the printed `database_id` into `wrangler.jsonc`.

### Step 4 — Apply migrations locally

```bash
npx wrangler d1 migrations apply advanced-english-vocabulary --local
```

### Step 5 — Apply migrations in production

```bash
npx wrangler d1 migrations apply advanced-english-vocabulary --remote
```

### Step 6 — Create the GitHub OAuth App

See [section 8](#8-github-oauth-app-setup). You need the production app's client id and secret next.

On a first deployment you will not yet know the `workers.dev` URL. Deploy first, note the URL
Wrangler prints (or read `https://YOUR_DEPLOYMENT/api/auth/github/config`), then register that
callback URL with the OAuth App — no redeploy is needed, because the redirect URI follows the origin
the app is served on.

### Step 7 — Set the production secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

`APP_URL` is deliberately not in that list — see [section 7](#7-environment-variables-and-secrets).

### Step 8 — Validate the project

```bash
npm run typecheck
npm run lint
npm test
npm run validate:data
npm run verify:kk
npm run build
```

Or all of them: `npm run verify`.

### Step 9 — Deploy

```bash
npx wrangler deploy
```

`npm run deploy` runs the build first.

### Step 10 — Verify the deployment

Visit the `*.workers.dev` URL Wrangler printed and check:

- [ ] `/` loads
- [ ] `/words` loads and lists the whole corpus
- [ ] `/words/consolidate` works by direct navigation
- [ ] refreshing a deep route still works (SPA fallback)
- [ ] browser back/forward navigation works
- [ ] GitHub login completes and returns you to the app
- [ ] `/api/auth/me` reports the signed-in user
- [ ] the session cookie is `HttpOnly` and `Secure` (DevTools → Application → Cookies)
- [ ] a `users` row exists: `npx wrangler d1 execute advanced-english-vocabulary --remote --command "SELECT id, github_login FROM users"`
- [ ] progress persists after a reload
- [ ] progress persists after logout and login
- [ ] the local→cloud merge banner appears and works
- [ ] quiz history persists (`/stats` shows completed quizzes)
- [ ] the review schedule persists
- [ ] logout works, and the old session is rejected afterwards
- [ ] anonymous mode still works in a private window

### Step 11 — Register the deployed URL with the OAuth App

If this was a first deployment, point the GitHub OAuth App's Homepage URL and Authorization callback
URL at the deployed origin:

```text
Homepage URL:                https://your-worker.workers.dev
Authorization callback URL:  https://your-worker.workers.dev/api/auth/github/callback
```

Confirm the second value against the running app:

```bash
curl https://your-worker.workers.dev/api/auth/github/config
```

A mismatch here is the single most common cause of *"The redirect_uri is not associated with this
application"*. Only set `APP_URL` if you want to pin a canonical origin — and remember that a
stale `APP_URL` produces exactly that error too.

### Step 12 — Optional custom domain

See the next section.

---

## 22. Custom domain

1. Add your domain to Cloudflare (Cloudflare dashboard → **Add a site**) and point its nameservers
   at Cloudflare.
2. Dashboard → **Workers & Pages** → your Worker → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain**. Cloudflare provisions the certificate automatically.
3. Update the GitHub OAuth App:

```text
Homepage URL:                https://vocab.example.com
Authorization callback URL:  https://vocab.example.com/api/auth/github/callback
```

4. Optional — pin the custom domain so that a login started at the old `*.workers.dev` URL still
   lands on it:

```bash
npx wrangler secret put APP_URL     # https://vocab.example.com
npx wrangler deploy
```

The custom domain, the OAuth Homepage URL and the OAuth callback URL must agree; `APP_URL`, when
set, must agree with them too. If you delete it (`npx wrangler secret delete APP_URL`), the redirect
URI follows whichever of the two origins the browser used.

---

## 23. Security notes

Reviewed and covered by tests:

- **OAuth CSRF.** State is a 256-bit CSPRNG value stored in `oauth_states` *and* mirrored in an
  HMAC-signed, HttpOnly cookie. The callback requires both: the database row proves the state is
  known, unexpired and unused (`DELETE … RETURNING` makes it single-use and atomic), and the cookie
  proves the flow started in *this* browser, which is what defeats login CSRF. Missing, expired,
  mismatched and replayed states are all rejected.
- **Open redirect.** Post-login destinations are never read from the query string; they come from a
  fixed allowlist. Absolute URLs, protocol-relative URLs and `javascript:` are all rejected.
- **Session fixation.** A brand-new session row and token are issued on every login, so a token
  planted before login is never adopted.
- **Session storage.** The browser holds a 256-bit opaque token; D1 stores only its SHA-256 hash.
  Database read access therefore does not yield usable sessions.
- **Cookie flags.** `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
- **Logout.** The session is deleted server-side *before* the cookie is cleared, so a captured token
  is dead immediately.
- **Session expiry.** 30 days; expired sessions are rejected and deleted on use, with opportunistic
  cleanup of expired sessions and states on each login.
- **GitHub token handling.** The access token is used once to read the profile and then discarded.
  It is never stored in D1, never logged, never put in a cookie, and never sent to the browser.
- **Least privilege.** No OAuth scopes are requested, so no repository and no email access.
- **Authorization.** User identity is *only* ever derived from the session cookie. No endpoint reads
  a user id from a body, query parameter or header. Every query is scoped by `user_id`, and quiz
  attempts are ownership-checked before any write. Cross-user isolation is tested for progress,
  quizzes, settings and statistics.
- **SQL injection.** Every statement is prepared and parameter-bound; no SQL is built by string
  concatenation. Tested with hostile word ids and GitHub logins.
- **XSS.** React escapes by default. Example-sentence highlighting splits strings and renders a
  `<mark>` element — `dangerouslySetInnerHTML` appears nowhere in the codebase.
- **Unsafe JSON import.** Imported files are fully validated with Zod, including per-record checks
  and a `correctAnswers ≤ quizAttempts` invariant, *before* anything is written. A rejected file
  leaves existing data untouched.
- **Error responses.** Stack traces and internal messages are never returned in production; errors
  are logged server-side and reported as a generic message with a stable error code.
- **Secrets.** `.dev.vars` is git-ignored, and no response includes the client secret or session
  secret (asserted in tests).

Known limitations are listed in [troubleshooting](#24-troubleshooting) and
[future architecture](#25-future-architecture).

---

## 24. Troubleshooting

**`redirect_uri_mismatch`, or "The redirect_uri is not associated with this application"**
The OAuth App's callback URL must exactly equal the `redirect_uri` the Worker sends, including
scheme, host, port and no trailing slash. Read that value straight from the deployment:

```bash
curl https://YOUR_DEPLOYMENT/api/auth/github/config
```

`appUrlSource: "request"` means it follows the origin you called; `appUrlSource: "APP_URL"` means a
configured `APP_URL` is overriding it — if that value is stale (for instance `http://localhost:5173`
left over on a production deployment) either update it or remove it with
`npx wrangler secret delete APP_URL`. Also make sure `APP_URL` is not declared under `vars` in
`wrangler.jsonc`: `vars` overwrite the secret of the same name on every deploy.

**Redirected to `/?login=failed&reason=invalid_state`**
The state cookie was missing or did not match. Usually one of: cookies blocked; more than 10 minutes
between starting and finishing the login; the back button used to replay a completed callback (state
is single-use by design); or `SESSION_SECRET` changed between the two halves of the flow.

**Redirected to `/?login=failed&reason=token_exchange_failed`**
`GITHUB_CLIENT_SECRET` is wrong, or the authorization code was already used. Re-run
`npx wrangler secret put GITHUB_CLIENT_SECRET`.

**Login works locally but not in production**
You are probably sharing one OAuth App between both. Create two — a GitHub OAuth App has exactly one
callback URL.

**`/api/*` returns 500 right after deploying**
A secret is missing. `npx wrangler secret list`, then set whichever of `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `SESSION_SECRET` is absent.

**`Binding name 'APP_URL' already in use` (API error 10053) from `wrangler secret put`**
The deployed Worker still carries `APP_URL` as a plain-text var, uploaded by an older
`wrangler.jsonc` that declared it under `vars`; a secret cannot share a name with an existing
binding. Deploy the current configuration first — `npm run deploy` drops the var, and existing
secrets survive a deploy — then set the secret if you still want one. Usually you do not: with no
`APP_URL` at all, the redirect URI follows the origin the app is served on.

**`D1_ERROR: no such table: users`**
Migrations were not applied to the remote database:
`npx wrangler d1 migrations apply advanced-english-vocabulary --remote`.

**Deep links 404 in production**
`assets.not_found_handling` must be `single-page-application` and `assets.directory` must be
`./dist/client` in `wrangler.jsonc`. Rebuild before deploying.

**`/api/*` returns the SPA HTML instead of JSON**
`assets.run_worker_first` must include `/api/*`, otherwise static assets are matched first.

**Session cookie not set in production**
Cookies are `Secure` outside development, so the site must be served over HTTPS. If you set
`ENVIRONMENT=development` in production, sessions will also fail on modern browsers — don't.

**Progress does not sync after logging in**
Check the merge banner: local progress is only merged when you click. If you dismissed it, reload;
if the dataset was already imported into that account, the server correctly refuses to import it twice.

**KK symbols show as boxes**
The `--font-phonetic` stack in `src/styles/index.css` needs a font with IPA coverage. Installing
Charis SIL or Doulos SIL fixes it on systems whose default fonts lack the glyphs.

**Pronunciation button is disabled**
Either the browser has no `speechSynthesis`, or pronunciation is switched off in `/settings`.
The button's tooltip says which.

**`npm run dev` cannot find the D1 database**
Run `npx wrangler d1 migrations apply advanced-english-vocabulary --local` first.

---

## 25. Future architecture

The codebase is structured so these can be added without a rewrite. None are implemented.

| Extension | Where it plugs in |
| --- | --- |
| Multiple decks / custom user vocabulary | `VocabularyRepository` already abstracts the corpus; add a deck id to `word_progress`. |
| AI-generated questions or explanations | `question-generator.ts` already separates curated from generated; add a new generator behind the same `QuizQuestion` schema. |
| Pronunciation audio, IPA, UK accents | `pronunciation` is an object, not a string — add `ipa`, `uk`, `audioUrl` fields. The ARPABET→KK converter in `scripts/lib/kk.ts` already has the phoneme inventory an IPA renderer would need. |
| User notes | New D1 table keyed `(user_id, word_id)`, plus a repository beside `ProgressRepository`. |
| Per-word interval overrides | The ladder is already a `UserSettings` field threaded through the domain layer; a per-word override would key off `word_progress` instead. |
| CSV / Anki import-export | Reuse `import-export.ts`; add a format adapter that produces the same validated shape. |
| PWA / offline mode | The corpus is already static, hash-named chunks; add a service worker and cache `/api/progress` optimistically. |
| Admin content editor | The validator (`scripts/validate-vocabulary.ts`) is the contract any editor must satisfy. |
| Multilingual UI | UI strings are currently inline `zh-TW`; extract to a message catalogue keyed by locale. |
| Richer analytics | `quiz_answers` already records question type, CEFR and timestamp per answer — the raw data is there. |

---

## License

Not yet specified. Add a `LICENSE` file before publishing.
