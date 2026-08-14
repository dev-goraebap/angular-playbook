# blog

개인 블로그와 프론트엔드 아키텍처 표준을 한 사이트로 운영하는 저장소입니다. 주소는 [goraebap.xyz](https://goraebap.xyz)입니다.

글과 표준 문서가 같은 저장소에 있는 이유는 둘이 같은 것의 앞뒤이기 때문입니다. 표준은 결론이고 글은 그 결론에 이르기까지의 고민입니다.

## 구조

```text
docs/                       마크다운 원본. 사이트 콘텐츠의 유일한 출처입니다
├── architectures/<도메인>/<스택>/
│   ├── index.md            스택 개요
│   ├── references/         주제별 참조 문서
│   └── decisions/          아키텍처 결정 기록(ADR)
└── posts/<슬러그>/
    ├── index.md            글 본문
    └── assets/             글에 딸린 이미지

scripts/build-docs.mjs      마크다운을 화면이 소비할 형태로 변환합니다
src/                        Angular 애플리케이션
```

`src/shared/markdown/generated/`는 빌드 산출물이며 커밋하지 않습니다. 마크다운 원본만 저장소에 남고 차이는 `docs/`에서 읽습니다.

## 실행

```bash
npm start          # 개발 서버. 문서 변환을 먼저 수행합니다
npm run build      # 정적 생성까지 포함한 프로덕션 빌드
npm run check      # 린트 · FSD 검사 · 빌드를 한 번에 수행합니다
```

`npm run docs:build`가 `start` · `build` · `lint` · `test` 앞에 자동으로 붙습니다. 마크다운을 고치고 애플리케이션을 실행하면 변환이 항상 먼저 돕니다.

## 문서 규칙

`scripts/build-docs.mjs`가 변환하면서 규칙을 함께 강제합니다. 프론트매터 필수 필드, 강조 블록의 종류와 밀도, 문서 간 링크의 유효성, 절 번호의 유효성, 글의 날짜 형식이 대상입니다. 어긋나면 파일명과 사유를 출력하고 멈추며, 실패해도 기존 생성물은 보존됩니다.

규칙 자체의 원본은 [개발 환경](docs/architectures/frontend/angular/references/개발-환경.md) 5절입니다.

## 아키텍처 표준

이 저장소는 표준을 문서로만 두지 않고 **자기 자신이 그 표준의 참조 구현**입니다. FSD 계층 구조, 라우팅과 로딩 전략, 디자인 토큰, 적응형 UI 판정이 모두 `src/` 에 적용되어 있으며 Steiger와 ESLint가 위반을 빌드에서 차단합니다.

주요 결정과 기각한 대안은 [decisions/](docs/architectures/frontend/angular/decisions/)에 ADR로 남아 있습니다.
