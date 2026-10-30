import ollama from "ollama";
import { tools } from "./tools.js";
import { definitions } from "./tool-definitions.js";

const toolCapabilities = definitions
  .map(
    ({ function: definition }) =>
      `${definition.name}: ${definition.description}`,
  )
  .join("\n");

const systemPrompt = `Chỉ được mô tả hoặc nhận thực hiện các khả năng được định nghĩa bởi tools dưới đây. 
Khi được hỏi bạn có thể làm gì, chỉ liệt kê các khả năng này và điều kiện sử dụng; 
không tự nhận có khả năng khác. 
Nếu được yêu cầu ngoài phạm vi tools, 
hãy nói rõ hiện tại bạn chỉ hỗ trợ các khả năng được liệt kê. Nếu kết quả tool có downloadUrl, hãy gửi chính xác URL đó cho người dùng.\n\n
Tools hiện có:\n${toolCapabilities},
Luôn luôn trả lời ngắn chọn, súc tích, không dài dòng.`;

export async function runAgent(question, image) {
  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: question,
      ...(image ? { images: [image] } : {}),
    },
  ];

  const response = await ollama.chat({
    model: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
    messages,
    tools: definitions,
    stream: false,
  });

  messages.push(response.message);
  const downloads = [];

  for (const call of response.message.tool_calls ?? []) {
    const name = call.function.name;

    if (!Object.hasOwn(tools, name)) {
      throw new Error("Tool không được phép");
    }

    const result = await tools[name](call.function.arguments ?? {});
    if (result && typeof result.downloadUrl === "string") {
      downloads.push(result);
    }

    messages.push({
      role: "tool",
      tool_name: name,
      content: typeof result === "string" ? result : JSON.stringify(result),
    });
  }

  if (response.message.tool_calls?.length) {
    const finalResponse = await ollama.chat({
      model: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
      messages,
      tools: definitions,
      stream: false,
    });

    const answer = finalResponse.message.content;
    const downloadLinks = downloads
      .filter(({ downloadUrl }) => !answer.includes(downloadUrl))
      .map(
        ({ downloadUrl, note }) =>
          `[Tải đơn khiếu nại PDF](${downloadUrl})${note ? `\n\n${note}` : ""}`,
      );
    return [answer, ...downloadLinks].filter(Boolean).join("\n\n");
  }

  return response.message.content;
}
