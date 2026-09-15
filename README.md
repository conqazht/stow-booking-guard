# STOW Booking Policy Guard

> Bộ kiểm soát tiền xử lý (pre-flight guard) và bộ đánh giá tự động (evaluation suite) đảm bảo tuân thủ nghiêm ngặt chính sách đặt lịch kho và quy trình tư vấn bảo hiểm cho trợ lý AI.

---

## 📌 Vấn đề thực tế (Problem Statement)

Khi trợ lý AI xử lý các luồng đặt kho trực tiếp với khách hàng, các ràng buộc chỉ dựa vào câu lệnh (prompt) rất dễ bị bỏ sót trong các trường hợp biên.

**Ví dụ thực tế khi khách yêu cầu:** *"Mình muốn dọn vào lúc 21:00 Chủ Nhật ngày 20/09/2026"*:
* **Kỳ vọng chuẩn:** Quy tắc ưu tiên số 1 (Chủ Nhật là ngày nghỉ) phải lập tức **CHẶN (BLOCK)** việc xác nhận lịch và chuyển CSKH gọi lại vào thứ Hai; đồng thời Quy tắc số 2 cảnh báo có **phụ phí ngoài giờ** (sau 18:00).
* **Lỗi thực tế của bot:** Mô hình LLM chỉ bắt mỗi quy tắc có độ ưu tiên thấp hơn (đặt trước > 3 ngày), nhưng lại "ngây thơ" xác nhận luôn thời gian *"21:00 Chủ Nhật, ngày 20/09/2026"* và bỏ quên hoàn toàn bước bắt buộc tư vấn gói bảo hiểm.

---

## 🏗️ Kiến trúc giải pháp (Solution Architecture)

Dự án triển khai một lớp bảo vệ tiền xử lý (pre-flight guard) bằng mã nguồn tất định (deterministic code), kiểm tra dữ liệu trước khi bot kịp gọi hàm chốt đơn:

| Thứ tự ưu tiên | Quy tắc kiểm tra | Mức độ | Hành vi xử lý của hệ thống |
|:---:|---|:---:|---|
| **1 (Cao nhất)** | Ngày nghỉ (Chủ Nhật / Ngày lễ) | **`BLOCK`** | Cấm xác nhận ngày giờ; tạo lịch hẹn CSKH gọi lại vào ngày làm việc tiếp theo |
| **2** | Ngoài giờ làm việc (trước 09:00 hoặc từ 18:00) | **`WARN`** | Cảnh báo có phụ phí ngoài giờ; CSKH sẽ xác nhận khung giờ chính xác |
| **3** | Kho tự quản đặt trước > 3 ngày | **`DEFER`** | Tạm hoãn cấp link thanh toán tự động; chuyển bộ phận Sales kiểm tra phòng trống |
| **4** | Lịch hẹn hoàn toàn hợp lệ | **`OK`** | Cho phép tiếp tục luồng tạo đơn và cấp link thanh toán tự động |

Bên cạnh đó, **Protection Plan Guard** sẽ chặn quy trình chốt đơn cho tới khi khách hàng đã được hỏi và chọn gói bảo hiểm (Basic, Silver, Gold, Platinum).

### Đảm bảo chuẩn xác múi giờ Việt Nam (UTC+7)

Toàn bộ các phép tính ngày, thứ trong tuần và giờ giấc đều sử dụng phép toán cộng offset cố định `+07:00` (`Asia/Ho_Chi_Minh`). Điều này giúp hệ thống hoạt động chính xác 100% trên các môi trường đám mây (như Vercel, AWS Lambda) vốn chạy mặc định ở múi giờ UTC, tránh hoàn toàn lỗi bị nhảy lệch ngày trong tuần.

---

## 🚀 Hướng dẫn chạy nhanh (Quick Start)

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chạy 11 bài kiểm thử tự động (Evaluation Suite)
```bash
npm test
```

### 3. Mở giao diện so sánh trực quan
```bash
npx serve web
# Mở trình duyệt và truy cập: http://localhost:3000
```

---

## 📁 Cấu trúc thư mục (Project Structure)

```
src/
  ├── types.ts              # Định nghĩa kiểu dữ liệu, vi phạm chính sách & các mức độ
  ├── schedule-guard.ts     # Logic kiểm tra lịch theo 4 cấp bậc ưu tiên (chuẩn UTC+7)
  ├── protection-guard.ts   # Bộ lọc bắt buộc tư vấn gói bảo hiểm trước khi chốt đơn
  └── format-response.ts    # Tổng hợp kết quả đánh giá & sinh thông điệp phản hồi cho khách
tests/
  └── eval-suite.test.ts    # 11 kịch bản kiểm thử tự động (sử dụng Vitest)
web/
  └── index.html            # Giao diện Web demo so sánh trực quan đối đầu (Side-by-side)
```

---

## 📊 Bảng tóm tắt kết quả kiểm thử (Evaluation Suite Summary)

| # | Kịch bản kiểm thử | Kết quả | Hành vi của hệ thống bảo vệ |
|:---:|---|:---:|---|
| **1** | 21:00 Chủ Nhật 20/09 — Kho tự quản | `BLOCK` | Chặn hẹn lịch Chủ Nhật; hẹn CSKH gọi lại vào thứ Hai |
| **2** | 10:00 Thứ Tư 17/09 — Kho tự quản | `OK` | Giờ hành chính trong vòng 3 ngày; hợp lệ |
| **3** | 20:00 Thứ Ba 16/09 — Kho tự quản | `WARN` | Cảnh báo phát sinh phụ phí ngoài giờ (sau 18h) |
| **4** | 10:00 Thứ Bảy 26/09 — Kho tự quản | `DEFER` | Tạm hoãn link thanh toán tự động (>3 ngày); chuyển Sales |
| **5** | 10:00 Thứ Bảy 26/09 — Kho trọn gói (Valet) | `OK` | Kho trọn gói được miễn áp dụng luật 3 ngày; hợp lệ |
| **6** | 10:00 Ngày Quốc Khánh 02/09 | `BLOCK` | Nhận diện đúng ngày nghỉ lễ lớn; chặn xác nhận lịch |
| **7** | Gói bảo hiểm = `null` (chưa hỏi) | `GATE` | Chặn gọi hàm chốt đơn; yêu cầu bot hỏi khách chọn gói bảo hiểm |
| **8** | Khách chọn gói bảo hiểm `BASIC` | `OK` | Đã chọn gói bảo hiểm; cho phép tiếp tục |
| **9** | Khách chọn gói bảo hiểm `GOLD` | `OK` | Đã chọn gói bảo hiểm; cho phép tiếp tục |
| **10** | Chủ Nhật 21:00 + Chưa chọn bảo hiểm | `BLOCK` | Bắt cùng lúc nhiều vi phạm theo đúng thứ tự ưu tiên |
| **11** | 10:00 Thứ Tư + Đã chọn bảo hiểm (Happy Path) | `READY` | Vượt qua tất cả kiểm tra; sẵn sàng cấp link thanh toán an toàn |
