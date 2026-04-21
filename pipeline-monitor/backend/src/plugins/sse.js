// เก็บ raw response ของทุก client ที่ต่อ SSE อยู่
const clients = new Set()

export function addClient(raw) {
    clients.add(raw)
    console.log(`[SSE] Client connected. Total: ${clients.size}`)
}

export function removeClient(raw) {
    clients.delete(raw)
    console.log(`[SSE] Client disconnected. Total: ${clients.size}`)
}

// Broadcast event ไปยังทุก client ที่ต่ออยู่
export function broadcastEvent(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
    for (const raw of clients) {
        try {
            raw.write(payload)
        } catch {
            clients.delete(raw)
        }
    }
    console.log(`[SSE] Broadcasted "${eventName}" to ${clients.size} clients`)
}
