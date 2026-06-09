import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type CallState = 'IDLE' | 'CONNECTING_SIGNALING' | 'READY' | 'WAITING_ACCEPT' | 'CALLING' | 'IN_CALL' | 'ENDED' | 'ERROR';

interface WebRtcSignalMessage {
  type: string;
  deviceId?: string;
  viewerId?: string;
  viewerName?: string;
  targetRole?: string;
  sdpType?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  status?: string;
  errorMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebRtcAudioCallService {
  private readonly zone = inject(NgZone);
  private readonly signalingStateSubject = new BehaviorSubject<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>(
    'DISCONNECTED'
  );
  private readonly callStateSubject = new BehaviorSubject<CallState>('IDLE');
  private readonly callStatusSubject = new BehaviorSubject('Chưa kết nối audio call');
  private readonly remoteStreamSubject = new BehaviorSubject<MediaStream | null>(null);

  private signalingSocket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private activeDeviceId = '';
  private reconnectTimer: number | null = null;
  private shouldReconnect = false;
  private startCallInFlight = false;
  private readonly viewerId = crypto.randomUUID();

  readonly signalingState$ = this.signalingStateSubject.asObservable();
  readonly callState$ = this.callStateSubject.asObservable();
  readonly callStatus$ = this.callStatusSubject.asObservable();
  readonly remoteStream$ = this.remoteStreamSubject.asObservable();

  connect(deviceId: string): void {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      return;
    }

    this.disconnect(false);
    this.activeDeviceId = normalizedDeviceId;
    this.shouldReconnect = true;
    this.signalingStateSubject.next('CONNECTING');
    this.callStateSubject.next('CONNECTING_SIGNALING');
    this.callStatusSubject.next(`Đang kết nối audio call tới ${normalizedDeviceId}`);
    this.log('connect()', { deviceId: normalizedDeviceId, viewerId: this.viewerId });

    const socket = new WebSocket(this.buildWebSocketUrl());
    this.signalingSocket = socket;

    socket.onopen = () => {
      this.zone.run(() => {
        this.log('signaling onopen', { deviceId: normalizedDeviceId });
        this.signalingStateSubject.next('CONNECTED');
        this.callStateSubject.next('READY');
        this.callStatusSubject.next(`Audio call sẵn sàng cho ${normalizedDeviceId}`);
        this.sendSignal({
        type: 'REGISTER_ADMIN',
        deviceId: normalizedDeviceId,
        viewerId: this.viewerId,
        viewerName: 'Admin Web'
        });
      });
    };

    socket.onmessage = (event) => {
      this.zone.run(() => void this.handleIncomingSignal(event.data));
    };

    socket.onclose = () => {
      this.zone.run(() => {
        this.log('signaling onclose', {
          shouldReconnect: this.shouldReconnect,
          activeDeviceId: this.activeDeviceId
        });
        this.signalingSocket = null;
        this.cleanupPeerConnection();
        if (!this.shouldReconnect || !this.activeDeviceId) {
          this.signalingStateSubject.next('DISCONNECTED');
          this.callStateSubject.next('IDLE');
          this.callStatusSubject.next('Audio call đã ngắt kết nối');
          return;
        }

        this.signalingStateSubject.next('CONNECTING');
        this.callStateSubject.next('CONNECTING_SIGNALING');
        this.callStatusSubject.next(`Đang kết nối lại audio call tới ${this.activeDeviceId}`);
        this.scheduleReconnect();
      });
    };

    socket.onerror = () => {
      this.zone.run(() => {
        this.log('signaling onerror');
        this.callStateSubject.next('ERROR');
        this.callStatusSubject.next('Kết nối signaling audio call gặp lỗi');
      });
    };
  }

  disconnect(clearDeviceId = true): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.endCall(false);
    this.signalingSocket?.close();
    this.signalingSocket = null;
    this.signalingStateSubject.next('DISCONNECTED');
    this.callStateSubject.next('IDLE');
    this.callStatusSubject.next('Audio call đã ngắt kết nối');
    if (clearDeviceId) {
      this.activeDeviceId = '';
    }
  }

  async startCall(): Promise<void> {
    if (this.startCallInFlight) {
      this.log('startCall() ignored because a start request is already in flight');
      return;
    }

    const currentCallState = this.callStateSubject.value;
    if (currentCallState === 'CALLING' || currentCallState === 'IN_CALL') {
      this.log('startCall() ignored because call is already active', { currentCallState });
      return;
    }

    if (!this.activeDeviceId || this.signalingSocket?.readyState !== WebSocket.OPEN) {
      this.log('startCall() blocked', {
        activeDeviceId: this.activeDeviceId,
        readyState: this.signalingSocket?.readyState
      });
      this.callStateSubject.next('ERROR');
      this.callStatusSubject.next('Signaling audio call chưa sẵn sàng');
      return;
    }

    this.startCallInFlight = true;

    try {
      this.log('startCall() sending CALL_REQUEST', { deviceId: this.activeDeviceId });
      this.callStateSubject.next('WAITING_ACCEPT');
      this.callStatusSubject.next(`Đang chờ ${this.activeDeviceId} chấp nhận cuộc gọi`);
      this.sendSignal({
        type: 'CALL_REQUEST',
        deviceId: this.activeDeviceId,
        viewerId: this.viewerId,
        viewerName: 'Admin Web',
        targetRole: 'DEVICE'
      });
    } catch (error) {
      this.log('startCall() failed', error);
      this.callStateSubject.next('ERROR');
      this.callStatusSubject.next('Không thể bắt đầu audio call');
      throw error;
    } finally {
      this.startCallInFlight = false;
    }
  }

  endCall(notifyRemote = true): void {
    this.log('endCall()', { notifyRemote, activeDeviceId: this.activeDeviceId });
    if (notifyRemote && this.activeDeviceId && this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.sendSignal({
        type: 'HANGUP',
        deviceId: this.activeDeviceId,
        viewerId: this.viewerId,
        targetRole: 'DEVICE'
      });
    }

    this.cleanupPeerConnection();
    this.callStateSubject.next(this.signalingSocket ? 'READY' : 'IDLE');
    this.callStatusSubject.next(
      this.signalingSocket ? `Audio call sẵn sàng cho ${this.activeDeviceId}` : 'Audio call đã ngắt kết nối'
    );
  }

  private async handleIncomingSignal(payload: string): Promise<void> {
    const message = JSON.parse(payload) as WebRtcSignalMessage;
    this.log('handleIncomingSignal()', {
      type: message.type,
      deviceId: message.deviceId,
      status: message.status,
      errorMessage: message.errorMessage,
      sdpType: message.sdpType,
      hasSdp: Boolean(message.sdp),
      hasCandidate: Boolean(message.candidate)
    });

    switch (message.type) {
      case 'REGISTER_ACK':
        this.callStateSubject.next('READY');
        this.callStatusSubject.next(`Audio call sẵn sàng cho ${message.deviceId ?? this.activeDeviceId}`);
        break;
      case 'ANSWER':
        if (message.sdpType && message.sdp) {
          const peerConnection = await this.ensurePeerConnection();
          await peerConnection.setRemoteDescription({
            type: message.sdpType as RTCSdpType,
            sdp: message.sdp
          });
          this.callStateSubject.next('IN_CALL');
          this.callStatusSubject.next(`Audio call đang hoạt động với ${message.deviceId ?? this.activeDeviceId}`);
        }
        break;
      case 'CALL_ACCEPTED':
        await this.beginOfferFlow();
        break;
      case 'OFFER':
        await this.handleIncomingOffer(message);
        break;
      case 'ICE_CANDIDATE':
        if (message.candidate) {
          const peerConnection = await this.ensurePeerConnection();
          await peerConnection.addIceCandidate({
            candidate: message.candidate,
            sdpMid: message.sdpMid ?? null,
            sdpMLineIndex: message.sdpMLineIndex ?? null
          });
        }
        break;
      case 'CALL_REJECTED':
        this.cleanupPeerConnection();
        this.callStateSubject.next('READY');
        this.callStatusSubject.next(message.errorMessage ?? 'Thiết bị từ chối audio call');
        break;
      case 'HANGUP':
      case 'DEVICE_OFFLINE':
        this.cleanupPeerConnection();
        this.callStateSubject.next('READY');
        this.callStatusSubject.next(
          message.type === 'DEVICE_OFFLINE'
            ? `Thiết bị ${message.deviceId ?? this.activeDeviceId} đã offline`
            : 'Đầu bên kia đã kết thúc audio call'
        );
        break;
      case 'ERROR':
        this.callStateSubject.next('ERROR');
        this.callStatusSubject.next(message.errorMessage ?? 'Audio call signaling gặp lỗi');
        break;
      default:
        break;
    }
  }

  private async beginOfferFlow(): Promise<void> {
    this.callStateSubject.next('CALLING');
    this.callStatusSubject.next(`Thiết bị ${this.activeDeviceId} đã chấp nhận, đang thiết lập cuộc gọi`);

    const peerConnection = await this.ensurePeerConnection();
    this.log('beginOfferFlow() peerConnection ready', {
      signalingState: peerConnection.signalingState,
      connectionState: peerConnection.connectionState
    });

    if (peerConnection.signalingState !== 'stable') {
      this.log('beginOfferFlow() aborted because peer signaling state is not stable', {
        signalingState: peerConnection.signalingState
      });
      this.callStateSubject.next('ERROR');
      this.callStatusSubject.next('Không thể bắt đầu cuộc gọi do trạng thái phiên không hợp lệ');
      return;
    }

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true
    });
    this.log('beginOfferFlow() offer created', { type: offer.type, sdpLength: offer.sdp?.length ?? 0 });
    await peerConnection.setLocalDescription(offer);
    this.log('beginOfferFlow() local description set', { type: offer.type });

    this.sendSignal({
      type: 'OFFER',
      deviceId: this.activeDeviceId,
      viewerId: this.viewerId,
      viewerName: 'Admin Web',
      targetRole: 'DEVICE',
      sdpType: offer.type,
      sdp: offer.sdp ?? ''
    });
  }

  private async handleIncomingOffer(message: WebRtcSignalMessage): Promise<void> {
    if (!message.sdpType || !message.sdp) {
      this.log('handleIncomingOffer() ignored due to missing SDP');
      return;
    }

    this.log('handleIncomingOffer() begin', { sdpType: message.sdpType, sdpLength: message.sdp.length });
    const peerConnection = await this.ensurePeerConnection();
    await peerConnection.setRemoteDescription({
      type: message.sdpType as RTCSdpType,
      sdp: message.sdp
    });

    const answer = await peerConnection.createAnswer();
    this.log('handleIncomingOffer() answer created', { type: answer.type, sdpLength: answer.sdp?.length ?? 0 });
    await peerConnection.setLocalDescription(answer);
    this.log('handleIncomingOffer() local answer set', { type: answer.type });
    this.sendSignal({
      type: 'ANSWER',
      deviceId: this.activeDeviceId,
      viewerId: this.viewerId,
      targetRole: 'DEVICE',
      sdpType: answer.type,
      sdp: answer.sdp ?? ''
    });
    this.callStateSubject.next('IN_CALL');
    this.callStatusSubject.next(`Audio call đang hoạt động với ${message.deviceId ?? this.activeDeviceId}`);
  }

  private async ensurePeerConnection(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      this.log('ensurePeerConnection() reuse existing peer');
      return this.peerConnection;
    }

    this.log('ensurePeerConnection() creating new peer');
    const peerConnection = new RTCPeerConnection({
      iceServers: []
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        this.log('onicecandidate: completed gathering');
        return;
      }

      this.log('onicecandidate', {
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex
      });
      this.sendSignal({
        type: 'ICE_CANDIDATE',
        deviceId: this.activeDeviceId,
        viewerId: this.viewerId,
        targetRole: 'DEVICE',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? undefined,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined
      });
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.log('ontrack', { trackCount: stream.getTracks().length });
        this.remoteStreamSubject.next(stream);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      this.log('onconnectionstatechange', { state: peerConnection.connectionState });
      if (peerConnection.connectionState === 'connected') {
        this.callStateSubject.next('IN_CALL');
        this.callStatusSubject.next(`Audio call đang hoạt động với ${this.activeDeviceId}`);
      }

      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        this.callStateSubject.next('ERROR');
        this.callStatusSubject.next('Audio call bị gián đoạn');
      }
    };

    this.log('ensurePeerConnection() requesting microphone');
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    this.log('ensurePeerConnection() microphone granted', {
      trackCount: this.localStream.getTracks().length
    });

    this.localStream.getTracks().forEach((track) => {
      this.log('ensurePeerConnection() addTrack', { kind: track.kind, id: track.id });
      peerConnection.addTrack(track, this.localStream!);
    });

    this.peerConnection = peerConnection;
    return peerConnection;
  }

  private cleanupPeerConnection(): void {
    this.log('cleanupPeerConnection()');
    this.peerConnection?.close();
    this.peerConnection = null;
    this.remoteStreamSubject.next(null);
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.shouldReconnect || !this.activeDeviceId) {
        return;
      }
      this.connect(this.activeDeviceId);
    }, 2_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendSignal(message: WebRtcSignalMessage): void {
    if (!this.signalingSocket || this.signalingSocket.readyState !== WebSocket.OPEN) {
      this.log('sendSignal() skipped because socket is not open', {
        type: message.type,
        readyState: this.signalingSocket?.readyState
      });
      return;
    }

    this.log('sendSignal()', {
      type: message.type,
      deviceId: message.deviceId,
      targetRole: message.targetRole,
      sdpType: message.sdpType,
      hasSdp: Boolean(message.sdp),
      hasCandidate: Boolean(message.candidate)
    });
    this.signalingSocket.send(JSON.stringify(message));
  }

  private buildWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    return `${protocol}//${host}:8080/ws/webrtc`;
  }

  private log(message: string, data?: unknown): void {
    if (data === undefined) {
      console.info(`[WebRtcAudioCall] ${message}`);
      return;
    }

    console.info(`[WebRtcAudioCall] ${message}`, data);
  }
}
