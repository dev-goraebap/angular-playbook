/**
 * 상단 바와 하단 네비게이션이 함께 쓰는 메뉴 정의입니다.
 *
 * 두 곳이 각자 배열을 갖지 않는 이유는 항목이 어긋나기 때문입니다. 좁은 화면에서는 하단이,
 * 넓은 화면에서는 상단이 유일한 메뉴이므로 한쪽에만 추가하면 그 기기에서 갈 길이 사라집니다.
 *
 * 아이콘 이름은 여기 두되 등록은 쓰는 컴포넌트가 합니다. 상단 바는 아이콘을 쓰지 않으므로
 * 이 파일이 `provideIcons` 를 하면 쓰지 않는 아이콘이 초기 번들에 들어갑니다.
 */
export interface NavigationItem {
  readonly path: string;
  readonly label: string;
  /** 블로그는 루트라 정확히 일치할 때만 활성입니다. 그러지 않으면 모든 화면에서 활성이 됩니다. */
  readonly exact: boolean;
  readonly icon: string;
}

export const NAVIGATION: readonly NavigationItem[] = [
  { path: '/', label: '블로그', exact: true, icon: 'lucideNewspaper' },
  { path: '/architectures', label: '아키텍처', exact: false, icon: 'lucideLayers' },
];
