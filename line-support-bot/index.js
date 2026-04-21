import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { SYSTEM_PROMPT } from "./prompt.js";

dotenv.config();
const app = express();
app.use(express.json());

// เก็บประวัติสนทนาแยกตาม userId (สูงสุด 10 ข้อความต่อคน)
const chatHistory = {};

const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it"
];

async function askAI(messages) {
    for (const model of MODELS) {
        try {
            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                { model, messages },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );
            return res.data.choices?.[0]?.message?.content;
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || err.message;
            console.log(`Model ${model} failed: ${errMsg}`);
            if (err.response?.status === 429) break;
        }
    }
    return null;
}

async function askAIWithImage(base64Image, mimeType = "image/jpeg") {
    try {
        const res = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: [
                            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                            { type: "text", text: "ช่วยดูรูปนี้หน่อยนะ" }
                        ]
                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return res.data.choices?.[0]?.message?.content;
    } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.log(`Vision model failed: ${errMsg}`);
        return null;
    }
}

async function downloadLineImage(messageId) {
    const res = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
            headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            responseType: "arraybuffer"
        }
    );
    return Buffer.from(res.data).toString("base64");
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    for (const event of req.body.events) {
        if (event.type !== "message") continue;

        const userId = event.source.userId || event.source.groupId || event.source.roomId;
        const msgType = event.message.type;

        if (msgType !== "text" && msgType !== "image") continue;

        if (!chatHistory[userId]) {
            chatHistory[userId] = [];
        }

        try {
            let reply;

            if (msgType === "image") {
                const base64Image = await downloadLineImage(event.message.id);
                reply = await askAIWithImage(base64Image) || "ขออภัย ลองใหม่อีกครั้งครับ";
            } else {
                const userMsg = event.message.text;
                chatHistory[userId].push({ role: "user", content: userMsg });
                if (chatHistory[userId].length > 10) {
                    chatHistory[userId] = chatHistory[userId].slice(-10);
                }
                const messages = [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...chatHistory[userId]
                ];
                reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งครับ";
                chatHistory[userId].push({ role: "assistant", content: reply });
            }

            await axios.post(
                "https://api.line.me/v2/bot/message/reply",
                {
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: reply }]
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                        "Content-Type": "application/json"
                    }
                }
            );
        } catch (err) {
            console.error("Error:", err.response?.data || err.message);
        }
    }
});

app.listen(3000, () => console.log("Server running on 3000"));
