import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PostCard } from '@/entities/post';
import { DOC_SUMMARIES, type DocSummary } from '@/shared/markdown';
import { ROUTES } from '@/shared/config';

/**
 * 주제 하나에 묶인 글 목록입니다.
 *
 * 태그는 문서 메타데이터에 이미 있으므로 별도 조회 없이 걸러 냅니다.
 * 없는 태그로 들어와도 오류가 아니라 빈 목록을 보여줍니다. 태그는 자유 문자열이라
 * 유효한 값의 집합이 고정되어 있지 않고, 글에서 태그를 빼면 그 주소가 자연히 비기 때문입니다.
 */
@Component({
  selector: 'app-tag-posts',
  imports: [RouterLink, PostCard],
  template: `
    <div id="main" class="mx-auto max-w-[42.5rem] px-4 py-12">
      <section class="mb-8">
        <a
          [routerLink]="routes.home()"
          class="text-sm text-foreground-secondary transition-colors hover:text-foreground"
        >
          ← 전체 글
        </a>
        <h1 class="mt-3 text-3xl leading-normal font-normal tracking-tight">#{{ tag() }}</h1>
        <p class="mt-1 text-sm text-foreground-secondary">
          {{ posts().length }}편의 글이 이 주제를 다룹니다.
        </p>
      </section>

      @if (posts().length === 0) {
        <div class="py-20 text-center">
          <p class="mb-2 text-2xl font-normal">이 주제의 글이 없습니다</p>
          <p class="text-sm text-muted-foreground">주소를 확인하거나 전체 글에서 찾아보세요.</p>
        </div>
      } @else {
        <section class="flex flex-col gap-4">
          @for (post of posts(); track post.slug) {
            <app-post-card [post]="post" />
          }
        </section>
      }
    </div>
  `,
})
export class TagPosts {
  protected readonly routes = ROUTES;

  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  protected readonly tag = computed(() => this.params()?.get('tag') ?? '');

  protected readonly posts = computed<readonly DocSummary[]>(() =>
    [...DOC_SUMMARIES.filter((doc) => doc.kind === 'post' && doc.tags?.includes(this.tag()))].sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? ''),
    ),
  );
}
