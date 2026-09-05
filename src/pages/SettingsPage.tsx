import { useRef, useState } from 'react';

import { Button, Card, ErrorNotice, SectionHeading, Toggle } from '@/components/ui';
import { cefrLevels, type CefrLevel } from '@/domain/vocabulary';
import { useAuth } from '@/features/auth/auth-context';
import { useProgress } from '@/features/progress/progress-context';
import { useSettings } from '@/features/settings/settings-context';
import {
  buildExport,
  downloadJson,
  parseImport,
  serializeExport,
} from '@/features/settings/import-export';
import { apiFetch } from '@/services/api-client';
import { cn } from '@/utils/cn';

const QUESTION_COUNTS = [5, 10, 15, 20, 30];

export function SettingsPage() {
  const { settings, update, replace } = useSettings();
  const { progress, resetAll, replaceAll } = useProgress();
  const { status } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<'local' | 'cloud' | null>(null);

  const toggleLevel = (level: CefrLevel) => {
    const next = settings.cefrLevels.includes(level)
      ? settings.cefrLevels.filter((item) => item !== level)
      : [...settings.cefrLevels, level];
    if (next.length === 0) return; // never allow an empty range
    void update({ cefrLevels: next as [CefrLevel, ...CefrLevel[]] });
  };

  const handleExport = () => {
    downloadJson(
      `english-vocab-lab-${new Date().toISOString().slice(0, 10)}.json`,
      serializeExport(buildExport(settings, progress)),
    );
    setMessage({ tone: 'ok', text: '已匯出學習進度。' });
  };

  const handleImportFile = async (file: File) => {
    const result = parseImport(await file.text());
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error });
      return;
    }
    // Validation passed — only now is anything written.
    await replace(result.data.settings);
    await replaceAll(result.data.progress);
    setMessage({
      tone: 'ok',
      text: `已匯入 ${result.data.progress.length} 筆學習紀錄與設定。`,
    });
  };

  const handleResetLocal = async () => {
    await resetAll();
    setConfirming(null);
    setMessage({ tone: 'ok', text: '已清除本機學習進度。' });
  };

  const handleResetCloud = async () => {
    try {
      await apiFetch('/api/progress', { method: 'DELETE' });
      await resetAll();
      setMessage({ tone: 'ok', text: '已清除雲端學習進度與測驗紀錄。' });
    } catch {
      setMessage({ tone: 'error', text: '清除雲端資料失敗，請稍後再試。' });
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">設定</h1>
        <p className="mt-1 text-sm text-ink-500">
          {status === 'authenticated'
            ? '設定會同步到您的雲端帳號，並保留一份本機副本。'
            : '未登入時，設定只會儲存在這個瀏覽器。'}
        </p>
      </header>

      {message ? (
        message.tone === 'error' ? (
          <ErrorNotice>{message.text}</ErrorNotice>
        ) : (
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {message.text}
          </div>
        )
      ) : null}

      <Card className="p-5">
        <SectionHeading>測驗</SectionHeading>

        <div className="py-3">
          <p className="text-sm font-medium text-ink-800">每次測驗題數</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUESTION_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={settings.questionsPerQuiz === count}
                onClick={() => void update({ questionsPerQuiz: count })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  settings.questionsPerQuiz === count
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400',
                )}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-ink-100 py-3">
          <p className="text-sm font-medium text-ink-800">預設 CEFR 等級</p>
          <p className="mt-0.5 text-xs text-ink-500">至少需要選擇一個等級。</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cefrLevels.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={settings.cefrLevels.includes(level)}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  settings.cefrLevels.includes(level)
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400',
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-ink-100 border-t border-ink-100">
          <Toggle
            id="setting-shuffle"
            checked={settings.shuffleOptions}
            onChange={(next) => void update({ shuffleOptions: next })}
            label="隨機排列選項"
            description="避免記住答案在第幾個位置。"
          />
          <Toggle
            id="setting-shortcuts"
            checked={settings.keyboardShortcutsEnabled}
            onChange={(next) => void update({ keyboardShortcutsEnabled: next })}
            label="啟用鍵盤快捷鍵"
            description="1–4 選擇答案、Enter 下一題、Space 發音、B 收藏。"
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading>顯示與發音</SectionHeading>
        <div className="divide-y divide-ink-100">
          <Toggle
            id="setting-pronunciation"
            checked={settings.pronunciationEnabled}
            onChange={(next) => void update({ pronunciationEnabled: next })}
            label="啟用發音功能"
            description="使用瀏覽器內建語音合成，僅供聽覺輔助。"
          />
          <Toggle
            id="setting-chinese"
            checked={settings.showChineseByDefault}
            onChange={(next) => void update({ showChineseByDefault: next })}
            label="預設顯示中文翻譯"
            description="關閉後，字彙頁只顯示英文定義與例句。"
          />
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">字彙庫預設檢視</p>
              <p className="mt-0.5 text-xs text-ink-500">列表適合快速掃讀，卡片適合瀏覽。</p>
            </div>
            <select
              aria-label="字彙庫預設檢視"
              value={settings.wordBankView}
              onChange={(event) =>
                void update({ wordBankView: event.target.value === 'card' ? 'card' : 'list' })
              }
              className="rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="list">列表</option>
              <option value="card">卡片</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading>匯入 / 匯出</SectionHeading>
        <p className="text-sm text-ink-600">
          匯出的 JSON 包含設定與所有學習紀錄。匯入時會先完整驗證檔案格式，
          <strong>驗證失敗不會變更任何現有資料</strong>。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleExport}>
            匯出 JSON
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            匯入 JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </Card>

      <Card className="border-red-200 p-5">
        <SectionHeading>危險操作</SectionHeading>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-ink-800">清除本機學習進度</p>
            <p className="mt-0.5 text-xs text-ink-500">
              只會清除儲存在這個瀏覽器的資料，雲端資料不受影響。
            </p>
            {confirming === 'local' ? (
              <div className="mt-2 flex gap-2">
                <Button variant="danger" size="sm" onClick={() => void handleResetLocal()}>
                  確認清除
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  取消
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setConfirming('local')}
              >
                清除本機進度
              </Button>
            )}
          </div>

          {status === 'authenticated' ? (
            <div className="border-t border-ink-100 pt-4">
              <p className="text-sm font-medium text-ink-800">清除雲端學習進度</p>
              <p className="mt-0.5 text-xs text-ink-500">
                會刪除所有字彙進度、測驗紀錄與作答紀錄，此操作無法復原。
              </p>
              {confirming === 'cloud' ? (
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" onClick={() => void handleResetCloud()}>
                    我了解，確認刪除
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                    取消
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConfirming('cloud')}
                >
                  清除雲端進度
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
