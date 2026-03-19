import { GoogleGenAI } from "@google/genai";
import { config } from "../config/env";

export interface VisionAnalysisResult {
  summary: string;
  issueType:
    | "layout_overflow"
    | "visual_regression"
    | "console_error"
    | "network_error"
    | "unknown";
  severity: "low" | "medium" | "high";
  suspectedComponent: string;
  explanation: string;
  recommendedFix: string;
  confidence: number;
  evidence: string[];
  suggestedTags: string[];
}

export interface VerificationAnalysisResult {
  issueResolved: boolean;
  regressionDetected: boolean;
  summary: string;
  explanation: string;
  confidence: number;
}

export interface VerificationAnalysisInput {
  taskTitle: string;
  originalIssueSummary: string;
  expectedOutcome: string;
  beforeScreenshotBase64?: string;
  afterScreenshotBase64?: string;
  beforeConsoleLogs?: string[];
  afterConsoleLogs?: string[];
}

export interface VisionAnalysisInput {
  taskTitle: string;
  targetUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  screenshotBase64?: string;
  consoleErrors?: string[];
  priorMemoryHints?: string;
}

function getAiClient(): GoogleGenAI {
  if (!config.isGeminiConfigured) {
    throw new Error(
      "Gemini is not configured. Set VITE_LIVE_MODE=true and VITE_GEMINI_API_KEY.",
    );
  }

  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

function parseJsonResponse<T>(text: string): T {
  const jsonText = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(jsonText) as T;
}

function imagePart(dataUri?: string) {
  if (!dataUri) {
    return null;
  }

  return {
    inlineData: {
      data: dataUri.replace(/^data:image\/\w+;base64,/, ""),
      mimeType: "image/png",
    },
  };
}

export const visionAnalysisAdapter = {
  async compareBeforeAfter(
    input: VerificationAnalysisInput,
  ): Promise<VerificationAnalysisResult> {
    const ai = getAiClient();

    const prompt = `
You are an expert frontend QA agent.
Compare the before and after application states and determine whether the original issue is resolved.

Task Title: ${input.taskTitle}
Original Issue Summary: ${input.originalIssueSummary}
Expected Outcome: ${input.expectedOutcome}

Before Console Logs:
${input.beforeConsoleLogs?.join("\n") || "None"}

After Console Logs:
${input.afterConsoleLogs?.join("\n") || "None"}

Respond with valid JSON only:
{
  "issueResolved": boolean,
  "regressionDetected": boolean,
  "summary": "string",
  "explanation": "string",
  "confidence": number
}
`.trim();

    const contents = [prompt];
    const beforeImage = imagePart(input.beforeScreenshotBase64);
    const afterImage = imagePart(input.afterScreenshotBase64);
    if (beforeImage) {
      contents.push(beforeImage as never);
    }
    if (afterImage) {
      contents.push(afterImage as never);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty verification response.");
    }

    return parseJsonResponse<VerificationAnalysisResult>(response.text);
  },

  async analyzeUi(input: VisionAnalysisInput): Promise<VisionAnalysisResult> {
    const ai = getAiClient();

    const prompt = `
You are an expert frontend debugging agent.
Analyze the provided application state and identify the issue that best matches the task.

Task Title: ${input.taskTitle}
Target URL: ${input.targetUrl}
Viewport: ${input.viewportWidth}x${input.viewportHeight}
Console Logs:
${input.consoleErrors?.join("\n") || "None"}

Prior Memory:
${input.priorMemoryHints || "None"}

Respond with valid JSON only:
{
  "summary": "string",
  "issueType": "layout_overflow" | "visual_regression" | "console_error" | "network_error" | "unknown",
  "severity": "low" | "medium" | "high",
  "suspectedComponent": "string",
  "explanation": "string",
  "recommendedFix": "string",
  "confidence": number,
  "evidence": ["string"],
  "suggestedTags": ["string"]
}
`.trim();

    const contents = [prompt];
    const screenshotPart = imagePart(input.screenshotBase64);
    if (screenshotPart) {
      contents.push(screenshotPart as never);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty UI analysis response.");
    }

    return parseJsonResponse<VisionAnalysisResult>(response.text);
  },
};
