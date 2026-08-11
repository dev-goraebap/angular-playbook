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
    ignores: ['dist/**', '.angular/**', 'src/shared/api/generated/**'],
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
