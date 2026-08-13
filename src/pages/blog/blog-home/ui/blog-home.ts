import { Component, computed } from '@angular/core';
import { DOC_SUMMARIES, type DocSummary } from '@/shared/markdown';
import { PostCard } from './post-card';

interface TagCount {
  readonly tag: string;
  readonly count: number;
}

/**
 * 글 목록입니다. 사이트의 첫 화면이며 사이드바를 두지 않습니다.
 *
 * 본문 열은 640px 로 제한하고 오른쪽에 주제 목록을 둡니다. 좁은 화면에서는
 * 주제가 사라지고 글만 남습니다. 판정이 아니라 CSS 로 처리하므로 런타임 분기가 없습니다.
 */
@Component({
  selector: 'app-blog-home',
  imports: [PostCard],
  template: `
    <div
      id="main"
      class="mx-auto max-w-[66rem] px-4 py-12 md:grid md:grid-cols-[minmax(0,40rem)_17.5rem] md:gap-16"
    >
      <div>
        <section class="mb-8">
          <h1 class="text-3xl leading-normal font-normal tracking-tight">읽어볼 만한 글</h1>
          <p class="mt-1 text-sm text-foreground-secondary">고민의 흔적들을 기록합니다.</p>
        </section>

        @if (posts().length === 0) {
          <div class="py-20 text-center">
            <p class="mb-2 text-2xl font-normal">아직 글이 없습니다</p>
            <p class="text-sm text-muted-foreground">
              곧 공을 들인 첫 번째 글로 돌아오겠습니다.
            </p>
          </div>
        } @else {
          <section class="flex flex-col gap-4">
            @for (post of posts(); track post.slug) {
              <app-post-card [post]="post" />
            }
          </section>
        }
      </div>

      <aside class="hidden md:block" aria-label="주제">
        <div class="sticky top-20">
          <h2 class="mb-4 text-lg font-normal">Topics</h2>
          <div class="flex flex-wrap gap-2">
            @for (entry of tags(); track entry.tag) {
              <span
                class="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm text-foreground-secondary"
              >
                #{{ entry.tag }}
                <span class="ml-1.5 text-xs text-muted-foreground">{{ entry.count }}</span>
              </span>
            }
          </div>
        </div>
      </aside>
    </div>
  `,
})
export class BlogHome {
  /** 최신 글이 위에 옵니다. 목록의 기준은 발행일이며 프론트매터의 order 가 아닙니다. */
  protected readonly posts = computed<readonly DocSummary[]>(() =>
    [...DOC_SUMMARIES.filter((doc) => doc.kind === 'post')].sort((a, b) =>
      (b.date ?? '').localeCompare(a.date ?? ''),
    ),
  );

  /** 많이 쓰인 주제가 앞에 옵니다. 아직 목록을 거르는 수단은 아니며 표시만 합니다. */
  protected readonly tags = computed<readonly TagCount[]>(() => {
    const counts = new Map<string, number>();

    for (const post of this.posts()) {
      for (const tag of post.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  });
}
