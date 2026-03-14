import { VerificationAnalysisInput, VerificationAnalysisResult, visionAnalysisAdapter } from '../adapters/visionAnalysis.adapter';

export const verificationComparisonService = {
  /**
   * Compares before and after state to determine if an issue was resolved
   * without introducing new regressions.
   */
  async compareState(input: VerificationAnalysisInput): Promise<VerificationAnalysisResult> {
    console.log('[Verification Comparison] Starting comparison for task:', input.taskTitle);

    // In a more complex implementation, we might do local diffs of logs here
    // before asking the AI. For the MVP, we rely on the adapter (which uses Gemini).

    return await visionAnalysisAdapter.compareBeforeAfter(input);
  }
};
