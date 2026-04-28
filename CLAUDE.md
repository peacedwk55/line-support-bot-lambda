# LINE Support Bot — CDSCOM

AWS Lambda + RAG chatbot สำหรับทีม Application Support ตอบปัญหาระบบ Express (พิธีการศุลกากร)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | AWS Lambda (Node.js 20.x) |
| API | API Gateway v2 HTTP API |
| AI (text) | Groq — llama-3.3-70b → llama-3.1-8b → gemma2-9b (fallback) |
| AI (vision) | Groq — llama-4-scout-17b |
| Knowledge base | Upstash Vector (multilingual-e5-large embedding) |
| Chat history | DynamoDB (TTL 24 ชม., เก็บ 10 messages ต่อ user) |
| Web Chat UI | GitHub Pages (`docs/index.html`) + LIFF SDK |

---

## Project Structure

```
src/
├── index.mjs                  # Lambda entry — routing /webhook และ /chat
├── prompt.mjs                 # System prompt (persona, rules, เบอร์ติดต่อ)
├── knowledge.mjs              # Q&A data 83 คู่
├── upload-qa.mjs              # Script upload Q&A → Upstash (รันครั้งเดียว)
├── rag-qa.md                  # Q&A ต้นฉบับ 97 คู่ (จาก chat log จริง)
├── config/index.mjs           # Constants, env vars, CORS, model list
├── middleware/lineAuth.mjs    # ตรวจ x-line-signature (HMAC-SHA256)
├── services/
│   ├── groqService.mjs        # askAI, describeImage, downloadLineImage, replyToLine
│   ├── ragService.mjs         # searchKnowledge, buildKnowledgeContext
│   └── historyService.mjs     # getHistory, saveHistory
└── controllers/
    ├── lineController.mjs     # จัดการ LINE webhook events
    └── chatController.mjs     # จัดการ LIFF Web Chat requests

docs/index.html                # Web Chat UI (GitHub Pages)
scripts/upload-qa.mjs          # Upload Q&A → Upstash
terraform/                     # Infrastructure as Code (Lambda + API GW + DynamoDB)
```

---

## Flow การทำงาน

### ช่องทาง 1 — LINE OA (`POST /webhook`)

```
User ส่งข้อความ/รูป
  → LINE → API Gateway → Lambda
  → verifySignature (HMAC-SHA256)
  → lineController.handleLineEvent()
      ├── [กลุ่ม] ต้อง mention @bot / "bot" / "บอท" ก่อน (รูปในกลุ่ม: ไม่ตอบ)
      ├── [text]  RAG → Groq AI → replyToLine
      └── [image] downloadLineImage → Vision → RAG → Groq AI → replyToLine
```

### ช่องทาง 2 — LIFF Web Chat (`POST /chat`)

```
User เปิด https://liff.line.me/2009887373-F9GIcCMR
  → GitHub Pages (LIFF SDK) → ดึง userId จาก LINE
  → fetch POST /chat { userId, message | imageBase64 }
  → API Gateway (CORS) → Lambda
  → chatController.handleWebChat()
      ├── [text]  RAG → Groq AI → { reply }
      └── [image] compress canvas (1024px) → Vision → RAG → Groq AI → { reply }
```

### RAG Pipeline (ทั้ง 2 ช่องทาง)

```
user message / vision text
  → Upstash Vector query (top 3, score ≥ 0.7)
  → buildKnowledgeContext → ต่อท้าย system prompt
  → [system + RAG context + history + user msg] → Groq AI → reply
  → saveHistory (DynamoDB)
```

---

## Environment Variables

| ตัวแปร | ที่มา |
|---|---|
| `GROQ_API_KEY` | console.groq.com |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings |
| `DYNAMODB_TABLE` | Terraform (set อัตโนมัติ) |
| `UPSTASH_VECTOR_REST_URL` | console.upstash.com |
| `UPSTASH_VECTOR_REST_TOKEN` | console.upstash.com |

---

## คำสั่งที่ใช้บ่อย

> **สำคัญ:** Build/Deploy ต้องรันใน **WSL เท่านั้น** (Makefile มีปัญหา CRLF บน Windows)

### Deploy / Update Lambda code
```bash
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda
npm install
zip -r deploy.zip src/ node_modules/ package.json
cd terraform && terraform apply -auto-approve \
  -var="groq_api_key=<key>" \
  -var="line_channel_access_token=<token>" \
  -var="line_channel_secret=<secret>" \
  -var="upstash_vector_rest_url=<url>" \
  -var="upstash_vector_rest_token=<token>"
```

### Update Q&A (ไม่ต้อง redeploy)
```bash
# แก้ไข src/knowledge.mjs แล้วรัน
UPSTASH_VECTOR_REST_URL=<url> UPSTASH_VECTOR_REST_TOKEN=<token> \
node scripts/upload-qa.mjs
```

### Update Web Chat UI (ไม่ต้อง redeploy)
```bash
git add docs/index.html && git commit -m "Update UI" && git push
```

### ดู Logs (debug)
```bash
aws logs tail /aws/lambda/line-support-bot --follow
```

### ดู URLs ที่ deploy แล้ว
```bash
cd terraform && terraform output
```

---

## แก้อะไร → ทำอะไร

| แก้ | คำสั่ง |
|---|---|
| Lambda code / prompt (`src/`) | deploy (WSL) |
| Web Chat UI (`docs/index.html`) | `git push` |
| Q&A knowledge (`src/knowledge.mjs`) | `node scripts/upload-qa.mjs` |
