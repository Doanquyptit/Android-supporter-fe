import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  RemoteControlService,
  SupportRequestItem
} from '../../../core/services/remote-control.service';

@Component({
  selector: 'app-remote-support-list-page',
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './remote-support-list-page.component.html',
  styleUrl: './remote-support-list-page.component.scss'
})
export class RemoteSupportListPageComponent implements OnInit, OnDestroy {
  private readonly remoteControlService = inject(RemoteControlService);
  private readonly subscriptions = new Subscription();

  supportRequests: SupportRequestItem[] = [];
  connectionState = 'DISCONNECTED';
  status = 'Chưa kết nối';

  ngOnInit(): void {
    this.subscriptions.add(
      this.remoteControlService.fetchSupportRequests().subscribe((requests) => {
        this.supportRequests = requests.map((request) => ({
          deviceId: request.deviceId,
          deviceName: request.deviceName,
          requestedAt: new Date(request.requestedAt).getTime(),
          status: request.status,
          acceptedAt: request.acceptedAt ? new Date(request.acceptedAt).getTime() : null,
          updatedAt: request.updatedAt ? new Date(request.updatedAt).getTime() : null
        }));
      })
    );

    this.subscriptions.add(
      this.remoteControlService.supportRequests$.subscribe((requests) => {
        this.supportRequests = requests;
      })
    );

    this.subscriptions.add(
      this.remoteControlService.connectionState$.subscribe((state) => {
        this.connectionState = state;
      })
    );

    this.subscriptions.add(
      this.remoteControlService.status$.subscribe((status) => {
        this.status = status;
      })
    );

    this.remoteControlService.startSupportMonitor();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  getRequestConnectionLabel(_request: SupportRequestItem): string {
    if (this.connectionState === 'CONNECTED') {
      return 'Đang lắng nghe';
    }

    if (this.connectionState === 'RECONNECTING') {
      return 'Đang kết nối lại';
    }

    if (this.connectionState === 'CONNECTING') {
      return 'Đang kết nối';
    }

    return 'Chưa kết nối';
  }

  getRequestStatusLabel(request: SupportRequestItem): string {
    switch (request.status) {
      case 'REQUESTED':
        return 'Đang chờ hỗ trợ';
      case 'ACCEPTED':
        return 'Đang hỗ trợ';
      case 'CONTROL_PENDING':
        return 'Chờ cấp quyền điều khiển';
      case 'CONTROL_GRANTED':
        return 'Đang điều khiển từ xa';
      case 'CONTROL_REJECTED':
        return 'Từ chối điều khiển';
      default:
        return 'Đang xử lý';
    }
  }
}
