/** Integrity marker for the exact emitted stylesheet, including release-only additions. */
import { createHash } from "node:crypto";

const trailer = /\n\/\* playmancer-stylesheet-sha256:([0-9a-f]{64}) \*\/\n$/;
const digest = body => createHash("sha256").update(body, "utf8").digest("hex");

export function sealStylesheet(body) {
  if (typeof body !== "string" || body.includes("/* playmancer-stylesheet-sha256:")) {
    throw new Error("Invalid stylesheet body");
  }
  return body + `\n/* playmancer-stylesheet-sha256:${digest(body)} */\n`;
}

export function appendToSealedStylesheet(sealed, addition) {
  const match = typeof sealed === "string" ? trailer.exec(sealed) : null;
  if (!match || sealed.split("/* playmancer-stylesheet-sha256:").length !== 2 ||
      digest(sealed.slice(0, match.index)) !== match[1]) {
    throw new Error("Missing or corrupt stylesheet seal");
  }
  return sealStylesheet(sealed.slice(0, match.index) + addition);
}
