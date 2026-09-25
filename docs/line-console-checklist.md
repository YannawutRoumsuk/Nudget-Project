# เช็กลิสต์ LINE Console สำหรับ Nudget

ชื่อ Channel, LIFF app และรูป Rich Menu จัดการผ่าน LINE Developers Console; สคริปต์ใน repo จัดการได้เฉพาะ Rich Menu API ที่ชื่อ `Nudget 8-button menu` และไม่สามารถเปลี่ยนชื่อ Channel ให้ได้

## ตรวจหรือเปลี่ยนชื่อที่ผู้ใช้เห็น

1. เปิด [LINE Developers Console](https://developers.line.biz/console/) แล้วเลือก Provider และ Channel ที่ Nudget ใช้
2. ใน Channel ประเภท LINE Login ตรวจชื่อ Channel และหน้าความยินยอม (consent); เปลี่ยนชื่อแสดงผลเป็น `Nudget` ถ้ายังเป็นชื่อเดิม
3. ใน LINE Login ตรวจ LIFF app ว่ายังชี้ไป `https://nudget-production.up.railway.app/` และเปิด scope ที่แอปต้องใช้
4. ใน Messaging API ตรวจชื่อและรูปของ LINE Official Account ผ่าน LINE Official Account Manager; ชื่อ Official Account เปลี่ยนที่หน้า manager ไม่ใช่ rich menu API
5. ถ้าอัปโหลดภาพ Rich Menu จาก Console ให้ตรวจพิกัด action ทั้ง 8 ช่องเทียบกับ [ผัง Rich Menu](rich-menu-nano-banana.md); วิธีนี้ไม่เรียก setup script

## Rich Menu ผ่าน API

1. ตั้ง `LINE_CHANNEL_ACCESS_TOKEN`, `PUBLIC_BASE_URL` และ `RICH_MENU_IMAGE` ใน environment ที่ตั้งใจใช้
2. รัน `bun run line:rich-menu -- --setup --dry-run` และตรวจว่าเป้าหมายกับเมนูซ้ำถูกต้อง
3. รัน `bun run line:rich-menu -- --setup`; คำสั่งนี้อัปเดต/สร้างเมนู Nudget, ตั้งเป็น default แล้วลบเฉพาะเมนูชื่อ `Nudget 8-button menu` ที่ซ้ำกัน
4. เปิดแชท OA บนมือถือ ทดสอบครบทั้ง 8 action; เมนูอื่นที่ตั้งชื่อเองต้องยังอยู่

## ย้อนกลับ

- ก่อน setup จด Rich Menu ID และถ่ายภาพเมนูเดิมไว้ใน LINE Console; API ไม่มีปุ่มย้อนรุ่นของภาพอัตโนมัติ
- ถ้าต้องคืนภาพเดิม ให้อัปโหลดภาพสำรองกับ action เดิมเป็น Rich Menu ใหม่ผ่าน Console แล้วตั้งอันนั้นเป็น default
- อย่าลบเมนูอื่นจาก Console เว้นแต่ตรวจชื่อและ ID แล้วว่าเป็นเมนูที่ต้องการลบ
