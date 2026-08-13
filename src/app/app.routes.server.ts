import { RenderMode, ServerRoute } from '@angular/ssr';
import { DOC_SUMMARIES } from '@/shared/markdown';

/**
 * 문서 사이트는 전부 공개 경로이므로 정적 생성 대상입니다.
 * 경로별 렌더링 모드의 결정 기준은 docs/architectures/frontend/angular/references/렌더링-전략.md 1절이 원본입니다.
 *
 * 문서 경로는 깊이가 일정하지 않아 와일드카드로 받습니다. `**` 파라미터에는 나머지 경로 전체가
 * 한 문자열로 들어가므로, 슬러그에서 `architectures/` 접두사만 떼어 넘깁니다.
 *
 * 슬러그를 ASCII 로 고정한 이유는 실측 결과이며 개발-환경.md 7절에 기록되어 있습니다.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'architectures/**',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () =>
      DOC_SUMMARIES.filter((doc) => doc.area === 'architectures' && doc.slug !== 'architectures').map(
        (doc) => ({ '**': doc.slug.slice('architectures/'.length) }),
      ),
  },
  {
    path: 'posts/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () =>
      DOC_SUMMARIES.filter((doc) => doc.kind === 'post').map((doc) => ({
        slug: doc.slug.slice('posts/'.length),
      })),
  },
  {
    // 글에 실제로 붙어 있는 태그만 생성합니다. 없는 태그로 들어오면 빈 목록을 보여줍니다.
    path: 'tags/:tag',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const tags = new Set(DOC_SUMMARIES.flatMap((doc) => doc.tags ?? []));
      return [...tags].map((tag) => ({ tag }));
    },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
