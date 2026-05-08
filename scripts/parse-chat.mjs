// แปลง LINE OpenChat export → Q&A pairs สำหรับเพิ่มใน knowledge.mjs
// Usage: node scripts/parse-chat.mjs "[LINE]CDS Paperless.txt"
//
// Algorithm: Thread-based extraction
//   - Thread เริ่มเมื่อ user ถาม
//   - Thread ดำเนินต่อเมื่อ CDS ถามกลับ / user ตอบกลับ CDS / user ส่งข้อมูลเพิ่ม
//   - Thread จบเมื่อ user คนอื่นถาม หรือเกิน THREAD_MAX_LEN messages
//   - Q = ทุก user message ใน thread (รวมกัน)
//   - A = ทุก CDS message ใน thread (รวมกัน)
//   ผลลัพธ์: A จะ "สมบูรณ์" เพราะเก็บ context ทั้ง thread ไม่ตัดทิ้ง

import fs from "fs";
import path from "path";

const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: node scripts/parse-chat.mjs <chat-file.txt>");
    process.exit(1);
}

// ---- Config ----------------------------------------------------------------

const CDS_NAMES = ["CDS-Sup", "CDS-sup", "CDS-Admin", "CDS-NSP", "CDS-Nsp", "CDS-nsp"];

// messages ที่ไม่มีประโยชน์ต่อ knowledge base
const SKIP_PATTERNS = [
    /^Photos$/i,
    /^Stickers$/i,
    /^Videos$/i,
    /unsent a message/i,
    /joined the chat/i,
    /left the chat/i,
    /02-254/,
    /089-/,
    /094-/,
    /^https?:\/\//,
    /ขอบคุณ/,
    /ขอบใจ/,
    /^ok$/i,
    /^โอเค$/,
    /^ได้เลย$/,
    /^รับทราบ/,
    /^ครับ+$/,
    /^ค่ะ+$/,
    /^นะคะ+$/,
    /^นะครับ+$/,
];

// thread จบถ้าเจอ user คนใหม่ที่ไม่ใช่คนที่เริ่ม thread หรือเกิน limit
// OpenChat จะ mask ชื่อเป็น "Unknown" ทุกคน ใช้ time gap แทน
const THREAD_MAX_LEN = 10;
// ถ้า gap ระหว่าง messages เกิน N นาที ถือว่า thread จบ (สำหรับ Unknown users)
const THREAD_TIME_GAP_MIN = 15;

// Q&A ที่สั้นเกินไปตัดทิ้ง
const MIN_Q_LEN = 8;
const MIN_A_LEN = 10;

// ---- Helpers ----------------------------------------------------------------

function isCDS(name) {
    return CDS_NAMES.some(prefix => name.startsWith(prefix));
}

function shouldSkip(text) {
    if (!text || text.trim().length < 4) return true;
    return SKIP_PATTERNS.some(p => p.test(text.trim()));
}

function toMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function isTimeGap(a, b) {
    if (a.date !== b.date) return true;
    return (toMinutes(b.time) - toMinutes(a.time)) > THREAD_TIME_GAP_MIN;
}

// ---- Parse messages from LINE export ----------------------------------------

const raw = fs.readFileSync(filePath, "utf-8");
const lines = raw.split("\n").map(l => l.trimEnd());

const messages = [];
let currentDate = "";

for (const line of lines) {
    // วันที่: 2024.01.15
    if (/^\d{4}\.\d{2}\.\d{2}/.test(line)) {
        currentDate = line.trim();
        continue;
    }

    // ข้อความ: HH:MM SenderName content (sender เป็น single word เสมอ)
    const match = line.match(/^(\d{2}:\d{2})\s+(\S+)\s+(.+)$/);
    if (match) {
        const [, time, sender, text] = match;
        messages.push({
            date: currentDate,
            time,
            sender: sender.trim(),
            text: text.trim(),
            isCDS: isCDS(sender.trim()),
        });
        continue;
    }

    // บรรทัดต่อเนื่องจาก message ก่อน (ไม่มี timestamp)
    if (
        messages.length > 0 &&
        line.trim() &&
        !line.match(/^\d{2}:\d{2}/)
    ) {
        messages[messages.length - 1].text += "\n" + line.trim();
    }
}

// ---- Thread-based Q&A extraction -------------------------------------------
//
// Thread: กลุ่มของ messages ที่เป็น "การสนทนาเรื่องเดียวกัน"
// เริ่มเมื่อ: user (non-CDS) ส่งข้อความ
// ดำเนินต่อเมื่อ: CDS reply → user reply → CDS reply ... (back-and-forth)
// จบเมื่อ:
//   (a) พบ user คนใหม่ (ไม่ใช่ original user ของ thread) ถาม ← เรื่องใหม่
//   (b) เกิน THREAD_MAX_LEN messages
//   (c) หมด messages

const qaPairs = [];
let i = 0;

while (i < messages.length) {
    const msg = messages[i];

    // thread เริ่มเมื่อ user (non-CDS) ถามและไม่ควร skip
    if (!msg.isCDS && !shouldSkip(msg.text)) {
        const threadUser = msg.sender;
        const userTexts = [msg.text.trim()];
        const cdsTexts = [];

        let j = i + 1;

        while (j < messages.length && j < i + THREAD_MAX_LEN) {
            const m = messages[j];

            // time gap = new topic (all users show as "Unknown" in OpenChat)
            if (isTimeGap(messages[j - 1], m)) break;

            if (m.isCDS) {
                // CDS reply — เก็บถ้าไม่ควร skip
                if (!shouldSkip(m.text)) {
                    cdsTexts.push(m.text.trim());
                }
                j++;
            } else {
                // user message
                if (m.sender === threadUser) {
                    // user คนเดิม follow-up → ยังอยู่ใน thread เดิม
                    if (!shouldSkip(m.text)) {
                        userTexts.push(m.text.trim());
                    }
                    j++;
                } else {
                    // user คนอื่นเข้ามา → thread จบ
                    break;
                }
            }
        }

        if (cdsTexts.length > 0) {
            // Q = user messages ทั้งหมดรวมกัน (เป็น context ที่สมบูรณ์)
            const q = userTexts.join(" / ");
            // A = CDS messages ทั้งหมดรวมกัน
            const a = cdsTexts.join(" ");

            if (q.length >= MIN_Q_LEN && a.length >= MIN_A_LEN) {
                qaPairs.push({ q, a });
            }
        }

        i = j;
        continue;
    }

    i++;
}

// ---- กรอง + deduplicate -------------------------------------------------------

// กรองออก entries ที่ Q หรือ A ดูเหมือน "ขอข้อมูลเพิ่ม" ไม่ใช่คำตอบจริง
const ASK_BACK_PATTERNS = [
    /error.*ว่าอะไร/,
    /screenshot/i,
    /รูปหน่อย/,
    /^กรุณาส่ง/,
];

function isAskBack(text) {
    return ASK_BACK_PATTERNS.some(p => p.test(text));
}

// deduplicate: ถ้า Q คล้ายกันมาก (prefix 30 ตัวเหมือนกัน) เก็บตัวที่ A ยาวกว่า
const seen = new Map();
for (const qa of qaPairs) {
    const key = qa.q.substring(0, 30).toLowerCase().replace(/\s/g, "");
    if (!seen.has(key) || seen.get(key).a.length < qa.a.length) {
        seen.set(key, qa);
    }
}

const filtered = [...seen.values()].filter(qa =>
    qa.q.length >= MIN_Q_LEN &&
    qa.a.length >= MIN_A_LEN &&
    !qa.q.includes("Photos") &&
    !qa.a.includes("Photos") &&
    !isAskBack(qa.a)  // ตัด entry ที่ A คือ CDS ถามกลับโดยไม่มีคำตอบ
);

// ---- หาเลข id ต่อจาก knowledge.mjs -----------------------------------------

const knowledgePath = path.resolve("src/knowledge.mjs");
let lastId = 83;
if (fs.existsSync(knowledgePath)) {
    const content = fs.readFileSync(knowledgePath, "utf-8");
    const ids = [...content.matchAll(/id:\s*"qa-(\d+)"/g)].map(m => parseInt(m[1]));
    if (ids.length > 0) lastId = Math.max(...ids);
}

// ---- Output -----------------------------------------------------------------

console.log(`\n=== Thread-based extraction ===`);
console.log(`Raw messages parsed : ${messages.length}`);
console.log(`Threads extracted   : ${qaPairs.length}`);
console.log(`After filter+dedup  : ${filtered.length}`);
console.log(`Starting from id    : qa-${String(lastId + 1).padStart(3, "0")}\n`);

const jsEntries = filtered.map((qa, idx) => {
    const id = `qa-${String(lastId + idx + 1).padStart(3, "0")}`;
    const escQ = qa.q.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/\n/g, " ");
    const escA = qa.a.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/\n/g, " ");
    return `    {\n        id: "${id}",\n        q: "${escQ}",\n        a: "${escA}",\n    },`;
});

const outPath = path.resolve("scripts/parsed-qa.txt");
fs.writeFileSync(outPath, jsEntries.join("\n\n"), "utf-8");
console.log(`บันทึกไว้ที่ scripts/parsed-qa.txt`);

// แสดง preview ทุกคู่ให้ review ก่อน copy ลง knowledge.mjs
console.log("\n--- Preview (ทุกคู่) ---\n");
filtered.forEach((qa, idx) => {
    const id = `qa-${String(lastId + idx + 1).padStart(3, "0")}`;
    console.log(`[${id}]`);
    console.log(`  Q: ${qa.q.substring(0, 100)}${qa.q.length > 100 ? "…" : ""}`);
    console.log(`  A: ${qa.a.substring(0, 120)}${qa.a.length > 120 ? "…" : ""}`);
    console.log();
});
