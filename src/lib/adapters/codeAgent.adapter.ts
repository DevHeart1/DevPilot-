import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  GitLabRepositoryFile,
  NormalizedFixRecommendation,
  PatchFile,
  PatchProposal,
  AgentMessage,
} from "../../types";
import { config } from "../config/env";
import { createUnifiedDiff } from "../utils/diff";

interface FixRecommendationInput {
  taskId: string;
  taskTitle: string;
  taskPrompt?: string;
  visionAnalysisResult: {
    issueType?: string;
    suspectedComponent?: string;
    explanation?: string;
    recommendedFix?: string;
    evidence?: string[];
    suggestedTags?: string[];
  };
  repoTreePaths: string[];
  memoryContent?: string;
}

interface PatchGenerationInput {
  taskId: string;
  recommendation: NormalizedFixRecommendation;
  files: GitLabRepositoryFile[];
}

function getAiClient(): GoogleGenAI {
  if (!config.isGeminiConfigured) {
    throw new Error(
      "Gemini is not configured. Set VITE_LIVE_MODE=true and VITE_GEMINI_API_KEY.",
    );
  }

  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

function parseJson<T>(text: string): T {
  const jsonText = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(jsonText) as T;
}

export const codeAgentAdapter = {
  async generateFixRecommendation(
    input: FixRecommendationInput,
  ): Promise<NormalizedFixRecommendation> {
    const ai = getAiClient();
    const prompt = `
You are a senior code-fix agent.
Given a UI issue analysis and repository tree, determine the most likely files and the fix strategy.

Task Title: ${input.taskTitle}
Task Prompt: ${input.taskPrompt || "None"}
Issue Type: ${input.visionAnalysisResult.issueType || "unknown"}
Suspected Component: ${input.visionAnalysisResult.suspectedComponent || "unknown"}
Explanation: ${input.visionAnalysisResult.explanation || "None"}
Recommended Fix: ${input.visionAnalysisResult.recommendedFix || "None"}
Evidence:
${(input.visionAnalysisResult.evidence || []).join("\n") || "None"}

Historical Memory:
${input.memoryContent || "None"}

Repository Tree:
${input.repoTreePaths.join("\n")}

Respond with valid JSON only:
{
  "issueType": "string",
  "suspectedComponent": "string",
  "suspectedFiles": ["path/to/file.tsx"],
  "explanation": "string",
  "recommendedFix": "string",
  "evidence": ["string"],
  "tags": ["string"],
  "confidence": number
}
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [prompt],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [
          { urlContext: {} },
          { codeExecution: {} },
          { googleSearch: {} },
        ],
      },
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty fix recommendation response.");
    }

    const parsed = parseJson<Omit<NormalizedFixRecommendation, "taskId" | "sourceArtifactIds">>(
      response.text,
    );

    return {
      taskId: input.taskId,
      issueType: parsed.issueType,
      suspectedComponent: parsed.suspectedComponent,
      suspectedFiles: parsed.suspectedFiles,
      explanation: parsed.explanation,
      recommendedFix: parsed.recommendedFix,
      evidence: parsed.evidence,
      tags: parsed.tags,
      confidence: parsed.confidence,
      sourceArtifactIds: [],
    };
  },

  async proposePatch(
    input: PatchGenerationInput,
  ): Promise<{ proposal: PatchProposal; files: PatchFile[] }> {
    const ai = getAiClient();

    const prompt = `
You are a senior TypeScript/React code generation agent.
Update the provided repository files to address the issue.
Return only valid JSON. Do not include markdown fences.

Issue Type: ${input.recommendation.issueType}
Suspected Component: ${input.recommendation.suspectedComponent}
Explanation: ${input.recommendation.explanation}
Recommended Fix: ${input.recommendation.recommendedFix}
Evidence:
${input.recommendation.evidence.join("\n") || "None"}

Repository Files:
${input.files
        .map(
          (file) => `FILE: ${file.filePath}\n${file.content}`,
        )
        .join("\n\n====\n\n")}

Respond with JSON:
{
  "title": "string",
  "summary": "string",
  "recommendedStrategy": "string",
  "explanation": "string",
  "confidence": number,
  "files": [
    {
      "filePath": "path/to/file.tsx",
      "changeType": "update" | "create" | "delete",
      "explanation": "string",
      "nextContent": "full file content after the change"
    }
  ]
}
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [prompt],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [
          { urlContext: {} },
          { codeExecution: {} },
          { googleSearch: {} },
        ],
      },
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty patch proposal response.");
    }

    const parsed = parseJson<{
      title: string;
      summary: string;
      recommendedStrategy: string;
      explanation: string;
      confidence: number;
      files: Array<{
        filePath: string;
        changeType: "update" | "create" | "delete";
        explanation: string;
        nextContent: string;
      }>;
    }>(response.text);

    const proposalId = crypto.randomUUID();
    const files = parsed.files.map((file) => {
      const currentFile = input.files.find(
        (item) => item.filePath === file.filePath,
      );
      const currentContent = currentFile?.content || "";
      return {
        id: crypto.randomUUID(),
        proposalId,
        taskId: input.taskId,
        filePath: file.filePath,
        changeType: file.changeType,
        patch: createUnifiedDiff(file.filePath, currentContent, file.nextContent),
        currentContent,
        nextContent: file.nextContent,
        explanation: file.explanation,
        createdAt: Date.now(),
      } satisfies PatchFile;
    });

    const proposal: PatchProposal = {
      id: proposalId,
      taskId: input.taskId,
      source: "gemini_code_agent",
      status: "ready_for_review",
      title: parsed.title,
      summary: parsed.summary,
      suspectedFiles: input.recommendation.suspectedFiles,
      recommendedStrategy: parsed.recommendedStrategy,
      explanation: parsed.explanation,
      confidence: parsed.confidence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return { proposal, files };
  },

  async handleFollowUp(input: {
    taskId: string;
    taskTitle: string;
    messages: AgentMessage[];
    currentProposal?: PatchProposal;
    currentFiles?: PatchFile[];
    repoFiles?: GitLabRepositoryFile[];
  }): Promise<{ reply: string; proposal?: PatchProposal; files?: PatchFile[] }> {
    const ai = getAiClient();

    const prompt = `
You are a senior code-fix agent currently engaged in a conversation with a human developer.
The developer is providing follow-up instructions or feedback on a task.
Based on the conversation history and the current state of the proposed fix, you should:
1. Provide a textual reply acknowledging their feedback and explaining your updated approach.
2. If their feedback implies the code needs to be updated or a new file needs to be patched, generate an updated patch proposal. If no code changes are needed and you are just answering a question, leave the "files" array empty.

Task Title: ${input.taskTitle}

Conversation History:
${input.messages
        .map((m) => `[${new Date(m.timestamp).toISOString()}] ${m.sender}: ${m.content}`)
        .join("\n")}

Current Patch Proposal (if any):
${input.currentProposal
        ? `Summary: ${input.currentProposal.summary}\nExplanation: ${input.currentProposal.explanation}`
        : "None"}

Repository Files (context):
${input.repoFiles
        ?.map((file) => `FILE: ${file.filePath}\n${file.content}`)
        .join("\n\n====\n\n") || "None"}

Respond with valid JSON only:
{
  "reply": "string",
  "hasCodeChanges": boolean,
  "title": "string (required if hasCodeChanges=true)",
  "summary": "string (required if hasCodeChanges=true)",
  "recommendedStrategy": "string (required if hasCodeChanges=true)",
  "explanation": "string (required if hasCodeChanges=true)",
  "files": [
    {
      "filePath": "path/to/file.tsx",
      "changeType": "update" | "create" | "delete",
      "explanation": "string",
      "nextContent": "full file content after the change"
    }
  ]
}
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [prompt],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [
          { urlContext: {} },
          { codeExecution: {} },
          { googleSearch: {} },
        ],
      },
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty conversational response.");
    }

    const parsed = parseJson<{
      reply: string;
      hasCodeChanges: boolean;
      title?: string;
      summary?: string;
      recommendedStrategy?: string;
      explanation?: string;
      files?: Array<{
        filePath: string;
        changeType: "update" | "create" | "delete";
        explanation: string;
        nextContent: string;
      }>;
    }>(response.text);

    let newProposal: PatchProposal | undefined;
    let newFiles: PatchFile[] | undefined;

    if (parsed.hasCodeChanges && parsed.files && parsed.files.length > 0) {
      const proposalId = crypto.randomUUID();
      newFiles = parsed.files.map((file) => {
        const repoFile = input.repoFiles?.find((f) => f.filePath === file.filePath);
        const currentContent = repoFile?.content || "";
        return {
          id: crypto.randomUUID(),
          proposalId,
          taskId: input.taskId,
          filePath: file.filePath,
          changeType: file.changeType,
          patch: createUnifiedDiff(file.filePath, currentContent, file.nextContent),
          currentContent,
          nextContent: file.nextContent,
          explanation: file.explanation,
          createdAt: Date.now(),
        } satisfies PatchFile;
      });

      newProposal = {
        id: proposalId,
        taskId: input.taskId,
        source: "gemini_code_agent",
        status: "ready_for_review",
        title: parsed.title || "Refined Patch Proposal",
        summary: parsed.summary || "",
        suspectedFiles: newFiles.map((f) => f.filePath),
        recommendedStrategy: parsed.recommendedStrategy || "",
        explanation: parsed.explanation || "",
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    return { reply: parsed.reply, proposal: newProposal, files: newFiles };
  },
};
