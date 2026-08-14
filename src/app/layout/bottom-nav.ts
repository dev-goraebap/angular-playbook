import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayers, lucideNewspaper, lucideSearch } from '@ng-icons/lucide';
import { NAVIGATION } from '@/shared/config';

/**
 * 좁은 화면의 메뉴입니다. 상단 바는 로고와 테마 전환만 남기고 이동 수단을 여기로 옮깁니다.
 *
 * 검색이 메뉴 뒤의 마지막 칸입니다. 띄우는 버튼(FAB)을 쓰지 않는 이유는 두 가지입니다. 스크롤 중에
 * 본문 우하단을 계속 가리고, 이 막대 위에 띄우려면 높이 값을 두 곳에서 맞춰야 합니다.
 *
 * 표시 여부는 CSS 로만 정합니다. DOM 이 같고 배치만 달라지므로 반응형이며, 런타임 분기로
 * 만드는 것은 적응형-UI.md 1절이 금지합니다. 이 경로는 정적 생성 대상이라 기기 판정도 쓸 수 없습니다.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, NgIcon],
  providers: [provideIcons({ lucideNewspaper, lucideLayers, lucideSearch })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'bg-toolbar fixed inset-x-0 bottom-0 z-40 border-t border-border backdrop-blur-lg backdrop-saturate-180 md:hidden [view-transition-name:bottom-nav]',
  },
  template: `
    <!--
      칸을 균등 분할하되 개수를 고정하지 않습니다. grid-cols-4 처럼 수를 적어 두면
      메뉴가 늘거나 줄 때 이 값을 함께 고쳐야 하고, 잊으면 빈 칸이나 눌린 칸이 생깁니다.

      홈 인디케이터가 있는 기기에서 마지막 줄이 가려지지 않도록 아래 여백을 확보합니다.
    -->
    <nav aria-label="주요 메뉴" class="flex pb-[env(safe-area-inset-bottom)]">
      @for (item of navigation; track item.path) {
        <a
          [routerLink]="item.path"
          [routerLinkActiveOptions]="{ exact: item.exact }"
          routerLinkActive="text-primary"
          class="flex h-[var(--bottom-nav-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-foreground-secondary transition-colors"
        >
          <ng-icon [name]="item.icon" class="text-lg" />
          {{ item.label }}
        </a>
      }

      <button
        type="button"
        class="flex h-[var(--bottom-nav-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-foreground-secondary transition-colors"
        (click)="searchRequested.emit()"
      >
        <ng-icon name="lucideSearch" class="text-lg" />
        검색
      </button>
    </nav>
  `,
})
export class BottomNav {
  /** 검색은 라우트가 아니라 오버레이라 셸이 엽니다. */
  public readonly searchRequested = output<void>();

  protected readonly navigation = NAVIGATION;
}
