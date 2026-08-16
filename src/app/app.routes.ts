import { Routes } from '@angular/router';
import { docArticleResolver } from '@/pages/docs/docs-article';

/**
 * 라우트 정의는 이 파일이 단독으로 소유합니다. `pages` 슬라이스는 자신의 경로를 정의하지 않습니다.
 * 근거는 external/refarch-angular-springboot/docs/architecture/angular/references/라우팅과-네비게이션.md 2절에 있습니다.
 *
 * 셸이 상단 바를 소유하고 그 아래에서 영역마다 프레임이 갈립니다. 블로그는 사이드바가 없어
 * 화면이 곧 프레임이고, 문서는 사이드바를 가진 프레임을 한 겹 더 둡니다.
 *
 * 문서 경로가 `architectures/angular/performance` 처럼 깊이가 일정하지 않으므로 와일드카드로 받고
 * 리졸버가 전체 경로로 문서를 찾습니다. 깊이마다 라우트를 두면 계층이 늘 때마다 여기를 고쳐야 합니다.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('@/pages/blog/blog-home').then((m) => m.BlogHome),
      },
      {
        path: 'posts/:slug',
        loadComponent: () => import('@/pages/docs/docs-article').then((m) => m.DocsArticle),
        resolve: { article: docArticleResolver },
        /*
         * URL 세그먼트만 비교합니다. 문서 화면은 쿼리 파라미터를 읽지 않으므로 쿼리 변화에
         * 리졸버가 다시 돌 이유가 없고, 셸이 검색 상태를 `?q=` 로 들고 있어 검색을 열고 닫을
         * 때마다 재실행됩니다. 문서 간 이동은 세그먼트가 달라지므로 그대로 잡힙니다.
         */
        runGuardsAndResolvers: 'pathParamsChange',
      },
      {
        path: 'architectures',
        loadComponent: () => import('./layout/docs-layout').then((m) => m.DocsLayout),
        children: [
          {
            path: '**',
            loadComponent: () => import('@/pages/docs/docs-article').then((m) => m.DocsArticle),
            resolve: { article: docArticleResolver },
            // 사유는 위 posts 라우트와 같습니다.
            runGuardsAndResolvers: 'pathParamsChange',
          },
        ],
      },
      {
        path: 'not-found',
        loadComponent: () => import('@/pages/not-found').then((m) => m.NotFound),
      },
      {
        path: '**',
        redirectTo: 'not-found',
      },
    ],
  },
];
