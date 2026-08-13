import { Routes } from '@angular/router';
import { docArticleResolver } from '@/pages/docs/docs-article';

/**
 * 라우트 정의는 이 파일이 단독으로 소유합니다. `pages` 슬라이스는 자신의 경로를 정의하지 않습니다.
 * 근거는 docs/references/라우팅과-네비게이션.md 2절에 있습니다.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/docs-layout').then((m) => m.DocsLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('@/pages/docs/docs-home').then((m) => m.DocsHome),
      },
      {
        path: 'docs/:slug',
        loadComponent: () => import('@/pages/docs/docs-article').then((m) => m.DocsArticle),
        resolve: { article: docArticleResolver },
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
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
];
