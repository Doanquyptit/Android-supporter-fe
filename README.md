# Monitor IHUB Frontend

Frontend Angular cho 2 nhóm chức năng:

- Monitor thiết bị IHUB: danh sách thiết bị, chi tiết thiết bị, lịch sử `ON/OFF`
- Remote control PoC: xem màn hình Android và điều khiển từ web

## Chạy local

```bash
npm install
npm start
```

Frontend mặc định chạy tại:

```text
http://localhost:4200
```

## Các màn chính

- Monitor thiết bị: `http://localhost:4200/devices`
- Remote control: `http://localhost:4200/remote-control`

## Build

```bash
npm run build
```

## Tài liệu liên quan

- Runbook PoC remote control:
  [remote-control-phase0-runbook.md](/Users/quydl/Project/Code/Git/Angular/Monitor_IHUB_BE/docs/remote-control-phase0-runbook.md)
- Spec PoC remote control:
  [remote-android-control-phase0-v2.md](/Users/quydl/Project/Code/Git/Angular/Monitor_IHUB_BE/docs/remote-android-control-phase0-v2.md)

## Ghi chú

- Remote control PoC hiện dùng WebSocket + JPEG base64
- Android Agent là project riêng nằm cạnh frontend/backend:
  `/Users/quydl/Project/Code/Git/Angular/Monitor_IHUB_AndroidAgent`
- Backend mặc định chạy ở `http://localhost:8080`
# Android-supporter-fe
