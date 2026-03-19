import { db } from "../db";

const LEGACY_DEMO_REPO = "Project-X";
const LEGACY_DEMO_TITLES = new Set([
  "Fix layout for top matches on mobile",
  "Refactor authentication middleware",
  "Update dependency: tailwindcss v3.4",
  "Implement Redis caching for API endpoints",
  "Hotfix: SSL Certificate renewal automation",
]);

async function pruneLegacyDemoData(): Promise<void> {
  const allTasks = await db.tasks.toArray();
  const legacyTasks = allTasks.filter(
    (task) =>
      task.repo === LEGACY_DEMO_REPO || LEGACY_DEMO_TITLES.has(task.title),
  );

  if (legacyTasks.length === 0) {
    return;
  }

  const taskIds = legacyTasks.map((task) => task.id);
  const proposalIds = (
    await db.patchProposals.where("taskId").anyOf(taskIds).toArray()
  ).map((proposal) => proposal.id);
  const verificationResultIds = (
    await db.verificationResults.where("taskId").anyOf(taskIds).toArray()
  ).map((result) => result.id);
  const flowRunIds = (
    await db.duoFlowRuns.where("taskId").anyOf(taskIds).toArray()
  ).map((flowRun) => flowRun.id);

  await db.transaction(
    "rw",
    [
      db.tasks,
      db.agentMessages,
      db.taskArtifacts,
      db.memories,
      db.agentRuns,
      db.agentEvents,
      db.runSteps,
      db.taskMemoryHits,
      db.patchProposals,
      db.patchFiles,
      db.verificationPlans,
      db.verificationResults,
      db.verificationEvidences,
      db.duoFlowRuns,
      db.duoAgentInvocations,
      db.gitlabRepositoryActions,
      db.gitlabMergeRequestRecords,
      db.gitlabPipelineRecords,
    ],
    async () => {
      await db.tasks.bulkDelete(taskIds);

      for (const taskId of taskIds) {
        await db.agentMessages.where("taskId").equals(taskId).delete();
        await db.taskArtifacts.where("taskId").equals(taskId).delete();
        await db.agentRuns.where("taskId").equals(taskId).delete();
        await db.agentEvents.where("taskId").equals(taskId).delete();
        await db.runSteps.where("taskId").equals(taskId).delete();
        await db.taskMemoryHits.where("taskId").equals(taskId).delete();
        await db.patchProposals.where("taskId").equals(taskId).delete();
        await db.verificationPlans.where("taskId").equals(taskId).delete();
        await db.verificationResults.where("taskId").equals(taskId).delete();
        await db.duoFlowRuns.where("taskId").equals(taskId).delete();
        await db.gitlabRepositoryActions.where("taskId").equals(taskId).delete();
        await db.gitlabMergeRequestRecords.where("taskId").equals(taskId).delete();
        await db.gitlabPipelineRecords.where("taskId").equals(taskId).delete();
      }

      if (proposalIds.length > 0) {
        await db.patchFiles.where("proposalId").anyOf(proposalIds).delete();
      }

      if (verificationResultIds.length > 0) {
        await db.verificationEvidences
          .where("verificationResultId")
          .anyOf(verificationResultIds)
          .delete();
      }

      if (flowRunIds.length > 0) {
        await db.duoAgentInvocations.where("flowRunId").anyOf(flowRunIds).delete();
      }

      const remainingTasks = await db.tasks.count();
      if (remainingTasks === 0) {
        await db.memories.clear();
        await db.taskMemoryHits.clear();
      }
    },
  );
}

export async function initializeDb(): Promise<void> {
  await db.open();
  await pruneLegacyDemoData();
}
