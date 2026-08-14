import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';

/**
 * 모든 화면의 하단입니다. 셸이 소유하므로 화면마다 따로 두지 않습니다.
 *
 * 연도를 런타임에 계산하지 않고 고정합니다. 정적 생성 시점의 연도가 HTML 에 박히는데
 * 하이드레이션 때 다시 계산하면 해가 바뀌는 순간 두 값이 어긋납니다.
 * 저작 연도는 사이트를 만든 해를 가리키므로 매년 갱신할 이유도 없습니다.
 */
@Component({
  selector: 'app-site-footer',
  imports: [NgIcon],
  providers: [provideIcons({ lucideGithub })],
  template: `
    <footer class="mt-auto border-t border-border py-8 text-sm text-muted-foreground [view-transition-name:site-footer]">
      <div class="mx-auto flex max-w-264 items-center justify-between px-4">
        <span>&copy; {{ year }} dev.goraebap</span>

        <a
          href="https://github.com/dev-goraebap"
          target="_blank"
          rel="noopener noreferrer"
          class="transition-colors hover:text-primary"
          aria-label="GitHub"
        >
          <ng-icon name="lucideGithub" size="20" />
        </a>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly year = 2026;
}
