import { DOCUMENT } from '@angular/common';
import { DestroyRef, afterNextRender, effect, inject, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { DocHeading } from '@/shared/markdown';

/** 기준선의 위치입니다. 본문 헤딩의 `scroll-margin-top` 과 같은 값이라 앵커 이동 직후의 판정이 일치합니다. */
const ACTIVE_LINE_REM = 5;

/**
 * 기준선 판정의 여유입니다.
 * 앵커로 이동하면 헤딩이 기준선과 같은 위치에 놓이는데, 서브픽셀 반올림으로 몇 px 어긋납니다.
 * 여유가 없으면 방금 이동한 절이 아니라 그 앞 절이 선택됩니다.
 */
const ACTIVE_LINE_TOLERANCE_PX = 8;

/** 문서 끝을 판정하는 여유입니다. 소수점 오차와 브라우저별 반올림을 흡수합니다. */
const BOTTOM_TOLERANCE_PX = 2;

/**
 * 현재 읽고 있는 절의 식별자를 추적합니다.
 *
 * 헤딩의 위치를 기준선과 비교해 **기준선을 지난 것 중 가장 아래**를 고릅니다.
 * `IntersectionObserver` 로 헤딩만 관찰하는 방식은 두 가지 경우에 실패합니다.
 * 절 사이의 내용이 화면보다 길면 어떤 헤딩도 교차하지 않아 표시가 사라지고,
 * 마지막 절은 화면 상단까지 올라올 수 없어 영영 활성화되지 않습니다.
 *
 * 문서 끝에 닿으면 마지막 절을 선택합니다. 스크롤이 더 내려갈 수 없는 구간에서는
 * 위치 비교만으로 마지막 절에 도달할 수 없기 때문입니다.
 *
 * DOM 과 `window` 접근이므로 관찰 시작을 `afterNextRender` 안으로 제한합니다.
 * 근거는 docs/references/렌더링-전략.md 2절에 있습니다.
 */
export function injectActiveHeading(headings: Signal<readonly DocHeading[]>): Signal<string | null> {
  const document = inject(DOCUMENT);
  const destroyRef = inject(DestroyRef);
  const fragment = toSignal(inject(ActivatedRoute).fragment, { initialValue: null });

  const active = signal<string | null>(null);
  const ready = signal(false);

  let frameId = 0;

  const measureActiveLine = (view: Window): number => {
    const rootFontSize = Number.parseFloat(view.getComputedStyle(document.documentElement).fontSize);
    return (Number.isFinite(rootFontSize) ? rootFontSize : 16) * ACTIVE_LINE_REM;
  };

  const update = (): void => {
    const view = document.defaultView;
    const list = headings();

    if (!view || list.length === 0) {
      active.set(null);
      return;
    }

    const reachedBottom =
      view.innerHeight + view.scrollY >=
      document.documentElement.scrollHeight - BOTTOM_TOLERANCE_PX;

    if (reachedBottom) {
      active.set(list[list.length - 1].id);
      return;
    }

    const line = measureActiveLine(view) + ACTIVE_LINE_TOLERANCE_PX;
    let current = list[0].id;

    for (const heading of list) {
      const element = document.getElementById(heading.id);
      if (!element) continue;
      if (element.getBoundingClientRect().top > line) break;
      current = heading.id;
    }

    active.set(current);
  };

  /** 스크롤마다 위치를 재면 비용이 커지므로 프레임당 한 번으로 묶습니다. */
  const schedule = (): void => {
    const view = document.defaultView;
    if (!view || frameId !== 0) return;
    frameId = view.requestAnimationFrame(() => {
      frameId = 0;
      update();
    });
  };

  afterNextRender(() => {
    const view = document.defaultView;
    if (!view) return;

    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule, { passive: true });

    destroyRef.onDestroy(() => {
      view.removeEventListener('scroll', schedule);
      view.removeEventListener('resize', schedule);
      if (frameId !== 0) view.cancelAnimationFrame(frameId);
    });

    ready.set(true);
  });

  // 다른 문서로 이동하면 본문이 교체되므로 다시 계산합니다.
  // effect 는 이 함수의 주입 컨텍스트에서 호출해야 하며, afterNextRender 콜백 안은 그 컨텍스트가 아닙니다.
  effect(() => {
    headings();
    if (ready()) schedule();
  });

  // 목차를 눌렀거나 프래그먼트가 붙은 주소로 들어온 경우입니다.
  // 위치 계산을 기다리지 않고 즉시 표시해, 이동 대상과 표시가 어긋나는 순간을 없앱니다.
  effect(() => {
    const target = fragment();
    if (target) active.set(target);
  });

  return active.asReadonly();
}
