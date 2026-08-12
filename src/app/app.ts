import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationVeil } from './navigation-veil';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavigationVeil],
  template: `
    <app-navigation-veil />
    <router-outlet />
  `,
})
export class App {}
