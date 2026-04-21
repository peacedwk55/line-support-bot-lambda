# LINE Pipeline Bot

LINE Chatbot สำหรับ monitor สถานะ Azure DevOps Pipeline แบบ real-time ผ่าน LINE

## Features

- ดูสถานะ build ล่าสุดของโปรเจคจากชื่อที่พิมพ์มา
- ดูสถานะ build ตาม ID ที่ระบุ
- วิเคราะห์สาเหตุที่ build fail จาก log จริง ด้วย AI
- แสดงรายชื่อโปรเจคทั้งหมดใน organization
- Fuzzy search ชื่อโปรเจค พร้อม confirm ก่อนดึงข้อมูล
- รองรับการส่งรูปภาพเพื่อวิเคราะห์ในแง่ DevOps

## Tech Stack

- **Runtime:** Node.js (ES Module)
- **Framework:** Express
- **AI:** Groq API (llama-3.3-70b-versatile)
- **Pipeline API:** Azure DevOps REST API
- **Messaging:** LINE Messaging API
- **Tunnel (dev):** Cloudflare Tunnel

## วิธีใช้งานใน LINE

| พิมพ์ | ผลลัพธ์ |
|---|---|
| `MDHPortalSystem` | ดู build ล่าสุดของโปรเจค |
| `MDHPortalSystem 2486` | ดู build #2486 |
| `มีโปรเจคไหนบ้าง` | แสดงรายชื่อโปรเจคทั้งหมด |
| ส่งรูป screenshot | วิเคราะห์ในแง่ DevOps/Pipeline |

## Setup

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. สร้างไฟล์ .env

```env
GROQ_API_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
AZURE_DEVOPS_ORG=
AZURE_DEVOPS_PAT=
```

### 3. รัน server

```bash
node index.js
```

### 4. เปิด tunnel (สำหรับ local dev)

```bash
./cloudflared tunnel --url http://localhost:3002
```

นำ URL ที่ได้ไปตั้งเป็น Webhook URL ใน LINE Developers Console
```
https://<tunnel-url>/webhook
```

## Environment Variables

| ตัวแปร | คำอธิบาย |
|---|---|
| `GROQ_API_KEY` | API key จาก [Groq Console](https://console.groq.com) |
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE Developers Console |
| `LINE_CHANNEL_SECRET` | จาก LINE Developers Console |
| `AZURE_DEVOPS_ORG` | ชื่อ organization ใน Azure DevOps |
| `AZURE_DEVOPS_PAT` | Personal Access Token (scope: Build Read, Project Read) |
# line-pipeline-bot
