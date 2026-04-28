import { verifySignature } from "./middleware/lineAuth.mjs";
import { handleWebChat } from "./controllers/chatController.mjs";
import { handleLineEvent } from "./controllers/lineController.mjs";

export const handler = async (event) => {
    const path   = event.rawPath || event.requestContext?.http?.path || event.path || "/";
    const method = event.requestContext?.http?.method || event.httpMethod || "";
    console.log("PATH:", path, "METHOD:", method);

    if (path === "/chat" || path.endsWith("/chat")) {
        return handleWebChat(event);
    }

    const rawBody  = event.body || "";
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
        try {
            await handleLineEvent(ev);
        } catch (err) {
            console.error("Error:", err.response?.data || err.message);
        }
    }

    return { statusCode: 200, body: "OK" };
};
