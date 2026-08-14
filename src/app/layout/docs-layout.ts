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
import {
  DOC_DOMAINS,
  DOC_GROUPS,
  DOC_SUMMARIES,
  type DocDomain,
  type DocGroup,
  type DocSummary,
} from '@/shared/markdown';
import { ROUTES } from '@/shared/config';
import { NavigationVeil, NavigationVeilSlot } from '../navigation-veil';

/** 스택 안에서 문서를 나누는 묶음입니다. 참조와 결정 기록이 여기 해당합니다. */
interface NavigationGroup {
  readonly group: DocGroup;
  readonly title: string;
  readonly documents: readonly DocSummary[];
}

/** 스택 하나입니다. 개요 문서 하나와 그 아래 묶음들로 구성됩니다. */
interface NavigationStack {
  readonly stack: string;
  readonly overview: DocSummary;
  readonly groups: readonly NavigationGroup[];
}

/** 사이드바 최상위 구분입니다. 프론트엔드와 백엔드가 여기 해당합니다. */
interface NavigationDomain {
  readonly domain: DocDomain;
  readonly title: string;
  readonly stacks: readonly NavigationStack[];
}

/**
 * 문서 영역의 프레임입니다. 상단 바는 셸이 소유하므로 여기에는 사이드바와 본문만 있습니다.
 *
 * 원래 설명은 다음과 같습니다. 골격은 `topbar` 이며 표면은 `bordered` 로 고정됩니다.
 *
 * 골격 종류와 스크롤 컨테이너의 대응은 docs/architectures/frontend/angular/references/레이아웃.md 2절이 원본입니다.
 * `topbar` 는 문서 전체가 스크롤 컨테이너이므로 헤더의 `sticky` 가 뷰포트를 기준으로 동작합니다.
 * 골격 전환을 제공하지 않으므로 3.1절의 템플릿 분기 구조는 아직 두지 않습니다.
 *
 * 좁은 화면의 문서 목록은 **반응형**으로 처리합니다. 시트는 항상 존재하고 트리거만 CSS 로
 * 숨기므로 런타임 판정이 없습니다. 이 경로는 전부 정적 생성 대상이라 적응형 판정을 쓸 수
 * 없으며(적응형-UI.md 6절), CSS 로 해결되는 것을 런타임 분기로 만드는 것도 1절이 금지합니다.
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
    NavigationVeil,
  ],
  providers: [provideIcons({ lucideMenu })],
  template: `
    <!--
      좌우 여백을 부모가 아니라 자식이 갖습니다. 부모에 두면 콘텐츠 열의 상자가 눈에 보이는
      본문 영역보다 좁아지고, 그 상자를 기준으로 놓은 베일이 양옆에 덮이지 않는 띠를 남깁니다.
      기준 상자와 덮어야 할 영역은 같아야 합니다(로딩-전략.md 7.1절).
    -->
    <div class="mx-auto flex max-w-[90rem] items-start gap-10">
      <nav
        aria-label="문서 목록"
        class="scroll-thin sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 pl-4 lg:block [view-transition-name:docs-sidebar]"
      >
        <ng-container [ngTemplateOutlet]="navigation" />
      </nav>

      <!--
        flex 자식의 기본 min-width 는 auto 라 긴 표와 코드 블록이 열을 밀어냅니다. 레이아웃.md 4.2절

        베일의 기준 상자입니다. 이 프레임은 사이드바를 함께 그리므로 셸의 본문 영역을
        덮으면 사이드바까지 가려집니다. 문서 영역에서 이동 수단이 사이드바이므로
        대기 중에도 눌러야 합니다(로딩-전략.md 7.1절).
      -->
      <!-- 사이드바가 보이는 폭에서는 그쪽이 왼쪽 여백을 대므로 여기서는 오른쪽만 갖습니다. -->
      <div id="main" class="relative min-w-0 flex-1 py-8 pr-4 max-lg:pl-4">
        <app-navigation-veil />
        <router-outlet />
      </div>
    </div>

    <!--
      문서 목록을 여는 버튼입니다. 본문 위에 두면 아래로 스크롤한 뒤 화면 밖으로 나가
      이동 수단이 사라지므로 화면에 고정합니다. 사이드바가 보이는 폭에서는 감춥니다.

      하단 네비 위에 놓습니다. 막대 높이를 여기에 다시 적지 않고 토큰에서 가져오므로
      막대가 바뀌어도 이 값을 함께 고칠 일이 없습니다.
    -->
    <button
      hlmBtn
      class="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] left-4 z-30 size-14 rounded-full shadow-lg lg:hidden"
      aria-label="문서 목록 열기"
      (click)="mobileNavOpen.set(true)"
    >
      <ng-icon name="lucideMenu" class="text-xl" />
    </button>

    <!--
      시트는 좁은 화면에서만 쓰이므로 초기 번들에서 분리합니다.
      번들 문제를 측정으로 확인한 뒤에만 지연을 적용한다는 규칙은 적응형-UI.md 4.4절입니다.
      조건은 기기 판정이 아니라 사용자 조작 상태이므로 하이드레이션 불일치가 없습니다.

      헤더의 flex 컨테이너 밖에 둡니다. 내용은 포털로 body 에 렌더되지만 <hlm-sheet> 호스트는
      원래 자리에 남아 flex 아이템으로 계산되며, 그러면 gap 이 하나 더 생겨 옆 요소가 밀립니다.
    -->
    @defer (when mobileNavOpen(); prefetch on idle) {
      <!--
        스크롤 전략을 기본값 block 에서 바꿉니다. block 은 문서를 고정했다가 닫힐 때
        저장해 둔 위치로 되돌리는데, 그 복원이 라우터의 위치 초기화를 덮어써서
        다른 문서로 이동해도 이전 스크롤 위치에 남습니다. 레이아웃.md 4.4절 참조.
      -->
      <hlm-sheet
        side="left"
        scrollStrategy="reposition"
        [state]="mobileNavOpen() ? 'open' : 'closed'"
        (stateChanged)="mobileNavOpen.set($event === 'open')"
      >
        <hlm-sheet-content *hlmSheetPortal class="scroll-thin w-80 overflow-y-auto">
          <div hlmSheetHeader>
            <h2 hlmSheetTitle>문서 목록</h2>
          </div>
          <!-- 시트 하위 요소는 각자 패딩을 갖습니다. 헤더의 p-4 에 항목의 px-2 를 더해 맞춥니다. -->
          <div class="px-2 pb-6">
            <ng-container [ngTemplateOutlet]="navigation" />
          </div>
        </hlm-sheet-content>
      </hlm-sheet>
    }

    <!-- 데스크탑 사이드바와 모바일 시트가 같은 목록을 공유합니다. 레이아웃.md 3절 -->
    <ng-template #navigation>
      <ul class="flex flex-col gap-6">
        @if (overview(); as area) {
          <li>
            <a
              [routerLink]="routes.doc(area.slug)"
              [routerLinkActiveOptions]="{ exact: true }"
              routerLinkActive="bg-accent text-accent-foreground"
              class="block rounded-md px-2 py-1.5 text-sm font-medium transition-colors pointer-coarse:py-3 hover:bg-accent hover:text-accent-foreground"
            >
              {{ area.title }}
            </a>
          </li>
        }

        @for (domain of domains(); track domain.domain) {
          <li>
            <h2 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {{ domain.title }}
            </h2>

            <ul class="flex flex-col gap-3">
              @for (stack of domain.stacks; track stack.stack) {
                <li>
                  <a
                    [routerLink]="routes.doc(stack.overview.slug)"
                    [routerLinkActiveOptions]="{ exact: true }"
                    routerLinkActive="bg-accent text-accent-foreground"
                    class="block rounded-md px-2 py-1.5 text-sm font-medium transition-colors pointer-coarse:py-3 hover:bg-accent hover:text-accent-foreground"
                  >
                    {{ stack.overview.title }}
                  </a>

                  @for (group of stack.groups; track group.group) {
                    <!-- 묶음 제목은 스택 아래 한 단계 들여 씁니다. 링크가 아니라 구분입니다. -->
                    <p class="mt-2 mb-1 pl-2 text-xs text-foreground-secondary">
                      {{ group.title }}
                    </p>
                    <ul class="flex flex-col gap-0.5 border-l border-border pl-2">
                      @for (doc of group.documents; track doc.slug) {
                        <li>
                          <a
                            [routerLink]="routes.doc(doc.slug)"
                            routerLinkActive="bg-accent text-accent-foreground"
                            class="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors pointer-coarse:py-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            {{ doc.title }}
                          </a>
                        </li>
                      }
                    </ul>
                  }
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

  /** 영역 개요입니다. 사이드바 맨 위에 단독으로 놓입니다. */
  protected readonly overview = computed(() => DOC_SUMMARIES.find((doc) => doc.kind === 'area'));

  /**
   * 사이드바 트리입니다. 문서가 없는 묶음과 개요가 없는 스택은 빼므로,
   * 준비 중인 스택은 개요 하나만 링크로 나타납니다.
   */
  protected readonly domains = computed<readonly NavigationDomain[]>(() =>
    (Object.keys(DOC_DOMAINS) as DocDomain[])
      .map((domain) => ({
        domain,
        title: DOC_DOMAINS[domain],
        stacks: this.stacksOf(domain),
      }))
      .filter((entry) => entry.stacks.length > 0),
  );

  private stacksOf(domain: DocDomain): readonly NavigationStack[] {
    const inDomain = DOC_SUMMARIES.filter((doc) => doc.domain === domain);
    const names = [...new Set(inDomain.map((doc) => doc.stack).filter((name) => name !== null))];

    return names
      .map((stack) => {
        const documents = inDomain.filter((doc) => doc.stack === stack);
        const overview = documents.find((doc) => doc.kind === 'stack');

        return overview ? { stack, overview, groups: this.groupsOf(documents) } : null;
      })
      .filter((entry) => entry !== null);
  }

  private groupsOf(documents: readonly DocSummary[]): readonly NavigationGroup[] {
    return (Object.keys(DOC_GROUPS) as DocGroup[])
      .map((group) => ({
        group,
        title: DOC_GROUPS[group],
        documents: documents.filter((doc) => doc.group === group),
      }))
      .filter((entry) => entry.documents.length > 0);
  }

  constructor() {
    // 이 프레임이 살아 있는 동안 베일 자리를 가져갑니다. 셸은 그동안 물러납니다.
    inject(NavigationVeilSlot).claim(this.destroyRef);

    // 링크 클릭뿐 아니라 뒤로가기로 이동한 경우에도 시트를 닫습니다.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.mobileNavOpen.set(false));
  }
}
