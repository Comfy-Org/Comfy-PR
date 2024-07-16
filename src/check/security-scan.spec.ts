import { $, file } from "bun";
import { tmpdir } from "os";
import { fromWritable } from "snoflow/fromNodeStream";
// await rm(outfile).catch(nil)
import { createWriteStream } from "fs";
import "openai";
import OpenAI from "openai";
import PolyfillTextDecoderStream from "polyfill-text-decoder-stream";
import { sf } from "snoflow";
it.skip("works", async () => {
  const ignores = ".git,*.log,cache,node_modules,.next,.venv,dist,bun.lockb,tsconfig.tsbuildinfo,*.ico,*.png";

  const id = (+new Date()).toString(36).slice(2);
  const checkmd = tmpdir() + "/" + id + "-all.md";
  const resultmd = tmpdir() + "/" + id + "-check-result.md";
  console.log(ignores, checkmd, resultmd);
  const all = await file(checkmd)
    .text()
    .catch(async () => {
      await $`npx -y code2md -r -s . -t ALL-CODES-TO-CHECK -e ${ignores} -o ${checkmd}`;
      await $`code ${checkmd}`;
      return await file(checkmd).text();
    });

  console.log("all:", all.length);
  const ai = new OpenAI();

  await sf(
    await ai.chat.completions
      .create({
        model: "gpt-4o",
        tools: [
          {
            function: {
              name: "scan-file",
              description: "scan file",
              parameters: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    description: "The file to scan",
                  },
                  // unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["file"],
              },
            },
            type: "function",
          },
        ],
        messages: [
          {
            role: "system",
            content:
              "Act as a code-security-scanner, tell me problems in the codes below: \n\n" + all.slice(0, 1024 * 80),
          },
        ],
        stream: true,
      })
      .then((e) => e.toReadableStream()),
  )
    .through(new PolyfillTextDecoderStream())
    .map((e) => JSON.parse(e).choices[0].delta.content ?? "")
    .tees(fromWritable(createWriteStream(resultmd)))
    .log((e) => console.write(e))
    .toNil();

  await $`code ${resultmd}`;

  // console.log(res.status);
  // const result = await res.text();
  // console.log("result", result.length);
  // await writeFile(resultmd, result);
  // await $`code ${resultmd}`;
  // console.log("all done");
});
