import { DOCUMENT } from '@angular/common';
import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { NAVIGATION, ROUTES } from '@/shared/config';
import { HlmButton } from '@/shared/ui/button';
import { SiteSearch } from '../site-search';
import { ThemeToggle } from '../theme-toggle';
import { BottomNav } from './bottom-nav';
import { SiteFooter } from './site-footer';

/**
 * 모든 화면이 공유하는 셸입니다. 상단 바와 하단 네비, 테마 전환, 검색 열기를 소유합니다.
 *
 * 사이드바 유무는 자식 프레임이 정합니다. 여기서 경로를 보고 분기하면
 * 셸이 어느 화면인지 알게 되어, 호출부가 골격을 모른다는 원칙이 뒤집힙니다.
 * 근거는 docs/architectures/frontend/angular/references/레이아웃.md 3.1절입니다.
 *
 * 상단 바를 셸에 두면 라우트를 옮겨도 재생성되지 않아 전환 중에 깜빡이지 않습니다.
 *
 * 좁은 화면에서는 상단 바가 로고와 테마 전환만 남기고 메뉴가 하단으로 내려갑니다.
 * 두 자리가 같은 `NAVIGATION` 을 읽으므로 한쪽에만 항목이 생기는 일이 없습니다.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmButton,
    ThemeToggle,
    BottomNav,
    SiteFooter,
    SiteSearch,
  ],
  providers: [provideIcons({ lucideSearch })],
  host: {
    // 하단 네비가 고정 요소라 문서 끝이 그 아래로 들어갑니다. 막대 높이만큼 본문을 띄웁니다.
    class: 'flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0',
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
        <a [routerLink]="routes.home()" class="text-lg font-semibold tracking-tight">
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
          (click)="searchOpen.set(true)"
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

    <!-- 본문이 짧아도 푸터가 화면 하단에 붙도록 남은 높이를 차지합니다. -->
    <main class="flex-1">
      <router-outlet />
    </main>

    <app-site-footer />

    <app-bottom-nav (searchRequested)="searchOpen.set(true)" />

    <!--
      검색은 색인과 팔레트를 함께 들여오므로 열 때 받습니다. 조건이 기기가 아니라 조작 상태라
      하이드레이션 불일치가 없습니다. 지연 판단 기준은 적응형-UI.md 4.4절입니다.
    -->
    @defer (when searchOpen(); prefetch on idle) {
      <app-site-search [open]="searchOpen()" (openChange)="searchOpen.set($event)" />
    }
  `,
})
export class AppShell {
  protected readonly routes = ROUTES;
  protected readonly navigation = NAVIGATION;

  /** 검색 오버레이의 열림 상태입니다. 지연 청크의 로드 조건도 겸합니다. */
  protected readonly searchOpen = signal(false);

  /** 단축키 표기입니다. 서버는 기기를 모르므로 더 널리 쓰이는 쪽에서 시작합니다. */
  protected readonly shortcutLabel = signal('Ctrl K');

  private readonly document = inject(DOCUMENT);

  constructor() {
    afterNextRender(() => {
      if (this.isApplePlatform()) this.shortcutLabel.set('⌘K');
    });
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
    this.searchOpen.update((open) => !open);
  }

  private isApplePlatform(): boolean {
    const platform = this.document.defaultView?.navigator.platform ?? '';
    return /Mac|iPhone|iPad|iPod/.test(platform);
  }
}
