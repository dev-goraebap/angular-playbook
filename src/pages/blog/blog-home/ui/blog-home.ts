import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DOC_SUMMARIES, type DocSummary } from '@/shared/markdown';
import { PostCard } from './post-card';

interface TagChip {
  readonly tag: string;
  readonly count: number;
  readonly selected: boolean;
}

/** 선택한 주제를 담는 쿼리 파라미터입니다. 값은 쉼표로 잇습니다. */
const TAGS_PARAM = 'tags';

/**
 * 글 목록입니다. 사이트의 첫 화면이며 사이드바를 두지 않습니다.
 *
 * 주제 선택을 URL 이 소유합니다. 컴포넌트 상태로 두면 새로고침과 뒤로가기, 링크 공유가
 * 각각 별도 구현을 요구합니다. 근거는 아키텍처 4절의 상태 소유권 규칙입니다.
 *
 * 주제 화면을 따로 두지 않는 이유는 목록이 하나이기 때문입니다. 화면을 나누면 같은
 * 목록 렌더링이 두 벌이 되고, 여러 주제를 겹쳐 고르는 것도 표현할 수 없습니다.
 */
@Component({
  selector: 'app-blog-home',
  imports: [PostCard],
  template: `
    <div
      id="main"
      class="mx-auto max-w-264 px-4 py-12 md:grid md:grid-cols-[minmax(0,40rem)_17.5rem] md:gap-16"
    >
      <div>
        <section class="mb-8">
          <h1 class="text-3xl leading-normal font-normal tracking-tight">읽어볼 만한 글</h1>
          <p class="mt-1 text-sm text-foreground-secondary">
            @if (selected().length === 0) {
              고민의 흔적들을 기록합니다.
            } @else {
              {{ selected().join(', ') }} 주제의 글 {{ posts().length }}편입니다.
            }
          </p>
        </section>

        @if (posts().length === 0) {
          <div class="py-20 text-center">
            <p class="mb-2 text-2xl font-normal">고른 주제에 맞는 글이 없습니다</p>
            <button
              type="button"
              class="text-sm text-primary transition-colors hover:underline"
              (click)="clear()"
            >
              주제 선택 지우기
            </button>
          </div>
        } @else {
          <section class="flex flex-col gap-4">
            @for (post of posts(); track post.slug) {
              <app-post-card [post]="post" />
            }
          </section>
        }
      </div>

      <aside class="mt-12 md:mt-0" aria-label="주제">
        <div class="md:sticky md:top-20">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-normal">Topics</h2>

            @if (selected().length > 0) {
              <button
                type="button"
                class="text-xs text-muted-foreground transition-colors hover:text-foreground"
                (click)="clear()"
              >
                지우기
              </button>
            }
          </div>

          <div class="flex flex-wrap gap-2">
            @for (chip of chips(); track chip.tag) {
              <!-- 누를 때마다 켜지고 꺼집니다. 여럿을 함께 고르면 모두 가진 글만 남습니다. -->
              <button
                type="button"
                [attr.aria-pressed]="chip.selected"
                [class]="chipClass(chip)"
                (click)="toggle(chip.tag)"
              >
                #{{ chip.tag }}
                <span class="ml-1.5 text-xs opacity-70">{{ chip.count }}</span>
              </button>
            }
          </div>
        </div>
      </aside>
    </div>
  `,
})
export class BlogHome {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = toSignal(this.route.queryParamMap);

  /** 주소에 담긴 주제입니다. 빈 값과 중복은 걸러 냅니다. */
  protected readonly selected = computed<readonly string[]>(() => {
    const raw = this.query()?.get(TAGS_PARAM) ?? '';
    return [...new Set(raw.split(',').filter(Boolean))];
  });

  private readonly allPosts = computed<readonly DocSummary[]>(() =>
    [...DOC_SUMMARIES.filter((doc) => doc.kind === 'post')].sort((a, b) =>
      (b.date ?? '').localeCompare(a.date ?? ''),
    ),
  );

  /** 고른 주제를 **모두** 가진 글만 남깁니다. 주제를 더할수록 목록이 좁아집니다. */
  protected readonly posts = computed<readonly DocSummary[]>(() => {
    const tags = this.selected();
    if (tags.length === 0) return this.allPosts();

    return this.allPosts().filter((post) => tags.every((tag) => post.tags?.includes(tag)));
  });

  /** 주제 목록은 전체 글을 기준으로 셉니다. 선택에 따라 개수가 흔들리면 고를 대상이 사라집니다. */
  protected readonly chips = computed<readonly TagChip[]>(() => {
    const counts = new Map<string, number>();

    for (const post of this.allPosts()) {
      for (const tag of post.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const selected = this.selected();

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count, selected: selected.includes(tag) }))
      .sort((a, b) => b.count - a.count);
  });

  protected chipClass(chip: TagChip): string {
    const base =
      'inline-flex h-8 items-center rounded-lg border px-3 text-sm transition-colors cursor-pointer';

    return chip.selected
      ? `${base} border-primary bg-primary text-primary-foreground`
      : `${base} border-border text-foreground-secondary hover:border-primary hover:text-primary`;
  }

  protected toggle(tag: string): void {
    const next = this.selected().includes(tag)
      ? this.selected().filter((entry) => entry !== tag)
      : [...this.selected(), tag];

    this.navigate(next);
  }

  protected clear(): void {
    this.navigate([]);
  }

  /**
   * 주소만 바꾸고 화면은 그대로 둡니다.
   * 선택이 없으면 파라미터 자체를 지워 `?tags=` 가 주소에 남지 않게 합니다.
   */
  private navigate(tags: readonly string[]): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [TAGS_PARAM]: tags.length > 0 ? tags.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }
}
