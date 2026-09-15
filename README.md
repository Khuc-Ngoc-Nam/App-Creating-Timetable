# TKB Tiểu học

Ứng dụng desktop hỗ trợ xây dựng thời khóa biểu tiểu học bằng React, Electron và FET 7.9.4.

## Chức năng chính

- Khai báo trường/điểm trường, lớp, môn học và giáo viên.
- Khai báo phân công chuyên môn (PCCM) theo lớp và giáo viên.
- Thiết lập ràng buộc thời gian, tiết ưu tiên, giáo viên bận và số buổi đi dạy.
- Sinh file dữ liệu `.fet` tương thích với FET.
- Chạy `fet-cl.exe` để tự động xếp thời khóa biểu.
- Xem thời khóa biểu theo lớp hoặc giáo viên.
- Lưu/mở dữ liệu dự án JSON.
- Xuất thời khóa biểu ra Excel hoặc ảnh PNG.
- Xem thống kê số tiết theo giáo viên và theo lớp.

## Yêu cầu

- Windows 10/11 khi chạy bản desktop.
- Node.js và npm để phát triển hoặc tự build.
- `fet-cl.exe` (bản runtime FET được đặt sẵn trong `vendor/fet`).

## Cài đặt và chạy bản phát triển

Mở PowerShell tại thư mục dự án:

```powershell
npm install
npm run desktop
```

Ứng dụng sẽ khởi động Vite và Electron. Nếu ứng dụng không tự tìm thấy FET, vào phần **Dữ liệu**, bấm nút chọn file và trỏ tới `vendor/fet/fet-cl.exe`.

## Quy trình sử dụng

1. Vào tab **Dữ liệu** và khai báo số ngày, số tiết mỗi buổi, trường/điểm trường, lớp, môn và giáo viên.
2. Vào **Các hoạt động** để nhập số tiết/tuần và phân công giáo viên cho từng lớp.
3. Vào **Ràng buộc** để thiết lập các điều kiện cố định hoặc ưu tiên.
4. Kiểm tra **Thống kê** để phát hiện khối lượng tiết chưa hợp lý.
5. Bấm **Lưu** để lưu dự án JSON hoặc **.fet** để xuất dữ liệu cho FET.
6. Bấm **Chạy FET** để sinh thời khóa biểu tự động.
7. Vào tab **Thời khóa biểu** để xem, tải kết quả FET, xuất Excel hoặc xuất PNG.

Nếu dùng FET bên ngoài ứng dụng, hãy tải lại file `*_activities.xml` trong thư mục output của FET từ tab **Thời khóa biểu**.

## Các lệnh npm

```powershell
npm run dev       # Chạy giao diện Vite trên trình duyệt
npm run desktop   # Chạy Vite cùng Electron
npm run typecheck # Kiểm tra TypeScript
npm test          # Chạy test
npm run build     # Kiểm tra và build giao diện production
npm run dist:win  # Đóng gói bộ cài Windows (NSIS và portable)
```

## Cấu trúc thư mục

```text
src/       Giao diện React và logic tạo dữ liệu FET
electron/  Main process, preload và tích hợp FET/Excel
tests/     Unit test
vendor/    Runtime FET và thư viện đi kèm
```

## Lưu ý

- Dữ liệu đang nhập được lưu tự động trong local storage của ứng dụng; nên dùng **Lưu** để tạo bản sao JSON.
- Thời gian chạy FET phụ thuộc kích thước dữ liệu và giới hạn bài toán.
- Khi có lỗi ràng buộc, hãy đọc phần cảnh báo/lỗi ở đầu giao diện trước khi chạy lại.

