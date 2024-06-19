import { gh } from "./gh";

export const ghUser = (await gh.users.getAuthenticated()).data;

console.log("Fetch Current Github User...");
console.log(`Current Github User: ${ghUser.login} <${ghUser.email}>`);