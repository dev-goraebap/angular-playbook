// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * 코드 규약의 강제 수단입니다.
 * 각 규칙의 근거는 docs/references/ 의 해당 문서가 원본입니다.
 * FSD 계층 규칙은 steiger.config.ts 가 담당하며 여기서 중복하지 않습니다.
 */
module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.angular/**',
      'src/shared/api/generated/**',
      'src/shared/markdown/generated/**',
      // 서브모듈은 다른 저장소의 소유입니다. 참조 구현 저장소는 자체 린트 규칙을 갖고 있으며
      // 여기서 검사하면 우리 규약을 그 저장소의 코드에 적용하게 됩니다.
      'external/**',
    ],
  },

  // ── TypeScript ────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // 명명 규칙 — docs/references/명명-규칙.md
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-class-suffix': 'off',
      '@angular-eslint/directive-class-suffix': 'off',

      // 보안 — docs/references/보안.md §3
      'no-restricted-properties': [
        'error',
        ...['bypassSecurityTrustHtml', 'bypassSecurityTrustScript', 'bypassSecurityTrustStyle',
            'bypassSecurityTrustUrl', 'bypassSecurityTrustResourceUrl'].map((property) => ({
          property,
          message: 'XSS 방어를 우회합니다. 불가피하면 ADR 로 사유를 남기고 이 규칙을 지역 예외로 처리하십시오.',
        })),
      ],

      // 예외 · 로깅 — docs/references/예외-에러표시-로깅.md §5.2
      'no-console': ['error', { allow: ['error'] }],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            // 폼 — docs/references/폼과-검증.md §1
            {
              name: '@angular/forms',
              importNames: ['FormGroup', 'FormControl', 'FormArray', 'FormBuilder',
                            'ReactiveFormsModule', 'Validators'],
              message: 'Signal Forms(@angular/forms/signals)를 사용합니다. ADR-0008 참조.',
            },
            // 의존성 주입 — docs/references/패키지-배치와-참조-규칙.md §7.5
            // Injector 직접 사용은 동적 토큰 주입 경로를 열어 계층 검사를 우회할 수 있습니다.
            // 불가피한 경우 지역 예외 주석으로 사유를 남기십시오.
            {
              name: '@angular/core',
              importNames: ['Injector'],
              message: 'Injector 직접 사용은 임포트 그래프에 나타나지 않는 참조를 만듭니다. inject() 를 사용하십시오.',
            },
          ],
          patterns: [
            {
              group: ['../../*'],
              message: '계층을 넘는 상대 경로입니다. "@/<layer>/..." 별칭을 사용하십시오.',
            },
            // Steiger 의 no-public-api-sidestep 을 대신합니다.
            // 그 규칙은 임포트하는 파일에서 발화해 경로 단위로 좁힐 수 없어 해제했습니다.
            // 근거는 steiger.config.ts 의 주석과 개발-환경.md §7 에 있습니다.
            {
              group: ['@/pages/**/ui/**', '@/pages/**/api/**', '@/pages/**/model/**',
                      '@/pages/**/lib/**', '@/pages/**/config/**',
                      '@/features/**/ui/**', '@/features/**/api/**', '@/features/**/model/**',
                      '@/features/**/lib/**', '@/features/**/config/**',
                      '@/entities/**/ui/**', '@/entities/**/api/**', '@/entities/**/model/**',
                      '@/entities/**/lib/**', '@/entities/**/config/**'],
              message: '슬라이스 내부 파일입니다. 슬라이스의 공개 API(index.ts)를 경유하십시오.',
            },
            {
              group: ['@/shared/*/*/**'],
              message:
                'shared 세그먼트의 내부 파일입니다. 세그먼트 또는 컴포넌트 진입점만 임포트하십시오.',
            },
          ],
        },
      ],
    },
  },

  // Node 진입점은 stdout 이 표준 로깅 채널입니다.
  // no-console 규칙의 근거(브라우저 콘솔로의 개인정보 유출)가 적용되지 않습니다.
  {
    files: ['src/server.ts', 'src/main.server.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // helm 사본은 Spartan 규약을 따릅니다.
  // 선택자 접두사는 hlm 이며, 이를 app 으로 바꾸면 컴포넌트를 재생성할 때마다 되돌아옵니다.
  // hlm.ts 의 Injector 는 runInInjectionContext 에 넘기는 용도라 우리 규칙이 막으려는
  // 동적 토큰 주입(Injector.get)이 아닙니다. 규칙이 입구를 넓게 막고 있어 함께 걸립니다.
  // 나머지 규칙(XSS 우회, no-console, 폼 수단 제한)은 그대로 적용합니다.
  {
    files: ['src/shared/ui/**/*.ts'],
    rules: {
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/directive-selector': 'off',
      // aria-label 처럼 표준 속성명을 그대로 받으려면 별칭이 필요합니다.
      '@angular-eslint/no-input-rename': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/forms',
              importNames: ['FormGroup', 'FormControl', 'FormArray', 'FormBuilder',
                            'ReactiveFormsModule', 'Validators'],
              message: 'Signal Forms(@angular/forms/signals)를 사용합니다. ADR-0008 참조.',
            },
          ],
          patterns: [
            {
              group: ['../../*'],
              message: '계층을 넘는 상대 경로입니다. "@/<layer>/..." 별칭을 사용하십시오.',
            },
          ],
        },
      ],
    },
  },

  // 전역 프로바이더는 shared 와 app 에서만 선언합니다.
  {
    files: ['src/pages/**/*.ts', 'src/features/**/*.ts', 'src/entities/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='providedIn'][value.value='root']",
          message:
            "providedIn: 'root' 는 shared 와 app 에서만 선언합니다. 화면 범위 서비스는 라우트 providers 에 등록하십시오.",
        },
      ],
    },
  },

  // ── 템플릿 ────────────────────────────────────────────────────────────────
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
);
