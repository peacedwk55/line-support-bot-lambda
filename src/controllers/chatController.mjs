import { CORS } from "../config/index.mjs";
import { SYSTEM_PROMPT } from "../prompt.mjs";
import { askAI, describeImage } from "../services/groqService.mjs";
import { searchKnowledge, buildKnowledgeContext } from "../services/ragService.mjs";
import { getHistory, saveHistory } from "../services/historyService.mjs";

export async function handleWebChat(event) {
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
