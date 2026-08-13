import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmCard, HlmCardDescription, HlmCardHeader, HlmCardTitle } from '@/shared/ui/card';
import {
  DOC_DOMAINS,
  DOC_SUMMARIES,
  type DocDomain,
  type DocSummary,
} from '@/shared/markdown';
import { ROUTES } from '@/shared/config';

interface DomainGroup {
  readonly domain: DocDomain;
  readonly title: string;
  readonly stacks: readonly DocSummary[];
}

/**
 * 임시 홈입니다. 이 자리는 블로그가 차지할 예정이며 지금은 스택 목록을 보여줍니다.
 */
@Component({
  selector: 'app-docs-home',
  imports: [RouterLink, HlmCard, HlmCardHeader, HlmCardTitle, HlmCardDescription],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-16">
      <section class="border-b border-border pb-10">
        <h1 class="text-4xl font-semibold tracking-tight">아키텍처 표준</h1>
        <p class="mt-4 text-lg text-foreground-secondary">
          코드를 어디에 두고 무엇을 참조할지, 데이터를 언제 받고 대기 중에 무엇을 보여줄지를 규칙으로
          고정한 표준입니다. 각 규칙은 근거와 감수한 대가를 함께 기록합니다.
        </p>
      </section>

      @for (group of domains(); track group.domain) {
        <section class="py-10">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {{ group.title }}
          </h2>
          <ul class="mt-4 grid gap-3 sm:grid-cols-2">
            @for (stack of group.stacks; track stack.slug) {
              <li class="h-full">
                <a
                  hlmCard
                  [routerLink]="routes.doc(stack.slug)"
                  class="block h-full transition-colors hover:bg-accent"
                >
                  <div hlmCardHeader>
                    <h3 hlmCardTitle>{{ stack.title }}</h3>
                    <p hlmCardDescription>{{ stack.description }}</p>
                  </div>
                </a>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class DocsHome {
  protected readonly routes = ROUTES;

  protected readonly domains = computed<readonly DomainGroup[]>(() =>
    (Object.keys(DOC_DOMAINS) as DocDomain[])
      .map((domain) => ({
        domain,
        title: DOC_DOMAINS[domain],
        stacks: DOC_SUMMARIES.filter((doc) => doc.kind === 'stack' && doc.domain === domain),
      }))
      .filter((group) => group.stacks.length > 0),
  );
}
