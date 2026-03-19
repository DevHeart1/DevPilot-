import { db } from "../db";
import { VerificationEvidence, VerificationResult } from "../../types";

export const verificationService = {
  async createVerificationResult(
    result: VerificationResult,
  ): Promise<string> {
    await db.verificationResults.add(result);
    return result.id;
  },

  async createVerificationEvidence(
    evidence: VerificationEvidence,
  ): Promise<string> {
    await db.verificationEvidences.add(evidence);
    return evidence.id;
  },

  async getLatestResultForTask(
    taskId: string,
  ): Promise<VerificationResult | undefined> {
    const results = await db.verificationResults
      .where("taskId")
      .equals(taskId)
      .reverse()
      .sortBy("createdAt");
    return results[0];
  },

  async getEvidenceForResult(
    verificationResultId: string,
  ): Promise<VerificationEvidence[]> {
    return db.verificationEvidences
      .where("verificationResultId")
      .equals(verificationResultId)
      .toArray();
  },
};
