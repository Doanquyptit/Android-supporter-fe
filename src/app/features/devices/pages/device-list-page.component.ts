import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, map, startWith, switchMap } from 'rxjs';

import { DeviceRealtimeService } from '../../../core/services/device-realtime.service';
import { DeviceListFilters, DeviceService } from '../../../core/services/device.service';
import { DeviceStatusBadgeComponent } from '../components/device-status-badge.component';

@Component({
  selector: 'app-device-list-page',
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, DeviceStatusBadgeComponent],
  templateUrl: './device-list-page.component.html',
  styleUrl: './device-list-page.component.scss'
})
export class DeviceListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly deviceService = inject(DeviceService);
  private readonly deviceRealtimeService = inject(DeviceRealtimeService);

  keyword = '';
  status: DeviceListFilters['status'] = '';

  readonly filters$ = this.route.queryParamMap.pipe(
    map((params) => ({
      keyword: params.get('keyword') ?? '',
      status: this.parseStatus(params.get('status'))
    })),
    map((filters) => {
      this.keyword = filters.keyword;
      this.status = filters.status;
      return filters;
    })
  );

  readonly devices$ = combineLatest([
    this.filters$,
    this.deviceRealtimeService.events$.pipe(startWith(null))
  ]).pipe(
    switchMap(([filters]) => this.deviceService.getDevices(filters))
  );

  applyFilters(): void {
    void this.router.navigate(['/devices'], {
      queryParams: {
        keyword: this.keyword.trim() || null,
        status: this.status || null
      }
    });
  }

  resetFilters(): void {
    this.keyword = '';
    this.status = '';
    void this.router.navigate(['/devices']);
  }

  private parseStatus(status: string | null): DeviceListFilters['status'] {
    return status === 'ONLINE' || status === 'OFFLINE' ? status : '';
  }
}
