import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  RemoteCommandResult,
  RemoteControlService,
  RemoteScreenFrame
} from '../../../core/services/remote-control.service';
import { WebRtcAudioCallService } from '../../../core/services/webrtc-audio-call.service';

type InteractionMode = 'TAP' | 'SWIPE';
type SupportState = 'IDLE' | 'REQUESTED' | 'CONTROL_PENDING' | 'CONTROL_GRANTED';

@Component({
  selector: 'app-remote-control-page',
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  templateUrl: './remote-control-page.component.html',
  styleUrl: './remote-control-page.component.scss'
})
export class RemoteControlPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly remoteControlService = inject(RemoteControlService);
  private readonly webRtcAudioCallService = inject(WebRtcAudioCallService);
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptions = new Subscription();

  @ViewChild('screenCanvas')
  private screenCanvasRef?: ElementRef<HTMLCanvasElement>;

  @ViewChild('remoteAudio')
  private remoteAudioRef?: ElementRef<HTMLAudioElement>;

  deviceId = 'ihub-001';
  interactionMode: InteractionMode = 'TAP';
  swipeDurationMs = 350;
  remoteText = '';
  lastFrameAt: Date | null = null;
  lastResult: RemoteCommandResult | null = null;
  connectionState = 'DISCONNECTED';
  status = 'Chưa kết nối';
  audioSignalingState = 'DISCONNECTED';
  audioCallState = 'IDLE';
  audioCallStatus = 'Chưa kết nối audio call';
  canControl = false;
  supportState: SupportState = 'IDLE';
  hasFrame = false;

  private currentFrame: RemoteScreenFrame | null = null;
  private swipeStart: { x: number; y: number } | null = null;

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => {
        const deviceId = params.get('deviceId')?.trim() ?? '';
        if (!deviceId) {
          return;
        }

        this.deviceId = deviceId;
        this.remoteControlService.acceptSupportRequest(deviceId);
        this.webRtcAudioCallService.connect(deviceId);
      })
    );
  }

  ngAfterViewInit(): void {
    this.subscriptions.add(
      this.remoteControlService.frame$.subscribe((frame) => {
        this.currentFrame = frame;
        this.hasFrame = frame !== null;
        this.lastFrameAt = frame ? new Date(frame.timestamp) : null;
        if (frame) {
          this.drawFrame(frame);
        } else {
          this.clearCanvas();
        }
      })
    );

    this.subscriptions.add(
      this.remoteControlService.results$.subscribe((result) => {
        this.lastResult = result;
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

    this.subscriptions.add(
      this.remoteControlService.canControl$.subscribe((canControl) => {
        this.canControl = canControl;
      })
    );

    this.subscriptions.add(
      this.remoteControlService.supportState$.subscribe((state) => {
        this.supportState = state;
      })
    );

    this.subscriptions.add(
      this.webRtcAudioCallService.signalingState$.subscribe((state) => {
        this.audioSignalingState = state;
      })
    );

    this.subscriptions.add(
      this.webRtcAudioCallService.callState$.subscribe((state) => {
        this.audioCallState = state;
      })
    );

    this.subscriptions.add(
      this.webRtcAudioCallService.callStatus$.subscribe((status) => {
        this.audioCallStatus = status;
      })
    );

    this.subscriptions.add(
      this.webRtcAudioCallService.remoteStream$.subscribe((stream) => {
        const audio = this.remoteAudioRef?.nativeElement;
        if (!audio) {
          return;
        }

        audio.srcObject = stream;
        if (stream) {
          void audio.play().catch(() => undefined);
        }
      })
    );

  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.remoteControlService.disconnect();
  }

  connect(): void {
    this.remoteControlService.connect(this.deviceId);
    this.webRtcAudioCallService.connect(this.deviceId);
  }

  disconnect(): void {
    this.remoteControlService.endSupport();
    window.setTimeout(() => {
      this.remoteControlService.disconnect();
      this.webRtcAudioCallService.disconnect();
    }, 150);
  }

  sendText(): void {
    const text = this.remoteText.trim();
    if (!text || !this.canControl) {
      return;
    }

    this.remoteControlService.sendText(text);
  }

  requestControl(): void {
    if (this.canControl || this.supportState === 'CONTROL_PENDING') {
      return;
    }

    this.remoteControlService.requestControl();
  }

  async startAudioCall(): Promise<void> {
    await this.webRtcAudioCallService.startCall();
  }

  endAudioCall(): void {
    this.webRtcAudioCallService.endCall();
  }

  handleCanvasClick(event: MouseEvent, canControl: boolean): void {
    if (!canControl || this.interactionMode !== 'TAP') {
      return;
    }

    const point = this.translateCoordinates(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    this.remoteControlService.sendTap(point.x, point.y);
  }

  handlePointerDown(event: PointerEvent, canControl: boolean): void {
    if (!canControl || this.interactionMode !== 'SWIPE') {
      return;
    }

    const point = this.translateCoordinates(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    this.swipeStart = point;
  }

  handlePointerUp(event: PointerEvent, canControl: boolean): void {
    if (!canControl || this.interactionMode !== 'SWIPE' || !this.swipeStart) {
      return;
    }

    const point = this.translateCoordinates(event.clientX, event.clientY);
    if (!point) {
      this.swipeStart = null;
      return;
    }

    this.remoteControlService.sendSwipe(
      this.swipeStart.x,
      this.swipeStart.y,
      point.x,
      point.y,
      this.swipeDurationMs
    );
    this.swipeStart = null;
  }

  private translateCoordinates(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.screenCanvasRef?.nativeElement;
    if (!canvas || !this.currentFrame) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const scaleX = this.currentFrame.width / rect.width;
    const scaleY = this.currentFrame.height / rect.height;

    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY)
    };
  }

  private drawFrame(frame: RemoteScreenFrame): void {
    const canvas = this.screenCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      canvas.width = frame.width;
      canvas.height = frame.height;
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(image, 0, 0, frame.width, frame.height);
    };
    image.src = `data:image/jpeg;base64,${frame.imageBase64}`;
  }

  private clearCanvas(): void {
    const canvas = this.screenCanvasRef?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}
