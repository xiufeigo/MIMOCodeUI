import { describe, expect, it } from "vitest"
import {
  IMAGE_MIME_EXTENSIONS,
  baseName,
  dataUrlForImage,
  fileUrlForPath,
  isImageMime,
  mimeForPath,
} from "./attachment"

describe("mimeForPath", () => {
  it("maps image extensions", () => {
    expect(mimeForPath("a.png")).toBe("image/png")
    expect(mimeForPath("a.JPEG")).toBe("image/jpeg")
    expect(mimeForPath("b.webp")).toBe("image/webp")
  })

  it("maps common text extensions", () => {
    expect(mimeForPath("a.ts")).toBe("text/typescript")
    expect(mimeForPath("a.json")).toBe("application/json")
    expect(mimeForPath("a.md")).toBe("text/plain")
  })

  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeForPath("a.unknown")).toBe("application/octet-stream")
    expect(mimeForPath("noextension")).toBe("application/octet-stream")
  })
})

describe("isImageMime", () => {
  it("recognizes image mime types", () => {
    expect(isImageMime("image/png")).toBe(true)
    expect(isImageMime("image/webp")).toBe(true)
    expect(isImageMime("text/plain")).toBe(false)
  })
})

describe("baseName", () => {
  it("returns the last path segment for both separators", () => {
    expect(baseName("C:\\a\\b\\c.txt")).toBe("c.txt")
    expect(baseName("/a/b/c.txt")).toBe("c.txt")
    expect(baseName("c.txt")).toBe("c.txt")
  })
})

describe("fileUrlForPath", () => {
  it("normalizes backslashes to forward slashes", () => {
    expect(fileUrlForPath("C:\\a\\b.txt")).toBe("file://C:/a/b.txt")
  })
})

describe("dataUrlForImage", () => {
  it("builds a base64 data URL", () => {
    expect(dataUrlForImage("image/png", "AAA")).toBe("data:image/png;base64,AAA")
  })
})

describe("IMAGE_MIME_EXTENSIONS", () => {
  it("covers the supported image formats", () => {
    expect(Object.keys(IMAGE_MIME_EXTENSIONS).sort()).toEqual([".gif", ".jpeg", ".jpg", ".png", ".webp"].sort())
  })
})
