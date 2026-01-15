import OpenAI from "openai";

export async function gptWriter(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  return (
    await new OpenAI().chat.completions.create({ model: "gpt-4o", messages, temperature: 0.0 })
  ).choices[0].message.content!;
}
