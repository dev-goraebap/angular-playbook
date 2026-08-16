import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBoxes,
  lucideChevronRight,
  lucideComponent,
  lucideLayers,
  lucideLeaf,
  lucideMenu,
  lucidePenLine,
  lucideServer,
} from '@ng-icons/lucide';
import { HlmButton } from '@/shared/ui/button';
import {
  HlmSheet,
  HlmSheetContent,
  HlmSheetHeader,
  HlmSheetPortal,
  HlmSheetTitle,
} from '@/shared/ui/sheet';
import { DOC_GROUPS, DOC_SUMMARIES, type DocGroup, type DocSummary } from '@/shared/markdown';
import { ROUTES } from '@/shared/config';
import { NavigationVeil, NavigationVeilSlot } from '../navigation-veil';

/** 주소에서 문서의 슬러그를 얻습니다. 쿼리와 프래그먼트를 떼고 앞 슬래시를 없앱니다. */
function slugOf(url: string): string {
  return url.split(/[?#]/)[0].replace(/^\//, '');
}

/** 두 경로가 같은지 봅니다. 노드에 직접 속한 문서를 고를 때 씁니다. */
function isSameTrail(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

/** 앞이 뒤로 시작하는지 봅니다. 자손 노드를 고를 때 씁니다. */
function startsWithTrail(trail: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => trail[index] === segment);
}

/** 노드 안에서 문서를 나누는 묶음입니다. 횡단 개념과 결정 기록이 여기 해당합니다. */
interface NavigationGroup {
  readonly group: DocGroup;
  readonly title: string;
  readonly documents: readonly DocSummary[];
  /** 묶음을 가리키는 열쇠입니다. 묶음 이름은 노드마다 반복되므로 경로와 함께 묶습니다. */
  readonly key: string;
  readonly open: boolean;
}

/**
 * 사이드바의 한 마디입니다. 개요 문서 하나와 그 아래 묶음, 그리고 자식 노드로 구성됩니다.
 *
 * 깊이를 고정하지 않는 이유는 아키텍처의 층이 구성마다 다르기 때문입니다. 디커플드는
 * 구성 · 범위 · 스택 세 층이지만 통합형은 그보다 얕습니다. 자기 참조로 두면 폴더를
 * 한 겹 더 파도 화면을 고치지 않습니다.
 */
interface NavigationNode {
  readonly overview: DocSummary;
  readonly groups: readonly NavigationGroup[];
  readonly children: readonly NavigationNode[];
  readonly key: string;
  readonly open: boolean;
}

/**
 * 문서 영역의 프레임입니다. 상단 바는 셸이 소유하므로 여기에는 사이드바와 본문만 있습니다.
 *
 * 원래 설명은 다음과 같습니다. 골격은 `topbar` 이며 표면은 `bordered` 로 고정됩니다.
 *
 * 골격 종류와 스크롤 컨테이너의 대응은 external/refarch-angular-springboot/docs/architecture/angular/references/레이아웃.md 2절이 원본입니다.
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
  /*
   * 노드 아이콘은 문서의 프론트매터가 이름으로 지정하므로 쓰이는 것을 여기서 전부 등록합니다.
   * 이름이 문자열이라 컴파일러가 누락을 잡지 못하며, 등록하지 않은 이름은 오류 없이
   * 빈 자리로 나타납니다. 새 노드를 만들 때 아이콘을 함께 등록했는지 확인합니다.
   */
  providers: [
    provideIcons({
      lucideMenu,
      lucideChevronRight,
      lucidePenLine,
      lucideLayers,
      lucideServer,
      lucideBoxes,
      lucideComponent,
      lucideLeaf,
    }),
  ],
  template: `
    <!--
      두 열을 벌리는 값도, 좌우 여백도 부모가 아니라 자식이 갖습니다. 부모에 gap 이나 padding 을
      두면 콘텐츠 열의 상자가 눈에 보이는 본문 영역보다 좁아지고, 그 상자를 기준으로 놓은 베일이
      사이드바와의 사이에 덮이지 않는 띠를 남깁니다. 기준 상자와 덮어야 할 영역은 같아야
      합니다(로딩-전략.md 7.1절).

      items-start 도 같은 이유로 쓰지 않습니다. 사이드바가 본문보다 길 때 콘텐츠 열의 상자가
      본문 영역보다 짧아져 아래쪽에 덮이지 않는 띠가 생깁니다. 늘어나면 안 되는 것은
      사이드바 하나뿐이므로 그쪽만 self-start 로 뺍니다.
    -->
    <div class="mx-auto flex max-w-[90rem]">
      <nav
        aria-label="문서 목록"
        class="scroll-thin sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 self-start overflow-y-auto py-8 pl-4 lg:block"
      >
        <ng-container [ngTemplateOutlet]="navigation" />
      </nav>

      <!--
        flex 자식의 기본 min-width 는 auto 라 긴 표와 코드 블록이 열을 밀어냅니다. 레이아웃.md 4.2절

        베일의 기준 상자입니다. 이 프레임은 사이드바를 함께 그리므로 셸의 본문 영역을
        덮으면 사이드바까지 가려집니다. 문서 영역에서 이동 수단이 사이드바이므로
        대기 중에도 눌러야 합니다(로딩-전략.md 7.1절).
      -->
      <!-- 사이드바가 보이는 폭에서는 왼쪽 여백이 두 열 사이의 간격을 겸합니다. -->
      <div id="main" class="relative min-w-0 flex-1 px-4 py-8 lg:pl-10">
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
      <ul class="flex flex-col gap-1">
        @if (overview(); as area) {
          <li>
            <a
              [routerLink]="routes.doc(area.slug)"
              [routerLinkActiveOptions]="{ exact: true }"
              routerLinkActive="bg-accent font-medium text-accent-foreground [&_ng-icon]:text-primary"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors pointer-coarse:py-2.5 hover:bg-accent hover:text-accent-foreground"
              [title]="area.title"
            >
              @if (area.icon) {
                <ng-icon [name]="area.icon" class="shrink-0 text-base text-muted-foreground" />
              }
              <span class="truncate">{{ area.title }}</span>
            </a>
          </li>
        }

        @for (node of tree(); track node.key) {
          <li>
            <ng-container
              [ngTemplateOutlet]="branch"
              [ngTemplateOutletContext]="{ $implicit: node }"
            />
          </li>
        }
      </ul>
    </ng-template>

    <!--
      마디 하나를 그립니다. 자기 자신을 다시 불러 자식을 그리므로 층이 몇 겹이든 같은
      코드가 처리합니다. 폴더를 한 겹 더 파도 이 파일을 고치지 않습니다.

      제목은 truncate 로 한 줄에 가둡니다. 사이드바 폭이 고정인데 제목 길이는 문서마다
      다르므로, 줄바꿈을 허용하면 항목의 높이가 들쭉날쭉해져 목록의 리듬이 깨집니다.
      잘린 전체 문구는 title 속성이 들고 있습니다.
    -->
    <ng-template #branch let-node>
      <!--
        마디도 접힙니다. 여는 것과 가는 것을 한 줄에 두되, 제목을 누르면 그 개요로 이동하고
        나머지 자리를 누르면 접힙니다. 링크가 자기 클릭을 여기서 멈추므로 두 동작이 겹치지
        않습니다.
      -->
      <details
        class="group/node"
        [open]="node.open"
        (toggle)="toggleGroup(node.key, $any($event.target).open)"
      >
        <summary
          class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors select-none pointer-coarse:py-2.5 hover:bg-accent hover:text-accent-foreground has-[.is-active]:bg-accent has-[.is-active]:text-accent-foreground"
        >
          <a
            [routerLink]="routes.doc(node.overview.slug)"
            [routerLinkActiveOptions]="{ exact: true }"
            routerLinkActive="is-active font-medium [&_ng-icon]:text-primary"
            class="flex min-w-0 flex-1 items-center gap-2"
            [title]="node.overview.title"
            (click)="$event.stopPropagation()"
          >
            @if (node.overview.icon) {
              <ng-icon [name]="node.overview.icon" class="shrink-0 text-base text-muted-foreground" />
            }
            <span class="truncate">{{ node.overview.title }}</span>
          </a>

          @if (node.groups.length > 0 || node.children.length > 0) {
            <ng-icon
              name="lucideChevronRight"
              class="shrink-0 text-sm text-muted-foreground transition-transform group-open/node:rotate-90"
            />
          }
        </summary>

        @if (node.groups.length > 0 || node.children.length > 0) {
        <!--
          자식 묶음을 세로선으로 잇습니다. 선이 없으면 들여쓰기만으로 계층을 읽어야 하는데,
          한 화면에 층이 넷까지 겹치면 어느 항목이 어느 부모에 속하는지 눈으로 따라가기
          어렵습니다. 왼쪽 여백은 부모의 아이콘 자리와 맞춥니다.
        -->
        <div class="mt-1 ml-3 flex flex-col gap-1 border-l border-border pl-3">
          @for (group of node.groups; track group.key) {
            <!--
              묶음은 기본이 접힘입니다. 문서 서른 개를 한 번에 펼쳐 두면 찾는 것이
              아니라 훑는 화면이 됩니다.

              details 를 쓰는 이유는 접힌 내용이 DOM 에 남기 때문입니다. 조건부
              렌더링으로 만들면 접힌 묶음의 링크가 아예 없어져 크롤러가 문서를
              찾지 못하고, 스크립트가 없는 환경에서는 펼칠 수단도 사라집니다.
            -->
            <details
              class="group/disclosure"
              [open]="group.open"
              (toggle)="toggleGroup(group.key, $any($event.target).open)"
            >
              <!--
                펼침 표시를 오른쪽 끝에 둡니다. 왼쪽에 두면 제목의 시작 위치가 형제
                항목과 어긋나 목록의 세로 정렬이 깨집니다.
              -->
              <summary
                class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors select-none pointer-coarse:py-2.5 hover:bg-accent hover:text-accent-foreground"
              >
                <span class="truncate">{{ group.title }}</span>
                <ng-icon
                  name="lucideChevronRight"
                  class="ml-auto shrink-0 text-sm text-muted-foreground transition-transform group-open/disclosure:rotate-90"
                />
              </summary>

              <!--
                잎 항목은 세로선 위에 자기 구간을 덮어 그립니다. 활성 항목의 선만 강조색이
                되므로 배경을 칠하지 않고도 현재 위치가 드러나며, 본문 우측 목차와 같은
                표현이라 두 곳을 따로 익히지 않아도 됩니다.
              -->
              <ul class="mt-1 flex flex-col border-l border-border">
                @for (doc of group.documents; track doc.slug) {
                  <li>
                    <a
                      [routerLink]="routes.doc(doc.slug)"
                      routerLinkActive="border-primary font-medium text-foreground"
                      class="-ml-px block truncate border-l border-transparent py-1 pr-2 pl-3 text-sm text-muted-foreground transition-colors pointer-coarse:py-2 hover:border-border hover:text-foreground"
                      [title]="doc.title"
                    >
                      {{ doc.title }}
                    </a>
                  </li>
                }
              </ul>
            </details>
          }

          @for (child of node.children; track child.key) {
            <div>
              <ng-container
                [ngTemplateOutlet]="branch"
                [ngTemplateOutletContext]="{ $implicit: child }"
              />
            </div>
          }
          </div>
        }
      </details>
    </ng-template>
  `,
})
export class DocsLayout {
  protected readonly routes = ROUTES;

  /** 좁은 화면의 문서 목록 열림 상태입니다. 시트 청크의 로드 조건도 겸합니다. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * 사용자가 직접 여닫은 결과입니다. 손대지 않은 항목은 이 맵에 없으며 기본값을 따릅니다.
   *
   * 집합이 아니라 맵인 이유는 기본값이 항목마다 다르기 때문입니다. 묶음은 접힘이 기본이고
   * 최상위 마디는 펼침이 기본이라, "펼쳐 둔 것"만 기록해서는 최상위를 접을 수 없습니다.
   *
   * 주소에 두지 않는 이유는 라우팅과-네비게이션.md 3.3절이 열린 아코디언을 컴포넌트 상태로
   * 규정하기 때문입니다. 공유된 링크가 남의 사이드바 접힘까지 정할 이유가 없습니다.
   *
   * 프레임은 문서 사이를 오가는 동안 유지되므로 여닫은 상태가 이동할 때마다 풀리지 않습니다.
   */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());

  /** 지금 보고 있는 문서의 슬러그입니다. 그 문서가 든 묶음은 자동으로 펼칩니다. */
  private readonly activeSlug = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => slugOf(this.router.url)),
    ),
    { initialValue: slugOf(this.router.url) },
  );

  /** 영역 개요입니다. 사이드바 맨 위에 단독으로 놓입니다. */
  protected readonly overview = computed(() => DOC_SUMMARIES.find((doc) => doc.kind === 'area'));

  /**
   * 사이드바 트리입니다. 문서가 없는 묶음은 빼므로 준비 중인 노드는 개요 하나만 나타납니다.
   *
   * 계층 정보를 개요 문서의 경로에서 읽습니다. 폴더가 이미 그 정보를 담고 있으므로
   * 화면이 층의 이름이나 개수를 따로 알지 않습니다.
   */
  protected readonly tree = computed<readonly NavigationNode[]>(() => {
    // 템플릿에서 함수를 부르지 않도록 펼침 여부까지 여기서 계산해 둡니다. 성능.md 3.1절
    return this.nodesUnder([], this.toggled(), this.activeSlug(), 0);
  });

  /** 주어진 경로 바로 아래 한 층의 노드들입니다. 자기 자신을 불러 그 아래를 마저 세웁니다. */
  private nodesUnder(
    trail: readonly string[],
    toggled: ReadonlyMap<string, boolean>,
    active: string,
    depth: number,
  ): readonly NavigationNode[] {
    return DOC_SUMMARIES.filter(
      (doc) =>
        doc.kind === 'node' &&
        doc.trail.length === trail.length + 1 &&
        startsWithTrail(doc.trail, trail),
    ).map((overview) => {
      const key = overview.trail.join('/');
      const groups = this.groupsOf(overview.trail, toggled, active);
      const children = this.nodesUnder(overview.trail, toggled, active, depth + 1);

      // 보고 있는 문서를 품은 마디는 접혀 있으면 자기 위치를 알 수 없으므로 함께 펼칩니다.
      const holdsActive =
        overview.slug === active ||
        groups.some((group) => group.open) ||
        children.some((child) => child.open);

      return {
        overview,
        key,
        groups,
        children,
        // 최상위 마디만 펼침이 기본입니다. 전부 접으면 문서에 닿는 데 계단이 하나 더 생깁니다.
        open: holdsActive || (toggled.get(key) ?? depth === 0),
      };
    });
  }

  private groupsOf(
    trail: readonly string[],
    toggled: ReadonlyMap<string, boolean>,
    active: string,
  ): readonly NavigationGroup[] {
    const own = DOC_SUMMARIES.filter(
      (doc) => doc.kind === 'document' && isSameTrail(doc.trail, trail),
    );

    return (Object.keys(DOC_GROUPS) as DocGroup[])
      .map((group) => {
        const inGroup = own.filter((doc) => doc.group === group);
        const key = `${trail.join('/')}/${group}`;

        return {
          group,
          title: DOC_GROUPS[group],
          documents: inGroup,
          key,
          // 보고 있는 문서가 든 묶음은 접혀 있으면 자기 위치를 알 수 없으므로 함께 펼칩니다.
          open: inGroup.some((doc) => doc.slug === active) || (toggled.get(key) ?? false),
        };
      })
      .filter((entry) => entry.documents.length > 0);
  }

  /** 사용자가 직접 여닫은 결과를 기록합니다. 지금 보고 있는 문서를 품은 자리는 이 값과 무관하게 펼쳐집니다. */
  protected toggleGroup(key: string, open: boolean): void {
    this.toggled.update((current) => new Map(current).set(key, open));
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
