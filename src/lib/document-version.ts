import { createHash } from "crypto";

export function documentContentHash(title: string, content: string) { return createHash("sha256").update(`${title}\n${content}`).digest("hex"); }
