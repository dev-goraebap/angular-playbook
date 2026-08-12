import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DOC_SECTIONS, DOC_SUMMARIES, type DocSection, type DocSummary } from '@/shared/markdown';
import { ROUTES } from '@/shared/config';

interface NavigationGroup {
  readonly section: DocSection;
  readonly title: string;
  readonly documents: readonly DocSummary[];
}

/**
 * 문서형 레이아웃입니다. 골격은 `topbar` 이며 표면은 `bordered` 로 고정됩니다.
 *
 * 골격 종류와 스크롤 컨테이너의 대응은 docs/references/레이아웃.md §2 가 원본입니다.
 * `topbar` 는 문서 전체가 스크롤 컨테이너이므로 헤더의 `sticky` 가 뷰포트를 기준으로 동작합니다.
 * 골격 전환을 제공하지 않으므로 §3.1 의 템플릿 분기 구조는 아직 두지 않습니다.
 */
@Component({
  selector: 'app-docs-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a
      href="#docs-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      본문으로 건너뛰기
    </a>

    <div class="min-h-dvh bg-background text-foreground">
      <header class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-[90rem] items-center gap-6 px-4">
          <a [routerLink]="routes.docsHome()" class="font-semibold tracking-tight">
            Angular Playbook
          </a>
          <span class="text-sm text-muted-foreground">프론트엔드 아키텍처 표준</span>
        </div>
      </header>

      <div class="mx-auto flex max-w-[90rem] items-start gap-10 px-4">
        <nav
          aria-label="문서 목록"
          class="sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 lg:block"
        >
          <ul class="flex flex-col gap-6">
            @for (group of groups(); track group.section) {
              <li>
                <h2 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {{ group.title }}
                </h2>
                <ul class="flex flex-col gap-0.5">
                  @for (doc of group.documents; track doc.slug) {
                    <li>
                      <a
                        [routerLink]="routes.docsArticle(doc.slug)"
                        routerLinkActive="bg-accent text-accent-foreground"
                        class="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {{ doc.title }}
                      </a>
                    </li>
                  }
                </ul>
              </li>
            }
          </ul>
        </nav>

        <!-- flex 자식의 기본 min-width 는 auto 라 긴 표와 코드 블록이 열을 밀어냅니다. 레이아웃.md §4.2 -->
        <div id="docs-main" class="min-w-0 flex-1 py-8">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
})
export class DocsLayout {
  protected readonly routes = ROUTES;

  protected readonly groups = computed<readonly NavigationGroup[]>(() =>
    (Object.keys(DOC_SECTIONS) as DocSection[])
      .map((section) => ({
        section,
        title: DOC_SECTIONS[section],
        documents: DOC_SUMMARIES.filter((doc) => doc.section === section),
      }))
      .filter((group) => group.documents.length > 0),
  );
}
