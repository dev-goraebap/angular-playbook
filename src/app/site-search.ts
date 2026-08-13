import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  resource,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import {
  loadSearchEntries,
  searchDocs,
  splitByMatches,
  type DocArea,
  type SearchHit,
  type TextSegment,
} from '@/shared/markdown';
import { HlmButton } from '@/shared/ui/button';
import { HlmCommandImports } from '@/shared/ui/command';

/**
 * 결과 묶음의 순서입니다. 상단 메뉴와 같은 차례라 목록에서 위치를 예측할 수 있습니다.
 * 소개는 빠져 있습니다. 색인 자체에 담지 않으므로 여기에 두어도 결과가 나오지 않습니다.
 */
const AREA_ORDER: readonly DocArea[] = ['posts', 'architectures'];

const AREA_LABELS: Record<DocArea, string> = {
  posts: '글',
  architectures: '아키텍처',
  about: '소개',
};

/**
 * 입력이 멎기를 기다리는 시간입니다.
 *
 * 검색 자체는 문서 43 개를 훑는 것이라 빠르지만, 글자마다 결과를 갈아 끼우면 목록이 통째로
 * 다시 그려지고 높이도 함께 움직입니다. 한글 입력기는 낱자마다 값을 내보내므로
 * `라우팅` 한 낱말에 여섯 번 넘게 발생합니다.
 */
const TYPING_DELAY = 150;

/** 목록에 그릴 결과 한 줄입니다. 질의와 겹치는 구간을 미리 갈라 둡니다. */
interface ResultRow {
  readonly hit: SearchHit;
  readonly title: readonly TextSegment[];
  readonly section: readonly TextSegment[] | null;
  readonly description: readonly TextSegment[];
}

/** 화면에 묶어서 내보내는 결과입니다. */
interface ResultGroup {
  readonly area: DocArea;
  readonly label: string;
  readonly rows: readonly ResultRow[];
}

/**
 * 글과 문서를 한 자리에서 찾습니다. 진입점을 영역마다 두지 않는 이유는 상단 바를 셸이
 * 소유하기 때문입니다. 영역별 검색을 두려면 소유를 프레임으로 내려야 하고 그러면 인덱스도
 * 두 벌이 됩니다. 결과는 대신 영역별로 묶어 어느 쪽에서 나온 것인지 구분합니다.
 *
 * 여는 상태를 밖에서 받습니다. 트리거가 상단 바와 하단 네비 두 곳에 있으므로 이 컴포넌트가
 * 상태를 소유하면 트리거들이 여기를 참조해야 하고, 그러면 지연 로드가 무의미해집니다.
 *
 * 열기 단축키는 셸이 듣습니다. 이 컴포넌트는 열릴 때 로드되므로 자신을 여는 열쇠를 가질 수 없습니다.
 */
@Component({
  selector: 'app-site-search',
  imports: [HlmCommandImports, HlmButton, NgIcon],
  providers: [provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      좁은 화면에서는 화면 전체를 씁니다. DOM 이 같고 크기와 모서리만 달라지므로 반응형이며,
      런타임 판정을 쓰지 않습니다. 근거는 적응형-UI.md 1절입니다.
    -->
    <hlm-command-dialog
      title="검색"
      description="글과 문서를 제목과 절 제목, 인라인 코드로 찾습니다"
      [state]="open() ? 'open' : 'closed'"
      (stateChange)="onStateChange($event)"
      dialogContentClass="max-w-none! p-0 md:w-[min(36rem,calc(100vw-2rem))] max-md:flex max-md:h-dvh max-md:w-screen max-md:flex-col max-md:rounded-none"
    >
      <!--
        걸러내기를 직접 하므로 brain 의 기본 필터를 끕니다. 항목은 이미 점수순으로 추려져
        들어오며, 여기서 한 번 더 걸러내면 순위가 뒤집히고 절 제목 일치가 사라집니다.
      -->
      <hlm-command [filter]="acceptAll" [search]="draft()" (searchChange)="draft.set($event)">
        <!--
          좁은 화면에는 백드롭이 남지 않고 물리 키도 없습니다. 닫기 버튼이 없으면 뒤로가기
          말고는 빠져나갈 길이 없어집니다. 넓은 화면은 백드롭과 Esc 가 있으므로 숨깁니다.
        -->
        <div class="flex items-center gap-1">
          <hlm-command-input class="flex-1" placeholder="글과 문서 검색" />

          <button
            hlmBtn
            variant="ghost"
            size="icon-sm"
            class="mr-1 shrink-0 md:hidden"
            aria-label="검색 닫기"
            (click)="closed.emit()"
          >
            <ng-icon name="lucideX" />
          </button>
        </div>

        <!--
          바닥과 천장 사이에서만 높이가 움직입니다. 바닥이 없으면 결과 1 건일 때 팔레트가
          입력창 높이로 줄었다가 다음 글자에 다시 커져 입력 중에 상자가 계속 뜁니다.

          높이를 직접 지정하는 이유는 CSS 로 전환을 걸 수 없기 때문입니다. 내용이 바뀌어도
          height 의 계산값은 auto 로 같으므로 전환이 발화하지 않습니다.
          좁은 화면에서는 화면을 채우므로 이 지정을 스타일 규칙이 되돌립니다.
        -->
        <hlm-command-list
          class="search-list min-h-72 max-h-[60dvh] transition-[height] duration-150 ease-out motion-reduce:transition-none"
          [style.height.px]="contentHeight() || null"
        >
          <div #content>
            @if (index.isLoading()) {
              <p class="px-2 py-6 text-center text-sm text-muted-foreground">
                색인을 불러오는 중입니다.
              </p>
            } @else if (groups().length === 0) {
              <div class="flex flex-col items-center gap-4 px-6 py-8 text-center">
                <!-- 단색 선화를 마스크로 얹고 색을 토큰에서 가져갑니다. 모드 전환이 자동입니다. -->
                <span aria-hidden="true" class="empty-art h-40 w-40 bg-muted-foreground"></span>
                <p class="text-sm text-muted-foreground">
                  {{
                    typedQuery().length === 0
                      ? '제목과 절 제목, 인라인 코드로 찾습니다.'
                      : '일치하는 글과 문서가 없습니다.'
                  }}
                </p>
              </div>
            }

            @for (group of groups(); track group.area) {
              <hlm-command-group>
                <span hlmCommandGroupLabel>{{ group.label }}</span>

                @for (row of group.rows; track row.hit.slug) {
                  <!--
                    text-left 를 붙이는 이유는 Tailwind 의 preflight 가 button 의 text-align 을
                    되돌리지 않기 때문입니다. 기본값 center 가 상속되어 폭이 꽉 찬 설명 줄만
                    가운데로 갑니다. 제목은 폭이 내용만큼이라 증상이 드러나지 않습니다.
                  -->
                  <button
                    hlmCommandItem
                    [value]="row.hit.slug"
                    (selected)="selected.emit(row.hit)"
                    class="flex-col items-start gap-0.5 text-left"
                  >
                    <span class="flex w-full min-w-0 items-baseline gap-2">
                      <span class="truncate font-medium">
                        @for (part of row.title; track $index) {
                          @if (part.match) {
                            <mark class="rounded-xs bg-mark text-mark-foreground">{{
                              part.text
                            }}</mark>
                          } @else {
                            {{ part.text }}
                          }
                        }
                      </span>

                      @if (row.section) {
                        <span class="truncate text-xs text-muted-foreground">
                          @for (part of row.section; track $index) {
                            @if (part.match) {
                              <mark class="rounded-xs bg-mark text-mark-foreground">{{
                                part.text
                              }}</mark>
                            } @else {
                              {{ part.text }}
                            }
                          }
                        </span>
                      }
                    </span>

                    <span class="w-full truncate text-xs text-muted-foreground">
                      @for (part of row.description; track $index) {
                        @if (part.match) {
                          <mark class="rounded-xs bg-mark text-mark-foreground">{{
                            part.text
                          }}</mark>
                        } @else {
                          {{ part.text }}
                        }
                      }
                    </span>
                  </button>
                }
              </hlm-command-group>
            }
          </div>
        </hlm-command-list>
      </hlm-command>
    </hlm-command-dialog>
  `,
  styles: `
    /*
     * 삽화는 이미지가 아니라 마스크로 얹습니다. <img> 로 넣으면 파일에 박힌 색이 그대로 나와
     * 다크 모드용 사본을 따로 두어야 하고, 인라인으로 넣으면 path 189 개가 DOM 에 들어옵니다.
     * 마스크는 알파 채널만 읽으므로 색은 배경색 유틸리티가 정합니다.
     */
    .empty-art {
      display: block;
      -webkit-mask-image: url('/empty.svg');
      mask-image: url('/empty.svg');
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
    }

    /*
     * 좁은 화면에서는 목록이 남은 높이를 전부 차지합니다.
     * 높이 전환은 상자가 화면 안에서 커졌다 작아질 때의 문제이며 전체 화면에서는 대상이 없습니다.
     *
     * !important 를 쓰는 이유는 되돌릴 대상이 인라인 스타일이기 때문입니다. 화면 폭을 컴포넌트가
     * 판정해 지정을 거르는 방법도 있으나 그러면 CSS 로 되는 것을 런타임 분기로 만들게 됩니다.
     */
    @media (width < 48rem) {
      .search-list {
        height: auto !important;
        max-height: none;
        min-height: 0;
        flex: 1;
      }
    }
  `,
})
export class SiteSearch {
  public readonly open = input.required<boolean>();

  /** 주소가 들고 있는 검색어입니다. 열 때 입력창의 초기값이 됩니다. */
  public readonly query = input('');

  /** 입력이 멎은 뒤의 검색어입니다. 셸이 이 값을 주소에 반영합니다. */
  public readonly queryChange = output<string>();

  /** 닫기 요청입니다. 실제로 닫는 것은 셸의 이동이며 여기서 상태를 바꾸지 않습니다. */
  public readonly closed = output<void>();

  /** 결과 선택입니다. 이동은 라우터를 소유한 셸이 합니다. */
  public readonly selected = output<SearchHit>();

  /** 입력창의 현재 값입니다. 화면에 즉시 반영되며 결과 계산에는 쓰지 않습니다. */
  protected readonly draft = signal('');

  /**
   * 입력이 멎은 뒤의 값입니다. 결과와 강조 구간이 이 값을 따릅니다.
   * 두 신호를 나누는 이유는 입력창의 반응까지 늦추면 글자가 늦게 찍히는 것처럼 보이기 때문입니다.
   */
  protected readonly typedQuery = toSignal(
    toObservable(this.draft).pipe(debounceTime(TYPING_DELAY)),
    { initialValue: '' },
  );

  /**
   * 색인은 처음 열 때 한 번만 받습니다. `params` 가 닫힌 동안 undefined 라 요청이 나가지 않고,
   * 열린 뒤에는 항상 같은 `true` 라 다시 열어도 재요청하지 않습니다.
   */
  protected readonly index = resource({
    params: () => (this.open() ? true : undefined),
    loader: () => loadSearchEntries(),
  });

  protected readonly groups = computed<readonly ResultGroup[]>(() => {
    const query = this.typedQuery();
    const hits = searchDocs(query, this.index.value() ?? []);

    return AREA_ORDER.map((area) => ({
      area,
      label: AREA_LABELS[area],
      rows: hits.filter((hit) => hit.area === area).map((hit) => this.toRow(hit, query)),
    })).filter((group) => group.rows.length > 0);
  });

  /** brain 의 필터를 통과시킵니다. 걸러내기는 `searchDocs` 가 이미 끝냈습니다. */
  protected readonly acceptAll = (): boolean => true;

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  /**
   * 결과 영역의 실제 높이입니다. 0 이면 아직 재기 전이며 그동안은 CSS 의 min/max 만 적용됩니다.
   * 이 값을 목록에 픽셀로 지정해야 높이 변화가 전환 대상이 됩니다.
   */
  protected readonly contentHeight = signal(0);

  constructor() {
    /*
     * 내용 높이를 관찰해 목록에 옮깁니다. 결과 수가 바뀔 때마다 다시 재는 대신 관찰자를 쓰는
     * 이유는 높이가 결과 수뿐 아니라 제목 줄바꿈과 글꼴 로드에도 좌우되기 때문입니다.
     *
     * 관찰 대상은 목록이 아니라 그 안의 내용입니다. 목록을 관찰하면 우리가 지정한 높이를
     * 다시 읽어 값이 자기 자신을 따라가는 순환이 됩니다.
     */
    effect((onCleanup) => {
      const element = this.content()?.nativeElement;
      if (!element || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(([entry]) => {
        this.contentHeight.set(entry.contentRect.height);
      });

      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });

    /*
     * 열릴 때 한 번만 주소의 값을 입력창으로 가져옵니다.
     *
     * `linkedSignal` 로 주소를 계속 따라가게 하면 글자를 잃습니다. 라우터의 입력 바인딩은
     * 첫 값 이후를 마이크로태스크로 전달하므로, 그 사이에 더 친 글자가 뒤늦게 도착한
     * 이전 값으로 덮입니다.
     */
    effect(() => {
      if (this.open()) untracked(() => this.draft.set(this.query()));
    });

    /*
     * 입력이 멎으면 주소에 반영합니다. 닫힌 동안에는 보내지 않습니다.
     * 이미 주소에 있는 값과 같으면 보내지 않아 의미 없는 이동을 만들지 않습니다.
     */
    effect(() => {
      const text = this.typedQuery();

      untracked(() => {
        if (!this.open() || text === this.query()) return;
        this.queryChange.emit(text);
      });
    });
  }

  protected onStateChange(state: BrnDialogState): void {
    // 여는 것은 셸이 이미 알고 있습니다. 여기서는 닫힘만 알립니다.
    if (state === 'closed') this.closed.emit();
  }

  private toRow(hit: SearchHit, query: string): ResultRow {
    return {
      hit,
      title: splitByMatches(hit.title, query),
      section: hit.section ? splitByMatches(hit.section.text, query) : null,
      description: splitByMatches(hit.description, query),
    };
  }
}
