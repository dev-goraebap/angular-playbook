import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideSpartanHlm } from '@/shared/ui/utils';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // 리졸버 결과와 경로 파라미터를 컴포넌트 입력으로 받습니다. 로딩-전략.md 5.2절
      withComponentInputBinding(),
      // 문서 스크롤을 대상으로 하며 topbar 골격에서 동작합니다. 레이아웃.md 4.3절
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      /*
       * 화면 전환을 브라우저의 View Transitions 로 잇습니다. 규격은 로딩-전략.md 3.4절입니다.
       *
       * 첫 전환은 건너뜁니다. 진입 시점의 화면은 정적 생성된 완성본이라 바뀌는 것이 없고,
       * 그때 애니메이션을 걸면 이미 그려진 내용이 한 번 깜빡입니다.
       *
       * 미지원 브라우저에서는 라우터가 전환을 시도하지 않고 그대로 넘어갑니다.
       */
      withViewTransitions({ skipInitialTransition: true }),
    ),
    provideClientHydration(withEventReplay()),
    // CDK 오버레이가 Angular 21 의 popover 동작을 쓰면 fixed 요소 위로 올라가 쌓임 순서가 어긋납니다.
    provideSpartanHlm(),
  ],
};
