import crypto from "crypto";
import axios from "axios";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Index } from "@upstash/vector";
import { SYSTEM_PROMPT } from "./prompt.mjs";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DYNAMODB_TABLE || "line-support-bot-history";
const TTL_SECONDS = 60 * 60 * 24; // 24 ชั่วโมง

const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it"
];

// Upstash Vector — lazy init เพื่อรองรับกรณีไม่ได้ตั้งค่า env
let vectorIndex = null;
function getVectorIndex() {
    if (!vectorIndex && process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN) {
        vectorIndex = new Index({
            url: process.env.UPSTASH_VECTOR_REST_URL,
            token: process.env.UPSTASH_VECTOR_REST_TOKEN,
        });
    }
    return vectorIndex;
}

// ─── LINE Signature Verification ────────────────────────────────────────────

function verifySignature(rawBody, signature) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) return true; // ข้ามถ้าไม่มี secret (dev mode)
    const hash = crypto.createHmac("sha256", secret)
        .update(rawBody)
        .digest("base64");
    return hash === signature;
}

// ─── DynamoDB ────────────────────────────────────────────────────────────────

async function getHistory(userId) {
    try {
        const res = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { userId } }));
        return res.Item?.history || [];
    } catch {
        return [];
    }
}

async function saveHistory(userId, history) {
    const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    await dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: { userId, history: history.slice(-10), ttl }
    }));
}

// ─── Upstash Vector RAG ──────────────────────────────────────────────────────

async function searchKnowledge(query) {
    const idx = getVectorIndex();
    if (!idx) return [];
    try {
        const results = await idx.query({
            data: query,
            topK: 3,
            includeMetadata: true,
        });
        return results.filter(r => r.score >= 0.7);
    } catch (err) {
        console.log("Upstash query failed:", err.message);
        return [];
    }
}

function buildKnowledgeContext(matches) {
    if (matches.length === 0) return "";
    const lines = matches.map(m => `Q: ${m.metadata.q}\nA: ${m.metadata.a}`).join("\n\n");
    return `\n\nข้อมูลที่เกี่ยวข้องกับคำถามนี้:\n${lines}`;
}

// ─── Groq AI ────────────────────────────────────────────────────────────────

async function askAI(messages) {
    for (const model of MODELS) {
        try {
            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                { model, messages },
                { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
            );
            return res.data.choices?.[0]?.message?.content;
        } catch (err) {
            console.log(`Model ${model} failed:`, err.response?.data?.error?.message || err.message);
            if (err.response?.status === 429) break;
        }
    }
    return null;
}

async function describeImage(base64Image, mimeType = "image/jpeg") {
    try {
        const res = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [{
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                        { type: "text", text: "อ่านรูปนี้แล้วสรุปเป็นข้อความสั้นๆ ว่าเห็น error message อะไร หรือปัญหาอะไรในโปรแกรม ถ้ามี error code ให้ระบุด้วย ตอบเป็นภาษาไทย ไม่เกิน 3 ประโยค" }
                    ]
                }]
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
        );
        return res.data.choices?.[0]?.message?.content;
    } catch (err) {
        console.log("Vision model failed:", err.response?.data?.error?.message || err.message);
        return null;
    }
}

async function downloadLineImage(messageId) {
    const res = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }, responseType: "arraybuffer" }
    );
    return Buffer.from(res.data).toString("base64");
}

async function replyToLine(replyToken, text) {
    await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        { replyToken, messages: [{ type: "text", text }] },
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
    );
}

// ─── CORS Headers ────────────────────────────────────────────────────────────

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── LIFF Web Chat Handler ───────────────────────────────────────────────────

async function handleWebChat(event) {
    if (event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers: CORS, body: "" };
    }
    let body;
    try {
        body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const { userId, message, imageBase64, mimeType } = body || {};
    if (!userId) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "userId required" }) };
    }

    const history = await getHistory(userId);
    let reply;

    if (imageBase64) {
        // Image flow: Vision → RAG → AI
        const imageDescription = await describeImage(imageBase64, mimeType || "image/jpeg");
        if (!imageDescription) {
            reply = "ขออภัย ไม่สามารถอ่านรูปได้ค่ะ กรุณาลองส่งใหม่อีกครั้ง";
        } else {
            const matches = await searchKnowledge(imageDescription);
            const knowledgeContext = buildKnowledgeContext(matches);
            if (matches.length > 0) {
                console.log(`RAG (web image): พบ ${matches.length} matches`);
            }
            const systemWithKnowledge = SYSTEM_PROMPT + knowledgeContext;
            const userContent = `ผู้ใช้ส่งรูปภาพมา จากการวิเคราะห์รูปพบว่า: ${imageDescription}`;
            history.push({ role: "user", content: userContent });
            const messages = [{ role: "system", content: systemWithKnowledge }, ...history];
            reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
            history.push({ role: "assistant", content: reply });
            await saveHistory(userId, history);
        }
    } else if (message) {
        // Text flow: RAG → AI
        const matches = await searchKnowledge(message);
        const knowledgeContext = buildKnowledgeContext(matches);
        if (matches.length > 0) {
            console.log(`RAG (web): พบ ${matches.length} matches (scores: ${matches.map(m => m.score.toFixed(2)).join(", ")})`);
        }
        const systemWithKnowledge = SYSTEM_PROMPT + knowledgeContext;
        history.push({ role: "user", content: message });
        const messages = [{ role: "system", content: systemWithKnowledge }, ...history];
        reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
        history.push({ role: "assistant", content: reply });
        await saveHistory(userId, history);
    } else {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "message or imageBase64 required" }) };
    }

    return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ reply }),
    };
}

// ─── Lambda Handler ──────────────────────────────────────────────────────────

export const handler = async (event) => {
    // รองรับทั้ง payload format 1.0 (path/httpMethod) และ 2.0 (rawPath/requestContext.http.method)
    const path   = event.rawPath || event.requestContext?.http?.path || event.path || "/";
    const method = event.requestContext?.http?.method || event.httpMethod || "";
    console.log("PATH:", path, "METHOD:", method);

    // LIFF Web Chat
    if (path === "/chat" || path.endsWith("/chat")) {
        return handleWebChat(event);
    }

    // LINE Webhook — ตรวจ signature ก่อน parse
    const rawBody = event.body || "";
    const signature = event.headers?.["x-line-signature"] || "";
    if (!verifySignature(rawBody, signature)) {
        console.log("Invalid signature — rejected");
        return { statusCode: 401, body: "Unauthorized" };
    }

    let body;
    try {
        body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    } catch {
        return { statusCode: 200, body: "OK" };
    }

    for (const ev of body.events || []) {
        if (ev.type !== "message") continue;

        const sourceType = ev.source.type;
        const userId = ev.source.userId;
        const msgType = ev.message.type;

        if (msgType !== "text" && msgType !== "image") continue;

        // ถ้าอยู่ในกลุ่ม/ห้อง ต้อง mention bot ก่อน (ทั้ง text และ image)
        const isGroup = sourceType === "group" || sourceType === "room";
        if (isGroup) {
            if (msgType === "text") {
                const text = ev.message.text.toLowerCase();
                const mentioned = text.includes("@") || text.includes("bot") || text.includes("บอท");
                if (!mentioned) continue;
            } else {
                // image ในกลุ่มไม่มีทางตรวจ mention — ข้ามเพื่อไม่ตอบทุกรูป
                continue;
            }
        }

        try {
            let reply;

            if (msgType === "image") {
                const history = await getHistory(userId);
                const base64Image = await downloadLineImage(ev.message.id);

                const imageDescription = await describeImage(base64Image);
                if (!imageDescription) {
                    reply = "ขออภัย ไม่สามารถอ่านรูปได้ค่ะ กรุณาลองส่งใหม่อีกครั้ง";
                } else {
                    console.log("Vision description:", imageDescription);

                    const matches = await searchKnowledge(imageDescription);
                    const knowledgeContext = buildKnowledgeContext(matches);
                    if (matches.length > 0) {
                        console.log(`RAG (image): พบ ${matches.length} matches (scores: ${matches.map(m => m.score.toFixed(2)).join(", ")})`);
                    }

                    const systemWithKnowledge = SYSTEM_PROMPT + knowledgeContext;
                    const userContent = `ผู้ใช้ส่งรูปภาพมา จากการวิเคราะห์รูปพบว่า: ${imageDescription}`;
                    history.push({ role: "user", content: userContent });
                    const messages = [{ role: "system", content: systemWithKnowledge }, ...history];
                    reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
                    history.push({ role: "assistant", content: reply });
                    await saveHistory(userId, history);
                }
            } else {
                let userMsg = ev.message.text.replace(/@\S+/g, "").trim();
                const history = await getHistory(userId);

                const matches = await searchKnowledge(userMsg);
                const knowledgeContext = buildKnowledgeContext(matches);
                if (matches.length > 0) {
                    console.log(`RAG: พบ ${matches.length} matches (scores: ${matches.map(m => m.score.toFixed(2)).join(", ")})`);
                }

                const systemWithKnowledge = SYSTEM_PROMPT + knowledgeContext;

                history.push({ role: "user", content: userMsg });
                const messages = [{ role: "system", content: systemWithKnowledge }, ...history];
                reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
                history.push({ role: "assistant", content: reply });

                await saveHistory(userId, history);
            }

            await replyToLine(ev.replyToken, reply);
        } catch (err) {
            console.error("Error:", err.response?.data || err.message);
        }
    }

    return { statusCode: 200, body: "OK" };
};
