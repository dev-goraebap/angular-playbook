import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@/shared/ui/button';
import { ROUTES } from '@/shared/config';

/**
 * 전체 화면 에러입니다. 앱셸이나 문서 네비게이션을 유지하지 않는 근거는
 * docs/architectures/decoupled/application/angular/decisions/0010-ADR-에러화면-전체화면-통일.md 에 있습니다.
 * 복구 액션을 화면 안에 두는 것이 그 결정의 전제입니다.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, HlmButton],
  template: `
    <main
      class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground"
    >
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl font-semibold tracking-tight">요청하신 문서를 찾을 수 없습니다</h1>
        <p class="text-muted-foreground">
          주소가 바뀌었거나 삭제된 문서일 수 있습니다. 문서 목록에서 다시 찾아보십시오.
        </p>
      </div>

      <a hlmBtn [routerLink]="routes.home()">문서 목록으로</a>
    </main>
  `,
})
export class NotFound {
  protected readonly routes = ROUTES;
}
