import { DOCUMENT, Location } from '@angular/common';
import { Component, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { NAVIGATION, ROUTES } from '@/shared/config';
import type { SearchHit } from '@/shared/markdown';
import { HlmButton } from '@/shared/ui/button';
import { NavigationVeil, NavigationVeilSlot } from '../navigation-veil';
import { SiteSearch } from '../site-search';
import { ThemeToggle } from '../theme-toggle';
import { BottomNav } from './bottom-nav';
import { SiteFooter } from './site-footer';

/**
 * 모든 화면이 공유하는 셸입니다. 상단 바와 하단 네비, 테마 전환, 검색 열기를 소유합니다.
 *
 * 사이드바 유무는 자식 프레임이 정합니다. 여기서 경로를 보고 분기하면
 * 셸이 어느 화면인지 알게 되어, 호출부가 골격을 모른다는 원칙이 뒤집힙니다.
 * 근거는 external/refarch-angular-springboot/docs/architecture/angular/references/layout.md 3.1절입니다.
 *
 * 상단 바를 셸에 두면 라우트를 옮겨도 재생성되지 않아 전환 중에 깜빡이지 않습니다.
 *
 * 좁은 화면에서는 상단 바가 로고와 테마 전환만 남기고 메뉴가 하단으로 내려갑니다.
 * 두 자리가 같은 `NAVIGATION` 을 읽으므로 한쪽에만 항목이 생기는 일이 없습니다.
 *
 * 검색 상태를 주소에 둡니다. 열려 있는 검색은 화면을 덮으므로 사용자가 그것을 화면으로 읽고
 * 뒤로가기를 누르며, 상태가 컴포넌트에 있으면 그 누름이 사이트를 떠나는 이동이 됩니다.
 * 주소에 두면 뒤로가기·새로고침·링크 공유가 별도 구현 없이 동작합니다(routing.md 3.3절).
 *
 * 라우터를 호출하는 곳은 이 셸 하나입니다. 오버레이가 자기 주소를 직접 고치면 열림 상태의
 * 원본이 두 곳이 되고, 어느 쪽이 히스토리를 쌓는지 추적할 수 없게 됩니다.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmButton,
    NavigationVeil,
    ThemeToggle,
    BottomNav,
    SiteFooter,
    SiteSearch,
  ],
  providers: [provideIcons({ lucideSearch })],
  host: {
    // 하단 네비가 고정 요소라 문서 끝이 그 아래로 들어갑니다. 막대 높이만큼 본문을 띄웁니다.
    class:
      'flex min-h-dvh flex-col pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0',
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      본문으로 건너뛰기
    </a>

    <!--
      불투명도는 --toolbar 토큰이 모드별로 정합니다. 여기서 /85 같은 알파를 붙이면
      라이트와 다크에 같은 값이 적용되어 다크에서 뒤 요소가 비쳐 보입니다.
    -->
    <header
      class="bg-toolbar sticky top-0 z-40 border-b border-border backdrop-blur-lg backdrop-saturate-180"
    >
      <nav class="mx-auto flex h-14 max-w-[90rem] items-center gap-5 px-4">
        <!-- 옮겨 오기 전 블로그와 같은 서체와 크기입니다. 사유는 ADR-0014 의 개정 절에 있습니다. -->
        <a
          [routerLink]="routes.home()"
          class="font-logo text-2xl font-medium tracking-tight whitespace-nowrap"
        >
          dev.goraebap
        </a>

        <!-- 좁은 화면에서는 하단 네비가 같은 항목을 맡으므로 여기서 숨깁니다. -->
        <div class="hidden items-center gap-5 md:flex">
          @for (item of navigation; track item.path) {
            <a
              [routerLink]="item.path"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              routerLinkActive="text-primary"
              class="text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
            >
              {{ item.label }}
            </a>
          }
        </div>

        <span class="flex-1"></span>

        <button
          hlmBtn
          variant="outline"
          size="sm"
          class="hidden gap-2 text-muted-foreground md:inline-flex"
          (click)="openSearch()"
        >
          <ng-icon name="lucideSearch" />
          검색
          <kbd class="rounded border border-border px-1 py-0.5 text-[0.625rem] leading-none">
            {{ shortcutLabel() }}
          </kbd>
        </button>

        <app-theme-toggle />
      </nav>
    </header>

    <!--
      본문이 짧아도 푸터가 화면 하단에 붙도록 남은 높이를 차지합니다.

      베일의 기준 상자이기도 합니다. 헤더·푸터·하단 네비가 이 밖에 있으므로
      전환 중에도 그 셋은 덮이지 않습니다. 사이드바를 함께 그리는 프레임은
      자기 콘텐츠 열에 베일을 두므로 그동안 여기 것은 물러납니다.
    -->
    <main class="relative flex-1">
      @if (!veilSlot.claimedByFrame()) {
        <app-navigation-veil />
      }
      <router-outlet />
    </main>

    <app-site-footer />

    <app-bottom-nav (searchRequested)="openSearch()" />

    <!--
      검색은 색인과 팔레트를 함께 들여오므로 열 때 받습니다. 조건이 기기가 아니라 조작 상태라
      하이드레이션 불일치가 없습니다. 지연 판단 기준은 adaptive-ui.md 4.4절입니다.
    -->
    @defer (when searchOpen(); prefetch on idle) {
      <app-site-search
        [open]="searchOpen()"
        [query]="q() ?? ''"
        (queryChange)="writeSearchQuery($event)"
        (closed)="closeSearch()"
        (selected)="goToResult($event)"
      />
    }
  `,
})
export class AppShell {
  /**
   * 검색 상태입니다. 값이 있으면 열린 것이고 그 값이 검색어입니다.
   * `withComponentInputBinding()` 이 같은 이름의 쿼리 파라미터를 여기에 묶습니다.
   *
   * 플래그와 검색어를 따로 두지 않습니다. 두 파라미터가 어긋난 상태가 표현 가능해집니다.
   */
  public readonly q = input<string>();

  protected readonly routes = ROUTES;
  protected readonly navigation = NAVIGATION;

  /** 안쪽 프레임이 베일 자리를 가져갔는지만 봅니다. 어느 화면인지는 묻지 않습니다. */
  protected readonly veilSlot = inject(NavigationVeilSlot);

  /** 검색 오버레이의 열림 상태입니다. 지연 청크의 로드 조건도 겸합니다. */
  protected readonly searchOpen = computed(() => this.q() !== undefined);

  /** 단축키 표기입니다. 서버는 기기를 모르므로 더 널리 쓰이는 쪽에서 시작합니다. */
  protected readonly shortcutLabel = signal('Ctrl K');

  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /**
   * 검색을 열면서 우리가 히스토리 항목을 쌓았는지입니다.
   * 공유 링크로 곧장 들어온 경우에는 돌아갈 항목이 없어 닫는 방법이 다릅니다.
   */
  private pushedForSearch = false;

  constructor() {
    afterNextRender(() => {
      if (this.isApplePlatform()) this.shortcutLabel.set('⌘K');
    });

    // 뒤로가기로 닫힌 경우에도 표식을 지웁니다. 남겨 두면 다음 닫기가 엉뚱한 곳으로 돌아갑니다.
    effect(() => {
      if (!this.searchOpen()) this.pushedForSearch = false;
    });
  }

  /** 여는 것은 이동입니다. 히스토리를 쌓아야 뒤로가기가 곧 닫기가 됩니다. */
  protected openSearch(): void {
    if (this.searchOpen()) return;

    this.pushedForSearch = true;
    void this.router.navigate([], { queryParams: { q: '' }, queryParamsHandling: 'merge' });
  }

  /**
   * 입력 반영은 히스토리를 쌓지 않습니다(3.2절). 쌓으면 뒤로가기가 글자 단위로 되감깁니다.
   * 여는 것과 반대 규칙이며, 같은 파라미터라도 조작의 성격이 다르기 때문입니다.
   */
  protected writeSearchQuery(text: string): void {
    if (!this.searchOpen()) return;

    void this.router.navigate([], {
      queryParams: { q: text },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected closeSearch(): void {
    if (!this.searchOpen()) return;

    // 우리가 쌓은 항목이면 되돌아가는 편이 히스토리를 깨끗하게 둡니다.
    if (this.pushedForSearch) {
      this.pushedForSearch = false;
      this.location.back();
      return;
    }

    // 공유 링크로 곧장 들어온 경우입니다. 돌아갈 항목이 없으므로 파라미터만 지웁니다.
    void this.router.navigate([], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * 결과로 이동합니다. 경로가 바뀌는 이동이라 쿼리 파라미터가 따라오지 않으므로
   * `q` 를 따로 지우지 않아도 검색이 닫힙니다.
   */
  protected goToResult(hit: SearchHit): void {
    void this.router.navigate(
      ROUTES.doc(hit.slug),
      hit.section ? { fragment: hit.section.id } : {},
    );
  }

  /**
   * 열기 단축키입니다. 셸이 듣는 이유는 검색이 지연 로드라 자신을 여는 열쇠를 가질 수 없기 때문입니다.
   *
   * `key` 가 아니라 `code` 로 판정합니다. 한글 자판에서는 같은 자리가 `ㅏ` 로 오므로
   * `key` 만 보면 입력기를 켠 상태에서 단축키가 듣지 않습니다.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k') return;

    event.preventDefault();

    if (this.searchOpen()) this.closeSearch();
    else this.openSearch();
  }

  private isApplePlatform(): boolean {
    const platform = this.document.defaultView?.navigator.platform ?? '';
    return /Mac|iPhone|iPad|iPod/.test(platform);
  }
}
