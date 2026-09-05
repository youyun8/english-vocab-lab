-- Initial schema for the English Vocabulary Lab.
--
-- Only user-owned data lives in D1. The vocabulary corpus and the curated
-- question bank stay in version control and ship with the Worker bundle.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id                TEXT    PRIMARY KEY,
    -- GitHub's numeric id is the external identity: usernames can be changed
    -- and re-used, numeric ids cannot.
    github_id         INTEGER NOT NULL UNIQUE,
    github_login      TEXT    NOT NULL,
    github_name       TEXT,
    github_avatar_url TEXT,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);

-- Opaque server-side sessions. The browser holds a random token; D1 stores only
-- its SHA-256 hash, so a database leak does not hand out live sessions.
CREATE TABLE sessions (
    id                 TEXT PRIMARY KEY,
    session_token_hash TEXT NOT NULL UNIQUE,
    user_id            TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    expires_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Single-use OAuth state values. Rows are deleted the moment they are consumed,
-- which makes state replay impossible rather than merely unlikely.
CREATE TABLE oauth_states (
    state      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);

-- ---------------------------------------------------------------------------
-- Learning data
-- ---------------------------------------------------------------------------

CREATE TABLE word_progress (
    user_id          TEXT    NOT NULL,
    word_id          TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'learning', 'reviewing', 'mastered')),
    bookmarked       INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1)),
    difficult        INTEGER NOT NULL DEFAULT 0 CHECK (difficult IN (0, 1)),
    times_seen       INTEGER NOT NULL DEFAULT 0 CHECK (times_seen >= 0),
    quiz_attempts    INTEGER NOT NULL DEFAULT 0 CHECK (quiz_attempts >= 0),
    correct_answers  INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
    mistake_count    INTEGER NOT NULL DEFAULT 0 CHECK (mistake_count >= 0),
    review_streak    INTEGER NOT NULL DEFAULT 0 CHECK (review_streak >= 0),
    last_reviewed_at TEXT,
    next_review_at   TEXT,
    updated_at       TEXT    NOT NULL,
    PRIMARY KEY (user_id, word_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Drives the "due for review" queue without a table scan.
CREATE INDEX idx_word_progress_due ON word_progress(user_id, next_review_at);

CREATE TABLE quiz_attempts (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    started_at      TEXT    NOT NULL,
    completed_at    TEXT,
    total_questions INTEGER NOT NULL CHECK (total_questions >= 0),
    correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id, started_at DESC);

CREATE TABLE quiz_answers (
    id                 TEXT    PRIMARY KEY,
    quiz_attempt_id    TEXT    NOT NULL,
    question_id        TEXT    NOT NULL,
    word_id            TEXT,
    question_type      TEXT,
    cefr               TEXT,
    selected_option_id TEXT    NOT NULL,
    correct            INTEGER NOT NULL CHECK (correct IN (0, 1)),
    answered_at        TEXT    NOT NULL,
    FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_answers_attempt ON quiz_answers(quiz_attempt_id);

CREATE TABLE user_settings (
    user_id       TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Records which anonymous datasets have already been merged into an account so
-- that a repeated import is a no-op instead of double-counting progress.
CREATE TABLE progress_imports (
    user_id     TEXT NOT NULL,
    import_id   TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY (user_id, import_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
