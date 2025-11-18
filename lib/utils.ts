import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export async function confirm(question: string) {
	return new Promise<boolean>((resolve) => {
		process.stdin.resume();
		process.stdout.write(`${question} (y/n): `);
		process.stdin.once("data", function (data) {
			const answer = data.toString().trim().toLowerCase();
			process.stdin.pause();
			resolve(answer === "y" || answer === "yes");
		});
	});
}
