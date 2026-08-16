import { DOCUMENT } from '@angular/common';
import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';
import { HlmButton } from '@/shared/ui/button';

type ThemeChoice = 'light' | 'dark' | 'system';

/** 사용자 선택을 담는 저장소 키입니다. 값이 없으면 시스템 설정을 따릅니다. */
const STORAGE_KEY = 'theme';

/**
 * 라이트와 다크를 전환합니다. 클래스 부여 로직을 `app` 계층이 소유한다는 규칙은
 * docs/architectures/decoupled/application/angular/concepts/디자인-시스템과-토큰.md 7절이 원본입니다.
 *
 * 토큰이 `light-dark()` 로 정의되어 있으므로 이 컴포넌트가 하는 일은 루트의 `color-scheme` 을
 * 바꾸는 것뿐입니다. 선택하지 않은 상태에서는 클래스를 붙이지 않아 시스템 설정이 그대로 적용됩니다.
 *
 * `localStorage` 와 `document` 는 서버에 없으므로 접근을 `afterNextRender` 안으로 제한합니다.
 * 근거는 docs/architectures/decoupled/application/angular/concepts/렌더링-전략.md 2절에 있습니다.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [NgIcon, HlmButton],
  providers: [provideIcons({ lucideSun, lucideMoon })],
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon-sm"
      [attr.aria-label]="label()"
      [attr.aria-pressed]="resolved() === 'dark'"
      (click)="toggle()"
    >
      <ng-icon [name]="resolved() === 'dark' ? 'lucideSun' : 'lucideMoon'" />
    </button>
  `,
})
export class ThemeToggle {
  private readonly document = inject(DOCUMENT);

  /** 저장된 선택입니다. 서버 렌더 시점에는 알 수 없으므로 `system` 에서 시작합니다. */
  private readonly choice = signal<ThemeChoice>('system');

  /** 실제로 적용된 모드입니다. 선택이 없으면 시스템 설정을 읽습니다. */
  protected readonly resolved = signal<'light' | 'dark'>('light');

  protected readonly label = computed(() =>
    this.resolved() === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
  );

  constructor() {
    afterNextRender(() => {
      const stored = this.readStoredChoice();
      this.choice.set(stored);
      this.resolved.set(stored === 'system' ? this.readSystemMode() : stored);
    });
  }

  protected toggle(): void {
    const next = this.resolved() === 'dark' ? 'light' : 'dark';
    const root = this.document.documentElement;

    root.classList.toggle('dark', next === 'dark');
    root.classList.toggle('light', next === 'light');

    this.choice.set(next);
    this.resolved.set(next);
    this.writeStoredChoice(next);
  }

  private readStoredChoice(): ThemeChoice {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      // 저장소 접근이 차단된 환경에서는 시스템 설정을 따릅니다.
      return 'system';
    }
  }

  private writeStoredChoice(value: ThemeChoice): void {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // 저장에 실패해도 현재 세션의 전환은 유지됩니다.
    }
  }

  private readSystemMode(): 'light' | 'dark' {
    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}
