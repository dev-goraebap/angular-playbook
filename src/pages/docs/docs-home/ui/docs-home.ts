import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOC_SECTIONS, DOC_SUMMARIES, type DocSection, type DocSummary } from '@/shared/markdown';
import { ROUTES } from '@/shared/config';

interface DocGroup {
  readonly section: DocSection;
  readonly title: string;
  readonly documents: readonly DocSummary[];
}

@Component({
  selector: 'app-docs-home',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-4xl">
      <section class="border-b border-border pb-10">
        <h1 class="text-4xl font-semibold tracking-tight">Angular 프론트엔드 아키텍처 표준</h1>
        <p class="mt-4 text-lg text-muted-foreground">
          코드를 어디에 두고 무엇을 참조할지, 데이터를 언제 받고 대기 중에 무엇을 보여줄지를
          규칙으로 고정한 표준입니다. 각 규칙은 근거와 감수한 대가를 함께 기록합니다.
        </p>
      </section>

      @for (group of groups(); track group.section) {
        <section class="py-10">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {{ group.title }}
          </h2>
          <ul class="mt-4 grid gap-3 sm:grid-cols-2">
            @for (doc of group.documents; track doc.slug) {
              <li>
                <a
                  [routerLink]="routes.docsArticle(doc.slug)"
                  class="block h-full rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span class="font-medium">{{ doc.title }}</span>
                  <span class="mt-1 block text-sm text-muted-foreground">
                    {{ doc.description }}
                  </span>
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

  protected readonly groups = computed<readonly DocGroup[]>(() =>
    (Object.keys(DOC_SECTIONS) as DocSection[])
      .map((section) => ({
        section,
        title: DOC_SECTIONS[section],
        documents: DOC_SUMMARIES.filter((doc) => doc.section === section),
      }))
      .filter((group) => group.documents.length > 0),
  );
}
