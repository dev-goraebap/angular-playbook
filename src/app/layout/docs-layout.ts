import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMenu } from '@ng-icons/lucide';
import { HlmButton } from '@/shared/ui/button';
import {
  HlmSheet,
  HlmSheetContent,
  HlmSheetHeader,
  HlmSheetPortal,
  HlmSheetTitle,
} from '@/shared/ui/sheet';
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
 *
 * 좁은 화면의 문서 목록은 **반응형**으로 처리합니다. 시트는 항상 존재하고 트리거만 CSS 로
 * 숨기므로 런타임 판정이 없습니다. 이 경로는 전부 정적 생성 대상이라 적응형 판정을 쓸 수
 * 없으며(적응형-UI.md §6), CSS 로 해결되는 것을 런타임 분기로 만드는 것도 §1 이 금지합니다.
 */
@Component({
  selector: 'app-docs-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    NgIcon,
    HlmButton,
    HlmSheet,
    HlmSheetPortal,
    HlmSheetContent,
    HlmSheetHeader,
    HlmSheetTitle,
  ],
  providers: [provideIcons({ lucideMenu })],
  template: `
    <a
      href="#docs-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      본문으로 건너뛰기
    </a>

    <div class="min-h-dvh bg-background text-foreground">
      <header class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4">
          <button
            hlmBtn
            variant="ghost"
            size="icon-sm"
            class="lg:hidden"
            aria-label="문서 목록 열기"
            (click)="mobileNavOpen.set(true)"
          >
            <ng-icon name="lucideMenu" />
          </button>

          <!--
            시트는 좁은 화면에서만 쓰이므로 초기 번들에서 분리합니다.
            번들 문제를 측정으로 확인한 뒤에만 지연을 적용한다는 규칙은 적응형-UI.md §4.4 입니다.
            조건은 기기 판정이 아니라 사용자 조작 상태이므로 하이드레이션 불일치가 없습니다.
          -->
          @defer (when mobileNavOpen(); prefetch on idle) {
            <hlm-sheet
              side="left"
              [state]="mobileNavOpen() ? 'open' : 'closed'"
              (stateChanged)="mobileNavOpen.set($event === 'open')"
            >
              <hlm-sheet-content *hlmSheetPortal class="scroll-thin w-80 overflow-y-auto">
                <div hlmSheetHeader>
                  <h2 hlmSheetTitle>문서 목록</h2>
                </div>
                <ng-container [ngTemplateOutlet]="navigation" />
              </hlm-sheet-content>
            </hlm-sheet>
          }

          <a [routerLink]="routes.docsHome()" class="font-semibold tracking-tight">
            Angular Playbook
          </a>
          <span class="hidden text-sm text-muted-foreground sm:inline">
            프론트엔드 아키텍처 표준
          </span>
        </div>
      </header>

      <div class="mx-auto flex max-w-[90rem] items-start gap-10 px-4">
        <nav
          aria-label="문서 목록"
          class="scroll-thin sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 lg:block"
        >
          <ng-container [ngTemplateOutlet]="navigation" />
        </nav>

        <!-- flex 자식의 기본 min-width 는 auto 라 긴 표와 코드 블록이 열을 밀어냅니다. 레이아웃.md §4.2 -->
        <div id="docs-main" class="min-w-0 flex-1 py-8">
          <router-outlet />
        </div>
      </div>
    </div>

    <!-- 데스크탑 사이드바와 모바일 시트가 같은 목록을 공유합니다. 레이아웃.md §3 -->
    <ng-template #navigation>
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
    </ng-template>
  `,
})
export class DocsLayout {
  protected readonly routes = ROUTES;

  /** 좁은 화면의 문서 목록 열림 상태입니다. 시트 청크의 로드 조건도 겸합니다. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly groups = computed<readonly NavigationGroup[]>(() =>
    (Object.keys(DOC_SECTIONS) as DocSection[])
      .map((section) => ({
        section,
        title: DOC_SECTIONS[section],
        documents: DOC_SUMMARIES.filter((doc) => doc.section === section),
      }))
      .filter((group) => group.documents.length > 0),
  );

  constructor() {
    // 링크 클릭뿐 아니라 뒤로가기로 이동한 경우에도 시트를 닫습니다.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.mobileNavOpen.set(false));
  }
}
