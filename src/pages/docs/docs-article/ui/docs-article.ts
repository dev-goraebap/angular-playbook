import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { injectActiveHeading } from '../lib/active-heading';
import type { DocHeading } from '@/shared/markdown';
import type { DocArticle } from '../api/doc-article-resolver';

@Component({
  selector: 'app-docs-article',
  imports: [RouterLink],
  template: `
    <div class="flex items-start gap-10">
      <article class="min-w-0 flex-1">
        <header class="border-b border-border pb-6">
          <h1 class="text-3xl font-semibold tracking-tight">{{ article().summary.title }}</h1>
          <p class="mt-2 text-muted-foreground">{{ article().summary.description }}</p>
        </header>

        <div class="doc-body mt-8" [innerHTML]="body()"></div>
      </article>

      @if (article().toc.length > 0) {
        <aside class="sticky top-20 hidden w-56 shrink-0 xl:block" aria-label="목차">
          <h2 class="mb-3 text-xs font-semibold uppercase text-muted-foreground">목차</h2>
          <ul class="flex flex-col gap-1 border-l border-border">
            @for (heading of article().toc; track heading.id) {
              <li>
                <a
                  [routerLink]="[]"
                  [fragment]="heading.id"
                  replaceUrl="true"
                  class="-ml-px block border-l py-0.5 text-sm transition-colors hover:text-foreground"
                  [class]="linkClass(heading)"
                >
                  {{ heading.text }}
                </a>
              </li>
            }
          </ul>
        </aside>
      }
    </div>
  `,
  styleUrl: './docs-article.css',
  // [innerHTML] 로 삽입된 요소에는 캡슐화 속성이 붙지 않아 컴포넌트 스타일이 적용되지 않습니다.
  // 스타일 범위는 .doc-body 선택자로 제한합니다.
  encapsulation: ViewEncapsulation.None,
})
export class DocsArticle {
  readonly article = input.required<DocArticle>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly toc = computed(() => this.article().toc);

  /** 현재 읽고 있는 절입니다. 목차의 활성 표시에 사용합니다. */
  protected readonly activeHeading = injectActiveHeading(this.toc);

  protected linkClass(heading: DocHeading): string {
    const indent = heading.depth === 3 ? 'pl-6' : 'pl-3';
    const active = this.activeHeading() === heading.id;
    return active
      ? `${indent} border-primary font-medium text-foreground`
      : `${indent} border-transparent text-muted-foreground hover:border-border`;
  }

  /**
   * 절 제목의 `id` 를 유지하기 위해 sanitizer 를 우회합니다.
   * 입력은 빌드 시점에 저장소의 마크다운에서 생성된 문자열이며 런타임 데이터가 결합되지 않습니다.
   * 허용 조건과 적용 범위는 docs/decisions/0013-ADR-생성문서-HTML-신뢰.md 가 원본입니다.
   */
  protected readonly body = computed(() =>
    // eslint-disable-next-line no-restricted-properties -- ADR-0013 의 조건을 충족하는 빌드 시점 생성물입니다.
    this.sanitizer.bypassSecurityTrustHtml(this.article().html),
  );
}
