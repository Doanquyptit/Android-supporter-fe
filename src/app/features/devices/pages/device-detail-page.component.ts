import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, map, startWith, switchMap } from 'rxjs';

import { DeviceStatusHistoryPage } from '../../../core/models/device.model';
import { DeviceRealtimeService } from '../../../core/services/device-realtime.service';
import { DeviceHistoryFilters, DeviceSnapshot, DeviceService } from '../../../core/services/device.service';
import { DeviceHistoryTableComponent } from '../components/device-history-table.component';
import { DeviceStatusBadgeComponent } from '../components/device-status-badge.component';

@Component({
  selector: 'app-device-detail-page',
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, DeviceStatusBadgeComponent, DeviceHistoryTableComponent],
  templateUrl: './device-detail-page.component.html',
  styleUrl: './device-detail-page.component.scss'
})
export class DeviceDetailPageComponent {
  readonly pageSizeOptions = [10, 20, 50];

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly deviceService = inject(DeviceService);
  private readonly deviceRealtimeService = inject(DeviceRealtimeService);

  startAt = '';
  endAt = '';
  pageSize = 10;

  readonly filters$ = this.route.queryParamMap.pipe(
    map((params) => ({
      startAt: this.toDateTimeLocal(params.get('startAt')),
      endAt: this.toDateTimeLocal(params.get('endAt')),
      page: this.toPositiveNumber(params.get('page'), 0),
      size: this.toPositiveNumber(params.get('size'), 10)
    })),
    map((filters) => {
      this.startAt = filters.startAt;
      this.endAt = filters.endAt;
      this.pageSize = filters.size;
      return filters;
    })
  );

  readonly data$ = combineLatest([this.route.paramMap, this.filters$]).pipe(
    map(([params, filters]) => ({
      deviceId: params.get('id') ?? '',
      filters
    })),
    filter(({ deviceId }) => deviceId.length > 0),
    switchMap(({ deviceId, filters }) =>
      this.deviceRealtimeService.events$.pipe(
        filter((event) => event.deviceId === deviceId),
        startWith(null),
        switchMap(() => this.deviceService.getDeviceSnapshot(deviceId, this.toHistoryFilters(filters)))
      )
    ),
    catchError((error) => {
      void this.router.navigate(['/devices']);
      return EMPTY as typeof EMPTY & never;
    })
  );

  getLatestOnAt(history: DeviceStatusHistoryPage): string | null {
    return history.latestOnAt;
  }

  getLatestOffAt(history: DeviceStatusHistoryPage): string | null {
    return history.latestOffAt;
  }

  formatUptime(uptimeSeconds: number): string {
    if (uptimeSeconds <= 0) {
      return '0 phút';
    }

    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    if (hours <= 0) {
      return `${minutes} phút`;
    }

    if (minutes <= 0) {
      return `${hours} giờ`;
    }

    return `${hours} giờ ${minutes} phút`;
  }

  applyFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        startAt: this.toIsoDateTime(this.startAt) || null,
        endAt: this.toIsoDateTime(this.endAt) || null,
        page: 0,
        size: 10
      },
      queryParamsHandling: 'merge'
    });
  }

  resetFilters(): void {
    this.startAt = '';
    this.endAt = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        startAt: null,
        endAt: null,
        page: 0,
        size: 10
      },
      queryParamsHandling: 'merge'
    });
  }

  changePage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge'
    });
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: 0,
        size
      },
      queryParamsHandling: 'merge'
    });
  }

  exportHistory(deviceId: string): void {
    const url = this.deviceService.getDeviceHistoryExportUrl(deviceId, {
      startAt: this.toIsoDateTime(this.startAt),
      endAt: this.toIsoDateTime(this.endAt)
    });

    window.open(url, '_blank');
  }

  private toHistoryFilters(filters: { startAt: string; endAt: string; page: number; size: number }): DeviceHistoryFilters {
    return {
      startAt: this.toIsoDateTime(filters.startAt),
      endAt: this.toIsoDateTime(filters.endAt),
      page: filters.page,
      size: filters.size
    };
  }

  private toIsoDateTime(value: string): string {
    if (!value) {
      return '';
    }

    return new Date(value).toISOString();
  }

  private toDateTimeLocal(value: string | null): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private toPositiveNumber(value: string | null, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
