src/prompt.mjs — บุคลิกของ Bot
ไฟล์นี้กำหนด ตัวตนและกฎ ให้ AI ก่อนตอบทุกครั้ง


export const SYSTEM_PROMPT = `คุณคือ Support Bot ของทีม Application Support...`
สิ่งที่ define ไว้:

บทบาท — Support Bot ของ CDSCOM ดูแลระบบ Express
เบอร์ติดต่อ — ในเวลา/นอกเวลา แยกตามปัญหา
กฎการตอบ — ภาษาไทย, ลงท้าย "ค่ะ" เท่านั้น, ห้ามแต่งข้อมูล
กรณีนอกขอบเขต — โยนไปโทรหา Support
src/index.mjs — Lambda Handler (ไฟล์หลัก)
ส่วนที่ 1 — ตั้งค่าเริ่มต้น (บรรทัด 1-28)

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"];

let vectorIndex = null;
function getVectorIndex() { ... } // lazy init
เชื่อมต่อ DynamoDB
กำหนด AI models เรียงตาม priority (ใช้ตัวแรกก่อน fallback ถ้าล้มเหลว)
Upstash Vector lazy init — สร้าง connection ตอนแรกที่ใช้งานเท่านั้น (ประหยัด cold start)
ส่วนที่ 2 — Security (บรรทัด 32-39)

function verifySignature(rawBody, signature) {
    const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    return hash === signature;
}
ทุก request จาก LINE มี header x-line-signature — คำนวณ HMAC-SHA256 ของ body ด้วย Channel Secret แล้วเปรียบเทียบ ถ้าไม่ตรง = request ปลอม → reject 401

ส่วนที่ 3 — DynamoDB (บรรทัด 43-58)

async function getHistory(userId) { ... }  // โหลด history
async function saveHistory(userId, history) { ... }  // บันทึก history
เก็บ 10 ข้อความล่าสุด ต่อ user
ตั้ง TTL ให้ลบอัตโนมัติหลัง 24 ชั่วโมง
ทำให้ bot จำบริบทการสนทนาได้ข้ามข้อความ
ส่วนที่ 4 — RAG (บรรทัด 62-82)

async function searchKnowledge(query) {
    const results = await idx.query({ data: query, topK: 3 });
    return results.filter(r => r.score >= 0.7);  // เอาเฉพาะที่เกี่ยวข้องพอ
}

function buildKnowledgeContext(matches) {
    // แปลง matches → text สำหรับใส่ใน prompt
}
นี่คือหัวใจของ RAG:

รับคำถาม → ส่งไป Upstash Vector
Upstash แปลงเป็น vector (multilingual-e5-large) แล้วหาที่คล้ายกัน
กรองเฉพาะ score ≥ 0.7 (ถ้าต่ำกว่านี้ถือว่าไม่เกี่ยว ไม่เอา)
แปลงผลลัพธ์เป็น Q&A text เพื่อ inject เข้า prompt
ส่วนที่ 5 — Groq AI (บรรทัด 86-124)
askAI() — ตอบข้อความ


for (const model of MODELS) {
    try { ... return response }
    catch { if (429) break }  // rate limit → หยุดลอง
}
วนลอง model ตามลำดับ ถ้าล้มเหลวลอง model ถัดไป ถ้าโดน rate limit หยุดทันที

describeImage() — อ่านรูป


// ส่งรูป (base64) ให้ llama-4-scout-17b อ่าน
// prompt: "บอกว่าเห็น error อะไร ไม่เกิน 3 ประโยค"
// return: text description เพื่อเอาไป query RAG ต่อ
downloadLineImage() — ดาวน์โหลดรูปจาก LINE (เฉพาะ LINE OA)

replyToLine() — ส่งข้อความกลับหา user ผ่าน LINE API

ส่วนที่ 6 — Web Chat Handler (บรรทัด 152-212)

async function handleWebChat(event) {
    if (OPTIONS) return CORS headers  // browser preflight

    if (imageBase64) {
        // Vision → RAG → AI
    } else if (message) {
        // RAG → AI
    }

    return { reply }  // JSON response กลับ frontend
}
รองรับทั้ง text และรูป เหมือน LINE OA แต่:

รับ input จาก HTTP POST (ไม่ใช่ LINE webhook)
ต้อง return CORS headers ทุก response (browser ต้องการ)
รูปมาเป็น base64 จาก frontend แทน download จาก LINE
ส่วนที่ 7 — Main Handler (บรรทัด 216-318)

export const handler = async (event) => {
    const path = event.rawPath || event.path || "/";

    if (path === "/chat") return handleWebChat(event);  // Web Chat

    // LINE Webhook
    verifySignature(...)  // ตรวจความปลอดภัย

    for (const ev of body.events) {
        if (isGroup && !mentioned) continue  // กลุ่ม: ต้อง mention
        if (image) → Vision → RAG → AI → reply
        if (text)  → RAG → AI → reply
    }
}
ตัวกรองสำคัญ:

path === "/chat" → Web Chat (ไม่ verify LINE signature)
path === "/webhook" → LINE OA (verify signature ก่อนทุกอย่าง)
อยู่ในกลุ่ม + text → ต้องพูดถึง "bot" หรือ "@"
อยู่ในกลุ่ม + รูป → ข้ามทันที (ไม่มีทางตรวจ mention)
userId ใช้รายคนเสมอ (ไม่แชร์ history ข้ามคน)
docs/index.html — LIFF Web Chat UI
ส่วนสำคัญ:

ส่วน	ทำอะไร
LIFF SDK init	เชื่อมต่อ LINE → ดึง userId อัตโนมัติ
compressImage()	canvas resize รูปให้ไม่เกิน 1024px ก่อนส่ง (ประหยัด bandwidth)
handleFile()	รับไฟล์รูป → compress → ส่ง base64 ไป /chat
send()	ส่ง text message → fetch POST /chat
addMsg() / addImgMsg()	แสดง chat bubble (text / รูป)
Typing indicator	แสดง 3 จุดกระดอนระหว่างรอ AI ตอบ
src/knowledge.mjs — Q&A Database

export const QA_PAIRS = [
    { id: "qa-001", q: "ยิงใบขนไม่ผ่าน...", a: "ให้ส่งซ้ำผ่านเมนู..." },
    ...83 คู่
]
ไฟล์นี้ ไม่ได้โหลดเข้า Lambda โดยตรง — ใช้แค่ตอนรัน upload-qa.mjs เพื่ออัปโหลดขึ้น Upstash Vector ครั้งเดียว หลังจากนั้น Upstash เก็บแทน

terraform/main.tf — Infrastructure
สร้าง AWS resources ทั้งหมด:

Lambda — รัน code, 256MB, timeout 30s
API Gateway — รับ request, route /webhook + /chat, CORS enabled
DynamoDB — เก็บ history, billing on-demand, TTL อัตโนมัติ
IAM Role — permission ให้ Lambda เขียน DynamoDB + CloudWatch logs