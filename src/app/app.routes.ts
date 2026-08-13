import { Routes } from '@angular/router';
import { docArticleResolver } from '@/pages/docs/docs-article';

/**
 * 라우트 정의는 이 파일이 단독으로 소유합니다. `pages` 슬라이스는 자신의 경로를 정의하지 않습니다.
 * 근거는 docs/architectures/frontend/angular/references/라우팅과-네비게이션.md 2절에 있습니다.
 *
 * 문서 경로가 `architectures/angular/performance` 처럼 깊이가 일정하지 않으므로 와일드카드로 받고
 * 리졸버가 전체 경로로 문서를 찾습니다. 깊이마다 라우트를 두면 계층이 늘 때마다 여기를 고쳐야 합니다.
 */
export const routes: Routes = [
  {
    path: 'architectures',
    loadComponent: () => import('./layout/docs-layout').then((m) => m.DocsLayout),
    children: [
      {
        path: '**',
        loadComponent: () => import('@/pages/docs/docs-article').then((m) => m.DocsArticle),
        resolve: { article: docArticleResolver },
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('@/pages/docs/docs-home').then((m) => m.DocsHome),
  },
  {
    path: 'not-found',
    loadComponent: () => import('@/pages/not-found').then((m) => m.NotFound),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
