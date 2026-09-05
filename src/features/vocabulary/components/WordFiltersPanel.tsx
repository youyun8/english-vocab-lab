import { Badge, Button } from '@/components/ui';
import { learningStatuses, learningStatusLabelZh } from '@/domain/progress';
import {
  cefrLevels,
  partOfSpeechLabelZh,
  partsOfSpeech,
  type CefrLevel,
  type PartOfSpeech,
} from '@/domain/vocabulary';
import type { LearningStatus } from '@/domain/progress';
import { cn } from '@/utils/cn';

import { DEFAULT_FILTERS, sortLabelZh, type SortKey, type WordFilters } from '../filtering';

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400',
      )}
    >
      {children}
    </button>
  );
}

export function WordFiltersPanel({
  filters,
  onChange,
  tags,
  resultCount,
}: {
  filters: WordFilters;
  onChange: (next: WordFilters) => void;
  tags: string[];
  resultCount: number;
}) {
  const set = (patch: Partial<WordFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="word-search" className="sr-only">
          搜尋字彙
        </label>
        <input
          id="word-search"
          type="search"
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder="搜尋英文、中文、搭配詞、標籤…"
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:border-accent-500"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          CEFR 等級
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {cefrLevels.map((level: CefrLevel) => (
            <FilterChip
              key={level}
              active={filters.cefrLevels.includes(level)}
              onClick={() => set({ cefrLevels: toggle(filters.cefrLevels, level) })}
            >
              {level}
            </FilterChip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          詞性
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {partsOfSpeech.map((pos: PartOfSpeech) => (
            <FilterChip
              key={pos}
              active={filters.partsOfSpeech.includes(pos)}
              onClick={() => set({ partsOfSpeech: toggle(filters.partsOfSpeech, pos) })}
            >
              {partOfSpeechLabelZh[pos]}
            </FilterChip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          學習狀態
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {learningStatuses.map((status: LearningStatus) => (
            <FilterChip
              key={status}
              active={filters.statuses.includes(status)}
              onClick={() => set({ statuses: toggle(filters.statuses, status) })}
            >
              {learningStatusLabelZh[status]}
            </FilterChip>
          ))}
          <FilterChip
            active={filters.bookmarkedOnly}
            onClick={() => set({ bookmarkedOnly: !filters.bookmarkedOnly })}
          >
            ★ 收藏
          </FilterChip>
          <FilterChip
            active={filters.difficultOnly}
            onClick={() => set({ difficultOnly: !filters.difficultOnly })}
          >
            ⚑ 困難
          </FilterChip>
          <FilterChip
            active={filters.masteredOnly}
            onClick={() => set({ masteredOnly: !filters.masteredOnly })}
          >
            ✓ 已精熟
          </FilterChip>
        </div>
      </fieldset>

      {tags.length > 0 ? (
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            主題標籤
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <FilterChip
                key={tag}
                active={filters.tags.includes(tag)}
                onClick={() => set({ tags: toggle(filters.tags, tag) })}
              >
                {tag}
              </FilterChip>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <label
          htmlFor="word-sort"
          className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-500 uppercase"
        >
          排序方式
        </label>
        <select
          id="word-sort"
          value={filters.sort}
          onChange={(event) => set({ sort: event.target.value as SortKey })}
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
        >
          {(Object.keys(sortLabelZh) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {sortLabelZh[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between border-t border-ink-200 pt-3">
        <Badge tone="muted">{resultCount} 個結果</Badge>
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
          清除篩選
        </Button>
      </div>
    </div>
  );
}
