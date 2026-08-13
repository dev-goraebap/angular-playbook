import { inject } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import {
  DOC_CONTENT_LOADERS,
  DOC_SUMMARIES,
  type DocHeading,
  type DocSummary,
} from '@/shared/markdown';

export interface DocArticle {
  readonly summary: DocSummary;
  readonly html: string;
  readonly toc: readonly DocHeading[];
}

/**
 * 문서 본문을 화면 진입 전에 받습니다. fetch-then-render 원칙은 docs/references/로딩-전략.md 1절이 원본입니다.
 *
 * 존재하지 않는 슬러그에는 `RedirectCommand` 를 반환합니다. 리졸버가 그냥 실패하면 네비게이션이
 * 취소되어 사용자가 이전 화면에 남고 아무 일도 일어나지 않은 것처럼 보입니다(5.5절).
 */
export const docArticleResolver: ResolveFn<DocArticle | RedirectCommand> = async (route) => {
  const slug = route.paramMap.get('slug') ?? '';
  const load = DOC_CONTENT_LOADERS[slug];
  const summary = DOC_SUMMARIES.find((doc) => doc.slug === slug);

  if (!load || !summary) {
    return new RedirectCommand(inject(Router).parseUrl('/not-found'));
  }

  const content = await load();
  return { summary, html: content.html, toc: content.toc };
};
