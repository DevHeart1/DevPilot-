import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env';

export interface VisionAnalysisResult {
  summary: string;
  issueType: "layout_overflow" | "visual_regression" | "console_error" | "network_error" | "unknown";
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

const parseGeminiJson = (text: string): VisionAnalysisResult | null => {
  try {
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr) as VisionAnalysisResult;
  } catch (e) {
    console.error('Failed to parse Gemini JSON output', e);
    return null;
  }
};

const getMockResult = (): VisionAnalysisResult => ({
  summary: "Mock analysis triggered due to missing API key.",
  issueType: "layout_overflow",
  severity: "medium",
  suspectedComponent: "MomentsGrid",
  explanation: "A simulated layout overflow was detected due to mock execution mode.",
  recommendedFix: "Apply 'overflow-hidden' to the parent container.",
  confidence: 0.85,
  evidence: ["Simulated visual discrepancy"],
  suggestedTags: ["ui_pattern", "css"]
});

/**
 * Adapter for calling Gemini 3.1 Pro Preview.
 * Includes graceful fallback if the VITE_GEMINI_API_KEY is not set.
 */
export const visionAnalysisAdapter = {

  async compareBeforeAfter(input: VerificationAnalysisInput): Promise<VerificationAnalysisResult> {
    if (!config.geminiApiKey || !config.liveMode) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return {
        issueResolved: true,
        regressionDetected: false,
        summary: "Mock verification passed. The issue appears resolved.",
        explanation: "Simulated comparison of before/after state based on mock data.",
        confidence: 0.95
      };
    }

    try {
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const prompt = `
        You are an expert Frontend QA AI agent. Compare the before and after state of the application
        to determine if the original issue was resolved and if any new regressions were introduced.

        Task Title: ${input.taskTitle}
        Original Issue Summary: ${input.originalIssueSummary}
        Expected Outcome: ${input.expectedOutcome}

        Before Console Logs: ${input.beforeConsoleLogs?.join('\n') || 'None'}
        After Console Logs: ${input.afterConsoleLogs?.join('\n') || 'None'}

        Respond ONLY with a valid JSON object matching this schema exactly:
        {
          "issueResolved": boolean,
          "regressionDetected": boolean,
          "summary": "string",
          "explanation": "string",
          "confidence": 0-1 (number)
        }
      `;

      const contents: any[] = [prompt];

      if (input.beforeScreenshotBase64) {
        contents.push({ inlineData: { data: input.beforeScreenshotBase64.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' } });
      }
      if (input.afterScreenshotBase64) {
        contents.push({ inlineData: { data: input.afterScreenshotBase64.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' } });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: contents,
      });

      if (response.text) {
        try {
          const jsonStr = response.text.replace(/```json\n?|\n?```/g, '').trim();
          return JSON.parse(jsonStr) as VerificationAnalysisResult;
        } catch (e) {
          console.error('Failed to parse Gemini verification JSON output', e);
        }
      }

      throw new Error('Invalid or empty response text from Gemini');

    } catch (error) {
      console.error('Verification Analysis failed:', error);
      return {
        issueResolved: false,
        regressionDetected: false,
        summary: "Analysis failed, unable to confirm resolution.",
        explanation: "The AI model failed to return a valid comparison.",
        confidence: 0.1
      };
    }
  }
,

  async analyzeUi(input: VisionAnalysisInput): Promise<VisionAnalysisResult> {
    if (!config.geminiApiKey || !config.liveMode) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return getMockResult();
    }

    try {
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const prompt = `
        You are an expert Frontend AI agent. Analyze the provided screenshot, console logs, and context
        to diagnose any UI issues matching the task title.

        Task Title: ${input.taskTitle}
        Target URL: ${input.targetUrl}
        Viewport: ${input.viewportWidth}x${input.viewportHeight}
        Console Logs: ${input.consoleErrors?.join('\n') || 'None'}
        Prior Knowledge: ${input.priorMemoryHints || 'None'}

        Respond ONLY with a valid JSON object matching this schema exactly:
        {
          "summary": "string",
          "issueType": "layout_overflow" | "visual_regression" | "console_error" | "network_error" | "unknown",
          "severity": "low" | "medium" | "high",
          "suspectedComponent": "string",
          "explanation": "string",
          "recommendedFix": "string",
          "confidence": 0-1 (number),
          "evidence": ["string"],
          "suggestedTags": ["string"]
        }
      `;

      let response;
      if (input.screenshotBase64) {
        // Handle standard base64 data URI format from browser layer
        const base64Data = input.screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
        response = await ai.models.generateContent({
          model: 'gemini-2.5-pro', // Using the current stable capable model based on typical usage, change if 3.1 preview is strictly required in SDK
          contents: [
            prompt,
            { inlineData: { data: base64Data, mimeType: 'image/png' } }
          ],
        });
      } else {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: [prompt],
        });
      }

      if (response.text) {
        const parsed = parseGeminiJson(response.text);
        if (parsed) return parsed;
      }

      throw new Error('Invalid or empty response text from Gemini');

    } catch (error) {
      console.error('Vision Analysis failed:', error);
      return {
        ...getMockResult(),
        summary: "Analysis failed, returned mock fallback.",
        confidence: 0.1,
      };
    }
  }
};
