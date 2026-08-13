import type { DocArea } from './generated/docs-index';
import type { SearchEntry, SearchSection } from './generated/search-index';

export type { SearchEntry, SearchSection } from './generated/search-index';

/**
 * 문서 하나에 대한 검색 결과입니다.
 * 절 단위가 아니라 문서 단위로 냅니다. 문서 43개에 절이 534개라 절마다 결과를 만들면
 * 흔한 낱말 하나에 수백 건이 나와 목록이 판단에 쓸모없어집니다.
 */
export interface SearchHit {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly area: DocArea;
  /** 절에서 일치가 났을 때만 채워집니다. 링크가 그 절로 바로 이동합니다. */
  readonly section: SearchSection | null;
  readonly score: number;
}

/**
 * 인덱스는 검색을 열 때 받아 옵니다. 압축 후 20kB 라 초기 번들에 두기에는 크고,
 * 검색을 쓰지 않는 방문에서는 한 번도 필요하지 않습니다.
 *
 * `shared/markdown` 배럴이 이 함수만 내보내고 인덱스 자체는 내보내지 않습니다.
 * 배럴에 인덱스를 실으면 사이드바가 문서 목록을 읽는 순간 함께 딸려 옵니다(개발-환경 7절).
 */
export function loadSearchEntries(): Promise<readonly SearchEntry[]> {
  return import('./generated/search-index').then((module) => module.SEARCH_ENTRIES);
}

/**
 * 어느 자리에서 일치했는지에 따른 가중치입니다.
 *
 * 인라인 코드가 절 제목보다 높습니다. `allowedHosts` 처럼 식별자를 그대로 친 질의는
 * 그 이름을 다루는 문서를 찾는 것이 목적이며, 같은 글자가 산문에 우연히 섞일 일이 없습니다.
 */
const WEIGHTS = {
  title: 6,
  code: 5,
  tag: 4,
  section: 3,
  description: 2,
} as const;

/** 제목이 질의로 시작할 때 더하는 값입니다. 같은 낱말을 담은 문서들 사이의 순서를 가릅니다. */
const PREFIX_BONUS = 3;

/**
 * 결과 상한입니다. 목록을 훑어 고르는 수단이므로 이 수를 넘으면 스크롤이 판단을 대신합니다.
 * 넘치면 질의를 좁히는 편이 맞습니다.
 */
const RESULT_LIMIT = 20;

/** 한 문서를 훑기 위해 소문자로 미리 바꿔 둔 형태입니다. 낱말마다 다시 만들지 않습니다. */
interface Lowered {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly sectionTexts: readonly string[];
  readonly sectionCode: readonly string[];
  readonly leadCode: string;
}

/**
 * 문서를 질의로 거릅니다. 모든 낱말이 한 문서 안에서 발견되어야 결과에 듭니다(AND).
 *
 * 형태소 분석 없이 부분 문자열로 맞춥니다. 한국어에서 `라우팅` 이 `라우팅과` 에 걸려야 하고,
 * 조사가 붙는 형태를 전부 열거할 수 없기 때문입니다. 대신 `팅과` 같은 조각도 걸립니다.
 */
export function searchDocs(query: string, entries: readonly SearchEntry[]): readonly SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const entry of entries) {
    const lowered = lower(entry);
    let score = 0;

    for (const token of tokens) {
      const weight = weigh(token, lowered);

      // 하나라도 없으면 이 문서는 결과가 아닙니다.
      if (weight === 0) {
        score = 0;
        break;
      }

      score += weight;
    }

    if (score === 0) continue;

    if (lowered.title.startsWith(tokens[0])) score += PREFIX_BONUS;

    hits.push({
      slug: entry.slug,
      title: entry.title,
      description: entry.description,
      area: entry.area,
      section: pickSection(tokens, entry.sections, lowered),
      score,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, RESULT_LIMIT);
}

function tokenize(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** 화면에서 강조할 구간과 그렇지 않은 구간으로 나뉜 문자열 조각입니다. */
export interface TextSegment {
  readonly text: string;
  readonly match: boolean;
}

/**
 * 질의와 겹치는 구간을 표시해 문자열을 조각으로 나눕니다.
 * 어느 낱말 때문에 이 결과가 걸렸는지 목록에서 바로 보이게 하는 용도입니다.
 *
 * HTML 문자열을 만들어 돌려주지 않는 이유는 화면이 그것을 `[innerHTML]` 로 넣어야 하기 때문입니다.
 * 그 경로는 빌드가 생성한 문서에만 열려 있습니다([ADR-0013] 참조). 조각으로 돌려주면
 * 화면이 텍스트 보간으로 그리므로 주입 경로가 새로 생기지 않습니다.
 */
export function splitByMatches(text: string, query: string): readonly TextSegment[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [{ text, match: false }];

  const lowered = text.toLowerCase();
  const ranges: [number, number][] = [];

  for (const token of tokens) {
    let from = lowered.indexOf(token);

    while (from !== -1) {
      ranges.push([from, from + token.length]);
      from = lowered.indexOf(token, from + token.length);
    }
  }

  if (ranges.length === 0) return [{ text, match: false }];

  // 낱말끼리 구간이 겹치면 합칩니다. 겹친 채로 두면 같은 글자를 두 번 그립니다.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];

  for (const [start, end] of ranges) {
    const last = merged.at(-1);

    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });

  return segments;
}

function lower(entry: SearchEntry): Lowered {
  return {
    title: entry.title.toLowerCase(),
    description: entry.description.toLowerCase(),
    tags: (entry.tags ?? []).map((tag) => tag.toLowerCase()),
    sectionTexts: entry.sections.map((section) => section.text.toLowerCase()),
    // 절마다 코드를 한 줄로 이어 둡니다. 어느 코드인지가 아니라 있는지만 보면 됩니다.
    sectionCode: entry.sections.map((section) => (section.code ?? []).join(' ').toLowerCase()),
    leadCode: (entry.code ?? []).join(' ').toLowerCase(),
  };
}

/**
 * 낱말이 발견된 자리의 가중치를 모두 더합니다. 어디에도 없으면 0 입니다.
 *
 * 가장 높은 자리 하나만 취하지 않는 이유는 그러면 `httpResource` 처럼 여러 문서가 쓰는 이름에서
 * 그 이름을 절 제목으로 내건 문서와 본문에 한 번 언급한 문서가 같은 점수가 되기 때문입니다.
 * 자리가 겹칠수록 그 문서가 낱말을 정면으로 다룬다는 뜻입니다.
 */
function weigh(token: string, entry: Lowered): number {
  let score = 0;

  if (entry.title.includes(token)) score += WEIGHTS.title;

  if (entry.leadCode.includes(token) || entry.sectionCode.some((code) => code.includes(token))) {
    score += WEIGHTS.code;
  }

  if (entry.tags.some((tag) => tag.includes(token))) score += WEIGHTS.tag;
  if (entry.sectionTexts.some((text) => text.includes(token))) score += WEIGHTS.section;
  if (entry.description.includes(token)) score += WEIGHTS.description;

  return score;
}

/**
 * 결과에 함께 보여줄 절 하나를 고릅니다. 낱말을 가장 많이 담은 절이며 없으면 null 입니다.
 * 제목뿐 아니라 절 안의 코드도 셉니다. 식별자로 찾은 결과가 그 이름이 나오는 절로 가야 합니다.
 */
function pickSection(
  tokens: readonly string[],
  sections: readonly SearchSection[],
  lowered: Lowered,
): SearchSection | null {
  let best: SearchSection | null = null;
  let bestCount = 0;

  for (let index = 0; index < sections.length; index += 1) {
    const haystack = `${lowered.sectionTexts[index]} ${lowered.sectionCode[index]}`;
    const count = tokens.filter((token) => haystack.includes(token)).length;

    if (count > bestCount) {
      best = sections[index];
      bestCount = count;
    }
  }

  return best;
}
