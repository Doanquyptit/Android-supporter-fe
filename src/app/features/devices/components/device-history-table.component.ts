import { CommonModule, DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';

import { DeviceStatusHistoryPage } from '../../../core/models/device.model';
import { DeviceStatusBadgeComponent } from './device-status-badge.component';

@Component({
  selector: 'app-device-history-table',
  imports: [CommonModule, DatePipe, DeviceStatusBadgeComponent],
  templateUrl: './device-history-table.component.html',
  styleUrl: './device-history-table.component.scss'
})
export class DeviceHistoryTableComponent {
  readonly history = input.required<DeviceStatusHistoryPage>();
}
