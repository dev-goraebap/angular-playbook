import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  type ElementRef,
  type Signal,
} from '@angular/core';

type MermaidApi = typeof import('mermaid').default;

/**
 * 하이라이터와 달리 다이어그램은 화면에서 그립니다.
 * 빌드 시점에 SVG 로 굽는 방식은 puppeteer 를 상시 의존성으로 요구하고 생성물 커밋을 낳습니다.
 * 기각한 대안과 감수하는 대가는 docs/decisions/0015-ADR-문서-타이포그래피-프리셋.md 가 원본입니다.
 */
let mermaidPromise: Promise<MermaidApi> | null = null;

/**
 * mermaid 를 한 번만 내려받습니다.
 * 다이어그램이 없는 문서에서는 이 함수가 호출되지 않으므로 해당 청크를 받지 않습니다.
 */
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise;
}

/** 렌더마다 유일한 식별자가 필요합니다. mermaid 가 임시 요소를 만들 때 사용합니다. */
let renderSequence = 0;

/**
 * 문서 본문의 Mermaid 블록을 SVG 로 그립니다.
 *
 * 문서를 바꾸거나 테마를 바꾸면 다시 그립니다. 테마는 색만 바뀌는 것이 아니라
 * mermaid 가 SVG 안에 색을 구워 넣으므로 CSS 로 전환할 수 없습니다.
 *
 * 그리는 시점이 첫 표시 이후이므로 본문 높이가 늘어납니다. 이동을 감추지 않고
 * 늘어나는 과정을 전환으로 보여주는 선택이며 근거는 CSS 파일 주석에 있습니다.
 *
 * DOM 과 동적 임포트이므로 시작을 `afterNextRender` 안으로 제한합니다.
 * 근거는 docs/references/렌더링-전략.md 2절에 있습니다.
 */
export function injectMermaidDiagrams(
  host: Signal<ElementRef<HTMLElement> | undefined>,
  revision: Signal<unknown>,
): void {
  const document = inject(DOCUMENT);
  const destroyRef = inject(DestroyRef);

  let ready = false;
  let disposed = false;
  let frameId = 0;

  /**
   * 적용된 모드를 읽습니다.
   * 토큰이 `light-dark()` 이므로 판단의 원본은 루트의 `color-scheme` 입니다.
   * 사용자가 아직 고르지 않았으면 계산값이 `light dark` 로 남으므로 시스템 설정을 봅니다.
   */
  const readMode = (): 'light' | 'dark' => {
    const view = document.defaultView;
    if (!view) return 'light';

    const scheme = view.getComputedStyle(document.documentElement).colorScheme;
    if (scheme === 'dark') return 'dark';
    if (scheme === 'light') return 'light';

    return view.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  /** 다이어그램의 글꼴을 본문과 맞춥니다. mermaid 는 SVG 안에 글꼴을 지정합니다. */
  const readFontFamily = (): string => {
    const view = document.defaultView;
    const body = document.body;
    return view && body ? view.getComputedStyle(body).fontFamily : 'sans-serif';
  };

  const render = async (): Promise<void> => {
    const container = host()?.nativeElement;
    if (!container) return;

    const targets = [...container.querySelectorAll<HTMLElement>('[data-mermaid]')];
    if (targets.length === 0) return;

    const mermaid = await loadMermaid();
    if (disposed) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: readMode() === 'dark' ? 'dark' : 'default',
      fontFamily: readFontFamily(),
      // 문법 오류가 나도 mermaid 가 화면에 오류 도형을 심지 않게 합니다. 처리는 아래 catch 가 맡습니다.
      suppressErrorRendering: true,
    });

    for (const target of targets) {
      const source = target.querySelector('.mermaid-source')?.textContent ?? '';
      const canvas = target.querySelector<HTMLElement>('.mermaid-canvas');
      if (!canvas || source.trim() === '') continue;

      try {
        const { svg } = await mermaid.render(`mermaid-${(renderSequence += 1)}`, source);
        if (disposed) return;

        canvas.innerHTML = svg;
        target.dataset['rendered'] = 'true';
      } catch {
        // 그리지 못한 다이어그램은 원본을 보여줍니다. 내용이 사라지는 것보다 낫습니다.
        target.dataset['rendered'] = 'failed';
      }
    }
  };

  /**
   * 테마 전환은 루트 클래스를 두 번 건드리므로 관찰자가 두 번 깨어납니다.
   * 프레임당 한 번으로 묶어 같은 다이어그램을 두 번 그리지 않게 합니다.
   */
  const schedule = (): void => {
    const view = document.defaultView;
    if (!ready || disposed || !view || frameId !== 0) return;

    frameId = view.requestAnimationFrame(() => {
      frameId = 0;
      void render();
    });
  };

  afterNextRender(() => {
    const view = document.defaultView;
    if (!view) return;

    ready = true;

    // 테마 전환은 app 계층이 루트 클래스로 수행하므로 속성 변화로 관찰합니다.
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    // 사용자가 고르지 않은 상태에서는 시스템 설정 변경이 그대로 반영됩니다.
    const systemMode = view.matchMedia('(prefers-color-scheme: dark)');
    systemMode.addEventListener('change', schedule);

    destroyRef.onDestroy(() => {
      disposed = true;
      themeObserver.disconnect();
      systemMode.removeEventListener('change', schedule);
      if (frameId !== 0) view.cancelAnimationFrame(frameId);
    });

    schedule();
  });

  // 다른 문서로 이동하면 본문이 교체되므로 다시 그립니다.
  // effect 는 이 함수의 주입 컨텍스트에서 호출해야 하며, afterNextRender 콜백 안은 그 컨텍스트가 아닙니다.
  effect(() => {
    revision();
    schedule();
  });
}
