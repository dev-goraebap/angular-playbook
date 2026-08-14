// docs/ 의 마크다운을 문서 사이트가 소비할 생성물로 변환합니다.
// 생성물은 커밋하지 않으며 빌드와 검사 전에 항상 다시 만듭니다.
// 규칙의 근거는 docs/architectures/frontend/angular/references/개발-환경.md 가 원본입니다.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import { createHighlighter } from 'shiki';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const OUT = join(ROOT, 'src', 'shared', 'markdown', 'generated');

/** 사이트에서 제외하는 파일입니다. 템플릿은 읽을 문서가 아닙니다. */
const EXCLUDED = new Set(['architectures/frontend/angular/decisions/0000-template.md']);

/** 스택 안에서 문서를 나누는 묶음입니다. 사이드바의 소제목과 정렬에 사용합니다. */
const GROUPS = {
  references: { title: '참조', order: 1 },
  decisions: { title: '결정 기록', order: 2 },
};

/** 스택을 묶는 영역입니다. 사이드바의 최상위 구분입니다. */
const DOMAINS = {
  frontend: { title: '프론트엔드', order: 0 },
  backend: { title: '백엔드', order: 1 },
};

/**
 * 문서의 위치를 경로에서 읽습니다. 계층을 프론트매터에 적지 않는 이유는
 * 폴더 구조가 이미 그 정보를 담고 있어 두 벌이 되면 한쪽이 낡기 때문입니다.
 *
 * 인식하는 형태는 넷입니다.
 *   architectures/index.md                          → 영역 개요
 *   architectures/<domain>/<stack>/index.md         → 스택 개요
 *   architectures/<domain>/<stack>/<group>/<파일>   → 스택의 문서
 *   posts/<slug>/index.md                           → 글
 *
 * 글이 폴더 형태인 이유는 이미지를 본문 옆에 두기 위함입니다. 자산이 문서와 함께 움직입니다.
 *
 * URL 은 `/architectures/<stack>/<slug>` 와 `/posts/<slug>` 로 조립합니다.
 * domain 과 group 을 주소에 넣지 않는 이유는 스택 이름이 이미 유일하고,
 * 계층은 사이드바가 보여주기 때문입니다.
 */
function locate(relPath) {
  const parts = relPath.split('/');
  const isIndex = parts.at(-1) === 'index.md';

  // posts/<slug>/index.md
  if (parts[0] === 'posts') {
    if (parts.length === 3 && isIndex) {
      return { area: 'posts', domain: null, stack: null, group: null, kind: 'post' };
    }
    throw new Error(
      `${relPath} 의 위치를 해석할 수 없습니다. 글은 posts/<슬러그>/index.md 여야 합니다.`,
    );
  }

  if (parts[0] !== 'architectures') {
    throw new Error(
      `${relPath} 이 인식할 수 없는 위치에 있습니다. architectures/ 또는 posts/ 에 두어야 합니다.`,
    );
  }

  // architectures/index.md
  if (parts.length === 2 && isIndex) {
    return { area: 'architectures', domain: null, stack: null, group: null, kind: 'area' };
  }

  const [, domain, stack] = parts;

  if (!(domain in DOMAINS)) {
    throw new Error(`${relPath} 의 영역 "${domain}" 이 DOMAINS 에 정의되어 있지 않습니다.`);
  }

  // architectures/<domain>/<stack>/index.md
  if (parts.length === 4 && isIndex) {
    return { area: 'architectures', domain, stack, group: null, kind: 'stack' };
  }

  // architectures/<domain>/<stack>/<group>/<파일>
  const group = parts[3];
  if (parts.length === 5 && group in GROUPS) {
    return { area: 'architectures', domain, stack, group, kind: 'document' };
  }

  throw new Error(
    `${relPath} 의 위치를 해석할 수 없습니다. ` +
      `스택 문서는 ${Object.keys(GROUPS).join(' 또는 ')} 아래에 두어야 합니다.`,
  );
}

/** 사이트에서 쓰는 경로입니다. 문서의 식별자를 겸합니다. */
function toUrlPath({ stack, kind }, relPath, slug) {
  if (kind === 'post') return `posts/${relPath.split('/')[1]}`;
  if (kind === 'area') return 'architectures';
  if (kind === 'stack') return `architectures/${stack}`;
  return `architectures/${stack}/${slug}`;
}

// ── 문서 수집 ───────────────────────────────────────────────────────────────

/**
 * 문서와 함께 두는 자산 폴더입니다. 순회 대상이 아닙니다.
 * 첨부한 마크다운이 문서로 잡히면 위치 해석에 실패합니다.
 */
const ASSET_DIR = 'assets';

/** docs/ 아래의 마크다운 경로를 docs 기준 상대 경로로 모읍니다. */
function collectMarkdownPaths(dir = DOCS, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== ASSET_DIR) collectMarkdownPaths(full, acc);
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

/**
 * 날짜를 YYYY-MM-DD 로 통일합니다.
 * YAML 파서가 따옴표 없는 날짜를 Date 로 만들어 주므로 두 형태가 함께 들어옵니다.
 */
function toPlainDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

/** 글이 추가로 요구하는 값입니다. 목록의 정렬과 표시에 쓰므로 없으면 화면을 만들 수 없습니다. */
function readPostFields(relPath, data) {
  const date = toPlainDate(data.date);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      `${relPath} 의 date 가 "${data.date}" 입니다. YYYY-MM-DD 형태로 적어야 합니다.`,
    );
  }

  if (!data.cover) {
    throw new Error(`${relPath} 에 cover 가 없습니다. 목록 카드가 표지 없이 비어 보입니다.`);
  }

  return {
    date,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    cover: String(data.cover),
    coverColor: data.coverColor ? String(data.coverColor) : null,
  };
}

for (const relPath of paths) {
  const raw = readFileSync(join(DOCS, relPath), 'utf-8');
  const { data, content } = matter(raw);
  const position = locate(relPath);

  // 글의 슬러그는 폴더가 정하므로 프론트매터에 적지 않습니다.
  const required =
    position.kind === 'post' ? ['title', 'description'] : ['slug', 'title', 'description'];

  for (const field of required) {
    if (!data[field]) {
      throw new Error(`${relPath} 의 프론트매터에 ${field} 가 없습니다.`);
    }
  }

  // 초안은 사이트에 내보내지 않습니다. 원본은 저장소에 남습니다.
  if (position.kind === 'post' && data.published !== true) continue;

  documents.push({
    path: relPath,
    slug: toUrlPath(position, relPath, data.slug),
    title: data.title,
    description: data.description,
    order: typeof data.order === 'number' ? data.order : 999,
    ...position,
    ...(position.kind === 'post' ? readPostFields(relPath, data) : {}),
    markdown: content,
  });
}

const slugsByPath = new Map(documents.map((doc) => [doc.path, doc.slug]));

const duplicated = documents
  .map((doc) => doc.slug)
  .filter((slug, index, all) => all.indexOf(slug) !== index);
if (duplicated.length > 0) {
  throw new Error(`경로가 중복되었습니다: ${[...new Set(duplicated)].join(', ')}`);
}

// ── 이미지 ──────────────────────────────────────────────────────────────────

/**
 * 생성할 폭입니다. 본문 최대 폭이 680px 이므로 2배 밀도까지 덮습니다.
 * 원본이 목록의 최대 폭보다 작으면 그보다 큰 폭은 만들지 않습니다. 늘려도 화질이 좋아지지 않습니다.
 */
const IMAGE_WIDTHS = [320, 640, 1360];

/** 벡터는 크기를 바꿀 이유가 없고 애니메이션은 정지 프레임으로 굳으므로 그대로 복사합니다. */
const COPY_AS_IS = new Set(['.svg', '.gif']);

const ASSETS = join(ROOT, 'public', 'posts');

/**
 * 글의 이미지를 폭별로 만들고 화면이 쓸 정보를 돌려줍니다.
 *
 * Astro 가 해 주던 일을 우리가 소유합니다. 원본을 그대로 내보내면 모바일에서도
 * 최대 1.2MB 를 받게 되므로, 옮기면서 성능이 나빠지는 결과가 됩니다.
 *
 * 생성물은 public/posts/ 에 놓이며 커밋하지 않습니다. 원본이 docs/posts/ 에 있어
 * 마크다운 차이를 보면 충분하다는 판단은 문서 HTML 과 같습니다.
 */
async function buildImage(docRelPath, source) {
  const postSlug = docRelPath.split('/')[1];
  const sourcePath = resolve(join(DOCS, dirname(docRelPath)), source);
  const extension = extname(sourcePath).toLowerCase();
  const name = basename(sourcePath, extension);
  const outDir = join(ASSETS, postSlug);

  mkdirSync(outDir, { recursive: true });

  if (COPY_AS_IS.has(extension)) {
    copyFileSync(sourcePath, join(outDir, `${name}${extension}`));
    return {
      src: `/posts/${postSlug}/${name}${extension}`,
      srcset: null,
      width: null,
      height: null,
    };
  }

  const image = sharp(sourcePath);
  const { width: originalWidth, height: originalHeight } = await image.metadata();
  const widths = IMAGE_WIDTHS.filter((width) => width <= originalWidth);
  if (widths.length === 0) widths.push(originalWidth);

  const entries = [];
  for (const width of widths) {
    const file = `${name}-${width}.webp`;
    await sharp(sourcePath).resize({ width }).webp({ quality: 82 }).toFile(join(outDir, file));
    entries.push(`/posts/${postSlug}/${file} ${width}w`);
  }

  const largest = widths.at(-1);

  return {
    src: `/posts/${postSlug}/${name}-${largest}.webp`,
    srcset: entries.join(', '),
    // 비율을 넘겨 두면 이미지가 도착하기 전에도 자리가 잡혀 본문이 밀리지 않습니다.
    width: originalWidth,
    height: originalHeight,
  };
}

/** 문서가 참조하는 저장소 안의 이미지입니다. 외부 주소는 우리가 다룰 수 없으므로 뺍니다. */
function collectImageSources(doc) {
  const sources = new Set();
  if (doc.cover) sources.add(doc.cover);

  for (const match of doc.markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    const href = match[1];
    if (!/^[a-z]+:/i.test(href) && !href.startsWith('/')) sources.add(href);
  }

  return sources;
}

/**
 * 이미지를 미리 전부 만들어 둡니다.
 * marked 의 렌더러가 동기라 변환 도중에는 파일을 만들 수 없습니다.
 */
async function buildImages(docs) {
  const built = new Map();

  rmSync(ASSETS, { recursive: true, force: true });

  for (const doc of docs) {
    if (doc.kind !== 'post') continue;

    for (const source of collectImageSources(doc)) {
      built.set(`${doc.path}::${source}`, await buildImage(doc.path, source));
    }
  }

  return built;
}

/** 이미지 하나를 `<img>` 로 만듭니다. 크기를 함께 심어 레이아웃 이동을 없앱니다. */
function toImageTag({ src, srcset, width, height }, alt, sizes) {
  const attributes = [
    `src="${src}"`,
    srcset ? `srcset="${srcset}"` : '',
    srcset ? `sizes="${sizes}"` : '',
    `alt="${escapeAttribute(alt)}"`,
    width ? `width="${width}"` : '',
    height ? `height="${height}"` : '',
    'loading="lazy"',
    'decoding="async"',
  ].filter(Boolean);

  return `<img ${attributes.join(' ')}>`;
}

function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"></path><path d="M15 3v4a2 2 0 0 0 2 2h4"></path></svg>',
  tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>',
  caution:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path><circle cx="12" cy="12" r="10"></circle></svg>',
};

/**
 * 허용하는 강조 블록은 둘뿐입니다.
 * 위반 시 데이터 손상이나 장애로 이어지는 제약은 `주의`, 작업 전 확인해야 하는 선행 조건은 `중요` 입니다.
 * 종류를 늘리면 강조의 희소성이 사라져 정작 치명적인 경고가 묻힙니다.
 * 규칙의 원본은 docs/architectures/frontend/angular/references/개발-환경.md 5.2절입니다.
 */
const ALERT_VARIANTS = [
  { type: 'warning', title: '주의', icon: ALERT_ICONS.warning },
  { type: 'important', title: '중요', icon: ALERT_ICONS.important },
  { type: 'note', title: '참고', icon: ALERT_ICONS.note },
  { type: 'tip', title: '팁', icon: ALERT_ICONS.tip },
  { type: 'caution', title: '경고', icon: ALERT_ICONS.caution },
];

/**
 * 표준 문서는 두 종류만 씁니다. 규범집에서 강조가 흔해지면 정작 치명적인 경고가 묻힙니다.
 * 글은 다섯 종류를 모두 허용하고 개수도 제한하지 않습니다.
 * 규격을 정의하는 문서와 생각을 풀어 쓰는 글은 강조의 성격이 다릅니다.
 */
const ALLOWED_ALERTS = {
  architectures: new Set(['warning', 'important']),
  posts: new Set(ALERT_VARIANTS.map((variant) => variant.type)),
};

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
function assertAlertRules(relPath, markdown, area) {
  const allowed = ALLOWED_ALERTS[area] ?? ALLOWED_ALERTS.posts;
  const limitDensity = area === 'architectures';

  let section = '문서 앞머리';
  let count = 0;

  const verifyDensity = () => {
    if (!limitDensity || count <= ALERTS_PER_SECTION) return;

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

    if (!allowed.has(alert[1].toLowerCase())) {
      throw new Error(
        `${relPath} 이 허용하지 않는 강조 블록 [!${alert[1]}] 를 사용합니다. ` +
          `허용 종류는 ${[...allowed].map((type) => `[!${type.toUpperCase()}]`).join(', ')} 입니다.`,
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
const sectionsBySlug = new Map(documents.map((doc) => [doc.slug, collectSections(doc.markdown)]));

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
  const open = STASH_MARK + scope + ':';
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
      /<a href="\/([^"#]+)"([^>]*)>((?:(?!<\/a>)[\s\S])*?)(\d+(?:\.\d+)*)절((?:(?!<\/a>)[\s\S])*?)<\/a>/g,
      (match, slug, attrs, before, number, after) =>
        '<a href="/' +
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
      /(<a href="\/([^"#]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<\/a>)(\s*)(\d+(?:\.\d+)*)절/g,
      (match, link, slug, gap, number) =>
        link +
        gap +
        '<a href="/' +
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
 * 규칙의 원본은 docs/architectures/frontend/angular/references/개발-환경.md 5.4절입니다.
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
      `${fromPath} 의 링크 "${href}" 가 가리키는 문서를 찾을 수 없습니다. ` + `대상: ${resolved}`,
    );
  }

  return fragment ? `/${slug}#${fragment}` : `/${slug}`;
}

/** 문서 하나를 HTML 과 목차로 변환합니다. */
function render(doc) {
  assertAlertRules(doc.path, doc.markdown, doc.area);

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
      image({ href, text }) {
        const built = images.get(`${doc.path}::${href}`);

        // 외부 주소는 그대로 둡니다. 크기를 알 수 없어 자리를 예약하지 못합니다.
        if (!built) {
          return `<img src="${href}" alt="${escapeAttribute(text ?? '')}" loading="lazy" decoding="async">`;
        }

        return toImageTag(built, text ?? '', '(max-width: 768px) 100vw, 680px');
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

/** 사이드바에 나타나는 순서입니다. 영역 개요가 먼저 오고 스택 안에서는 개요가 앞섭니다. */
const KIND_ORDER = { area: 0, stack: 1, document: 2 };

const sorted = [...documents].sort((a, b) => {
  const domainGap = (DOMAINS[a.domain]?.order ?? -1) - (DOMAINS[b.domain]?.order ?? -1);
  if (domainGap !== 0) return domainGap;

  if (a.stack !== b.stack) return (a.stack ?? '').localeCompare(b.stack ?? '');

  const kindGap = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindGap !== 0) return kindGap;

  const groupGap = (GROUPS[a.group]?.order ?? 0) - (GROUPS[b.group]?.order ?? 0);
  return groupGap !== 0 ? groupGap : a.order - b.order;
});

/*
 * 변환과 검증을 먼저 전부 끝낸 뒤에 파일을 씁니다.
 * 출력 디렉터리를 지우고 나서 변환하면, 문서 하나가 검증에 걸렸을 때 생성물이 사라진 채로 남습니다.
 * 그 상태에서는 실행 중인 개발 서버가 모듈을 찾지 못해 실패하며,
 * 원인이 마크다운 한 줄인데 오류는 타입스크립트 임포트에서 나므로 추적이 어렵습니다.
 */
const images = await buildImages(sorted);

const rendered = sorted.map((doc) => ({ doc, ...render(doc) }));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'content'), { recursive: true });

const banner = '// 이 파일은 scripts/build-docs.mjs 가 생성합니다. 직접 수정하지 않습니다.\n';

for (const { doc, html, toc } of rendered) {
  // 슬러그가 경로이므로 생성물도 같은 계층으로 놓습니다. 파일을 찾을 때 주소와 대응됩니다.
  const file = join(OUT, 'content', `${doc.slug}.ts`);
  mkdirSync(dirname(file), { recursive: true });

  writeFileSync(
    file,
    `${banner}
export const html = ${JSON.stringify(html)};

export const toc = ${JSON.stringify(toc, null, 2)};
`,
    'utf-8',
  );
}

const summaries = sorted.map((doc) => ({
  slug: doc.slug,
  title: doc.title,
  description: doc.description,
  area: doc.area,
  domain: doc.domain,
  stack: doc.stack,
  group: doc.group,
  kind: doc.kind,
  // 글은 목록 카드가 날짜와 표지를 함께 그리므로 요약에 담습니다.
  ...(doc.kind === 'post'
    ? {
        date: doc.date,
        tags: doc.tags,
        coverColor: doc.coverColor,
        cover: images.get(`${doc.path}::${doc.cover}`) ?? null,
      }
    : {}),
}));

writeFileSync(
  join(OUT, 'docs-index.ts'),
  `${banner}
/** 빌드가 폭별로 만들어 둔 이미지입니다. 벡터는 srcset 과 크기를 갖지 않습니다. */
export interface DocImage {
  readonly src: string;
  readonly srcset: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface DocSummary {
  /** 사이트 경로이자 문서의 식별자입니다. 예: architectures/angular/performance */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly area: DocArea;
  /** 영역 개요는 domain 과 stack 을 갖지 않고, 스택 개요는 group 을 갖지 않습니다. */
  readonly domain: DocDomain | null;
  readonly stack: string | null;
  readonly group: DocGroup | null;
  readonly kind: DocKind;
  /** 아래 넷은 글에만 있습니다. */
  readonly date?: string;
  readonly tags?: readonly string[];
  readonly coverColor?: string | null;
  readonly cover?: DocImage | null;
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

export type DocArea = 'architectures' | 'posts';

export type DocKind = 'area' | 'stack' | 'document' | 'post';

export type DocDomain = ${Object.keys(DOMAINS)
    .map((key) => `'${key}'`)
    .join(' | ')};

export type DocGroup = ${Object.keys(GROUPS)
    .map((key) => `'${key}'`)
    .join(' | ')};

export const DOC_DOMAINS: Record<DocDomain, string> = ${JSON.stringify(
    Object.fromEntries(Object.entries(DOMAINS).map(([key, value]) => [key, value.title])),
    null,
    2,
  )};

export const DOC_GROUPS: Record<DocGroup, string> = ${JSON.stringify(
    Object.fromEntries(Object.entries(GROUPS).map(([key, value]) => [key, value.title])),
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

/**
 * 절마다 그 안에 나오는 인라인 코드를 모읍니다. `allowedHosts` 처럼 식별자로 찾는 경우를
 * 절 제목만으로는 맞출 수 없기 때문입니다. 압축 후 6kB 로 본문 전문 141kB 의 1/23 입니다.
 *
 * 코드 블록은 제외합니다. 예제 전체가 들어오면 흔한 낱말이 모든 문서에 걸립니다.
 *
 * 절의 순서는 `toc` 와 같습니다. 둘 다 같은 마크다운에서 2·3단계 제목만 차례로 읽으므로
 * 색인이 어긋나지 않습니다. 첫 제목 앞의 도입부는 문서 단위로 따로 담습니다.
 */
function collectCodeTokens(markdown, toc) {
  const stripped = markdown.replace(/```[\s\S]*?```/g, ' ');
  const sections = toc.map(() => new Set());
  const lead = new Set();
  let current = -1;

  for (const line of stripped.split('\n')) {
    // 제목에 들어 있는 코드는 절 제목 자체가 이미 담고 있습니다.
    if (/^#{2,3}\s+/.test(line)) {
      current += 1;
      continue;
    }

    const target = current >= 0 && current < sections.length ? sections[current] : lead;

    for (const match of line.matchAll(/`([^`\n]{1,60})`/g)) {
      const token = match[1].trim();
      if (token) target.add(token);
    }
  }

  return { sections: sections.map((set) => [...set]), lead: [...lead] };
}

/*
 * 검색 인덱스입니다. 본문 전문이 아니라 절 제목과 인라인 코드까지만 담습니다.
 * 전문은 압축 후 141kB 이고 이 인덱스는 20kB 이므로 7배 차이가 납니다.
 * 문서가 절 번호 체계를 갖고 있어 결과에서 해당 절로 바로 이동합니다.
 *
 * docs-index 와 파일을 나누는 이유는 지연 로드 때문입니다. 같은 파일에 두면
 * 사이드바가 DOC_SUMMARIES 를 쓰는 순간 인덱스도 초기 번들로 따라 들어옵니다.
 */
const searchEntries = rendered.map(({ doc, toc }) => {
  const code = collectCodeTokens(doc.markdown, toc);

  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    area: doc.area,
    ...(doc.tags?.length ? { tags: doc.tags } : {}),
    ...(code.lead.length ? { code: code.lead } : {}),
    sections: toc.map(({ id, text }, index) => ({
      id,
      text,
      ...(code.sections[index].length ? { code: code.sections[index] } : {}),
    })),
  };
});

writeFileSync(
  join(OUT, 'search-index.ts'),
  `${banner}
import type { DocArea } from './docs-index';

/** 문서 안의 절입니다. 앵커를 함께 담아 결과에서 그 절로 바로 이동합니다. */
export interface SearchSection {
  readonly id: string;
  readonly text: string;
  /** 절 안에 나오는 인라인 코드입니다. 없으면 생략합니다. */
  readonly code?: readonly string[];
}

export interface SearchEntry {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly area: DocArea;
  /** 글에만 있습니다. */
  readonly tags?: readonly string[];
  /** 첫 절 제목 앞 도입부의 인라인 코드입니다. 절에 속하지 않아 따로 담습니다. */
  readonly code?: readonly string[];
  readonly sections: readonly SearchSection[];
}

export const SEARCH_ENTRIES: readonly SearchEntry[] = ${JSON.stringify(searchEntries, null, 2)};
`,
  'utf-8',
);

const sectionCount = searchEntries.reduce((total, entry) => total + entry.sections.length, 0);

console.log(`문서 생성 완료: ${sorted.length}개, 검색 인덱스 절 ${sectionCount}개`);
