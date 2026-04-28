import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE, TTL_SECONDS } from "../config/index.mjs";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function getHistory(userId) {
    try {
        const res = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { userId } }));
        return res.Item?.history || [];
    } catch {
        return [];
    }
}

export async function saveHistory(userId, history) {
    const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    await dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: { userId, history: history.slice(-10), ttl },
    }));
}
