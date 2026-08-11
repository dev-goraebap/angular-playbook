import { Routes } from '@angular/router';
import { homeResolver } from '@/pages/home';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@/pages/home').then((m) => m.Home),
    resolve: { greeting: homeResolver },
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
  },
];
