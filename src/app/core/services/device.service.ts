import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';

import { DeviceDetail, DeviceListItem, DeviceStatusHistoryPage } from '../models/device.model';

@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://localhost:8080/api/admin/devices';

  getDevices(filters: DeviceListFilters = {}): Observable<DeviceListItem[]> {
    const params = new URLSearchParams();

    if (filters.keyword?.trim()) {
      params.set('keyword', filters.keyword.trim());
    }

    if (filters.status?.trim()) {
      params.set('status', filters.status.trim());
    }

    const queryString = params.toString();
    const url = queryString.length > 0 ? `${this.apiBaseUrl}?${queryString}` : this.apiBaseUrl;
    return this.http.get<DeviceListItem[]>(url);
  }

  getDeviceById(deviceId: string): Observable<DeviceDetail> {
    return this.http.get<DeviceDetail>(`${this.apiBaseUrl}/${deviceId}`);
  }

  getDeviceHistory(deviceId: string, filters: DeviceHistoryFilters = {}): Observable<DeviceStatusHistoryPage> {
    const params = new URLSearchParams();

    if (filters.startAt?.trim()) {
      params.set('startAt', filters.startAt.trim());
    }

    if (filters.endAt?.trim()) {
      params.set('endAt', filters.endAt.trim());
    }

    params.set('page', `${filters.page ?? 0}`);
    params.set('size', `${filters.size ?? 10}`);

    const queryString = params.toString();
    const url = queryString.length > 0
      ? `${this.apiBaseUrl}/${deviceId}/status-history?${queryString}`
      : `${this.apiBaseUrl}/${deviceId}/status-history`;
    return this.http.get<DeviceStatusHistoryPage>(url);
  }

  getDeviceSnapshot(deviceId: string, historyFilters: DeviceHistoryFilters = {}): Observable<DeviceSnapshot> {
    return forkJoin({
      device: this.getDeviceById(deviceId),
      history: this.getDeviceHistory(deviceId, historyFilters)
    });
  }

  getDeviceHistoryExportUrl(deviceId: string, filters: DeviceHistoryFilters = {}): string {
    const params = new URLSearchParams();

    if (filters.startAt?.trim()) {
      params.set('startAt', filters.startAt.trim());
    }

    if (filters.endAt?.trim()) {
      params.set('endAt', filters.endAt.trim());
    }

    const queryString = params.toString();
    const url = `${this.apiBaseUrl}/${deviceId}/status-history/export`;
    return queryString.length > 0 ? `${url}?${queryString}` : url;
  }
}

export interface DeviceSnapshot {
  device: DeviceDetail;
  history: DeviceStatusHistoryPage;
}

export interface DeviceListFilters {
  keyword?: string;
  status?: 'ONLINE' | 'OFFLINE' | '';
}

export interface DeviceHistoryFilters {
  startAt?: string;
  endAt?: string;
  page?: number;
  size?: number;
}
