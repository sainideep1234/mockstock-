import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { QUEUE_URL } from "../config.js";

const sqs = new SQSClient({ region: "ap-south-1" });

async function pollMessages() {
  console.log("👨‍🍳 Waiting for new messages...");

  const command = new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 5, // how many to process in one batch
    WaitTimeSeconds: 10, // long polling (wait for messages)
  });

  const response = await sqs.send(command);

  if (!response.Messages || response.Messages.length === 0) {
    console.log("😴 No new messages");
    return;
  }

  for (const msg of response.Messages) {
    console.log("🍳 Processing:", msg.Body);

    // simulate work
    await new Promise((r) => setTimeout(r, 2000));

    // delete message after processing
    if (msg.ReceiptHandle) {
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle,
        })
      );
      console.log("✅ Message deleted:", msg.MessageId);
    }
  }
}

// Keep polling forever
setInterval(pollMessages, 5000);
