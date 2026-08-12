import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideSpartanHlm } from '@/shared/ui/utils';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // 리졸버 결과와 경로 파라미터를 컴포넌트 입력으로 받습니다. 로딩-전략.md §5.2
      withComponentInputBinding(),
      // 문서 스크롤을 대상으로 하며 topbar 골격에서 동작합니다. 레이아웃.md §4.3
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideClientHydration(withEventReplay()),
    // CDK 오버레이가 Angular 21 의 popover 동작을 쓰면 fixed 요소 위로 올라가 쌓임 순서가 어긋납니다.
    provideSpartanHlm(),
  ],
};
