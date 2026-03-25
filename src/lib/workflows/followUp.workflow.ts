import { codeAgentAdapter } from "../adapters/codeAgent.adapter";
import { gitlabRepositoryAdapter } from "../adapters/gitlabRepository.adapter";
import { taskService, patchProposalService } from "../services";
import { runService } from "../services/run.service";
import { countDiffStats } from "../utils/diff";

export const runFollowUpWorkflow = async (taskId: string) => {
    const task = await taskService.getTaskById(taskId);
    if (!task) return;

    // We don't strictly require an active run for a follow-up conversation, 
    // but we can create a lightweight run or just execute it directly.
    // For simplicity, we just execute and track status on the task.

    await taskService.updateTask(taskId, { codeFixStatus: "running" });

    try {
        const messages = await taskService.getMessagesByTaskId(taskId);

        // Get the most recent patch proposal, if any
        const currentProposal = await patchProposalService.getLatestProposalForTask(taskId);

        let currentFiles;
        let repoFiles;

        if (currentProposal) {
            currentFiles = await patchProposalService.getPatchFilesForProposal(currentProposal.id);

            // Fetch the actual file contents from the repo (or from patch files if we have them)
            if (currentProposal.suspectedFiles && currentProposal.suspectedFiles.length > 0) {
                const fileResults = await Promise.all(
                    currentProposal.suspectedFiles.map((filePath) =>
                        gitlabRepositoryAdapter.getFileContent(
                            filePath,
                            task.gitlabProjectId,
                            task.branch || task.defaultBranch
                        )
                    )
                );
                repoFiles = fileResults
                    .filter((result): result is typeof result & { data: NonNullable<typeof result.data> } =>
                        result.success && !!result.data
                    )
                    .map((result) => result.data);
            }
        }

        const { reply, proposal, files: patchFiles } = await codeAgentAdapter.handleFollowUp({
            taskId,
            taskTitle: task.title,
            messages,
            currentProposal,
            currentFiles,
            repoFiles
        });

        if (proposal && patchFiles && patchFiles.length > 0) {
            // The AI proposed a new code change based on the conversation
            const proposalId = await patchProposalService.createPatchProposal(proposal);
            for (const file of patchFiles) {
                await patchProposalService.createPatchFile({ ...file, proposalId });
            }

            const combinedDiff = patchFiles.map((file) => file.patch).join("\n\n");
            const diffStats = patchFiles.reduce(
                (totals, file) => {
                    const stats = countDiffStats(file.patch);
                    totals.additions += stats.additions;
                    totals.deletions += stats.deletions;
                    return totals;
                },
                { additions: 0, deletions: 0 },
            );

            await taskService.updateTaskArtifact(taskId, "diff", combinedDiff);
            await taskService.updateTaskDiffStats(
                taskId,
                diffStats.additions,
                diffStats.deletions,
            );

            await taskService.updateTask(taskId, { codeFixStatus: "ready_for_review" });
        } else {
            // No code changes, just answering a question
            await taskService.updateTask(taskId, { codeFixStatus: (currentProposal && currentProposal.status !== "draft") ? currentProposal.status : "idle" });
        }

        // Append the AI's reply to the chat
        await taskService.appendAgentMessage({
            taskId,
            sender: "code_agent",
            content: reply,
            kind: "success",
            timestamp: Date.now(),
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await taskService.updateTask(taskId, { codeFixStatus: "failed" });
        await taskService.appendAgentMessage({
            taskId,
            sender: "system",
            content: `Follow-up workflow failed: ${message}`,
            kind: "warning",
            timestamp: Date.now(),
        });
    }
};
