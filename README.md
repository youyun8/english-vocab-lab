# English Vocabulary Lab

An interactive **B2–C2 English vocabulary learning platform** built for Traditional Chinese
(`zh-TW`) speakers. It is designed for long-term daily study rather than as a demo: every word
comes with KK phonetics, English *and* Traditional Chinese definitions, a written explanation of
how the word actually behaves, collocations, grammar patterns, common learner mistakes, and
comparisons against words it is easily confused with.

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

- 120 curated B2–C2 entries (36 B2 / 60 C1 / 24 C2) aimed at professional, software-engineering,
  academic and analytical English.
- KK phonetic transcription (American English) for every headword, **machine-verified against the
  CMU Pronouncing Dictionary** (see [KK verification](#17-kk-phonetic-verification)), in a font
  stack chosen for IPA coverage.
- Multiple parts of speech and multiple senses per entry.
- Per sense: English definition, Traditional Chinese definition, a written Chinese usage explanation,
  grammar patterns, collocations, 2–4 natural example sentences with translations, usage notes and
  common learner mistakes.
- Word families, synonyms, antonyms, and a confusing-word comparison table — present on **every**
  entry — that links to the other entry when it is in the corpus.
- Browser speech synthesis for pronunciation (an audio convenience — the KK transcription is the authority).

**Practice**

- Seven quiz types: `meaning_en_to_zh`, `meaning_zh_to_en`, `cloze`, `usage`, `collocation`,
  `grammar`, `confusing_words`.
- 174 hand-written questions with explanations, plus recognition questions generated from the corpus.
- Quiz modes: random, weak words, mistake review, due review, bookmarked, difficult.
- Answer feedback that explains why the right answer is right *and* why the important distractors are wrong.
- Keyboard shortcuts (`1`–`4`, `Enter`, `Space`, `B`) that never fire while a form control has focus.

**Review and analytics**

- Lightweight spaced repetition with a documented, unit-tested scheduler. The interval ladder is a
  **user setting** (default 1 → 3 → 7 → 14 → 30 days), editable by preset or by hand.
- Deterministic weak-word scoring, driving both `/review` and the weak-word quiz mode.
- A statistics page with status distribution, accuracy by CEFR level and question type, a 14-day
  activity chart and a learning streak — all drawn with CSS/SVG, no chart library.

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
              +-- Sessions            /api/auth/me, /api/auth/logout
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

### Bundle strategy

The corpus is loaded through a **lazy** `import.meta.glob`, so each JSON file becomes its own chunk
fetched on demand, and routes below the dashboard are code-split. This is what lets the corpus grow
from 120 to several thousand entries without the initial download growing with it.

```text
initial JS bundle   224 kB  (71 kB gzipped)
per data file        ~15 kB  (~6 kB gzipped, loaded in parallel on first use)
per route chunk    2–15 kB
```

The design has been measured against exactly this: doubling the corpus (60 → 120 entries,
98 → 174 questions) grew the initial bundle by **2 kB**, because the new content landed in new
chunks that are only fetched when a page needs them.

---

## 5. Source directory structure

```text
src/
  app/
    App.tsx                 application root
    router.tsx              routes; code-splits everything below the dashboard
    providers.tsx           auth → settings → vocabulary → progress
    RouteErrorBoundary.tsx

  components/
    ui/                     Button, Card, Badge, StatTile, Toggle, EmptyState, …
    layout/AppShell.tsx     header, navigation, Suspense boundary, merge banner

  domain/                   types + Zod schemas + pure rules (no I/O)
    vocabulary.ts  quiz.ts  progress.ts  review.ts  settings.ts  stats.ts  user.ts

  shared/api.ts             wire contract shared by browser and Worker

  data/
    index.ts                lazy, validated content loader
    vocabulary/b2|c1|c2/    the corpus, ~6 entries per file
    questions/              curated question bank, one file per question type

  repositories/
    vocabulary-repository.ts
    progress-repository.ts            interfaces
    anonymous-progress-repository.ts  localStorage
    cloud-progress-repository.ts      Worker API

  services/
    search.ts  quiz-engine.ts  question-generator.ts
    progress-merge.ts  stats.ts  pronunciation.ts  api-client.ts

  features/
    auth/  vocabulary/  quiz/  review/  stats/  settings/  progress/

  pages/                    one component per route

  worker/
    index.ts                Hono app mounted at /api
    routes/                 auth, progress, quiz, review, stats, settings
    middleware/             auth, error-handler
    services/               github-oauth, session, crypto
    repositories/           user, session, progress, quiz, settings

  test/                     D1 adapter, jsdom setup, render helpers
  utils/  styles/

scripts/validate-vocabulary.ts
migrations/0001_initial.sql
```

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
| `npm run validate:data` | Validate the vocabulary and question corpus |
| `npm run verify:kk` | Check every KK transcription against the CMU Pronouncing Dictionary |
| `npm run verify:kk:report` | The same check, listing conventions, variants and exceptions |
| `npm run kk -- <word…>` | Propose a KK transcription for a headword you are about to add |
| `npm run merge:vocab -- <patch.json>` | Merge extra fields into existing entries (never overwrites) |
| `npm run verify` | Typecheck, lint, test, validate data, verify KK, build — the CI order |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database |

### How OAuth works locally

The Worker runs on the same origin as the SPA (`http://localhost:5173`), so the local callback URL
is `http://localhost:5173/api/auth/github/callback`.

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
| `APP_URL` | Public origin, e.g. `https://vocab.example.com` | No |
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
APP_URL=http://localhost:5173
ENVIRONMENT=development
```

### Production

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put APP_URL
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
  with `?code=…&state=…`. It must match `APP_URL + /api/auth/github/callback` exactly, or GitHub
  refuses the request.
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
}

interface VocabularySense {
  id: string;                         // unique across the whole corpus
  partOfSpeech: PartOfSpeech;
  register?: Register[];

  definitionEn: string;
  definitionZh: string;
  usageExplanationZh: string;         // the "用法解析" block

  grammarPatterns?: string[];
  collocations?: Collocation[];
  examples: ExampleSentence[];        // at least one
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
  | 'meaning_en_to_zh' | 'meaning_zh_to_en' | 'cloze' | 'usage'
  | 'collocation' | 'grammar' | 'confusing_words';

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
  because a generator cannot guarantee that exactly one option is defensible.
- **Generated** questions are derived from the corpus at runtime, and only for the two simple
  recognition types (`meaning_en_to_zh`, `meaning_zh_to_en`). Two safeguards keep them fair:
  distractors are drawn from entries with a matching part of speech, and any entry that is a
  declared synonym of the target — or whose gloss matches the target's — is excluded, so a question
  can never have two defensible answers. Ids are derived from `entry.id` + type, so duplicates are
  impossible. See `src/services/question-generator.test.ts`.

---

## 14. How to add a vocabulary entry

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

4. Run `npm run validate:data` **and** `npm run verify:kk`.

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

---

## 15. How to add a quiz question

1. Pick the file matching the type: `src/data/questions/{cloze,collocation,confusing-words,grammar,meaning,usage}.json`.
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
the answer away by shape alone). It does **not** check the phonetics themselves — that is
`npm run verify:kk`, described in [section 17](#17-kk-phonetic-verification).

Example output:

```text
✓ Content validation passed
  vocabulary entries : 120
      B2   36
      C1   60
      C2   24
  curated questions  : 174
      cloze              36
      collocation        32
      confusing_words    34
      grammar            28
      meaning_en_to_zh   10
      meaning_zh_to_en   10
      usage              24
```

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

On a first deployment you will not yet know the `workers.dev` URL. Deploy once with a placeholder
`APP_URL`, note the URL Wrangler prints, then set `APP_URL` and the OAuth App's callback URL to it
and redeploy (step 11).

### Step 7 — Set the production secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put APP_URL
```

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

### Step 11 — Update the OAuth configuration if the URL changed

If this was a first deployment, update **both**:

```bash
npx wrangler secret put APP_URL     # https://your-worker.workers.dev
```

and the GitHub OAuth App's Homepage URL and Authorization callback URL. Then `npx wrangler deploy`
again. A mismatch here is the single most common cause of `redirect_uri_mismatch`.

### Step 12 — Optional custom domain

See the next section.

---

## 22. Custom domain

1. Add your domain to Cloudflare (Cloudflare dashboard → **Add a site**) and point its nameservers
   at Cloudflare.
2. Dashboard → **Workers & Pages** → your Worker → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain**. Cloudflare provisions the certificate automatically.
3. Update `APP_URL`:

```bash
npx wrangler secret put APP_URL     # https://vocab.example.com
```

4. Update the GitHub OAuth App:

```text
Homepage URL:                https://vocab.example.com
Authorization callback URL:  https://vocab.example.com/api/auth/github/callback
```

5. Redeploy: `npx wrangler deploy`.

All four must agree: the custom domain, `APP_URL`, the OAuth Homepage URL, and the OAuth callback URL.

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

**`redirect_uri_mismatch` from GitHub**
The OAuth App's callback URL must exactly equal `APP_URL + /api/auth/github/callback`, including
scheme, host, port and no trailing slash. Check `npx wrangler secret list` and the OAuth App settings.

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
`GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `APP_URL` is absent.

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
