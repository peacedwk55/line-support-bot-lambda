# line-gemini-bot — App Support Bot (CDSCOM)

## โปรเจคนี้คืออะไร
LINE Chatbot สำหรับทีม Application Support บริษัท CDSCOM
ช่วยตอบปัญหาการใช้งานระบบ Express เบื้องต้นแทนการโทร
รองรับทั้งแชทส่วนตัวและกลุ่ม LINE (ตอบทุกข้อความโดยไม่ต้อง mention)

## Stack
- **Runtime:** Node.js (ES Module)
- **Framework:** Express
- **AI:** Groq API (fallback หลาย model อัตโนมัติ)
- **Vision:** Groq Vision (meta-llama/llama-4-scout-17b-16e-instruct) รองรับรับรูปภาพ
- **Tunnel:** cloudflared (local dev)
- **Port:** 3000

## โครงสร้างไฟล์
- `index.js` — server หลัก, webhook handler, logic จำประวัติสนทนา, รองรับรูปภาพ
- `prompt.js` — system prompt ของ bot (แก้บทบาท/ข้อมูลที่นี่)
- `.env` — API keys (ห้าม commit)

## Environment Variables (.env)
```
GROQ_API_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

## วิธีรัน
```bash
node index.js
# เปิดอีก terminal
./cloudflared.exe tunnel --url http://localhost:3000
```
เอา URL จาก cloudflared ไปใส่ใน LINE Developers Console → Webhook URL → `/webhook`

## AI Models (fallback ตามลำดับ)
1. llama-3.3-70b-versatile
2. llama-3.1-8b-instant
3. gemma2-9b-it

Vision model (รูปภาพ):
- meta-llama/llama-4-scout-17b-16e-instruct

## Groq Rate Limits (Free Tier)
- ~30 RPM, ~6,000 TPM, ~14,400 RPD ต่อ API Key
- ถ้าหมด RPM รอ 1 นาที, ถ้าหมด RPD รอถึง 07:00 น. (เที่ยงคืน UTC)
- ดู usage: console.groq.com

## การแก้ไข bot
- เปลี่ยนบทบาท/ข้อมูล → แก้ที่ `prompt.js` อย่างเดียว
- เพิ่ม/ลด model → แก้ array `MODELS` ใน `index.js`
- ประวัติสนทนาเก็บ in-memory (หายเมื่อ restart server)
- bot ใช้คำลงท้าย "ค่ะ" เท่านั้น (กำหนดใน prompt.js)

## การใช้งานในกลุ่ม LINE
- ตอบทุกข้อความในกลุ่มโดยไม่ต้อง mention ชื่อ bot
- รองรับ group, room, และแชทส่วนตัว
- history แยกตาม userId/groupId/roomId

## LINE OA
- Account: Demo-Bot (@216fdhso)
- ดูแลโดยทีม App Support CDSCOM
- ติดต่อ escalate: พีส 092-962-2541
