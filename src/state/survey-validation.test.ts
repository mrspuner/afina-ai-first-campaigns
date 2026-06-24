import { describe, it, expect } from "vitest";
import {
  isCompanyNameValid,
  isTaskDescriptionValid,
  isSurveyMinimallyFilled,
} from "./survey-validation";

describe("isCompanyNameValid", () => {
  it("accepts a 2+ char name", () => {
    expect(isCompanyNameValid("Acme")).toBe(true);
  });
  it("rejects empty / whitespace", () => {
    expect(isCompanyNameValid("")).toBe(false);
    expect(isCompanyNameValid("   ")).toBe(false);
  });
  it("rejects single char", () => {
    expect(isCompanyNameValid("A")).toBe(false);
  });
});

describe("isTaskDescriptionValid", () => {
  it("accepts a non-empty description", () => {
    expect(isTaskDescriptionValid("Хотим привлечь людей, ищущих ипотеку")).toBe(
      true,
    );
  });
  it("accepts a single meaningful word over the min length", () => {
    expect(isTaskDescriptionValid("ипотека")).toBe(true);
  });
  it("rejects empty / whitespace-only", () => {
    expect(isTaskDescriptionValid("")).toBe(false);
    expect(isTaskDescriptionValid("   ")).toBe(false);
  });
  it("rejects too-short input", () => {
    expect(isTaskDescriptionValid("ок")).toBe(false); // < min length
  });
});

describe("isSurveyMinimallyFilled (хотя бы одно поле)", () => {
  it("оба пустые → false", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "", taskDescription: "" })).toBe(false);
  });
  it("оба из пробелов → false", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "  ", taskDescription: "\n\t" })).toBe(false);
  });
  it("только сайт → true", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "example.com", taskDescription: "" })).toBe(true);
  });
  it("только задача → true", () => {
    expect(isSurveyMinimallyFilled({ companyWebsite: "", taskDescription: "ищу ипотеку" })).toBe(true);
  });
});
