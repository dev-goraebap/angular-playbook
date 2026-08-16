import { DOCUMENT, ViewportScroller } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** 앵커 이동 시 확보할 상단 여백입니다. 본문 헤딩의 `scroll-margin-top` 과 같은 값입니다. */
const ANCHOR_OFFSET_REM = 5;

/*
 * 베일을 여기에 두지 않습니다. 이 자리는 화면 전체이므로 헤더와 사이드바까지 덮게 되고,
 * 대기 중에도 이동할 수 있어야 한다는 규칙이 깨집니다(loading.md 7.1절).
 * 콘텐츠 영역이 어디까지인지 아는 것은 셸과 프레임이므로 그쪽이 자리를 정합니다.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  private readonly document = inject(DOCUMENT);

  constructor() {
    /*
     * 라우터의 앵커 이동은 `scroll-margin-top` 을 따르지 않습니다.
     * `ViewportScroller` 가 `scrollIntoView()` 대신 좌표를 계산해 `scrollTo()` 를 호출하므로,
     * CSS 만 지정하면 sticky 헤더가 절 제목을 가립니다. 오프셋을 라우터에 별도로 알립니다.
     *
     * 함수로 넘기는 이유는 기준 배율이 뷰포트 폭에 따라 달라지기 때문입니다(accessibility.md 5절).
     * 값을 고정하면 넓은 화면에서 여백이 모자랍니다.
     */
    inject(ViewportScroller).setOffset(() => [0, this.anchorOffset()]);
  }

  private anchorOffset(): number {
    const view = this.document.defaultView;
    if (!view) return 0;

    const rootFontSize = Number.parseFloat(
      view.getComputedStyle(this.document.documentElement).fontSize,
    );
    return (Number.isFinite(rootFontSize) ? rootFontSize : 16) * ANCHOR_OFFSET_REM;
  }
}
