# blog

개인 블로그와 아키텍처 표준을 한 사이트로 발행하는 저장소입니다. 주소는 [goraebap.xyz](https://goraebap.xyz)입니다.

글과 표준 문서를 한 사이트에 두는 이유는 둘이 같은 것의 앞뒤이기 때문입니다. 표준은 결론이고 글은 그 결론에 이르기까지의 고민입니다.

## 구조

콘텐츠는 두 저장소에서 옵니다. 아키텍처 문서의 원본은 [refarch-angular-springboot](https://github.com/dev-goraebap/refarch-angular-springboot)이고 이 저장소는 그것을 서브모듈로 가져와 발행합니다. 문서를 따르는 코드가 참조 구현 저장소에 있어 규칙과 구현이 한 커밋에서 함께 움직이는 반면, 블로그에 원본을 두면 문서만 앞서 나가도 아무것도 막지 않습니다.

```text
docs/                       이 저장소가 소유하는 마크다운
├── architectures/index.md  영역 개요. 에세이입니다
└── posts/<슬러그>/
    ├── index.md            글 본문
    └── assets/             글에 딸린 이미지

external/refarch-angular-springboot/     서브모듈. 아키텍처 문서의 원본입니다
└── docs/architecture/      사이트의 architectures/decoupled/ 로 마운트됩니다
    ├── index.md            그 구성의 개요
    └── <스택>/
        ├── index.md        그 노드의 개요
        ├── references/     참조 문서
        └── decisions/      아키텍처 결정 기록(ADR)

scripts/build-docs.mjs      두 뿌리의 마크다운을 화면이 소비할 형태로 변환합니다
src/                        Angular 애플리케이션
```

노드의 깊이는 고정되어 있지 않습니다. 폴더를 한 겹 더 파면 사이드바에 한 층이 늘고, 파서와 화면은 고치지 않습니다. 서브모듈이 사이트의 어느 자리에 놓이는지는 `build-docs.mjs`의 `SOURCES`가 정하므로, 원본이 옮겨 가도 주소는 바뀌지 않습니다.

`src/shared/markdown/generated/`는 빌드 산출물이며 커밋하지 않습니다. 마크다운 원본만 저장소에 남습니다.

## 실행

서브모듈을 함께 받아야 아키텍처 문서가 들어옵니다.

```bash
git clone --recurse-submodules https://github.com/dev-goraebap/blog.git
git submodule update --init          # 이미 클론했다면 이것만 실행합니다

npm start          # 개발 서버. 문서 변환을 먼저 수행합니다
npm run build      # 정적 생성까지 포함한 프로덕션 빌드
npm run check      # 린트 · FSD 검사 · 빌드를 한 번에 수행합니다
```

`npm run docs:build`가 `start` · `build` · `lint` · `test` 앞에 자동으로 붙습니다. 마크다운을 고치고 애플리케이션을 실행하면 변환이 항상 먼저 돕니다.

## 문서 규칙

`scripts/build-docs.mjs`가 변환하면서 규칙을 함께 강제합니다. 프론트매터 필수 필드, 강조 블록의 종류와 밀도, 문서 간 링크의 유효성, 절 번호의 유효성, 글의 날짜 형식이 대상입니다. 어긋나면 파일명과 사유를 출력하고 멈추며, 실패해도 기존 생성물은 보존됩니다.

규칙 자체의 원본은 `external/refarch-angular-springboot/docs/architecture/angular/references/개발-환경.md` 5절이며 사이트에서는 [개발 환경](https://goraebap.xyz/architectures/angular/dev-environment)으로 읽을 수 있습니다.

## 아키텍처 표준

이 저장소는 표준을 문서로만 두지 않고 **자기 자신이 그 표준의 참조 구현**입니다. FSD 계층 구조, 라우팅과 로딩 전략, 디자인 토큰, 적응형 UI 판정이 모두 `src/` 에 적용되어 있으며 Steiger와 ESLint가 위반을 빌드에서 차단합니다.

주요 결정과 기각한 대안은 `external/refarch-angular-springboot/docs/architecture/angular/decisions/`에 ADR로 남아 있습니다.
