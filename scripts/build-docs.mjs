// docs/ 의 마크다운을 문서 사이트가 소비할 생성물로 변환합니다.
// 생성물은 커밋하지 않으며 빌드와 검사 전에 항상 다시 만듭니다.
// 규칙의 근거는 docs/references/개발-환경.md 가 원본입니다.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Marked } from 'marked';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const OUT = join(ROOT, 'src', 'shared', 'markdown', 'generated');

/** 사이트에서 제외하는 파일입니다. 템플릿은 읽을 문서가 아닙니다. */
const EXCLUDED = new Set(['decisions/0000-template.md']);

/** 문서가 속한 묶음입니다. 목록 화면의 구분과 정렬에 사용합니다. */
const SECTIONS = {
  root: { title: '개요', order: 0 },
  references: { title: '참조', order: 1 },
  decisions: { title: '결정 기록', order: 2 },
};

// ── 문서 수집 ───────────────────────────────────────────────────────────────

/** docs/ 아래의 마크다운 경로를 docs 기준 상대 경로로 모읍니다. */
function collectMarkdownPaths(dir = DOCS, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownPaths(full, acc);
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;

    const relPath = relative(DOCS, full).split('\\').join('/');
    if (EXCLUDED.has(relPath)) continue;
    acc.push(relPath);
  }
  return acc;
}

const paths = collectMarkdownPaths().sort();
const documents = [];

for (const relPath of paths) {
  const raw = readFileSync(join(DOCS, relPath), 'utf-8');
  const { data, content } = matter(raw);

  for (const field of ['slug', 'title', 'description']) {
    if (!data[field]) {
      throw new Error(`${relPath} 의 프론트매터에 ${field} 가 없습니다.`);
    }
  }

  const section = relPath.includes('/') ? relPath.split('/')[0] : 'root';
  if (!(section in SECTIONS)) {
    throw new Error(`${relPath} 이 속한 묶음 "${section}" 이 SECTIONS 에 정의되어 있지 않습니다.`);
  }

  documents.push({
    path: relPath,
    slug: data.slug,
    title: data.title,
    description: data.description,
    order: typeof data.order === 'number' ? data.order : 999,
    section,
    markdown: content,
  });
}

const slugsByPath = new Map(documents.map((doc) => [doc.path, doc.slug]));

const duplicated = documents
  .map((doc) => doc.slug)
  .filter((slug, index, all) => all.indexOf(slug) !== index);
if (duplicated.length > 0) {
  throw new Error(`슬러그가 중복되었습니다: ${[...new Set(duplicated)].join(', ')}`);
}

// ── 변환 ────────────────────────────────────────────────────────────────────

/**
 * 헤딩 텍스트를 프래그먼트 식별자로 만듭니다.
 * 프래그먼트는 서버 요청에 포함되지 않으므로 한글을 유지합니다.
 *
 * `section-` 접두사를 붙이는 이유는 절 제목이 대부분 숫자로 시작하기 때문입니다.
 * 숫자로 시작하는 식별자는 HTML 에서 유효하지만 CSS 선택자로는 이스케이프가 필요하므로,
 * `querySelector` 나 `:target` 을 쓰는 순간 예외가 됩니다.
 */
function toAnchorId(text) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[\s.·]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `section-${slug}`;
}

/** 문서 간 마크다운 링크를 사이트 경로로 바꿉니다. 대상이 문서가 아니면 원본을 유지합니다. */
function resolveDocumentLink(href, fromPath) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;

  const [target, fragment] = href.split('#');
  if (!target.endsWith('.md')) return href;

  const resolved = posix.normalize(posix.join(posix.dirname(fromPath), target));
  const slug = slugsByPath.get(resolved);
  if (!slug) return href;

  return fragment ? `/docs/${slug}#${fragment}` : `/docs/${slug}`;
}

/** 문서 하나를 HTML 과 목차로 변환합니다. */
function render(doc) {
  const toc = [];
  const marked = new Marked({ gfm: true });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        const id = toAnchorId(plain);

        // 본문 최상위 제목은 화면이 별도로 표시하므로 목차에 넣지 않습니다.
        if (depth === 2 || depth === 3) {
          toc.push({ id, text: plain, depth });
        }
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      table(token) {
        // 넓은 표는 자기 영역 안에서 가로 스크롤됩니다. 본문이 좌우로 흔들리지 않게 합니다.
        const rendered = this.parser.renderer.constructor.prototype.table.call(this, token);
        return `<div class="table-scroll">${rendered}</div>`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const resolved = resolveDocumentLink(href, doc.path);
        const isExternal = /^https?:/i.test(resolved);
        const attributes = [
          `href="${resolved}"`,
          title ? `title="${title}"` : '',
          isExternal ? 'target="_blank" rel="noopener"' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<a ${attributes}>${text}</a>`;
      },
    },
  });

  // 최상위 제목은 프론트매터의 title 이 원본이므로 본문에서 제거합니다.
  const body = doc.markdown.replace(/^#\s+.*\n/, '');

  return { html: marked.parse(body), toc };
}

// ── 출력 ────────────────────────────────────────────────────────────────────

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'content'), { recursive: true });

const sorted = [...documents].sort((a, b) => {
  const sectionGap = SECTIONS[a.section].order - SECTIONS[b.section].order;
  return sectionGap !== 0 ? sectionGap : a.order - b.order;
});

const banner = '// 이 파일은 scripts/build-docs.mjs 가 생성합니다. 직접 수정하지 않습니다.\n';

for (const doc of sorted) {
  const { html, toc } = render(doc);
  writeFileSync(
    join(OUT, 'content', `${doc.slug}.ts`),
    `${banner}
export const html = ${JSON.stringify(html)};

export const toc = ${JSON.stringify(toc, null, 2)};
`,
    'utf-8',
  );
}

const summaries = sorted.map(({ slug, title, description, section }) => ({
  slug,
  title,
  description,
  section,
}));

writeFileSync(
  join(OUT, 'docs-index.ts'),
  `${banner}
export interface DocSummary {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly section: DocSection;
}

export interface DocHeading {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

export interface DocContent {
  readonly html: string;
  readonly toc: readonly DocHeading[];
}

export type DocSection = ${Object.keys(SECTIONS)
    .map((key) => `'${key}'`)
    .join(' | ')};

export const DOC_SECTIONS: Record<DocSection, string> = ${JSON.stringify(
    Object.fromEntries(Object.entries(SECTIONS).map(([key, value]) => [key, value.title])),
    null,
    2,
  )};

export const DOC_SUMMARIES: readonly DocSummary[] = ${JSON.stringify(summaries, null, 2)};

export const DOC_CONTENT_LOADERS: Record<string, () => Promise<DocContent>> = {
${sorted.map((doc) => `  '${doc.slug}': () => import('./content/${doc.slug}'),`).join('\n')}
};
`,
  'utf-8',
);

console.log(`문서 생성 완료: ${sorted.length}개`);
