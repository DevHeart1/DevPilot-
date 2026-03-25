import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AdvancedChatInput } from "../AdvancedChatInput";
import { sandboxAdapter } from "../../lib/adapters/sandbox.adapter";
import { gitlabRepositoryAdapter } from "../../lib/adapters/gitlabRepository.adapter";
import { config } from "../../lib/config/env";
import {
    gitlabRepositoryService,
    patchProposalService,
    taskService,
    verificationService,
    memoryService,
    runService,
} from "../../lib/services";
import { PatchDiff } from "./PatchDiff";
import { runUiInspectionWorkflow } from "../../lib/workflows/uiInspection.workflow";
import { runVerificationPreparationWorkflow } from "../../lib/workflows/verificationPreparation.workflow";
import { runFollowUpWorkflow } from "../../lib/workflows";
import {
    Task,
} from "../../types";

const statusBadgeLabel = (status?: string) =>
    status ? status.replace(/_/g, " ") : "unknown";

const toImageSrc = (content?: string) =>
    content
        ? content.startsWith("data:")
            ? content
            : `data:image/png;base64,${content}`
        : undefined;

const parseJsonContent = <T,>(content?: string): T | undefined => {
    if (!content) return undefined;
    try {
        return JSON.parse(content) as T;
    } catch {
        return undefined;
    }
};

interface TaskDetailProps {
    taskId: string;
    onBack: () => void;
    projects: string[];
    branches: string[];
}

export const TaskDetail: React.FC<TaskDetailProps> = ({
    taskId,
    onBack,
    projects,
    branches,
}) => {
    const [isAgentOpen, setIsAgentOpen] = useState(true);
    const [isBrowserOpen, setIsBrowserOpen] = useState(true);
    const [isCodeOpen, setIsCodeOpen] = useState(true);
    const [codeTab, setCodeTab] = useState<"diff" | "log" | "terminal" | "vision_analysis">(
        "diff",
    );
    const [isApproving, setIsApproving] = useState(false);
    const workflowTriggeredRef = useRef(false);

    const task = useLiveQuery(() => taskService.getTaskById(taskId), [taskId]);
    const messages = useLiveQuery(() => taskService.getMessagesByTaskId(taskId), [taskId]);
    const run = useLiveQuery(() => taskService.getActiveAgentRun(taskId), [taskId]);
    const memoryHits = useLiveQuery(() => memoryService.getTaskMemoryHits(taskId), [taskId]);
    const latestProposal = useLiveQuery(
        () => patchProposalService.getLatestProposalForTask(taskId),
        [taskId],
    );
    const patchFiles = useLiveQuery(
        () =>
            latestProposal
                ? patchProposalService.getPatchFilesForProposal(latestProposal.id)
                : Promise.resolve([]),
        [latestProposal?.id],
    );
    const runSteps = useLiveQuery(
        () => (run?.id ? runService.getRunStepsByRunId(run.id) : Promise.resolve([])),
        [run?.id],
    );
    const mrRecord = useLiveQuery(
        () => gitlabRepositoryService.getMRRecordForTask(taskId),
        [taskId],
    );
    const pipelineRecord = useLiveQuery(
        () => gitlabRepositoryService.getPipelineRecordForTask(taskId),
        [taskId],
    );
    const verificationResult = useLiveQuery(
        () => verificationService.getLatestResultForTask(taskId),
        [taskId],
    );
    const browserArtifact = useLiveQuery(
        async () =>
            (await taskService.getArtifactsByTaskIdAndType(taskId, "after_screenshot")) ||
            taskService.getArtifactsByTaskIdAndType(taskId, "screenshot"),
        [taskId],
    );
    const diffArtifact = useLiveQuery(
        () => taskService.getArtifactsByTaskIdAndType(taskId, "diff"),
        [taskId],
    );
    const logArtifact = useLiveQuery(
        () => taskService.getArtifactsByTaskIdAndType(taskId, "log"),
        [taskId],
    );
    const terminalArtifact = useLiveQuery(
        async () =>
            (await taskService.getArtifactsByTaskIdAndType(taskId, "after_logs")) ||
            taskService.getArtifactsByTaskIdAndType(taskId, "terminal"),
        [taskId],
    );
    const visionArtifact = useLiveQuery(
        () => taskService.getArtifactsByTaskIdAndType(taskId, "vision_analysis"),
        [taskId],
    );
    const afterAnalysisArtifact = useLiveQuery(
        () => taskService.getArtifactsByTaskIdAndType(taskId, "after_analysis"),
        [taskId],
    );

    const parsedVision = useMemo(
        () =>
            parseJsonContent<{
                summary?: string;
                explanation?: string;
            }>(visionArtifact?.content),
        [visionArtifact?.content],
    );

    const parsedVerification = useMemo(
        () =>
            parseJsonContent<{
                summary?: string;
                explanation?: string;
            }>(afterAnalysisArtifact?.content),
        [afterAnalysisArtifact?.content],
    );

    useEffect(() => {
        workflowTriggeredRef.current = false;
    }, [taskId]);

    useEffect(() => {
        if (
            !task ||
            !run ||
            workflowTriggeredRef.current ||
            task.status !== "running" ||
            run.status !== "running" ||
            task.inspectionStatus !== "idle"
        ) {
            return;
        }

        workflowTriggeredRef.current = true;
        void runUiInspectionWorkflow(taskId).catch(async (error) => {
            workflowTriggeredRef.current = false;
            await taskService.appendAgentMessage({
                taskId,
                sender: "system",
                content: `Unable to start UI inspection: ${error instanceof Error ? error.message : String(error)}`,
                kind: "warning",
                timestamp: Date.now(),
            });
        });
    }, [run?.status, task, taskId]);

    useEffect(() => {
        if (!mrRecord?.mergeRequestIid && !pipelineRecord?.pipelineId) return;

        const terminalMrStates = new Set(["merged", "closed", "locked"]);
        const terminalPipelineStates = new Set(["success", "failed", "canceled", "skipped", "manual"]);

        let cancelled = false;
        const poll = async () => {
            if (!config.isGitLabConfigured || cancelled) return;

            if (mrRecord?.mergeRequestIid && !terminalMrStates.has(mrRecord.status)) {
                const mrStatus = await gitlabRepositoryAdapter.fetchMRStatus(
                    mrRecord.mergeRequestIid,
                    task?.gitlabProjectId
                );
                if (!cancelled && mrStatus.success && mrStatus.data) {
                    await gitlabRepositoryService.updateMergeRequestRecord(mrRecord.id, {
                        status: mrStatus.data.status as typeof mrRecord.status,
                        webUrl: mrStatus.data.webUrl,
                        mergedAt: mrStatus.data.mergedAt ? Date.parse(mrStatus.data.mergedAt) : undefined,
                    });
                    if (mrStatus.data.status === "merged") {
                        await taskService.updateTask(taskId, { status: "merged" });
                    }
                }
            }

            if (pipelineRecord?.pipelineId && !terminalPipelineStates.has(pipelineRecord.status)) {
                const pipelineStatus = await gitlabRepositoryAdapter.fetchPipelineStatus(
                    pipelineRecord.pipelineId,
                    task?.gitlabProjectId
                );
                if (!cancelled && pipelineStatus.success && pipelineStatus.data) {
                    await gitlabRepositoryService.updatePipelineRecord(pipelineRecord.id, {
                        status: pipelineStatus.data.status as typeof pipelineRecord.status,
                        webUrl: pipelineStatus.data.webUrl,
                        ref: pipelineStatus.data.ref,
                    });
                }
            }
        };

        void poll();
        const intervalId = window.setInterval(() => void poll(), 15000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [mrRecord, pipelineRecord, taskId]);

    const handleChatSubmit = async (content: string, project: string, branch: string) => {
        await taskService.updateTask(taskId, { repo: project, branch });
        await taskService.appendAgentMessage({
            taskId,
            sender: "ui_agent",
            content,
            kind: "info",
            timestamp: Date.now(),
        });

        // Trigger the follow-up conversational workflow
        void runFollowUpWorkflow(taskId).catch(error => {
            console.error("Failed to run follow-up workflow:", error);
        });
    };

    const handleApprove = async () => {
        if (!latestProposal || latestProposal.status !== "ready_for_review") return;
        setIsApproving(true);
        try {
            await runVerificationPreparationWorkflow(taskId, latestProposal.id);
        } finally {
            setIsApproving(false);
        }
    };

    if (!task) {
        return (
            <div className="flex h-screen items-center justify-center bg-background-dark p-8 text-center font-display text-slate-500">
                <span className="material-symbols-outlined mr-2 animate-spin">sync</span>
                Loading task workspace...
            </div>
        );
    }

    const screenshotSrc = toImageSrc(browserArtifact?.content);
    const viewportLabel = task.viewportPreset === "mobile" ? "375x812" : task.viewportPreset === "tablet" ? "768x1024" : "1280x800";
    const projectOptions = projects.length > 0 ? projects : [task.repo];
    const branchOptions = Array.from(new Set([task.branch, task.defaultBranch, ...branches].filter(Boolean)));
    const browserSummary = verificationResult?.summary || parsedVerification?.summary || parsedVision?.summary || "Waiting for live inspection evidence.";
    const browserDetail = verificationResult?.explanation || parsedVerification?.explanation || parsedVision?.explanation || "The browser pane will show real screenshots and analysis.";

    // Format last inspected time if available
    const lastInspectedStr = task.lastInspectionAt
        ? new Date(task.lastInspectionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : "Pending";

    // Determine active code view
    let codeView: React.ReactNode;
    if (codeTab === "diff") {
        if (patchFiles && patchFiles.length > 0) {
            codeView = (
                <div className="space-y-2">
                    {patchFiles.map((file) => (
                        <PatchDiff key={file.id} filePath={file.filePath} patch={file.patch} />
                    ))}
                </div>
            );
        } else if (diffArtifact?.content) {
            codeView = <pre className="whitespace-pre overflow-auto">{diffArtifact.content}</pre>;
        } else {
            codeView = <div className="text-slate-500 italic">No patch generated yet.</div>;
        }
    } else if (codeTab === "log") {
        codeView = <pre className="whitespace-pre overflow-auto">{logArtifact?.content || "No logs available."}</pre>;
    } else if (codeTab === "terminal") {
        codeView = <pre className="whitespace-pre overflow-auto">{terminalArtifact?.content || "No terminal output."}</pre>;
    } else if (codeTab === "vision_analysis") {
        codeView = (
            <div className="space-y-4">
                <div className="font-bold text-primary">UI Analysis Result:</div>
                <div className="bg-surface-dark border border-border-dark p-4 rounded-lg">
                    {visionArtifact?.content || "Waiting for analysis..."}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background-dark font-display text-slate-100 selection:bg-primary/30">
            <header className="flex flex-col items-start justify-between gap-4 border-b border-border-dark bg-background-dark px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:gap-0">
                <div className="flex items-center gap-4">
                    <div className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-400 hover:text-slate-300" onClick={onBack}>
                        <span className="material-symbols-outlined mr-2 text-xl text-primary">rocket_launch</span>
                        <span>{task.repo}</span>
                        <span>/</span>
                        <span className="capitalize">{task.category.replace("_", " ")}</span>
                        <span>/</span>
                        <span className="font-semibold text-white">#{task.id.slice(0, 4)}</span>
                    </div>
                    <h1 className="ml-2 text-base font-bold text-white">{task.title}</h1>
                    <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        {task.status === "running" ? (
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                            </span>
                        ) : task.status === "merged" ? (
                            <span className="material-symbols-outlined text-[12px] text-green-500">check_circle</span>
                        ) : null}
                        {task.status}
                    </div>
                </div>

                <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            const url = mrRecord?.webUrl || task.gitlabProjectWebUrl;
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        disabled={!mrRecord?.webUrl && !task.gitlabProjectWebUrl}
                        className="flex items-center gap-2 rounded-lg border border-border-dark bg-surface-dark px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-surface-dark/80 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-lg text-primary">visibility</span>
                        <span>View PR</span>
                    </button>
                    <button
                        type="button"
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-background-dark hover:bg-primary/90 disabled:opacity-50"
                        onClick={handleApprove}
                        disabled={task.status !== "running" || isApproving || run?.phase === "verification" || latestProposal?.status !== "ready_for_review"}
                    >
                        <span>
                            {run?.phase === "verification" || isApproving ? "Verifying..." : latestProposal?.status === "ready_for_review" ? "Approve & Commit" : "Awaiting Proposal"}
                        </span>
                    </button>
                </div>
            </header>

            <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
                <aside className={`absolute z-40 flex h-full flex-col border-border-dark bg-background-dark transition-all duration-300 md:relative md:static ${isAgentOpen ? "w-[85vw] border-r shadow-2xl md:w-80 md:shadow-none" : "w-12 border-r"}`}>
                    <div className="flex cursor-pointer items-center justify-between border-b border-border-dark p-4 hover:bg-surface-dark/50" onClick={() => setIsAgentOpen(!isAgentOpen)}>
                        {isAgentOpen ? (
                            <>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Agent Intelligence</span>
                                <span className="material-symbols-outlined hidden text-sm text-slate-500 md:block">keyboard_double_arrow_left</span>
                            </>
                        ) : (
                            <span className="material-symbols-outlined text-sm text-slate-500 w-full text-center">smart_toy</span>
                        )}
                    </div>
                    {isAgentOpen && (
                        <div className="flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar">
                            {(messages || []).map((message) => {
                                // Determine styling based on sender role
                                let icon = "smart_toy";
                                let colorClass = "text-primary";
                                let bgClass = "bg-primary/10 border-primary/20";
                                let label: string = message.sender;

                                if (message.sender === "system") {
                                    icon = "tune";
                                    colorClass = "text-slate-400";
                                    bgClass = "bg-slate-800 border-border-dark";
                                } else if (message.sender === "code_agent") {
                                    icon = "code_blocks";
                                    colorClass = "text-emerald-400";
                                    bgClass = "bg-emerald-500/10 border-emerald-500/20";
                                    label = "Code Engine";
                                } else if (message.sender === "devpilot" || message.sender === "ui_agent") {
                                    icon = "rocket_launch";
                                    colorClass = "text-primary";
                                    bgClass = "bg-primary/20 border-primary/30";
                                    label = "DevPilot Synthesis";
                                }

                                if (message.kind === "success") {
                                    colorClass = "text-green-500";
                                    bgClass = "bg-green-500/20 border-green-500/30";
                                    icon = "check_circle";
                                } else if (message.kind === "warning") {
                                    colorClass = "text-amber-400";
                                    bgClass = "bg-amber-500/20 border-amber-500/30";
                                    icon = "warning";
                                }

                                return (
                                    <div key={message.id} className="space-y-1.5 opacity-95 hover:opacity-100 transition-opacity">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`flex size-5 items-center justify-center rounded border ${bgClass} ${colorClass}`}>
                                                <span className="material-symbols-outlined text-[13px]">{icon}</span>
                                            </div>
                                            <span className={`text-[11px] font-bold tracking-wider uppercase ${colorClass}`}>{label}</span>
                                            <span className="text-[10px] text-slate-600 ml-auto font-mono">
                                                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className={`rounded-lg border border-border-dark bg-[#151515] p-3 text-[13px] leading-relaxed ${message.sender === "system" ? "text-slate-400 font-mono text-[11px]" : "text-slate-300"}`}>
                                            {message.content}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="mt-auto pb-4">
                        <AdvancedChatInput
                            onSendMessage={handleChatSubmit}
                            projects={projectOptions}
                            branches={branchOptions}
                            fileSuggestions={task.candidateFiles || []}
                            disabled={!task}
                            placeholder="Add follow-up instructions..."
                        />
                    </div>
                </aside>

                <div className="flex flex-1 flex-col overflow-hidden md:flex-row min-h-0">
                    <section className={`flex flex-col border-r border-border-dark bg-[#0a0a0a] transition-all duration-300 min-h-0 min-w-0 ${isBrowserOpen ? "flex-[2]" : "w-12 flex-none"}`}>
                        <div className="flex-1 relative overflow-hidden bg-background-dark group min-h-0">
                            {task.status === "running" ? (
                                <div className="absolute inset-0 flex flex-col">
                                    {/* Runtime Context Metadata Strip */}
                                    <div className="bg-[#111111] border-b border-border-dark px-4 py-2 flex items-center justify-between shadow-sm z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                                                <span className="flex h-1.5 w-1.5 relative mr-0.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                                                </span>
                                                LIVE SESSION
                                            </div>
                                            <span className="text-slate-500 text">|</span>
                                            <div className="text-[11px] text-slate-300 font-mono tracking-tight font-medium flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[14px] text-slate-500">public</span>
                                                {task.targetUrl || "http://localhost:3000"}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">desktop_windows</span>
                                                {viewportLabel}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">update</span>
                                                {lastInspectedStr}
                                            </div>
                                        </div>
                                    </div>
                                    <iframe
                                        src={`${config.sandboxUrl}/vnc/index.html?autoconnect=true&resize=remote`}
                                        className="flex-1 w-full h-full min-h-0 border-none"
                                        style={{ minHeight: 0 }}
                                        title="Sandbox Live View"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col min-h-0">
                                    {/* Captured Frame Metadata Strip */}
                                    <div className="bg-[#111111] border-b border-border-dark px-4 py-2 flex items-center justify-between shadow-sm z-10 w-full shrink-0">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-600/30 bg-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                                                CAPTURED FRAME
                                            </div>
                                            <span className="text-slate-500 text">|</span>
                                            <div className="text-[11px] text-slate-300 font-mono tracking-tight font-medium flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[14px] text-slate-500">public</span>
                                                {task.targetUrl || "http://localhost:3000"}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">desktop_windows</span>
                                                {viewportLabel}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">history</span>
                                                {lastInspectedStr}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-background-dark/50">
                                        {screenshotSrc ? (
                                            <img src={screenshotSrc} className="max-w-full rounded-md shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-[#333]" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 text-slate-500">
                                                <span className="material-symbols-outlined text-4xl opacity-50">flip_to_back</span>
                                                <span className="font-mono text-xs uppercase tracking-widest">Awaiting Inspection Frame</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                    <section className={`flex flex-col border-t border-border-dark bg-[#0d0d0d] transition-all duration-300 min-h-0 min-w-0 ${isCodeOpen ? "flex-1" : "h-12 w-12 flex-none"}`}>
                        <div className="flex-1 overflow-auto p-6 font-mono text-xs text-slate-300 custom-scrollbar">
                            {codeView || <div className="text-slate-500 uppercase tracking-widest text-[10px] text-center mt-20">Initializing Code Workspace...</div>}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};
