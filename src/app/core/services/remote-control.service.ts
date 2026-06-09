import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface RemoteScreenFrame {
  deviceId: string;
  width: number;
  height: number;
  timestamp: number;
  imageBase64: string;
}

export interface RemoteCommandResult {
  type: string;
  requestId?: string;
  deviceId?: string;
  status?: string;
  errorMessage?: string;
}

export interface SupportRequestItem {
  deviceId: string;
  deviceName?: string;
  requestedAt: number;
  status?: string;
  acceptedAt?: number | null;
  updatedAt?: number | null;
}

type SupportState = 'IDLE' | 'REQUESTED' | 'CONTROL_PENDING' | 'CONTROL_GRANTED';

type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

interface RemoteMessage {
  type: string;
  requestId?: string;
  deviceId?: string;
  viewerId?: string;
  viewerName?: string;
  deviceName?: string;
  width?: number;
  height?: number;
  timestamp?: number;
  imageBase64?: string;
  command?: string;
  text?: string;
  x?: number;
  y?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  durationMs?: number;
  status?: string;
  canControl?: boolean;
  supportRequested?: boolean;
  errorMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RemoteControlService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly frameSubject = new BehaviorSubject<RemoteScreenFrame | null>(null);
  private readonly connectionStateSubject = new BehaviorSubject<ConnectionState>('DISCONNECTED');
  private readonly canControlSubject = new BehaviorSubject(false);
  private readonly supportStateSubject = new BehaviorSubject<SupportState>('IDLE');
  private readonly supportRequestsSubject = new BehaviorSubject<SupportRequestItem[]>([]);
  private readonly statusSubject = new BehaviorSubject('Chưa kết nối');
  private readonly resultSubject = new Subject<RemoteCommandResult>();

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private activeDeviceId = '';
  private supportSessionDeviceId = '';
  private shouldReconnect = false;

  readonly frame$ = this.frameSubject.asObservable();
  readonly connectionState$ = this.connectionStateSubject.asObservable();
  readonly canControl$ = this.canControlSubject.asObservable();
  readonly supportState$ = this.supportStateSubject.asObservable();
  readonly supportRequests$ = this.supportRequestsSubject.asObservable();
  readonly status$ = this.statusSubject.asObservable();
  readonly results$ = this.resultSubject.asObservable();

  connect(deviceId: string): void {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      return;
    }

    this.activeDeviceId = normalizedDeviceId;
    this.frameSubject.next(null);
    this.canControlSubject.next(false);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendAdminViewDevice(normalizedDeviceId);
      return;
    }

    this.startSupportMonitor();
  }

  startSupportMonitor(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this.connectionStateSubject.next('CONNECTING');
    this.statusSubject.next(this.activeDeviceId ? `Đang kết nối tới ${this.activeDeviceId}` : 'Đang lắng nghe yêu cầu hỗ trợ');

    const socket = new WebSocket(this.buildWebSocketUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.zone.run(() => {
        this.connectionStateSubject.next('CONNECTED');
        this.sendMessage({
          type: 'ADMIN_SUPPORT_MONITOR'
        });

        if (this.activeDeviceId) {
          this.sendAdminViewDevice(this.activeDeviceId);
        } else {
          this.statusSubject.next('Đang lắng nghe yêu cầu hỗ trợ');
        }
      });
    };

    socket.onmessage = (event) => {
      this.zone.run(() => this.handleIncomingMessage(event.data));
    };

    socket.onclose = () => {
      this.zone.run(() => {
        this.socket = null;
        this.canControlSubject.next(false);
        if (!this.shouldReconnect) {
          this.connectionStateSubject.next('DISCONNECTED');
          this.statusSubject.next('Đã ngắt kết nối');
          return;
        }

        this.connectionStateSubject.next('RECONNECTING');
        this.statusSubject.next(this.activeDeviceId ? `Đang kết nối lại tới ${this.activeDeviceId}` : 'Đang kết nối lại kênh hỗ trợ');
        this.scheduleReconnect();
      });
    };

    socket.onerror = () => {
      this.zone.run(() => {
        this.statusSubject.next('Kết nối websocket gặp lỗi');
      });
    };
  }

  disconnect(clearDeviceId = true): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.frameSubject.next(null);
    this.canControlSubject.next(false);
    this.supportStateSubject.next('IDLE');
    this.supportRequestsSubject.next([]);
    this.supportSessionDeviceId = '';
    this.connectionStateSubject.next('DISCONNECTED');
    this.statusSubject.next('Đã ngắt kết nối');
    if (clearDeviceId) {
      this.activeDeviceId = '';
    }
  }

  sendTap(x: number, y: number): void {
    this.sendMessage({
      type: 'COMMAND',
      requestId: crypto.randomUUID(),
      deviceId: this.activeDeviceId,
      command: 'TAP',
      x,
      y
    });
  }

  sendSwipe(startX: number, startY: number, endX: number, endY: number, durationMs: number): void {
    this.sendMessage({
      type: 'COMMAND',
      requestId: crypto.randomUUID(),
      deviceId: this.activeDeviceId,
      command: 'SWIPE',
      startX,
      startY,
      endX,
      endY,
      durationMs
    });
  }

  sendText(text: string): void {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    this.sendMessage({
      type: 'COMMAND',
      requestId: crypto.randomUUID(),
      deviceId: this.activeDeviceId,
      command: 'TYPE_TEXT',
      text: normalizedText
    });
  }

  requestControl(): void {
    if (!this.activeDeviceId) {
      return;
    }

    this.supportStateSubject.next('CONTROL_PENDING');
    this.statusSubject.next(`Đang chờ ${this.activeDeviceId} xác nhận quyền điều khiển`);
    this.sendMessage({
      type: 'CONTROL_REQUEST',
      deviceId: this.activeDeviceId,
      viewerId: crypto.randomUUID(),
      viewerName: 'Admin Web'
    });
  }

  endSupport(): void {
    if (!this.activeDeviceId) {
      return;
    }

    this.sendMessage({
      type: 'END_SUPPORT',
      deviceId: this.activeDeviceId,
      viewerId: crypto.randomUUID(),
      viewerName: 'Admin Web'
    });
  }

  acceptSupportRequest(deviceId: string): void {
    this.supportSessionDeviceId = deviceId.trim();
    this.supportStateSubject.next('REQUESTED');
    this.connect(deviceId);
  }

  fetchSupportRequests() {
    return this.http.get<SupportRequestApiResponse[]>('http://localhost:8080/api/admin/support-requests');
  }

  fetchSupportRequest(deviceId: string) {
    return this.http.get<SupportRequestApiResponse>(`http://localhost:8080/api/admin/support-requests/${deviceId}`);
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.shouldReconnect) {
        return;
      }
      this.socket = null;
      this.startSupportMonitor();
    }, 2_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleIncomingMessage(payload: string): void {
    const message = JSON.parse(payload) as RemoteMessage;

    switch (message.type) {
      case 'SCREEN_FRAME':
        if (
          typeof message.width === 'number' &&
          typeof message.height === 'number' &&
          typeof message.timestamp === 'number' &&
          typeof message.imageBase64 === 'string' &&
          typeof message.deviceId === 'string'
        ) {
          this.frameSubject.next({
            deviceId: message.deviceId,
            width: message.width,
            height: message.height,
            timestamp: message.timestamp,
            imageBase64: message.imageBase64
          });
        }
        break;
      case 'ADMIN_SUPPORT_MONITOR_ACK':
        if (!this.activeDeviceId) {
          this.statusSubject.next('Đang lắng nghe yêu cầu hỗ trợ');
        }
        break;
      case 'ADMIN_VIEW_DEVICE_ACK':
        this.canControlSubject.next(Boolean(message.canControl));
        this.supportStateSubject.next(this.resolveSupportStateForViewAck(message));
        this.statusSubject.next(
          message.canControl
            ? `Đang điều khiển ${message.deviceId ?? this.activeDeviceId}`
            : `Đang xem ${message.deviceId ?? this.activeDeviceId} ở chế độ chỉ xem`
        );
        this.removeSupportRequest(message.deviceId);
        break;
      case 'SUPPORT_REQUESTED':
        if ((message.deviceId ?? '') === this.activeDeviceId) {
          this.supportStateSubject.next('REQUESTED');
          this.statusSubject.next(`Thiết bị ${message.deviceId ?? this.activeDeviceId} đang yêu cầu hỗ trợ`);
        }
        if (message.deviceId) {
          this.upsertSupportRequest({
            deviceId: message.deviceId,
            deviceName: message.deviceName,
            requestedAt: Date.now(),
            status: 'REQUESTED'
          });
        }
        break;
      case 'SUPPORT_REQUEST_RESOLVED':
        if (message.status === 'CLOSED') {
          if (!this.canControlSubject.value && (message.deviceId ?? '') === this.activeDeviceId) {
            this.supportStateSubject.next('IDLE');
          }
          if ((message.deviceId ?? '') === this.supportSessionDeviceId && !this.canControlSubject.value) {
            this.supportSessionDeviceId = '';
          }
          this.removeSupportRequest(message.deviceId);
        } else {
          if ((message.deviceId ?? '') === this.activeDeviceId) {
            if (message.status === 'CONTROL_GRANTED') {
              this.supportStateSubject.next('CONTROL_GRANTED');
            } else {
              this.supportStateSubject.next('REQUESTED');
            }
          }
          if (message.deviceId) {
            this.upsertSupportRequest({
              deviceId: message.deviceId,
              requestedAt: this.findRequestedAt(message.deviceId),
              status: message.status,
              updatedAt: Date.now()
            });
          }
        }
        break;
      case 'CONTROL_REQUEST_ACK':
        this.supportStateSubject.next('CONTROL_PENDING');
        this.statusSubject.next(`Đã gửi yêu cầu điều khiển tới ${message.deviceId ?? this.activeDeviceId}`);
        break;
      case 'CONTROL_GRANTED':
        this.canControlSubject.next(Boolean(message.canControl));
        this.supportStateSubject.next('CONTROL_GRANTED');
        this.statusSubject.next(`Đã được cấp quyền điều khiển ${message.deviceId ?? this.activeDeviceId}`);
        break;
      case 'END_SUPPORT_ACK':
        this.canControlSubject.next(false);
        this.supportStateSubject.next('IDLE');
        this.statusSubject.next(`Đã kết thúc hỗ trợ ${message.deviceId ?? this.activeDeviceId}`);
        this.removeSupportRequest(message.deviceId);
        if ((message.deviceId ?? '') === this.supportSessionDeviceId) {
          this.supportSessionDeviceId = '';
        }
        break;
      case 'CONTROL_RELEASED':
        this.canControlSubject.next(false);
        this.supportStateSubject.next('REQUESTED');
        this.statusSubject.next(`Quyền điều khiển ${message.deviceId ?? this.activeDeviceId} đã bị thu hồi`);
        break;
      case 'CONTROL_REJECTED':
        this.canControlSubject.next(false);
        this.supportStateSubject.next('REQUESTED');
        this.statusSubject.next(message.errorMessage ?? 'Khách hàng đã từ chối quyền điều khiển');
        this.resultSubject.next({
          type: message.type,
          requestId: message.requestId,
          deviceId: message.deviceId,
          status: message.status,
          errorMessage: message.errorMessage
        });
        break;
      case 'COMMAND_ACK':
      case 'COMMAND_RESULT':
      case 'ERROR':
      case 'DEVICE_DISCONNECTED':
        if (message.type === 'ERROR') {
          if (message.status === 'CONTROL_REQUEST_PENDING') {
            this.supportStateSubject.next('CONTROL_PENDING');
          } else if (
            message.status === 'DEVICE_OFFLINE' ||
            message.status === 'CONTROL_DENIED' ||
            message.status === 'INVALID_CONTROL_REQUEST'
          ) {
            this.supportStateSubject.next(this.canControlSubject.value ? 'CONTROL_GRANTED' : 'REQUESTED');
          }
          if (message.errorMessage) {
            this.statusSubject.next(message.errorMessage);
          }
        }
        if (message.type === 'DEVICE_DISCONNECTED') {
          this.statusSubject.next(`Thiết bị ${message.deviceId ?? this.activeDeviceId} đã ngắt kết nối`);
          if ((message.deviceId ?? '') === this.activeDeviceId) {
            this.supportStateSubject.next('IDLE');
          }
          this.removeSupportRequest(message.deviceId);
        }
        this.resultSubject.next({
          type: message.type,
          requestId: message.requestId,
          deviceId: message.deviceId,
          status: message.status,
          errorMessage: message.errorMessage
        });
        break;
      default:
        break;
    }
  }

  private sendMessage(message: RemoteMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private sendAdminViewDevice(deviceId: string): void {
    this.sendMessage({
      type: 'ADMIN_VIEW_DEVICE',
      deviceId,
      viewerId: crypto.randomUUID(),
      viewerName: 'Admin Web'
    });
    this.statusSubject.next(`Đang xem ${deviceId}`);
  }

  private upsertSupportRequest(request: SupportRequestItem): void {
    const existing = this.supportRequestsSubject.value.find((item) => item.deviceId === request.deviceId);
    const merged: SupportRequestItem = {
      ...existing,
      ...request,
      requestedAt: request.requestedAt || existing?.requestedAt || Date.now()
    };
    const current = this.supportRequestsSubject.value.filter((item) => item.deviceId !== request.deviceId);
    this.supportRequestsSubject.next([merged, ...current]);
  }

  private removeSupportRequest(deviceId?: string): void {
    if (!deviceId) {
      return;
    }

    this.supportRequestsSubject.next(this.supportRequestsSubject.value.filter((item) => item.deviceId !== deviceId));
  }

  private resolveSupportStateForViewAck(message: RemoteMessage): SupportState {
    if (message.canControl) {
      return 'CONTROL_GRANTED';
    }

    const deviceId = message.deviceId ?? this.activeDeviceId;
    if (message.supportRequested || deviceId === this.supportSessionDeviceId) {
      return 'REQUESTED';
    }

    return 'IDLE';
  }

  private findRequestedAt(deviceId: string): number {
    return this.supportRequestsSubject.value.find((item) => item.deviceId === deviceId)?.requestedAt ?? Date.now();
  }

  private buildWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    return `${protocol}//${host}:8080/ws/remote`;
  }
}

interface SupportRequestApiResponse {
  deviceId: string;
  deviceName?: string;
  status: string;
  requestedAt: string;
  acceptedAt?: string | null;
  updatedAt?: string | null;
}
