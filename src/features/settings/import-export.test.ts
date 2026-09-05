import { describe, expect, it } from 'vitest';

import { createEmptyProgress } from '@/domain/progress';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { PROGRESS_EXPORT_VERSION } from '@/shared/api';
import { buildExport, parseImport, serializeExport } from './import-export';

const NOW = '2026-03-01T00:00:00.000Z';
const validProgress = [
  { ...createEmptyProgress('w_consolidate', NOW), quizAttempts: 4, correctAnswers: 3 },
];

function validFile(): string {
  return serializeExport(buildExport(DEFAULT_SETTINGS, validProgress));
}

describe('buildExport / serializeExport', () => {
  it('stamps the current export version and a timestamp', () => {
    const data = buildExport(DEFAULT_SETTINGS, validProgress);
    expect(data.version).toBe(PROGRESS_EXPORT_VERSION);
    expect(Number.isFinite(Date.parse(data.exportedAt))).toBe(true);
  });

  it('round-trips through serialize and parse', () => {
    const result = parseImport(validFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.progress).toEqual(validProgress);
      expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe('parseImport', () => {
  it('rejects text that is not JSON', () => {
    const result = parseImport('this is not json {');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('JSON');
  });

  it('rejects an empty file', () => {
    expect(parseImport('')).toMatchObject({ ok: false });
  });

  it('rejects a JSON array instead of the export object', () => {
    expect(parseImport('[]')).toMatchObject({ ok: false });
  });

  it('rejects a missing version field', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    delete data.version;
    expect(parseImport(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('rejects an unsupported version', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.version = 99;
    expect(parseImport(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('rejects malformed progress records', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.progress = [{ wordId: 'w_a', status: 'not-a-status' }];
    const result = parseImport(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('未變更任何資料');
  });

  it('rejects negative counters', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.progress = [{ ...validProgress[0], quizAttempts: -1 }];
    expect(parseImport(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('rejects records where correctAnswers exceeds quizAttempts', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.progress = [{ ...validProgress[0], quizAttempts: 1, correctAnswers: 5 }];
    const result = parseImport(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('資料不一致');
  });

  it('rejects invalid settings', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.settings = { ...DEFAULT_SETTINGS, questionsPerQuiz: 5000 };
    expect(parseImport(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('rejects an empty CEFR range in settings', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.settings = { ...DEFAULT_SETTINGS, cefrLevels: [] };
    expect(parseImport(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('names the offending field so the user can fix the file', () => {
    const data = JSON.parse(validFile()) as Record<string, unknown>;
    data.settings = { ...DEFAULT_SETTINGS, questionsPerQuiz: 'ten' };
    const result = parseImport(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('settings.questionsPerQuiz');
  });

  it('accepts an export containing no progress at all', () => {
    const result = parseImport(serializeExport(buildExport(DEFAULT_SETTINGS, [])));
    expect(result.ok).toBe(true);
  });
});
