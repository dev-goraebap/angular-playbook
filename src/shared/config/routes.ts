/**
 * 경로 문자열의 원본입니다.
 * 호출부와 템플릿이 경로를 직접 기재하지 않는 근거는 docs/references/라우팅과-네비게이션.md 2.1절에 있습니다.
 */
export const ROUTES = {
  docsHome: () => '/',
  docsArticle: (slug: string) => `/docs/${slug}`,
} as const;
