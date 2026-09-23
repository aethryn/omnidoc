import { timingSafeEqual } from "crypto";

export function validBearerToken(authorization: string | null, expected: string | undefined) {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice(7));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function isImageReferenced(fileName: string, contents: Array<string | null | undefined>) {
  const reference = `/api/images/${fileName}`;
  return contents.some((content) => content?.includes(reference));
}
