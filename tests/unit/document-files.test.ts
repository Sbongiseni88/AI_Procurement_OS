import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sha256Hex, sniffMimeType, versionStoragePath } from "../../src/lib/documents/files.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffMimeType", () => {
  it("recognises the four accepted types from their first bytes", () => {
    assert.equal(sniffMimeType(text("%PDF-1.7\n...")), "application/pdf");
    assert.equal(
      sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
      "image/png",
    );
    assert.equal(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0)), "image/jpeg");
    assert.equal(sniffMimeType(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
  });

  it("finds a PDF header after leading bytes, within the first 1024", () => {
    const late = new Uint8Array(1100);
    late.set(text("%PDF-1.4"), 1000);
    assert.equal(sniffMimeType(late), "application/pdf");

    const tooLate = new Uint8Array(1100);
    tooLate.set(text("%PDF-1.4"), 1020);
    assert.equal(sniffMimeType(tooLate), null);
  });

  it("refuses anything else, whatever the file is called", () => {
    for (const value of ["<html>", "PK\u0003\u0004 (a .docx is a zip)", "", "%PDF"]) {
      assert.equal(sniffMimeType(text(value)), null, JSON.stringify(value));
    }
    // RIFF but not WebP (e.g. a WAV file).
    assert.equal(sniffMimeType(text("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")), null);
  });
});

describe("sha256Hex", () => {
  it("hashes the exact bytes (known test vectors)", () => {
    assert.equal(
      sha256Hex(new Uint8Array()),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    assert.equal(
      sha256Hex(text("abc")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("versionStoragePath", () => {
  it("puts the company first, as the storage policy and the database require", () => {
    assert.equal(versionStoragePath("org", "doc", "ver"), "org/doc/ver");
  });
});
