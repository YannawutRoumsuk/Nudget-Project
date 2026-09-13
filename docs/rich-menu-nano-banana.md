# Nudget Rich Menu — Nano Banana handoff

สร้างภาพขนาด **2500 × 1686 px** เป็นตาราง 4 คอลัมน์ × 2 แถว แต่ละช่องกว้าง 625 px สูง 843 px ห้ามย้ายเส้นแบ่ง เพราะ action ของ LINE ใช้พิกัดนี้ตรง ๆ

| ตำแหน่ง | พิกัด `(x, y, w, h)` | ข้อความบนภาพ | Action |
|---|---:|---|---|
| บน 1 | `0, 0, 625, 843` | ภาพรวม | `https://nudget-production.up.railway.app/` |
| บน 2 | `625, 0, 625, 843` | รายการ | `https://nudget-production.up.railway.app/transactions` |
| บน 3 | `1250, 0, 625, 843` | วิเคราะห์ | `https://nudget-production.up.railway.app/insights` |
| บน 4 | `1875, 0, 625, 843` | บิล | `https://nudget-production.up.railway.app/bills` |
| ล่าง 1 | `0, 843, 625, 843` | แผนเดือน | `https://nudget-production.up.railway.app/plan` |
| ล่าง 2 | `625, 843, 625, 843` | สรุปเดือนนี้ | ส่งข้อความ `เดือนนี้` |
| ล่าง 3 | `1250, 843, 625, 843` | ฟีดแบ็ก | `https://nudget-production.up.railway.app/feedback` |
| ล่าง 4 | `1875, 843, 625, 843` | วิธีใช้ | ส่งข้อความ `วิธีใช้` |

## Prompt สำหรับ Nano Banana

> Create a polished LINE rich menu for a Thai personal finance assistant named Nudget. Exact canvas 2500x1686 pixels, exact 4-column by 2-row grid, each tile 625x843 pixels. Warm ivory paper background, dark brown ink, indigo accent, subtle ledger-line texture, clean premium minimal style, large friendly finance icons centered in every tile. Keep all icons and decoration at least 80 pixels away from every tile boundary. Tiles in order left to right: dashboard chart, transaction list, analytics trend, bill receipt; calendar plan, monthly summary chart, feedback chat bubble, help question bubble. Keep the bottom 150 pixels of every tile visually quiet for Thai labels that will be overlaid later. No text, no letters, no numbers, no logo, no watermark. Boundaries must remain perfectly aligned at x=625, 1250, 1875 and y=843.

เพื่อไม่ให้ภาษาไทยสะกดผิด ให้ Nano Banana สร้างเฉพาะพื้นหลังและไอคอน แล้ววางข้อความ 8 คำตามตารางด้วยเครื่องมือกราฟิกภายหลัง ใช้ `static/line-rich-menu.png` เป็นภาพไกด์พิกัด

ถ้าจะติดตั้งผ่านสคริปต์แทน Console ให้วางไฟล์สุดท้ายไว้ที่ path ใดก็ได้แล้วตั้ง `RICH_MENU_IMAGE` ก่อนรัน `bun run line:rich-menu -- --setup` สคริปต์จะใช้ action จากตารางเดียวกับภาพ
