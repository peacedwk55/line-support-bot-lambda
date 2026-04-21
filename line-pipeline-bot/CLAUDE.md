# line-pipeline-bot — Pipeline Bot

## โปรเจคนี้คืออะไร
LINE Chatbot สำหรับช่วยตอบคำถามด้าน DevOps / CI/CD / Pipeline

## Stack
- **Runtime:** Node.js (ES Module)
- **Framework:** Express
- **AI:** Groq API (fallback หลาย model อัตโนมัติ)
- **Vision:** Groq Vision (meta-llama/llama-4-scout-17b-16e-instruct)
- **Tunnel:** cloudflared (local dev)
- **Port:** 3002

## โครงสร้างไฟล์
- `index.js` — server หลัก, webhook handler, รองรับรูปภาพ
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
npm install
node index.js
# เปิดอีก terminal
./cloudflared.exe tunnel --url http://localhost:3002
```
เอา URL จาก cloudflared ไปใส่ใน LINE Developers Console → Webhook URL → `/webhook`

## การแก้ไข bot
- เปลี่ยนบทบาท/ข้อมูล → แก้ที่ `prompt.js` อย่างเดียว
- เพิ่ม/ลด model → แก้ array `MODELS` ใน `index.js`
- ประวัติสนทนาเก็บ in-memory (หายเมื่อ restart server)
