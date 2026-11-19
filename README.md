# 🌟 Dungle AI — website AI của Dũng Lê

Website AI chat riêng của **Dũng Lê**, thiết kế theo phong cách chat.z.ai: trợ lý tên **Dungle AI** với **bộ não phân tích** câu hỏi trước khi trả lời, 3 chế độ **GLM-4.6 / Flash / Agent**, và khi được hỏi "ai tạo ra bạn?" luôn trả lời là **Dũng Lê**.

- Giao diện **gradient đen–trắng** giản dị (Onyx), đổi được 6 giao diện
- **Đăng ký trực tiếp** hoặc **đăng nhập Google** mới được dùng
- Người dùng mới được **miễn phí 3 lượt**; admin **dungledev** dùng **vô hạn** và có trang quản trị
- Avatar anime nam đen trắng riêng cho AI và ngẫu nhiên cho từng người dùng

## ✨ Chức năng

| Chức năng | Cách dùng |
|---|---|
| 💬 Chat stream + bộ não phân tích | Bật nút "Bộ não" — AI hiện quá trình đọc → phân tích → trả lời |
| ⚡ 3 chế độ | Chọn ở góc trên: **GLM-4.6** (đầy đủ), **Flash** (siêu nhanh), **Agent** (tự tra web, tổng hợp có nguồn) |
| 📎 Gửi file / ảnh | Nút giấy kẹp, kéo–thả, hoặc Ctrl+V |
| 👁️ Đọc/hiểu ảnh (vision) | Đính kèm ảnh kèm câu hỏi |
| 📄 Đọc file text, code, CSV… | Tối đa 200k ký tự/file |
| 🎨 Vẽ ảnh AI | Nút hình ảnh → mô tả → chọn khung |
| 🌐 Tìm kiếm web (kèm nguồn) | Nút quả cầu; Agent tự tìm |
| 🎤 Giọng nói → chữ, 🔊 đọc to | Nút mic / nút Nghe dưới mỗi câu trả lời |
| 👥 Tài khoản & lượt dùng | Đăng ký trực tiếp hoặc Google; miễn phí 3 lượt |
| 🛡️ Trang quản trị admin | Danh sách user, đặt giới hạn/vô hạn, reset lượt, xoá |
| 🎨 6 giao diện | Nút bảng màu góc trên phải |
| 💾 Lịch sử chat trên máy | Sidebar + xuất file .md |

## 🚀 Chạy trên máy

```bash
cd dungle-ai
npm install
node server.js
# mở http://localhost:3000
```

Server đọc file `.z-ai-config` (JSON có `baseUrl` + `apiKey`) ở: thư mục project → `~/.z-ai-config` → `/etc/.z-ai-config`, hoặc từ biến môi trường `ZAI_CONFIG_JSON`.

### Tài khoản

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Admin | `dungledev` / `dunglengaongo` | Dùng vô hạn, token vô hạn, quản trị user |
| User mới | Tự đăng ký trên web | Miễn phí 3 lượt; admin cấp thêm được |

Mật khẩu được băm scrypt lưu trong `users.json` (tự tạo lần đầu chạy; nên thêm vào `.gitignore`).

### Phiên đăng nhập ổn định (đã fix lỗi "tự đăng xuất khi chat")

- Secret ký cookie phiên là **hằng số ổn định** (không nằm trong `users.json`) → server restart, mất file hay deploy lại thì **không ai bị đăng xuất**.
- Mỗi tài khoản có **id cố định theo tên đăng nhập** → admin luôn giữ phiên; người dùng nếu bị mất tài khoản (vd Render free xoá dữ liệu), **đăng ký lại đúng tên cũ là cookie cũ tự sống lại**, không cần làm gì thêm.
- `users.json` được ghi nguyên tử kèm bản backup `users.json.bak` — file hỏng giữa chừng cũng tự phục hồi từ backup.
- Lỗi mạng thoáng qua (server đang khởi động lại…) **không** làm trang văng về màn hình đăng nhập; chỉ khi hết phiên thật sự thì hiện khung đăng nhập lại thân thiện ngay trên giao diện chat.
- Muốn tự ép mọi phiên hết hạn (vd nghi lộ cookie): đặt biến môi trường `SESSION_SECRET` mới cho server.

### Bật đăng nhập Google (tuỳ chọn)

1. Tạo OAuth client trên Google Cloud Console (Web application).
2. Authorized redirect URI: `https://your-domain.onrender.com/auth/google/callback` (và `http://localhost:3000/auth/google/callback` để test).
3. Đặt biến môi trường cho server: `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`.
4. Nút "Tiếp tục với Google" trên web sẽ hoạt động; chưa cấu hình thì web vẫn dùng đăng ký trực tiếp bình thường.

## ☁️ Deploy lên Render

1. Đẩy thư mục `dungle-ai/` lên repo GitHub (riêng tư; không commit `.z-ai-config` thật).
2. Render → **Web Service**: Runtime Node, Build = `npm install`, Start = `node server.js`.
3. Environment: thêm `ZAI_CONFIG_JSON` (JSON cấu hình API), và nếu cần `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. Mở URL — trang giới thiệu hiện ra, đăng ký là dùng ngay.

> Lưu ý Render gói free: khi service "ngủ" rồi dậy, dữ liệu file bị xoá (đặc tính nền tảng). Tài khoản sẽ cần đăng ký lại (đúng tên cũ là cookie cũ tự khớp), còn admin thì không bao giờ mất phiên. Muốn giữ dữ liệu vĩnh viễn: dùng Render Disk (trả phí) hoặc host ở nơi có disk bền vững.

## 📁 File

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ frontend (landing, auth, chat, admin) — 1 file, không build |
| `server.js` | Server Node: auth, quota, admin, gọi API chat/vision/vẽ ảnh/tìm web/TTS/ASR |
| `avatars/` | Avatar anime đen trắng: `ai.jpg` (của AI) + `u1..u8.jpg` (random cho user) |
| `users.json` | CSDL người dùng (tự tạo khi chạy) |
| `package.json` | Khai báo phụ thuộc `z-ai-web-dev-sdk` |

## ❓ Lưu ý

- PDF/DOCX chưa đọc trực tiếp — dùng ảnh hoặc file text/code.
- Lịch sử chat nằm trong trình duyệt (localStorage), server không lưu nội dung chat.
- Hỏi Dungle AI "bạn là ai / ai tạo ra bạn" → trả lời ngẫu nhiên vui tươi, luôn nhắc tên **Dũng Lê**.
