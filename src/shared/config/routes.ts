/**
 * 경로 문자열의 원본입니다.
 * 호출부와 템플릿이 경로를 직접 기재하지 않는 근거는 docs/architectures/decoupled/application/angular/concepts/라우팅과-네비게이션.md 2.1절에 있습니다.
 */
export const ROUTES = {
  home: () => '/',

  /**
   * 문서의 슬러그가 곧 경로입니다. `architectures/angular/performance` 처럼 여러 조각이므로
   * 배열로 돌려줍니다. `routerLink` 에 문자열로 넘기면 슬래시가 인코딩되어 매칭되지 않습니다.
   */
  doc: (slug: string) => ['/', ...slug.split('/')],
} as const;
