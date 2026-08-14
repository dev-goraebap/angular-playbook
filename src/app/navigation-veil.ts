import { Component, DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Event as RouterEvent,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter } from 'rxjs';
import { HlmSpinner } from '@/shared/ui/spinner';

/** 이 시간 안에 전환이 끝나면 베일을 띄우지 않습니다. */
const WAIT_DELAY_MS = 200;

/** 한 번 띄운 베일을 유지하는 최소 시간입니다. 즉시 걷히면 깜빡입니다. */
const WAIT_MIN_MS = 400;

/** 앞부분의 슬래시와 쿼리·프래그먼트를 제외한 경로 세그먼트를 얻습니다. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * 베일 자리의 주인을 가립니다.
 *
 * 셸은 자기 본문 영역에 베일을 두지만, 문서처럼 안쪽 프레임이 사이드바를 함께
 * 그리는 경우에는 그 프레임이 자기 콘텐츠 열에 베일을 둡니다. 두 자리가 겹치면
 * 바깥 것이 사이드바까지 덮으므로 안쪽이 자리를 가져가는 동안 바깥은 물러납니다.
 *
 * 셸이 경로를 보고 판정하지 않는 이유는 그러면 셸이 어느 화면인지 알게 되어
 * 호출부가 골격을 모른다는 원칙이 뒤집히기 때문입니다(레이아웃.md 3.1절).
 * 셸은 "안쪽이 가져갔는가"만 묻고 어느 화면인지는 끝까지 모릅니다.
 */
@Injectable({ providedIn: 'root' })
export class NavigationVeilSlot {
  /** 자리를 주장한 안쪽 프레임의 수입니다. 중첩을 대비해 불리언이 아니라 수로 셉니다. */
  private readonly claims = signal(0);

  readonly claimedByFrame = computed(() => this.claims() > 0);

  /** 프레임이 살아 있는 동안 자리를 차지합니다. 해제는 프레임이 사라질 때 자동입니다. */
  claim(destroyRef: DestroyRef): void {
    this.claims.update((count) => count + 1);
    destroyRef.onDestroy(() => this.claims.update((count) => count - 1));
  }
}

/**
 * 화면 전환 중 콘텐츠 영역을 덮는 베일입니다.
 *
 * 경로가 바뀌면 베일, 쿼리만 바뀌면 인디케이터라는 판정과 시간 정책의 근거는
 * docs/architectures/frontend/angular/references/로딩-전략.md 3절과 4절에 있습니다. 정책을 라우터 층에 거는 이유는
 * 화면마다 다른 값을 쓰면 같은 대기가 화면에 따라 다르게 보이기 때문입니다.
 *
 * 덮는 범위는 이 컴포넌트를 놓은 자리가 정합니다. 화면 전체가 아니라 콘텐츠
 * 영역만 덮어야 대기 중에도 이동할 수 있습니다(로딩-전략.md 7.1절). 그래서
 * fixed 가 아니라 absolute 이며, 놓는 쪽이 relative 를 함께 지정합니다.
 *
 * 인디케이터는 반대로 화면 기준입니다. 갱신은 콘텐츠 영역 안의 일이 아니라
 * 주소 전체의 일이므로 상단에 한 줄로 붙입니다.
 */
@Component({
  selector: 'app-navigation-veil',
  imports: [HlmSpinner],
  template: `
    @if (visible()) {
      <div
        class="absolute inset-0 z-20 bg-background/70 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <!--
          본문이 화면보다 길면 영역의 한가운데가 화면 밖입니다. sticky 로 붙여
          어디까지 스크롤했든 보이는 자리에 남게 합니다.
        -->
        <div class="sticky top-1/2 flex justify-center">
          <hlm-spinner aria-label="불러오는 중" />
        </div>
      </div>
    }
    @if (indicating()) {
      <div
        class="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
        role="status"
        aria-live="polite"
      >
        <span class="sr-only">갱신 중</span>
      </div>
    }
  `,
})
export class NavigationVeil {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mode = signal<'idle' | 'veil' | 'indicator'>('idle');
  private readonly veilShownAt = signal<number | null>(null);

  protected readonly visible = computed(() => this.mode() === 'veil');
  protected readonly indicating = computed(() => this.mode() === 'indicator');

  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private minTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event: RouterEvent) =>
            event instanceof NavigationStart ||
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.start(event.url);
          return;
        }
        // 실패에는 최소 유지 시간을 적용하지 않습니다. 대기를 더 강요할 이유가 없습니다.
        this.finish(event instanceof NavigationEnd);
      });

    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  private start(targetUrl: string): void {
    const pathChanged = pathOf(this.router.url) !== pathOf(targetUrl);

    if (!pathChanged) {
      this.mode.set('indicator');
      return;
    }

    this.clearTimers();
    this.delayTimer = setTimeout(() => {
      this.mode.set('veil');
      this.veilShownAt.set(performance.now());
    }, WAIT_DELAY_MS);
  }

  private finish(succeeded: boolean): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }

    const shownAt = this.veilShownAt();
    if (!succeeded || shownAt === null) {
      this.reset();
      return;
    }

    const remaining = WAIT_MIN_MS - (performance.now() - shownAt);
    if (remaining <= 0) {
      this.reset();
      return;
    }
    this.minTimer = setTimeout(() => this.reset(), remaining);
  }

  private reset(): void {
    this.mode.set('idle');
    this.veilShownAt.set(null);
  }

  private clearTimers(): void {
    if (this.delayTimer !== null) clearTimeout(this.delayTimer);
    if (this.minTimer !== null) clearTimeout(this.minTimer);
    this.delayTimer = null;
    this.minTimer = null;
  }
}
