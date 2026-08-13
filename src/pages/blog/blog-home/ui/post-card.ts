import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ROUTES } from '@/shared/config';
import type { DocSummary } from '@/shared/markdown';

/**
 * 글 목록의 카드입니다.
 *
 * 표지 · 제목 · 설명 · 태그를 담고 경계선으로 구분합니다. 표면을 밝기로 쌓지 않는
 * 방식은 디자인 전반의 규칙이며 근거는 ADR-0016 에 있습니다.
 *
 * 표지에 `width` 와 `height` 가 실려 있어 이미지가 도착하기 전에도 자리가 잡힙니다.
 */
@Component({
  selector: 'app-post-card',
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="routes.doc(post().slug)"
      class="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background p-2 transition-colors hover:bg-accent"
    >
      <div
        class="relative aspect-[2/1] w-full overflow-hidden rounded-xl"
        [style.background]="post().coverColor ?? 'var(--muted)'"
      >
        @if (post().cover; as cover) {
          <img
            [src]="cover.src"
            [attr.srcset]="cover.srcset"
            sizes="(max-width: 768px) 100vw, 640px"
            [attr.width]="cover.width"
            [attr.height]="cover.height"
            [alt]="post().title"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        }

        <time
          [dateTime]="post().date"
          class="absolute top-2 right-2 flex h-7 items-center rounded-lg bg-background/80 px-3 text-sm backdrop-blur-md"
        >
          {{ elapsed() }}
        </time>
      </div>

      <div class="px-4 pt-4 pb-3">
        <h2 class="line-clamp-2 text-2xl leading-snug font-normal tracking-tight">
          {{ post().title }}
        </h2>

        <p class="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground-secondary">
          {{ post().description }}
        </p>

        @if (post().tags?.length) {
          <div class="mt-3 flex flex-wrap gap-2">
            @for (tag of post().tags; track tag) {
              <span class="text-xs text-muted-foreground">#{{ tag }}</span>
            }
          </div>
        }
      </div>
    </a>
  `,
})
export class PostCard {
  readonly post = input.required<DocSummary>();

  protected readonly routes = ROUTES;

  /**
   * 발행 시점을 상대 표현으로 바꿉니다.
   * 서버와 브라우저의 현재 시각이 달라도 결과가 날짜 단위라 하이드레이션이 어긋나지 않습니다.
   */
  protected readonly elapsed = computed(() => {
    const days = Math.floor((Date.now() - Date.parse(this.post().date ?? '')) / 86_400_000);

    if (days < 1) return '오늘';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${Math.floor(days / 365)}년 전`;
  });
}
