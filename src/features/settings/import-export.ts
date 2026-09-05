import { wordProgressSchema, type WordProgress } from '@/domain/progress';
import { userSettingsSchema, type UserSettings } from '@/domain/settings';
import { PROGRESS_EXPORT_VERSION, progressExportSchema, type ProgressExport } from '@/shared/api';

/**
 * JSON import/export.
 *
 * Import is validated with Zod *before* anything is written, so a malformed or
 * hostile file can never partially overwrite existing data.
 */

export function buildExport(settings: UserSettings, progress: WordProgress[]): ProgressExport {
  return {
    version: PROGRESS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    progress,
  };
}

export function serializeExport(data: ProgressExport): string {
  return JSON.stringify(data, null, 2);
}

export type ImportResult =
  | { ok: true; data: ProgressExport }
  | { ok: false; error: string };

/** Parses and fully validates an uploaded file. Never throws. */
export function parseImport(rawText: string): ImportResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return { ok: false, error: '檔案不是有效的 JSON 格式。' };
  }

  const result = progressExportSchema.safeParse(parsedJson);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join('.') || '檔案';
    return {
      ok: false,
      error: `匯入檔案格式不正確（${where}：${first?.message ?? '未知錯誤'}）。未變更任何資料。`,
    };
  }

  if (result.data.version !== PROGRESS_EXPORT_VERSION) {
    return {
      ok: false,
      error: `不支援的匯出版本 ${String(result.data.version)}，本站目前僅支援版本 ${PROGRESS_EXPORT_VERSION}。`,
    };
  }

  // Per-item re-validation: reject the whole file if any record is malformed,
  // rather than silently importing a partial dataset.
  for (const item of result.data.progress) {
    if (!wordProgressSchema.safeParse(item).success) {
      return { ok: false, error: '匯入檔案中含有無效的學習紀錄。未變更任何資料。' };
    }
    if (item.correctAnswers > item.quizAttempts) {
      return {
        ok: false,
        error: `字彙 ${item.wordId} 的答對次數超過作答次數，資料不一致。未變更任何資料。`,
      };
    }
  }

  if (!userSettingsSchema.safeParse(result.data.settings).success) {
    return { ok: false, error: '匯入檔案中的設定無效。未變更任何資料。' };
  }

  return { ok: true, data: result.data };
}

export function downloadJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
