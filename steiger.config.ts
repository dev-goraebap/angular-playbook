import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

/**
 * FSD 아키텍처 규칙의 강제 수단입니다.
 * 규칙의 근거와 배치 판정 기준은 docs/references/패키지-배치와-참조-규칙.md 가 원본입니다.
 */
export default defineConfig([
  ...fsd.configs.recommended,

  // 프레임워크 진입점은 계층에 속하지 않습니다.
  {
    ignores: ['./src/main.ts', './src/main.server.ts', './src/server.ts', './src/index.html'],
  },

  // 슬라이스가 하나뿐인 초기 단계에서는 과분할 지적이 유효하지 않습니다.
  // pages 슬라이스가 셋 이상이 되면 이 예외를 제거합니다.
  {
    files: ['./src/pages/**'],
    rules: {
      'fsd/excessive-slicing': 'off',
    },
  },

  // helm 사본의 폴더 구조는 Spartan CLI 가 정합니다.
  // <컴포넌트>/src/lib/ 형태라 FSD 의 공개 API 위치와 예약 폴더명 규칙에 걸립니다.
  // 구조를 손으로 평탄화하면 컴포넌트를 추가하거나 재생성할 때마다 같은 작업을 반복하게 되므로,
  // 두 규칙만 이 경로에서 해제합니다. 진입점은 tsconfig 의 @/shared/ui/<컴포넌트> 별칭이 담당합니다.
  // 근거는 docs/references/디자인-시스템과-토큰.md §1 에 있습니다.
  {
    files: ['./src/shared/ui/**'],
    rules: {
      'fsd/public-api': 'off',
      'fsd/no-reserved-folder-names': 'off',
    },
  },

  // 사용처가 @/shared/ui/<컴포넌트> 를 임포트하는 것을 이 규칙이 공개 API 우회로 판정합니다.
  // 실제로는 우회가 아니며 tsconfig 가 그 경로를 컴포넌트의 index.ts 로 매핑합니다.
  // 세그먼트 배럴을 두면 @defer 가 의존성을 분리하지 못해 초기 번들이 217kB 늘어납니다(개발-환경 §7).
  //
  // 규칙은 임포트하는 파일에서 발화하므로 경로 단위로 좁힐 수 없어 전역으로 해제하고,
  // 슬라이스 내부 파일 직접 임포트 금지는 eslint.config.js 의 no-restricted-imports 가 대신합니다.
  {
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
]);
