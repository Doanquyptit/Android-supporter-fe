export type DeviceStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'IDLE'
  | 'IN_USE'
  | 'ERROR'
  | 'MAINTENANCE';

export interface DeviceListItem {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  lastSeenAt: string;
}

export interface DeviceDetail extends DeviceListItem {
  location: string;
  model: string;
  osVersion: string;
  appVersion: string;
  uptimeSeconds: number;
}

export interface DeviceStatusHistoryItem {
  id: string;
  deviceId: string;
  fromStatus: DeviceStatus | null;
  toStatus: DeviceStatus;
  currentStep: string;
  reason: string;
  createdAt: string;
}

export interface DeviceStatusHistoryPage {
  items: DeviceStatusHistoryItem[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  latestOnAt: string | null;
  latestOffAt: string | null;
}

export interface DeviceRealtimeEvent {
  type: 'LIFECYCLE_UPDATED' | 'HEARTBEAT_RECEIVED' | 'STATUS_EVENT_RECEIVED' | 'DEVICE_MARKED_OFFLINE';
  deviceId: string;
  status: DeviceStatus;
  currentStep: string;
  occurredAt: string;
}

export interface DeviceOnlineHistoryItem {
  id: string;
  deviceId: string;
  onAt: string;
  previousLastSeenAt: string | null;
}
