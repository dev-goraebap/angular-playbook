// docs/ 의 마크다운을 문서 사이트가 소비할 생성물로 변환합니다.
// 생성물은 커밋하지 않으며 빌드와 검사 전에 항상 다시 만듭니다.
// 규칙의 근거는 docs/references/개발-환경.md 가 원본입니다.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import { createHighlighter } from 'shiki';

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

// ── 강조 블록 ───────────────────────────────────────────────────────────────

/**
 * 아이콘은 lucide 원본에서 가져오되 Angular 전용 변수를 뺀 형태입니다.
 * 화면 컴포넌트가 아니라 빌드 산출물에 들어가므로 `@ng-icons` 런타임을 거치지 않습니다.
 */
const ALERT_ICONS = {
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
  important:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
};

/**
 * 허용하는 강조 블록은 둘뿐입니다.
 * 위반 시 데이터 손상이나 장애로 이어지는 제약은 `주의`, 작업 전 확인해야 하는 선행 조건은 `중요` 입니다.
 * 종류를 늘리면 강조의 희소성이 사라져 정작 치명적인 경고가 묻힙니다.
 * 규칙의 원본은 docs/references/개발-환경.md 5.2절입니다.
 */
const ALERT_VARIANTS = [
  { type: 'warning', title: '주의', icon: ALERT_ICONS.warning },
  { type: 'important', title: '중요', icon: ALERT_ICONS.important },
];

const ALLOWED_ALERTS = new Set(ALERT_VARIANTS.map((variant) => variant.type));

/** 한 절에 허용하는 강조 블록의 개수입니다. */
const ALERTS_PER_SECTION = 1;

/**
 * 강조 블록의 종류와 밀도를 검사합니다.
 *
 * 종류를 제한하는 이유는 marked-alert 가 기본 다섯 종을 항상 인식하기 때문입니다.
 * 확장 설정만으로는 막을 수 없으므로 여기서 거부합니다.
 *
 * 밀도를 검사하는 이유는 강조가 희소할 때만 작동하기 때문입니다.
 * 한 절에 여러 개가 이어지면 시선이 계속 끊기고 정작 치명적인 경고가 묻힙니다.
 */
function assertAlertRules(relPath, markdown) {
  let section = '문서 앞머리';
  let count = 0;

  const verifyDensity = () => {
    if (count <= ALERTS_PER_SECTION) return;

    throw new Error(
      `${relPath} 의 "${section}" 절에 강조 블록이 ${count} 개 있습니다. ` +
        `한 절에 ${ALERTS_PER_SECTION} 개까지만 허용합니다. ` +
        `나머지는 본문 문장이나 표의 열로 흡수합니다.`,
    );
  };

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      verifyDensity();
      section = heading[1];
      count = 0;
      continue;
    }

    const alert = line.match(/^>\s*\[!(\w+)\]/);
    if (!alert) continue;

    if (!ALLOWED_ALERTS.has(alert[1].toLowerCase())) {
      throw new Error(
        `${relPath} 이 허용하지 않는 강조 블록 [!${alert[1]}] 를 사용합니다. ` +
          `허용 종류는 ${[...ALLOWED_ALERTS].map((type) => `[!${type.toUpperCase()}]`).join(', ')} 입니다.`,
      );
    }

    count += 1;
  }

  verifyDensity();
}

// ── 코드 하이라이팅 ─────────────────────────────────────────────────────────

/**
 * 하이라이팅 대상 언어입니다. 문서에서 실제로 쓰는 것만 싣습니다.
 * 목록에 없는 언어는 평문으로 처리하므로 빌드가 실패하지 않습니다.
 */
const CODE_LANGUAGES = ['ts', 'css', 'html', 'bash', 'json'];

/** 두 테마의 색을 함께 심고 화면에서 light-dark() 로 고릅니다. */
const CODE_THEMES = { light: 'github-light', dark: 'github-dark' };

const highlighter = await createHighlighter({
  themes: Object.values(CODE_THEMES),
  langs: CODE_LANGUAGES,
});

const loadedLanguages = new Set(highlighter.getLoadedLanguages());

/** HTML 텍스트 노드에 그대로 실을 수 있도록 이스케이프합니다. */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 다이어그램은 화면이 그립니다. 여기서는 원본과 그릴 자리만 만듭니다.
 *
 * 원본을 속성이 아니라 숨긴 요소의 텍스트로 두는 이유는 두 가지입니다.
 * 줄바꿈과 `<br/>` 이 섞인 문자열을 속성에 실으려면 별도 인코딩이 필요하고,
 * 테마를 바꿀 때 같은 원본으로 다시 그려야 하므로 그릴 자리와 함께 남아 있어야 합니다.
 */
function diagram(code) {
  return `<div class="mermaid-diagram not-prose" data-mermaid><pre class="mermaid-source" hidden>${escapeHtml(code)}</pre><div class="mermaid-canvas"></div></div>`;
}

/** 코드 블록을 색이 입혀진 HTML 로 바꿉니다. */
function highlight(code, info) {
  // 정보 문자열에 언어 외의 값이 붙어도 첫 낱말만 씁니다.
  const requested = (info ?? '').trim().split(/\s+/)[0];
  if (requested === 'mermaid') return diagram(code);

  const lang = loadedLanguages.has(requested) ? requested : 'text';

  return highlighter.codeToHtml(code, {
    lang,
    themes: CODE_THEMES,
    // 기본 색을 인라인으로 넣지 않아야 light-dark() 가 두 값을 모두 쥘 수 있습니다.
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          // 타이포그래피 프리셋의 인라인 code 서식이 코드 블록에 상속되지 않게 합니다.
          this.addClassToHast(node, 'not-prose');
        },
      },
    ],
  });
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

// ── 절 참조 ─────────────────────────────────────────────────────────────────

/**
 * 문서의 절 번호와 앵커를 짝지읍니다.
 * 절 제목이 `7.1 app 계층` 처럼 번호로 시작하는 것만 대상입니다.
 */
function collectSections(markdown) {
  const sections = new Map();

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^#{2,4}\s+(.*)/);
    if (!heading) continue;

    const title = heading[1].trim();
    const numbered = title.match(/^(\d+(?:\.\d+)*)[.\s]/);
    if (!numbered) continue;

    sections.set(numbered[1], toAnchorId(title));
  }

  return sections;
}

/** 슬러그별 절 앵커입니다. 다른 문서의 절을 가리키려면 렌더 전에 전부 필요합니다. */
const sectionsBySlug = new Map(
  documents.map((doc) => [doc.slug, collectSections(doc.markdown)]),
);

/**
 * 자리표시자로 쓰는 문자입니다.
 * 본문에 나타날 수 없는 값이어야 복원할 때 엉뚱한 자리를 덮지 않습니다.
 * 소스에는 이스케이프로 적어 파일 자체는 텍스트로 유지합니다.
 */
const STASH_MARK = '\u0000';

/**
 * 걷어낸 구간을 서로 구분하는 번호입니다.
 * 마커를 공유하면 한쪽의 자리표시자를 다른 쪽이 자기 것으로 읽어 엉뚱한 내용으로 복원합니다.
 */
let stashScope = 0;

/** 구간을 잠시 걷어내고 복원 수단을 함께 돌려줍니다. */
function stashMatches(text, pattern) {
  const scope = (stashScope += 1);
  const open = STASH_MARK + scope + ":";
  const stash = [];

  const masked = text.replace(pattern, (match) => {
    stash.push(match);
    return open + (stash.length - 1) + STASH_MARK;
  });

  const marker = new RegExp(open + '(\\d+)' + STASH_MARK, 'g');

  return {
    masked,
    restore: (value) => value.replace(marker, (_, index) => stash[Number(index)]),
  };
}

/**
 * `3.1절` 표기를 해당 절로 가는 링크로 바꿉니다.
 *
 * 절 번호는 화면에서 클릭할 수 없으면 목차로 돌아가 눈으로 찾아야 합니다.
 * 문서 원본에는 번호만 남겨 두고 링크는 여기서 만듭니다.
 * 세 가지 형태를 처리하며, 번호에 해당하는 절이 없으면 빌드를 멈춥니다.
 */
function linkSectionReferences(html, doc) {
  const own = sectionsBySlug.get(doc.slug);

  // 코드 블록과 인라인 코드 안의 절 표기는 링크로 바꾸지 않습니다. 실제 주석에 등장합니다.
  const code = stashMatches(html, /<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g);

  const anchorOf = (slug, number, context) => {
    const anchor = sectionsBySlug.get(slug)?.get(number);
    if (anchor) return anchor;

    throw new Error(
      doc.path + ' 이 존재하지 않는 절 "' + number + '절" 을 가리킵니다. 문맥: ' + context,
    );
  };

  const linked = code.masked
    // 1) 링크 텍스트 안에 번호가 있는 경우: [아키텍처 9절](...) → 링크에 프래그먼트를 붙입니다.
    .replace(
      /<a href="\/docs\/([^"#]+)"([^>]*)>((?:(?!<\/a>)[\s\S])*?)(\d+(?:\.\d+)*)절((?:(?!<\/a>)[\s\S])*?)<\/a>/g,
      (match, slug, attrs, before, number, after) =>
        '<a href="/docs/' +
        slug +
        '#' +
        anchorOf(slug, number, match) +
        '"' +
        attrs +
        '>' +
        before +
        number +
        '절' +
        after +
        '</a>',
    )
    // 2) 링크 바로 뒤에 오는 경우: [개발 환경](...) 7절 → 그 문서의 7절로 보냅니다.
    .replace(
      /(<a href="\/docs\/([^"#]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<\/a>)(\s*)(\d+(?:\.\d+)*)절/g,
      (match, link, slug, gap, number) =>
        link +
        gap +
        '<a href="/docs/' +
        slug +
        '#' +
        anchorOf(slug, number, match) +
        '">' +
        number +
        '절</a>',
    );

  // 3) 남은 것은 자기 문서의 절입니다. 이미 링크가 된 구간은 다시 감싸지 않습니다.
  const anchors = stashMatches(linked, /<a[\s\S]*?<\/a>/g);

  const withOwn = anchors.masked.replace(/(\d+(?:\.\d+)*)절/g, (match, number) => {
    const anchor = own?.get(number);
    if (!anchor) {
      throw new Error(doc.path + ' 이 존재하지 않는 절 "' + number + '절" 을 가리킵니다.');
    }
    return '<a href="#' + anchor + '">' + number + '절</a>';
  });

  return code.restore(anchors.restore(withOwn));
}

/**
 * 문서 간 마크다운 링크를 사이트 경로로 바꿉니다.
 *
 * 저장소 안을 가리키면서 문서로 해석되지 않는 링크는 오류로 처리합니다.
 * 마크다운 원본에서는 디렉터리 링크가 동작하지만 사이트에는 그 경로가 없어 404 가 됩니다.
 * 양쪽에서 성립하지 않는 표기이므로 디렉터리는 링크 없이 `references/` 형태로 언급합니다.
 * 규칙의 원본은 docs/references/개발-환경.md 5.4절입니다.
 */
function resolveDocumentLink(href, fromPath) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;

  const [target, fragment] = href.split('#');

  if (!target.endsWith('.md')) {
    throw new Error(
      `${fromPath} 의 링크 "${href}" 가 문서를 가리키지 않습니다. ` +
        `사이트에는 해당 경로가 없어 404 가 됩니다. 디렉터리는 링크 없이 언급합니다.`,
    );
  }

  const resolved = posix.normalize(posix.join(posix.dirname(fromPath), target));
  const slug = slugsByPath.get(resolved);

  if (!slug) {
    throw new Error(
      `${fromPath} 의 링크 "${href}" 가 가리키는 문서를 찾을 수 없습니다. ` +
        `대상: ${resolved}`,
    );
  }

  return fragment ? `/docs/${slug}#${fragment}` : `/docs/${slug}`;
}

/** 문서 하나를 HTML 과 목차로 변환합니다. */
function render(doc) {
  assertAlertRules(doc.path, doc.markdown);

  const toc = [];
  const marked = new Marked({ gfm: true });

  marked.use(markedAlert({ variants: ALERT_VARIANTS }));

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        const id = toAnchorId(plain);

        // 최상위 제목은 문서 전체를 가리키므로 목차에 넣지 않습니다. 목차는 절 단위입니다.
        if (depth === 2 || depth === 3) {
          toc.push({ id, text: plain, depth });
        }
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        return highlight(text, lang);
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

  /*
   * 본문을 그대로 변환합니다. 최상위 제목과 첫 문단을 걷어내지 않는 이유는
   * 프론트매터와 본문의 역할이 다르기 때문입니다.
   * 프론트매터의 title 과 description 은 문서 목록과 메타데이터가 쓰는 짧은 이름이고,
   * 본문의 제목과 첫 문장은 문서 자체의 것입니다. ADR 은 두 값이 의도적으로 다릅니다.
   */
  return { html: linkSectionReferences(marked.parse(doc.markdown), doc), toc };
}

// ── 출력 ────────────────────────────────────────────────────────────────────

const sorted = [...documents].sort((a, b) => {
  const sectionGap = SECTIONS[a.section].order - SECTIONS[b.section].order;
  return sectionGap !== 0 ? sectionGap : a.order - b.order;
});

/*
 * 변환과 검증을 먼저 전부 끝낸 뒤에 파일을 씁니다.
 * 출력 디렉터리를 지우고 나서 변환하면, 문서 하나가 검증에 걸렸을 때 생성물이 사라진 채로 남습니다.
 * 그 상태에서는 실행 중인 개발 서버가 모듈을 찾지 못해 실패하며,
 * 원인이 마크다운 한 줄인데 오류는 타입스크립트 임포트에서 나므로 추적이 어렵습니다.
 */
const rendered = sorted.map((doc) => ({ doc, ...render(doc) }));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'content'), { recursive: true });

const banner = '// 이 파일은 scripts/build-docs.mjs 가 생성합니다. 직접 수정하지 않습니다.\n';

for (const { doc, html, toc } of rendered) {
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
