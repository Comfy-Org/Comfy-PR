import { updateAuthorsForGithub } from "./updateAuthorsForGithub";
import { updateAuthorsFromCNRepo } from "./updateAuthorsFromCNRepo";

export async function updateAuthors() {
  await updateAuthorsFromCNRepo();
  await updateAuthorsForGithub();
}
