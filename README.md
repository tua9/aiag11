# AIAG11 Demo

Ứng dụng quản lý đơn hàng, hàng hoàn trả và tạo đơn khiếu nại PDF. Backend dùng Express/MongoDB; frontend dùng React/Vite.

## Yêu cầu

- Node.js 22 trở lên
- MongoDB đang chạy hoặc MongoDB Atlas
- Ollama và model `gemma4:e2b` để dùng chat/agent
- FFmpeg (`ffmpeg` và `ffprobe`) có trong `PATH` để so sánh video
- Cloudinary nếu cần upload video

## Chạy ứng dụng

### 1. Cấu hình backend

Mở Terminal 1:

```bash
cd aiag11-demo
npm install
```

Tạo file `aiag11-demo/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/aiag11
PORT=8888
OLLAMA_MODEL=gemma4:e2b
PUBLIC_API_URL=http://localhost:8888
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Thay `MONGODB_URI` bằng URI MongoDB của bạn. Chỉ cần `CLOUDINARY_URL` khi sử dụng upload video.

### 2. Chuẩn bị Ollama

Cài và khởi động Ollama, sau đó tải model:

```bash
ollama pull gemma4:e2b
```

Nếu Ollama chưa tự chạy nền, mở Terminal riêng và chạy `ollama serve`.

### 3. Khởi động backend

Trong Terminal 1:

```bash
npm run dev
```

Backend chạy ở `http://localhost:8888`. MongoDB phải kết nối được trước khi server khởi động.

### 4. Khởi động frontend

Mở Terminal 2:

```bash
cd aiag11-demo-fe
npm install
npm run dev
```

Mở URL Vite hiển thị trong Terminal, thường là `http://localhost:5173`.

## Các trang chính

- `/`: upload video hàng hoàn trả và chat với agent.
- `/orders`: xem danh sách đơn hàng.
- `/returns`: xem danh sách hàng hoàn trả.

## Tools của agent

- `get_orders`: tra cứu đơn hàng theo serial; bỏ serial để lấy tối đa 20 đơn mới nhất.
- `get_return_orders`: tra cứu hàng hoàn trả theo serial; bỏ serial để lấy tối đa 20 lượt mới nhất.
- `create_seller_complaint_pdf`: tạo PDF từ `serial` và `issueDescription`. Có thể yêu cầu trong chat, ví dụ: `Tạo đơn khiếu nại cho serial GYWV6VTK vì hàng hoàn bị thiếu phụ kiện`. Tool trả link tải PDF; file được lưu tại `aiag11-demo/assets/generated-complaints/`. Gửi `POST /api/confirmation` cũng tạo PDF và trả `complaintPdf.downloadUrl`.
- `compare_product_video`: so sánh video đóng hàng và mở hàng theo `orderId` và `returnOrderId` (MongoDB `_id`). Kết quả JSON có `status` (`MATCH`, `MISMATCH`, `NEEDS_REVIEW`), giải thích, metric OpenCV và frame chứng cứ dạng data URL. Chỉ chấp nhận video HTTPS từ `res.cloudinary.com`, tối đa 100 MB và 5 phút mỗi video.

Nếu không truyền serial, PDF dùng dữ liệu mô phỏng và đánh dấu `[MOCK]`. Nếu tìm thấy return-order tương ứng, khi tạo PDF thành công, trạng thái của lượt hoàn được chuyển thành `rejected`. Kiểm tra các trường `[MOCK]` và thay bằng dữ liệu thật trước khi gửi đơn.

## Ghi chú

- Frontend hiện gọi API tại `http://localhost:8888/api`; nếu đổi `PORT`, cập nhật URL này trong `aiag11-demo-fe/src/api.ts`.
- PDF cần font hỗ trợ tiếng Việt. Service tự tìm font hệ thống phổ biến; nếu không tìm thấy, cấu hình `PDF_REGULAR_FONT_PATH` và `PDF_BOLD_FONT_PATH` trong `.env`.
- Không commit file `.env` hoặc thông tin kết nối thật.
