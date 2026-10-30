import ollama from "ollama";
import { tools } from "./tools.js";

const definitions = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Lấy thời gian hiện tại",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export async function runAgent(question, image) {
  const messages = [
    {
      role: "user",
      content: question,
      ...(image ? { images: [image] } : {}),
    },
  ];

  const response = await ollama.chat({
    model: process.env.OLLAMA_MODEL ?? "qwen3-vl:4b",
    messages,
    tools: definitions,
    stream: false,
  });

  messages.push(response.message);

  for (const call of response.message.tool_calls ?? []) {
    const name = call.function.name;

    if (!Object.hasOwn(tools, name)) {
      throw new Error("Tool không được phép");
    }

    const result = tools[name]();

    messages.push({
      role: "tool",
      tool_name: name,
      content: String(result),
    });
  }

  if (response.message.tool_calls?.length) {
    const finalResponse = await ollama.chat({
      model: process.env.OLLAMA_MODEL ?? "qwen3-vl:4b",
      messages,
      tools: definitions,
      stream: false,
    });

    return finalResponse.message.content;
  }

  return response.message.content;
}
