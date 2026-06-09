import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { DeviceStatus } from '../../../core/models/device.model';

const STATUS_LABELS: Record<DeviceStatus, string> = {
  ONLINE: 'Trực tuyến',
  OFFLINE: 'Mất kết nối',
  IDLE: 'Trực tuyến',
  IN_USE: 'Trực tuyến',
  ERROR: 'Trực tuyến',
  MAINTENANCE: 'Trực tuyến'
};

@Component({
  selector: 'app-device-status-badge',
  imports: [CommonModule],
  template: `
    <span class="status-badge" [class]="cssClass()">
      {{ label() }}
    </span>
  `,
  styleUrl: './device-status-badge.component.scss'
})
export class DeviceStatusBadgeComponent {
  readonly status = input.required<DeviceStatus>();

  readonly label = computed(() => STATUS_LABELS[this.status()]);
  readonly cssClass = computed(() => `status-${this.status().toLowerCase().replace('_', '-')}`);
}
