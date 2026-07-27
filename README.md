# FB Crawler Control Center

Project web UI mới, tách riêng khỏi repo cũ.

## Chạy local

```bash
npm run dev
```

Sau đó mở `http://localhost:4173`.
Khi frontend start bằng lệnh này, local backend crawler cũng sẽ được auto-start cùng lúc ở port `8787` mặc định.

## Bật/tắt crawler server ngay trong web app

- Mở màn `Kiểm tra server`.
- Nút `Bật server` và `Tắt server` sẽ điều khiển local backend process của chính dự án này.
- Cách này chỉ hoạt động khi web app được chạy bằng `npm run dev` hoặc `npm run dev:web`, vì static server của dự án có kèm local controller.
- Nếu cần tắt auto-start backend, chạy với env `FB_CRAWLER_AUTO_START_BACKEND=0`.

## Chạy backend thủ công nếu cần

Nếu muốn mở backend HTTP riêng bằng terminal:

```bash
npm run dev:server
```

## Ghi chú

- UI dùng HTTP/SSE adapter trong `ui/backend-api.jsx`.
- Cấu hình crawler được đồng bộ riêng tại `data/crawler-config.json` và sẽ được backend đọc lại khi bấm `Bắt đầu`.
- Khi backend server chưa chạy, app vẫn render bằng mock/preview data từ `ui/data.jsx` và `ui/real-data-adapter.jsx`.
- Repo cũ chỉ được dùng làm nguồn tham chiếu hành vi, không còn là nơi sửa UI mới.
