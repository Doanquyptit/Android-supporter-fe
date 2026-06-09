import { Routes } from '@angular/router';

import { DeviceDetailPageComponent } from './features/devices/pages/device-detail-page.component';
import { DeviceListPageComponent } from './features/devices/pages/device-list-page.component';
import { RemoteControlPageComponent } from './features/remote-control/pages/remote-control-page.component';
import { RemoteSupportListPageComponent } from './features/remote-control/pages/remote-support-list-page.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'devices'
  },
  {
    path: 'devices',
    component: DeviceListPageComponent
  },
  {
    path: 'devices/:id',
    component: DeviceDetailPageComponent
  },
  {
    path: 'support',
    component: RemoteSupportListPageComponent
  },
  {
    path: 'support/:deviceId',
    component: RemoteControlPageComponent
  },
  {
    path: '**',
    redirectTo: 'devices'
  }
];
