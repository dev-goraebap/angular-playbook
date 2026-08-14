import {
  Component,
  ViewEncapsulation,
  computed,
  inject,
  input,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { injectActiveHeading } from '../lib/active-heading';
import { injectMermaidDiagrams } from '../lib/mermaid-diagrams';
import type { DocHeading } from '@/shared/markdown';
import { ROUTES } from '@/shared/config';
import type { DocArticle } from '../api/doc-article-resolver';

@Component({
  selector: 'app-docs-article',
  imports: [RouterLink, NgIcon],
  providers: [provideIcons({ lucideArrowLeft })],
  template: `
    <div class="flex items-start gap-10" [class]="containerClass()">
      <article class="min-w-0 flex-1">
        @if (isReading()) {
          <a
            [routerLink]="routes.home()"
            class="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground-secondary transition-colors hover:text-foreground"
          >
            <ng-icon name="lucideArrowLeft" size="16" />
            전체 글
          </a>

          <!--
            글은 본문에 제목이 없습니다. 프론트매터가 제목과 표지의 유일한 출처이므로
            화면이 그립니다. 표준 문서는 반대로 본문이 제목을 소유합니다.
            규칙은 개발-환경.md 5.4절이 원본입니다.
          -->
          <header class="mb-10">
            @if (summary().cover; as cover) {
              <div
                class="mb-8 aspect-2/1 w-full overflow-hidden rounded-xl"
                [style.background]="summary().coverColor ?? 'var(--muted)'"
              >
                <img
                  [src]="cover.src"
                  [attr.srcset]="cover.srcset"
                  sizes="(max-width: 768px) 100vw, 640px"
                  [attr.width]="cover.width"
                  [attr.height]="cover.height"
                  [alt]="summary().title"
                  decoding="async"
                  class="h-full w-full object-cover"
                />
              </div>
            }

            <h1 class="text-2xl leading-tight font-normal tracking-tight md:text-4xl">
              {{ summary().title }}
            </h1>

            @if (summary().date) {
              <div class="mt-4 flex flex-wrap items-center gap-3 text-sm text-foreground-secondary">
                <time [dateTime]="summary().date">{{ publishedOn() }}</time>

                @if (summary().tags?.length) {
                  <span class="text-border">·</span>
                  @for (tag of summary().tags; track tag) {
                    <a
                      [routerLink]="routes.home()"
                      [queryParams]="{ tags: tag }"
                      class="font-medium text-muted-foreground transition-colors hover:text-primary"
                    >
                      #{{ tag }}
                    </a>
                  }
                }
              </div>
            }
          </header>
        }

        <div #docBody class="doc-body prose" [innerHTML]="body()"></div>
      </article>

      @if (showToc()) {
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
  private readonly docBody = viewChild<ElementRef<HTMLElement>>('docBody');

  /**
   * 글에는 목차를 두지 않습니다. 규격 문서는 원하는 규칙을 찾아 들어가지만
   * 글은 처음부터 끝까지 읽는 것이 전제라 목차가 읽기를 돕지 않습니다.
   */
  protected readonly showToc = computed(() => this.toc().length > 0);

  protected readonly routes = ROUTES;

  /** 목록과 헤더가 함께 쓰는 메타데이터입니다. */
  protected readonly summary = computed(() => this.article().summary);

  /** 글은 처음부터 끝까지 읽는 화면입니다. 표준 문서와 헤더 구성과 여백이 다릅니다. */
  protected readonly isReading = computed(() => this.summary().kind === 'post');

  /** 발행일을 사람이 읽는 형태로 바꿉니다. 목록의 상대 표현과 달리 상세에서는 정확한 날짜를 보입니다. */
  protected readonly publishedOn = computed(() => {
    const date = this.summary().date;
    if (!date) return '';

    const [year, month, day] = date.split('-');
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  });

  /**
   * 목차가 없으면 본문이 화면 전체를 쓰지 않도록 읽기 폭으로 가둡니다.
   *
   * 상하 여백이 폭에 따라 갈립니다. 좁은 화면에서는 보이는 높이가 짧아 같은 48px 이
   * 헤더와 본문 사이의 빈 자리로 읽힙니다. 문서 프레임의 py-8 과 같은 값을 씁니다.
   */
  protected readonly containerClass = computed(() =>
    this.isReading() ? 'mx-auto max-w-264 px-4 py-8 md:py-12' : '',
  );

  /** 현재 읽고 있는 절입니다. 목차의 활성 표시에 사용합니다. */
  protected readonly activeHeading = injectActiveHeading(this.toc);

  constructor() {
    injectMermaidDiagrams(this.docBody, this.article);
  }

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
   * 허용 조건과 적용 범위는 docs/architectures/frontend/angular/decisions/0013-ADR-생성문서-HTML-신뢰.md 가 원본입니다.
   */
  protected readonly body = computed(() =>
    // eslint-disable-next-line no-restricted-properties -- ADR-0013 의 조건을 충족하는 빌드 시점 생성물입니다.
    this.sanitizer.bypassSecurityTrustHtml(this.article().html),
  );
}
