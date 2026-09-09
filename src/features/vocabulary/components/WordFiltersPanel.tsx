import { useMemo, useState } from 'react';

import { ActiveFilters, FilterGroup, FilterRail, ToggleChip } from '@/components/ui/filters';
import { learningStatuses, learningStatusLabelZh } from '@/domain/progress';
import {
  cefrLevels,
  partOfSpeechLabelZh,
  partsOfSpeech,
  type CefrLevel,
  type PartOfSpeech,
} from '@/domain/vocabulary';
import type { LearningStatus } from '@/domain/progress';

import {
  DEFAULT_FILTERS,
  partitionTags,
  sortLabelZh,
  type FacetCounts,
  type SortKey,
  type WordFilters,
} from '../filtering';

/** Topic tags shown before the reader asks for the rest of the list. */
const VISIBLE_TOPIC_TAGS = 12;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function WordFiltersPanel({
  filters,
  onChange,
  tags,
  counts,
  resultCount,
  activeCount,
}: {
  filters: WordFilters;
  onChange: (next: WordFilters) => void;
  tags: string[];
  counts: FacetCounts;
  resultCount: number;
  activeCount: number;
}) {
  const [tagQuery, setTagQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  const set = (patch: Partial<WordFilters>) => onChange({ ...filters, ...patch });

  const { exam, topic } = useMemo(() => partitionTags(tags), [tags]);
  const matchingTopics = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    const matches = query ? topic.filter((tag) => tag.includes(query)) : topic;
    // Selected tags stay visible even when the list is truncated or searched.
    return [...new Set([...filters.tags.filter((tag) => topic.includes(tag)), ...matches])];
  }, [topic, tagQuery, filters.tags]);
  const visibleTopics =
    showAllTags || tagQuery.trim() ? matchingTopics : matchingTopics.slice(0, VISIBLE_TOPIC_TAGS);

  const applied = [
    ...(filters.query.trim()
      ? [{ key: 'query', label: `「${filters.query.trim()}」`, onRemove: () => set({ query: '' }) }]
      : []),
    ...filters.cefrLevels.map((level) => ({
      key: `cefr-${level}`,
      label: level,
      onRemove: () => set({ cefrLevels: toggle(filters.cefrLevels, level) }),
    })),
    ...filters.partsOfSpeech.map((pos) => ({
      key: `pos-${pos}`,
      label: partOfSpeechLabelZh[pos],
      onRemove: () => set({ partsOfSpeech: toggle(filters.partsOfSpeech, pos) }),
    })),
    ...filters.statuses.map((status) => ({
      key: `status-${status}`,
      label: learningStatusLabelZh[status],
      onRemove: () => set({ statuses: toggle(filters.statuses, status) }),
    })),
    ...(filters.bookmarkedOnly
      ? [{ key: 'bookmarked', label: '★ 收藏', onRemove: () => set({ bookmarkedOnly: false }) }]
      : []),
    ...(filters.difficultOnly
      ? [{ key: 'difficult', label: '⚑ 困難', onRemove: () => set({ difficultOnly: false }) }]
      : []),
    ...filters.tags.map((tag) => ({
      key: `tag-${tag}`,
      label: tag,
      onRemove: () => set({ tags: toggle(filters.tags, tag) }),
    })),
  ];

  const hint = (selected: number) => (selected > 0 ? `${selected}` : undefined);

  return (
    <FilterRail
      activeCount={activeCount}
      resultLabel={`${resultCount} 個結果`}
      onClear={() => onChange({ ...DEFAULT_FILTERS })}
    >
      <div>
        <label htmlFor="word-search" className="sr-only">
          搜尋字彙
        </label>
        <input
          id="word-search"
          type="search"
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder="搜尋英文、中文、搭配詞…"
          className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm placeholder:text-ink-400 focus:border-accent-500"
        />
      </div>

      {applied.length > 0 ? <ActiveFilters items={applied} /> : null}

      <FilterGroup label="CEFR 等級" hint={hint(filters.cefrLevels.length)}>
        <div className="flex flex-wrap gap-1.5">
          {cefrLevels.map((level: CefrLevel) => (
            <ToggleChip
              key={level}
              active={filters.cefrLevels.includes(level)}
              count={counts.cefrLevels.get(level) ?? 0}
              onClick={() => set({ cefrLevels: toggle(filters.cefrLevels, level) })}
            >
              {level}
            </ToggleChip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="學習狀態" hint={hint(filters.statuses.length)}>
        <div className="flex flex-wrap gap-1.5">
          {learningStatuses.map((status: LearningStatus) => (
            <ToggleChip
              key={status}
              active={filters.statuses.includes(status)}
              count={counts.statuses.get(status) ?? 0}
              onClick={() => set({ statuses: toggle(filters.statuses, status) })}
            >
              {learningStatusLabelZh[status]}
            </ToggleChip>
          ))}
          <ToggleChip
            active={filters.bookmarkedOnly}
            count={counts.bookmarked}
            onClick={() => set({ bookmarkedOnly: !filters.bookmarkedOnly })}
          >
            ★ 收藏
          </ToggleChip>
          <ToggleChip
            active={filters.difficultOnly}
            count={counts.difficult}
            onClick={() => set({ difficultOnly: !filters.difficultOnly })}
          >
            ⚑ 困難
          </ToggleChip>
        </div>
      </FilterGroup>

      <FilterGroup label="詞性" hint={hint(filters.partsOfSpeech.length)}>
        <div className="flex flex-wrap gap-1.5">
          {partsOfSpeech.map((pos: PartOfSpeech) => (
            <ToggleChip
              key={pos}
              active={filters.partsOfSpeech.includes(pos)}
              count={counts.partsOfSpeech.get(pos) ?? 0}
              onClick={() => set({ partsOfSpeech: toggle(filters.partsOfSpeech, pos) })}
            >
              {partOfSpeechLabelZh[pos]}
            </ToggleChip>
          ))}
        </div>
      </FilterGroup>

      {exam.length > 0 ? (
        <FilterGroup
          label="考試字表"
          hint={hint(filters.tags.filter((tag) => exam.includes(tag)).length)}
        >
          <div className="flex flex-wrap gap-1.5">
            {exam.map((tag) => (
              <ToggleChip
                key={tag}
                active={filters.tags.includes(tag)}
                count={counts.tags.get(tag) ?? 0}
                onClick={() => set({ tags: toggle(filters.tags, tag) })}
              >
                {tag}
              </ToggleChip>
            ))}
          </div>
        </FilterGroup>
      ) : null}

      {topic.length > 0 ? (
        <FilterGroup
          label="主題標籤"
          hint={hint(filters.tags.filter((tag) => topic.includes(tag)).length)}
        >
          <label htmlFor="tag-search" className="sr-only">
            搜尋標籤
          </label>
          <input
            id="tag-search"
            type="search"
            value={tagQuery}
            onChange={(event) => setTagQuery(event.target.value)}
            placeholder={`搜尋 ${topic.length} 個標籤…`}
            className="mb-2 w-full rounded-md border border-ink-300 bg-surface px-2.5 py-1.5 text-xs placeholder:text-ink-400 focus:border-accent-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {visibleTopics.map((tag) => (
              <ToggleChip
                key={tag}
                active={filters.tags.includes(tag)}
                count={counts.tags.get(tag) ?? 0}
                onClick={() => set({ tags: toggle(filters.tags, tag) })}
              >
                {tag}
              </ToggleChip>
            ))}
          </div>
          {matchingTopics.length === 0 ? (
            <p className="text-xs text-ink-400">沒有符合的標籤。</p>
          ) : null}
          {!tagQuery.trim() && matchingTopics.length > VISIBLE_TOPIC_TAGS ? (
            <button
              type="button"
              onClick={() => setShowAllTags((value) => !value)}
              className="mt-2 text-xs font-medium text-accent-600 hover:underline"
            >
              {showAllTags ? '收合標籤' : `顯示全部 ${matchingTopics.length} 個標籤`}
            </button>
          ) : null}
        </FilterGroup>
      ) : null}

      <FilterGroup label="排序方式">
        <label htmlFor="word-sort" className="sr-only">
          排序方式
        </label>
        <select
          id="word-sort"
          value={filters.sort}
          onChange={(event) => set({ sort: event.target.value as SortKey })}
          className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm"
        >
          {(Object.keys(sortLabelZh) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {sortLabelZh[key]}
            </option>
          ))}
        </select>
      </FilterGroup>
    </FilterRail>
  );
}
