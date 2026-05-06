import { LIFF_URL, LIFF_KEYWORDS } from "../config/index.mjs";
import { SYSTEM_PROMPT } from "../prompt.mjs";
import { askAI, describeImage, downloadLineImage, replyToLine } from "../services/groqService.mjs";
import { searchKnowledge, buildKnowledgeContext } from "../services/ragService.mjs";
import { getHistory, saveHistory } from "../services/historyService.mjs";

export async function handleLineEvent(ev) {
    if (ev.type !== "message") return;

    const sourceType = ev.source.type;
    const userId = ev.source.userId;
    const msgType = ev.message.type;

    if (msgType !== "text" && msgType !== "image") return;

    const isGroup = sourceType === "group" || sourceType === "room";
    if (isGroup) {
        if (msgType === "text") {
            const text = ev.message.text.toLowerCase();
            const mentioned = text.includes("@") || text.includes("bot") || text.includes("บอท");
            if (!mentioned) return;
        } else {
            return;
        }
    }

    let reply;

    // ดักคำที่บ่งบอกว่าต้องการ LIFF URL
    if (msgType === "text") {
        const lowerMsg = ev.message.text.toLowerCase();
        const wantsLiff = LIFF_KEYWORDS.some(kw => lowerMsg.includes(kw));
        if (wantsLiff) {
            await replyToLine(ev.replyToken, `สามารถใช้งาน Web Chat ได้ที่ลิงก์นี้เลยค่ะ 😊\n${LIFF_URL}`);
            return;
        }
    }

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
        const userMsg = ev.message.text.replace(/@\S+/g, "").trim();
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
}
