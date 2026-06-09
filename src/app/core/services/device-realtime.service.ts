import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { DeviceRealtimeEvent } from '../models/device.model';

@Injectable({
  providedIn: 'root'
})
export class DeviceRealtimeService {
  private readonly eventsSubject = new Subject<DeviceRealtimeEvent>();
  private readonly socketUrl = this.buildSocketUrl('http://localhost:8080/api/admin/devices');

  private reconnectTimeoutId: number | null = null;
  private socket: WebSocket | null = null;

  readonly events$: Observable<DeviceRealtimeEvent> = this.eventsSubject.asObservable();

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (typeof WebSocket === 'undefined') {
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const socket = new WebSocket(this.socketUrl);
    this.socket = socket;

    socket.onopen = () => {
      if (this.reconnectTimeoutId !== null) {
        window.clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as DeviceRealtimeEvent;
        if (event.deviceId) {
          this.eventsSubject.next(event);
        }
      } catch {
        // Ignore malformed realtime payloads.
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (this.reconnectTimeoutId === null) {
        this.reconnectTimeoutId = window.setTimeout(() => {
          this.reconnectTimeoutId = null;
          this.connect();
        }, 3000);
      }
    };
  }

  private buildSocketUrl(apiBaseUrl: string): string {
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    return `${protocol}//${apiUrl.host}/ws/devices`;
  }
}
