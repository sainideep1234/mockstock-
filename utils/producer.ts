import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { QUEUE_URL } from "../config.js";
import type { IorderSchema } from "../types.js";

const sqs = new SQSClient({ region: "ap-south-1" }); // choose your AWS region


export async function sendMessage(messageBody: IorderSchema) {
   const stringifiedMessage =  JSON.stringify(messageBody)
  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: stringifiedMessage,
  });

  try {
    const response = await sqs.send(command);
    console.log("Message sent:", response.MessageId);
  } catch (err) {
    console.error(" Failed to send:", err);
  }
}

