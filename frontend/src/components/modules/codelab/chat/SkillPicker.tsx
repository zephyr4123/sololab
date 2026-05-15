'use client';

/**
 * SkillPicker — grouped popover for `/skill` autocomplete.
 *
 * The OpenCode skill catalogue is flat (just `name + description`), but
 * users recognise skills in clusters: research / planning / building /
 * design / project-management. We classify by name prefix at render
 * time so the picker reads as a card-catalogue rather than a long list.
 *
 * Classification rules are *heuristic, not authoritative* — if a skill
 * doesn't match any cluster, it lands in "其他". Falling back is
 * deliberate: skills are user-installed, so naming conventions vary.
 *
 * Keyboard contract (managed by ChatComposer):
 *   - ArrowDown/Up    move selection
 *   - Enter / Tab     confirm
 *   - Esc             dismiss
 *
 * This component is presentational; selection state and dismissal
 * live in ChatComposer so the input remains the source of truth.
 */

import { useMemo } from 'react';
import type { CodelabSkill } from '@/lib/api-client';

type GroupId = 'research' | 'plan' | 'build' | 'design' | 'docs' | 'meta' | 'other';

interface SkillGroup {
  id: GroupId;
  label: string;
  monogram: string;
  skills: CodelabSkill[];
}

const GROUP_META: Record<GroupId, { label: string; monogram: string }> = {
  research: { label: '探索 · Research', monogram: '⊙' },
  plan:     { label: '规划 · Plan',     monogram: '◈' },
  build:    { label: '执行 · Build',    monogram: '⬢' },
  design:   { label: '设计 · Design',   monogram: '✦' },
  docs:     { label: '文档 · Docs',     monogram: '✎' },
  meta:     { label: '元 · Meta',       monogram: '⊕' },
  other:    { label: '其他',            monogram: '·' },
};

function classify(skill: CodelabSkill): GroupId {
  const n = skill.name.toLowerCase();
  if (/^(explore|research|search|grep|find|analyse|analyze)/.test(n)) return 'research';
  if (/^(plan|design|architect|spec|outline)/.test(n)) return 'plan';
  if (/^(build|implement|code|test|fix|debug|refactor|migrate)/.test(n)) return 'build';
  if (/^(ui|css|style|component|frontend)/.test(n)) return 'design';
  if (/^(doc|write|readme|comment)/.test(n)) return 'docs';
  if (/^(pm|task|todo|track|review)/.test(n)) return 'meta';
  return 'other';
}

interface SkillPickerProps {
  skills: CodelabSkill[];
  query: string;
  activeIndex: number;
  onPick: (skill: CodelabSkill) => void;
  onHover: (index: number) => void;
}

export function SkillPicker({ skills, query, activeIndex, onPick, onHover }: SkillPickerProps) {
  // Filter then group. We keep the global index across groups so
  // ArrowDown/Up traversal in ChatComposer matches what's on screen.
  const { flat, groups } = useMemo(() => {
    const q = query.toLowerCase();
    const matched = skills.filter((s) => s.name.toLowerCase().includes(q));
    matched.sort((a, b) => a.name.localeCompare(b.name));

    const byGroup = new Map<GroupId, CodelabSkill[]>();
    for (const s of matched) {
      const g = classify(s);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(s);
    }

    const order: GroupId[] = ['research', 'plan', 'build', 'design', 'docs', 'meta', 'other'];
    const groupsArr: SkillGroup[] = [];
    const flatArr: CodelabSkill[] = [];
    for (const id of order) {
      const items = byGroup.get(id);
      if (!items?.length) continue;
      groupsArr.push({ id, ...GROUP_META[id], skills: items });
      flatArr.push(...items);
    }
    return { flat: flatArr, groups: groupsArr };
  }, [skills, query]);

  if (flat.length === 0) return null;

  let runningIdx = 0;

  return (
    <div className="skill-popover absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto py-1.5 z-20">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="skill-group-label flex items-center gap-2">
            <span
              className="text-[12px] leading-none"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-warm)' }}
              aria-hidden
            >
              {group.monogram}
            </span>
            <span>{group.label}</span>
            <span
              className="ml-auto text-[9px] tabular-nums text-muted-foreground/40"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {group.skills.length}
            </span>
          </div>
          {group.skills.map((skill) => {
            const idx = runningIdx++;
            const active = idx === activeIndex;
            return (
              <div
                key={skill.name}
                role="option"
                aria-selected={active}
                data-active={active}
                className="skill-row"
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick(skill)}
              >
                <span
                  className="text-[11px] text-warm/65 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  /
                </span>
                <span
                  className="truncate text-[12px] text-foreground/85"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {skill.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground/55">
                  {skill.description}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
