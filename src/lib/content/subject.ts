import { SubjectId } from "./types";

export function isSubjectId(x: string): x is SubjectId {
  return x === "math" || x === "physics" || x === "chemistry";
}

