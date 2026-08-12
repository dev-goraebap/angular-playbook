import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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

/** 이 시간 안에 전환이 끝나면 베일을 띄우지 않습니다. */
const WAIT_DELAY_MS = 200;

/** 한 번 띄운 베일을 유지하는 최소 시간입니다. 즉시 걷히면 깜빡입니다. */
const WAIT_MIN_MS = 400;

/** 앞부분의 슬래시와 쿼리·프래그먼트를 제외한 경로 세그먼트를 얻습니다. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * 화면 전환 중 이전 화면을 덮는 베일입니다.
 *
 * 경로가 바뀌면 베일, 쿼리만 바뀌면 인디케이터라는 판정과 시간 정책의 근거는
 * docs/references/로딩-전략.md §3 과 §4 에 있습니다. 정책을 라우터 층에 거는 이유는
 * 화면마다 다른 값을 쓰면 같은 대기가 화면에 따라 다르게 보이기 때문입니다.
 */
@Component({
  selector: 'app-navigation-veil',
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <span class="text-sm text-muted-foreground">불러오는 중</span>
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
