// upload-qa.mjs — รันครั้งเดียวบน local เพื่ออัปโหลด Q&A เข้า Upstash Vector
// ใช้งาน: node src/upload-qa.mjs
//
// ต้องตั้งค่า env ก่อนรัน:
//   export UPSTASH_VECTOR_REST_URL=https://...
//   export UPSTASH_VECTOR_REST_TOKEN=...

import { Index } from "@upstash/vector";
import { QA_PAIRS } from "./knowledge.mjs";

const url   = process.env.UPSTASH_VECTOR_REST_URL;
const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

if (!url || !token) {
    console.error("❌ กรุณาตั้งค่า UPSTASH_VECTOR_REST_URL และ UPSTASH_VECTOR_REST_TOKEN ก่อนรัน");
    process.exit(1);
}

const index = new Index({ url, token });

const BATCH_SIZE = 10; // upsert ทีละ 10 รายการ

async function upload() {
    console.log(`📚 กำลัง upload ${QA_PAIRS.length} Q&A entries ขึ้น Upstash Vector...`);
    console.log(`🔗 URL: ${url.slice(0, 40)}...`);
    console.log("");

    let success = 0;
    let failed  = 0;

    for (let i = 0; i < QA_PAIRS.length; i += BATCH_SIZE) {
        const batch = QA_PAIRS.slice(i, i + BATCH_SIZE);

        const vectors = batch.map(({ id, q, a }) => ({
            id,
            data: `${q}\n${a}`,   // ข้อความที่จะถูก embed อัตโนมัติ
            metadata: { q, a },    // เก็บ q/a เพื่อดึงกลับมาใน Lambda
        }));

        try {
            await index.upsert(vectors);
            success += batch.length;
            const ids = batch.map(b => b.id).join(", ");
            console.log(`✅ batch ${Math.floor(i / BATCH_SIZE) + 1}: [${ids}]`);
        } catch (err) {
            failed += batch.length;
            console.error(`❌ batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
        }
    }

    console.log("");
    console.log(`🎉 เสร็จสิ้น — สำเร็จ ${success}/${QA_PAIRS.length} รายการ${failed > 0 ? `, ล้มเหลว ${failed} รายการ` : ""}`);

    if (success > 0) {
        console.log("");
        console.log("🧪 ทดสอบ query...");
        try {
            const testResults = await index.query({
                data: "ยิงใบขนไม่ผ่านทำยังไง",
                topK: 3,
                includeMetadata: true,
            });
            console.log(`🔍 ผลลัพธ์ test query "ยิงใบขนไม่ผ่าน":`);
            testResults.forEach(r => {
                console.log(`   [${r.score.toFixed(3)}] ${r.id}: ${r.metadata?.q?.slice(0, 50)}...`);
            });
        } catch (err) {
            console.error("ทดสอบ query ล้มเหลว:", err.message);
        }
    }
}

upload();
