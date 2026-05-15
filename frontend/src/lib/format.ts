/**
 * Shared formatting helpers for the Home + Sidebar surfaces.
 *
 * Following the four-layer language system established in the codebase:
 *   - Decoration / metadata = English (uppercase + tracking)
 *   - Numbers + units inline = English numerals + Chinese unit suffix
 *   - Action / status / empty states = Chinese (warm, conversational)
 *
 * `relativeTime` returns a Chinese phrase. Pass `english: true` if you
 * need an English variant for an English-eyebrow context.
 */

export function relativeTime(ms: number, opts: { english?: boolean } = {}): string {
  if (!ms) return opts.english ? 'never' : '未活动';

  const diff = Date.now() - ms;
  const sec = 1_000;
  const min = 60 * sec;
  const hr = 60 * min;
  const day = 24 * hr;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < min) return opts.english ? 'just now' : '刚刚';
  if (diff < hr) {
    const n = Math.floor(diff / min);
    return opts.english ? `${n}m ago` : `${n} 分钟前`;
  }
  if (diff < day) {
    const n = Math.floor(diff / hr);
    return opts.english ? `${n}h ago` : `${n} 小时前`;
  }
  if (diff < week) {
    const n = Math.floor(diff / day);
    return opts.english ? `${n}d ago` : `${n} 天前`;
  }
  if (diff < month) {
    const n = Math.floor(diff / week);
    return opts.english ? `${n}w ago` : `${n} 周前`;
  }
  const n = Math.floor(diff / month);
  return opts.english ? `${n}mo ago` : `${n} 月前`;
}

/**
 * Returns the Chinese unit suffix for a given module's collection noun.
 * Used in places like "3 次推演 · 2 小时前".
 */
export const MODULE_NOUN_ZH: Record<'ideaspark' | 'writer' | 'codelab', string> = {
  ideaspark: '次推演',
  writer: '篇草稿',
  codelab: '个会话',
};

/**
 * Returns the English uppercase unit for an eyebrow / chip context.
 * Used where typography needs the letter-spacing visual rhythm.
 */
export const MODULE_NOUN_EN: Record<'ideaspark' | 'writer' | 'codelab', string> = {
  ideaspark: 'runs',
  writer: 'drafts',
  codelab: 'sessions',
};
