import type { ZodObject, ZodRawShape } from "zod/v4";
import { z } from "zod/v4";

// Re-export zChatCompletion with simplified options type to avoid TS2589
// ("Type instantiation is excessively deep") caused by Partial<ChatCompletionCreateParamsNonStreaming>
let _mod: { default: Function } | undefined;

export default function zChatCompletion<S extends ZodRawShape>(
  schema: S | ZodObject<S>,
  options?: { model?: string; [key: string]: unknown },
): (strings: TemplateStringsArray, ...values: unknown[]) => Promise<z.infer<ZodObject<S>>> {
  _mod ??= require("z-chat-completion") as { default: Function };
  return _mod.default(schema, options);
}
