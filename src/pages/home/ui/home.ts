import { Component } from '@angular/core';
import { formatDate } from '@/shared/lib';
import { GREETING } from '../api/greeting';

@Component({
  selector: 'app-home',
  template: `<p>{{ greeting }} — {{ today }}</p>`,
})
export class Home {
  protected readonly greeting = GREETING;
  protected readonly today = formatDate(new Date(0));
}
