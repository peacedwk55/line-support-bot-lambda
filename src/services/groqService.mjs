import axios from "axios";
import { MODELS, VISION_MODEL } from "../config/index.mjs";

export async function askAI(messages) {
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

export async function describeImage(base64Image, mimeType = "image/jpeg") {
    try {
        const res = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: VISION_MODEL,
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

export async function downloadLineImage(messageId) {
    const res = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }, responseType: "arraybuffer" }
    );
    return Buffer.from(res.data).toString("base64");
}

export async function replyToLine(replyToken, text) {
    await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        { replyToken, messages: [{ type: "text", text }] },
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
    );
}
