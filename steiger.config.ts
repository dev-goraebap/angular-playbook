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
]);
