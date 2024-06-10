import { db } from "./db";
type CNPulls = {
  repository: string;
  title: string;
  state: string;
};
export const CNPulls = db.collection<CNPulls>("CNPulls");

