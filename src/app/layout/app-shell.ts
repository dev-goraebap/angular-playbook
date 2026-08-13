import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ROUTES } from '@/shared/config';
import { ThemeToggle } from '../theme-toggle';

/**
 * 모든 화면이 공유하는 셸입니다. 상단 바와 테마 전환만 소유합니다.
 *
 * 사이드바 유무는 자식 프레임이 정합니다. 여기서 경로를 보고 분기하면
 * 셸이 어느 화면인지 알게 되어, 호출부가 골격을 모른다는 원칙이 뒤집힙니다.
 * 근거는 docs/architectures/frontend/angular/references/레이아웃.md 3.1절입니다.
 *
 * 상단 바를 셸에 두면 라우트를 옮겨도 재생성되지 않아 전환 중에 깜빡이지 않습니다.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle],
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

        @for (item of menu; track item.path) {
          <a
            [routerLink]="item.path"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            routerLinkActive="text-primary"
            class="text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
          >
            {{ item.label }}
          </a>
        }

        <app-theme-toggle class="ml-auto" />
      </nav>
    </header>

    <router-outlet />
  `,
})
export class AppShell {
  protected readonly routes = ROUTES;

  /**
   * 상단 메뉴입니다. 블로그는 루트라 정확히 일치할 때만 활성 표시를 켭니다.
   * 그러지 않으면 어느 화면에서든 활성으로 보입니다.
   */
  protected readonly menu = [
    { path: '/', label: '블로그', exact: true },
    { path: '/architectures', label: '아키텍처', exact: false },
    { path: '/about', label: '소개', exact: false },
  ];
}
