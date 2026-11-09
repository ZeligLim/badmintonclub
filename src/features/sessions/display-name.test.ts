import { describe, expect, it } from "vitest";
import { isStudentNumberDisplayName } from "./display-name";

describe("isStudentNumberDisplayName", () => {
  it("recognises an ATU student number", () => {
    expect(isStudentNumberDisplayName("g00440629")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(isStudentNumberDisplayName("  G00440629 ")).toBe(true);
  });

  it("accepts student numbers of any length from six digits", () => {
    expect(isStudentNumberDisplayName("g123456")).toBe(true);
    expect(isStudentNumberDisplayName("g12345")).toBe(false);
  });

  it("leaves real names alone", () => {
    expect(isStudentNumberDisplayName("Jamie Murphy")).toBe(false);
    expect(isStudentNumberDisplayName("Gráinne Ní Dhomhnaill")).toBe(false);
  });

  it("handles missing names", () => {
    expect(isStudentNumberDisplayName(null)).toBe(false);
    expect(isStudentNumberDisplayName(undefined)).toBe(false);
    expect(isStudentNumberDisplayName("   ")).toBe(false);
  });
});
