import type { ZodObject, ZodRawShape } from "zod/v4";
import { z } from "zod/v4";

// Re-export zChatCompletion with simplified options type to avoid TS2589
// ("Type instantiation is excessively deep") caused by Partial<ChatCompletionCreateParamsNonStreaming>
type ZChatModule = {
  default: <S extends ZodRawShape>(
    schema: S | ZodObject<S>,
    options?: { model?: string; [key: string]: unknown },
  ) => (strings: TemplateStringsArray, ...values: unknown[]) => Promise<z.infer<ZodObject<S>>>;
};

let _mod: ZChatModule | undefined;
let _modPromise: Promise<ZChatModule> | undefined;

async function loadZChatModule(): Promise<ZChatModule> {
  _modPromise ??= import(
    new URL("../node_modules/z-chat-completion/dist/index.js", import.meta.url).href
  ) as Promise<ZChatModule>;
  _mod ??= await _modPromise;
  return _mod;
}

export default function zChatCompletion<S extends ZodRawShape>(
  schema: S | ZodObject<S>,
  options?: { model?: string; [key: string]: unknown },
): (strings: TemplateStringsArray, ...values: unknown[]) => Promise<z.infer<ZodObject<S>>> {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const mod = await loadZChatModule();
    return mod.default(schema, options)(strings, ...values);
  };
}

export async function initZChat() {
  await loadZChatModule();
}
