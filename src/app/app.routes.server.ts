import { RenderMode, ServerRoute } from '@angular/ssr';
import { DOC_SUMMARIES } from '@/shared/markdown';

/**
 * 문서 사이트는 전부 공개 경로이므로 정적 생성 대상입니다.
 * 경로별 렌더링 모드의 결정 기준은 docs/references/렌더링-전략.md §1 이 원본입니다.
 *
 * 슬러그를 ASCII 로 고정한 이유는 실측 결과이며 개발-환경.md §7 에 기록되어 있습니다.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'docs/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => DOC_SUMMARIES.map((doc) => ({ slug: doc.slug })),
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
