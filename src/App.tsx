/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AdvancedChatInput } from "./components/AdvancedChatInput";
import { DashboardHeroComposer } from "./components/DashboardHeroComposer";
import { Changelog } from "./pages/Changelog";
import { Documentation } from "./pages/Documentation";
import {
  Legal,
  PrivacyPolicyContent,
  TermsOfServiceContent,
} from "./pages/Legal";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Support";
import { sandboxAdapter } from "./lib/adapters/sandbox.adapter";
import { gitlabRepositoryAdapter } from "./lib/adapters/gitlabRepository.adapter";
import { config } from "./lib/config/env";
import { initializeDb } from "./lib/seeds";
import {
  gitlabRepositoryService,
  patchProposalService,
  taskService,
  verificationService,
} from "./lib/services";
import { gitlabDuoAdapter } from "./lib/adapters/gitlabDuo.adapter";
import { devpilotFlow } from "./lib/gitlab-duo/flows/devpilot.flow";
import { memoryService } from "./lib/services/memory.service";
import { runService } from "./lib/services/run.service";
import { runUiInspectionWorkflow } from "./lib/workflows/uiInspection.workflow";
import { runVerificationPreparationWorkflow } from "./lib/workflows/verificationPreparation.workflow";
import {
  GitLabBranchSummary,
  GitLabProjectSummary,
  Task,
} from "./types";

type Page =
  | "dashboard"
  | "task_detail"
  | "documentation"
  | "changelog"
  | "settings"
  | "privacy"
  | "terms"
  | "support";

interface IntegrationState {
  loading: boolean;
  ready: boolean;
  issues: string[];
  project?: GitLabProjectSummary;
  branches: GitLabBranchSummary[];
}

const Header = ({ navigate }: { navigate: (page: Page) => void }) => (
  <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border-subtle bg-background-dark/50 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
    <div
      className="flex cursor-pointer items-center gap-3"
      onClick={() => navigate("dashboard")}
    >
      <div className="flex size-8 items-center justify-center rounded bg-primary text-black">
        <span className="material-symbols-outlined text-[20px] font-bold">
          bolt
        </span>
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">
        DevPilot
      </h2>
    </div>
    <div className="flex items-center gap-4">
      <div className="mr-6 hidden items-center gap-6 md:flex">
        <button
          onClick={() => navigate("documentation")}
          className="text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          Documentation
        </button>
        <button
          onClick={() => navigate("changelog")}
          className="text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          Changelog
        </button>
      </div>
      <button className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5">
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <button
        onClick={() => navigate("settings")}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5"
      >
        <span className="material-symbols-outlined">settings</span>
      </button>
      <div
        className="h-8 w-8 cursor-pointer rounded-full border border-white/10 bg-gradient-to-tr from-primary to-orange-200"
        onClick={() => navigate("settings")}
      />
    </div>
  </header>
);

const Tabs = ({
  activeTab,
  onTabChange,
}: {
  activeTab: Task["category"];
  onTabChange: (tab: Task["category"]) => void;
}) => {
  const tabs: { id: Task["category"]; label: string }[] = [
    { id: "tasks", label: "Tasks" },
    { id: "code_reviews", label: "Code reviews" },
    { id: "archive", label: "Archive" },
  ];

  return (
    <div className="mb-6 flex items-center gap-4 overflow-x-auto whitespace-nowrap border-b border-border-subtle sm:mb-8 sm:gap-8 hide-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`pb-4 text-sm transition-colors ${
            activeTab === tab.id
              ? "border-b-2 border-primary font-semibold text-primary"
              : "font-medium text-slate-500 hover:text-slate-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

interface TaskProps {
  id: string;
  title: string;
  status: string;
  time: string;
  branch: string;
  additions: number;
  deletions: number;
  group: string;
  onClick?: () => void;
}

const TaskItem = ({
  title,
  status,
  time,
  branch,
  additions,
  deletions,
  onClick,
}: TaskProps) => {
  let statusClasses = "";
  if (status === "MERGED") {
    statusClasses = "border-purple-500/20 bg-purple-500/10 text-purple-400";
  } else if (status === "RUNNING") {
    statusClasses = "border-primary/20 bg-primary/10 text-primary";
  } else if (status === "CLOSED") {
    statusClasses = "border-slate-500/20 bg-slate-500/10 text-slate-400";
  }

  return (
    <div
      onClick={onClick}
      className="relative flex cursor-pointer flex-col justify-between border-t border-border-subtle p-4 transition-all duration-200 first:border-t-0 hover:z-10 hover:scale-[1.01] hover:bg-surface-dark/50 hover:shadow-lg md:flex-row md:items-center sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
          <span className="line-clamp-2 break-words text-sm font-medium text-slate-100 transition-colors group-hover:text-primary md:line-clamp-1">
            {title}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${statusClasses}`}
          >
            {status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">schedule</span>
            {time}
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">fork_right</span>
            {branch}
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 md:mt-0">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="font-bold text-emerald-500">+{additions}</span>
          <span className="font-bold text-rose-500">-{deletions}</span>
        </div>
        <span className="material-symbols-outlined text-slate-600 transition-colors group-hover:text-slate-300">
          chevron_right
        </span>
      </div>
    </div>
  );
};

const formatTimeAgo = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
};

const getTaskGroup = (timestamp: number) => {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  return days <= 7 ? "Last 7 Days" : "Older";
};

const TaskList = ({
  onSelectTask,
  activeTab,
}: {
  onSelectTask: (id: string) => void;
  activeTab: Task["category"];
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const dbTasks = useLiveQuery(() => taskService.getTasksByCategory(activeTab), [
    activeTab,
  ]);

  const allTasks = (dbTasks || []).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status.toUpperCase(),
    time: formatTimeAgo(task.createdAt),
    branch: `${task.repo}/${task.branch}`,
    additions: task.plusCount,
    deletions: task.minusCount,
    group: getTaskGroup(task.createdAt),
  }));

  const filteredTasks = allTasks.filter(
    (task) =>
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.branch.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const recentTasks = filteredTasks.filter((task) => task.group === "Last 7 Days");
  const olderTasks = filteredTasks.filter((task) => task.group === "Older");

  return (
    <div className="space-y-8">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          search
        </span>
        <input
          type="text"
          placeholder="Filter tasks by title or branch..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full rounded-xl border border-border-subtle bg-surface/30 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-all focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-12">
        {recentTasks.length > 0 && (
          <div>
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Last 7 Days
            </h3>
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface/30">
              {recentTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  {...task}
                  onClick={() => onSelectTask(task.id)}
                />
              ))}
            </div>
          </div>
        )}

        {olderTasks.length > 0 && (
          <div>
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Older
            </h3>
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface/30">
              {olderTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  {...task}
                  onClick={() => onSelectTask(task.id)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredTasks.length === 0 && (
          <div className="rounded-2xl border border-border-subtle bg-surface/20 px-6 py-12 text-center text-slate-500">
            {searchQuery
              ? `No tasks found matching "${searchQuery}".`
              : "No live tasks yet. Submit a prompt above to create the first run."}
          </div>
        )}
      </div>
    </div>
  );
};

const Footer = ({ navigate }: { navigate: (page: Page) => void }) => (
  <div className="mt-20 flex flex-col items-center justify-between gap-4 border-t border-border-subtle py-8 md:flex-row">
    <p className="text-xs text-slate-600">(c) 2026 DevPilot Automation Platform</p>
    <div className="flex gap-6">
      <button
        onClick={() => navigate("privacy")}
        className="text-xs text-slate-500 transition-colors hover:text-primary"
      >
        Privacy Policy
      </button>
      <button
        onClick={() => navigate("terms")}
        className="text-xs text-slate-500 transition-colors hover:text-primary"
      >
        Terms of Service
      </button>
      <button
        onClick={() => navigate("support")}
        className="text-xs text-slate-500 transition-colors hover:text-primary"
      >
        Support
      </button>
    </div>
  </div>
);

const FloatingIndicator = () => (
  <div className="fixed bottom-6 right-6 hidden items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-500 md:flex">
    <span className="rounded bg-white/5 px-1.5 py-0.5">CTRL</span>
    <span className="rounded bg-white/5 px-1.5 py-0.5">K</span>
    <span>TO SEARCH</span>
  </div>
);

const statusBadgeLabel = (status?: string) =>
  status ? status.replace(/_/g, " ") : "unknown";

const toImageSrc = (content?: string) =>
  content
    ? content.startsWith("data:")
      ? content
      : `data:image/png;base64,${content}`
    : undefined;

const parseJsonContent = <T,>(content?: string): T | undefined => {
  if (!content) {
    return undefined;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
};

const TaskDetail = ({
  taskId,
  onBack,
  projects,
  branches,
}: {
  taskId: string;
  onBack: () => void;
  projects: string[];
  branches: string[];
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
  const messages = useLiveQuery(() => taskService.getMessagesByTaskId(taskId), [
    taskId,
  ]);
  const run = useLiveQuery(() => taskService.getActiveAgentRun(taskId), [taskId]);
  const memoryHits = useLiveQuery(() => memoryService.getTaskMemoryHits(taskId), [
    taskId,
  ]);
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
        issueType?: string;
        severity?: string;
        suspectedComponent?: string;
        summary?: string;
        explanation?: string;
        recommendedFix?: string;
        confidence?: number;
      }>(visionArtifact?.content),
    [visionArtifact?.content],
  );

  const parsedVerification = useMemo(
    () =>
      parseJsonContent<{
        summary?: string;
        explanation?: string;
        issueResolved?: boolean;
        regressionDetected?: boolean;
        confidence?: number;
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
        content: `Unable to start UI inspection: ${
          error instanceof Error ? error.message : String(error)
        }`,
        kind: "warning",
        timestamp: Date.now(),
      });
    });
  }, [run?.status, task, taskId]);

  useEffect(() => {
    if (!mrRecord?.mergeRequestIid && !pipelineRecord?.pipelineId) {
      return;
    }

    const terminalMrStates = new Set(["merged", "closed", "locked"]);
    const terminalPipelineStates = new Set([
      "success",
      "failed",
      "canceled",
      "skipped",
      "manual",
    ]);

    let cancelled = false;
    const poll = async () => {
      if (!config.isGitLabConfigured || cancelled) {
        return;
      }

      if (
        mrRecord?.mergeRequestIid &&
        !terminalMrStates.has(mrRecord.status)
      ) {
        const mrStatus = await gitlabRepositoryAdapter.fetchMRStatus(
          mrRecord.mergeRequestIid,
        );
        if (!cancelled && mrStatus.success && mrStatus.data) {
          await gitlabRepositoryService.updateMergeRequestRecord(mrRecord.id, {
            status: mrStatus.data.status as typeof mrRecord.status,
            webUrl: mrStatus.data.webUrl,
            mergedAt: mrStatus.data.mergedAt
              ? Date.parse(mrStatus.data.mergedAt)
              : undefined,
          });

          if (mrStatus.data.status === "merged") {
            await taskService.updateTask(taskId, { status: "merged" });
          }
        }
      }

      if (
        pipelineRecord?.pipelineId &&
        !terminalPipelineStates.has(pipelineRecord.status)
      ) {
        const pipelineStatus = await gitlabRepositoryAdapter.fetchPipelineStatus(
          pipelineRecord.pipelineId,
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
    const intervalId = window.setInterval(() => {
      void poll();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    mrRecord?.id,
    mrRecord?.mergeRequestIid,
    mrRecord?.status,
    pipelineRecord?.id,
    pipelineRecord?.pipelineId,
    pipelineRecord?.status,
    taskId,
  ]);

  const handleChatSubmit = async (
    content: string,
    project: string,
    branch: string,
  ) => {
    await taskService.updateTask(taskId, { repo: project, branch });
    await taskService.appendAgentMessage({
      taskId,
      sender: "ui_agent",
      content,
      kind: "info",
      timestamp: Date.now(),
    });
  };

  const handleApprove = async () => {
    if (!latestProposal || latestProposal.status !== "ready_for_review") {
      await taskService.appendAgentMessage({
        taskId,
        sender: "system",
        content: "No patch proposal is ready to approve yet.",
        kind: "warning",
        timestamp: Date.now(),
      });
      return;
    }

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
  const viewportLabel =
    task.viewportPreset === "mobile"
      ? "375x812"
      : task.viewportPreset === "tablet"
        ? "768x1024"
        : "1280x800";
  const projectOptions = projects.length > 0 ? projects : [task.repo];
  const branchOptions = Array.from(
    new Set([task.branch, task.defaultBranch, ...branches].filter(Boolean)),
  );
  const diffContent =
    patchFiles && patchFiles.length > 0
      ? patchFiles.map((file) => file.patch).join("\n\n")
      : diffArtifact?.content;
  const browserSummary =
    verificationResult?.summary ||
    parsedVerification?.summary ||
    parsedVision?.summary ||
    "Waiting for live inspection evidence.";
  const browserDetail =
    verificationResult?.explanation ||
    parsedVerification?.explanation ||
    parsedVision?.explanation ||
    "The browser pane will show real screenshots and analysis once the sandbox run completes.";
  const activeCodeArtifact =
    codeTab === "diff"
      ? diffContent
      : codeTab === "log"
        ? logArtifact?.content
        : codeTab === "terminal"
          ? terminalArtifact?.content
          : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background-dark font-display text-slate-100 selection:bg-primary/30">
      <header className="flex flex-col items-start justify-between gap-4 border-b border-border-dark bg-background-dark px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:gap-0">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-400 hover:text-slate-300"
            onClick={onBack}
          >
            <span className="material-symbols-outlined mr-2 text-xl text-primary">
              rocket_launch
            </span>
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
              <span className="material-symbols-outlined text-[12px] text-green-500">
                check_circle
              </span>
            ) : null}
            {task.status}
          </div>
          {run && run.totalSteps > 0 && (
            <>
              <div className="mx-2 h-4 w-px bg-border-dark" />
              <div className="flex items-center gap-1.5 rounded border border-border-dark px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-400">
                <span>
                  {run.completedSteps}/{run.totalSteps} STEPS
                </span>
                {run.progress > 0 && <span className="text-primary">{run.progress}%</span>}
              </div>
            </>
          )}
          <div className="mx-2 h-4 w-px bg-border-dark" />
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">account_tree</span>
              <span>{task.branch}</span>
            </div>
            {pipelineRecord && (
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">deployed_code</span>
                <span>{statusBadgeLabel(pipelineRecord.status)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
          <button
            type="button"
            onClick={() => {
              const url = mrRecord?.webUrl || task.gitlabProjectWebUrl;
              if (url) {
                window.open(url, "_blank", "noopener,noreferrer");
              }
            }}
            disabled={!mrRecord?.webUrl && !task.gitlabProjectWebUrl}
            className="flex items-center gap-2 rounded-lg border border-border-dark bg-surface-dark px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-surface-dark/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg text-primary">
              visibility
            </span>
            <span>View PR</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-background-dark transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleApprove}
            disabled={
              task.status !== "running" ||
              isApproving ||
              run?.phase === "verification" ||
              latestProposal?.status !== "ready_for_review"
            }
          >
            <span>
              {run?.phase === "verification" || isApproving
                ? "Verifying..."
                : latestProposal?.status === "ready_for_review"
                  ? "Approve & Commit"
                  : "Awaiting Proposal"}
            </span>
          </button>
          <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border-dark bg-surface-dark">
            <div className="size-full bg-gradient-to-tr from-primary to-orange-200" />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside
          className={`absolute z-40 flex h-full flex-col border-border-dark bg-background-dark transition-all duration-300 md:relative md:static ${
            isAgentOpen
              ? "w-[85vw] border-r shadow-2xl md:w-80 md:shadow-none"
              : "w-12 border-r"
          }`}
        >
          <div
            className="flex cursor-pointer items-center justify-between border-b border-border-dark p-4 hover:bg-surface-dark/50"
            onClick={() => setIsAgentOpen(!isAgentOpen)}
          >
            {isAgentOpen ? (
              <>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Agent Intelligence
                </span>
                <span className="material-symbols-outlined hidden text-sm text-slate-500 md:block">
                  keyboard_double_arrow_left
                </span>
                <span className="material-symbols-outlined block text-sm text-slate-500 md:hidden">
                  keyboard_double_arrow_up
                </span>
              </>
            ) : (
              <div className="flex w-full flex-col items-center gap-4 py-3">
                <span className="material-symbols-outlined text-sm text-slate-500">
                  keyboard_double_arrow_right
                </span>
                <span className="material-symbols-outlined text-sm text-slate-400">
                  smart_toy
                </span>
              </div>
            )}
          </div>

          {isAgentOpen && (
            <>
              <div className="flex-1 space-y-6 overflow-y-auto p-4">
                {(messages || []).map((message) => (
                  <div key={message.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex size-6 items-center justify-center rounded ${
                          message.kind === "success"
                            ? "bg-green-500/20 text-green-500"
                            : message.kind === "warning"
                              ? "bg-yellow-500/20 text-yellow-500"
                              : "bg-primary/20 text-primary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {message.sender === "system" ? "dns" : "smart_toy"}
                        </span>
                      </div>
                      <span className="text-xs font-bold capitalize">
                        {message.sender}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div
                      className={`rounded-lg border p-3 text-sm leading-relaxed ${
                        message.kind === "success"
                          ? "border-green-500/20 bg-green-900/10 text-green-200"
                          : message.kind === "warning"
                            ? "border-yellow-500/20 bg-yellow-900/10 text-yellow-200"
                            : "border-border-dark bg-surface-dark text-slate-300"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {run?.status === "running" && (
                  <div className="flex items-center gap-3 px-1 py-2">
                    <span className="material-symbols-outlined animate-pulse text-primary">
                      sync
                    </span>
                    <span className="text-xs text-slate-400">{run.currentStep}</span>
                  </div>
                )}

                {runSteps && runSteps.length > 0 && (
                  <div className="space-y-3 border-t border-border-dark pt-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Workflow Steps
                    </h3>
                    {runSteps.map((step) => (
                      <div
                        key={step.id}
                        className="rounded-lg border border-border-dark bg-surface-dark/50 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-200">
                            {step.label}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              step.status === "completed"
                                ? "text-green-400"
                                : step.status === "failed"
                                  ? "text-red-400"
                                  : step.status === "running"
                                    ? "text-primary"
                                    : "text-slate-500"
                            }`}
                          >
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          {step.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {(mrRecord || pipelineRecord || verificationResult) && (
                  <div className="space-y-3 border-t border-border-dark pt-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Live Status
                    </h3>
                    {mrRecord && (
                      <div className="rounded-lg border border-border-dark bg-surface-dark/50 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Merge Request</span>
                          <span className="uppercase tracking-wider text-primary">
                            {statusBadgeLabel(mrRecord.status)}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-slate-500">
                          {mrRecord.webUrl || `!${mrRecord.mergeRequestIid}`}
                        </p>
                      </div>
                    )}
                    {pipelineRecord && (
                      <div className="rounded-lg border border-border-dark bg-surface-dark/50 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Pipeline</span>
                          <span className="uppercase tracking-wider text-primary">
                            {statusBadgeLabel(pipelineRecord.status)}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-slate-500">
                          {pipelineRecord.webUrl || `#${pipelineRecord.pipelineId}`}
                        </p>
                      </div>
                    )}
                    {verificationResult && (
                      <div className="rounded-lg border border-border-dark bg-surface-dark/50 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Verification</span>
                          <span className="uppercase tracking-wider text-primary">
                            {statusBadgeLabel(verificationResult.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-slate-500">
                          {verificationResult.summary}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {memoryHits && memoryHits.length > 0 && (
                  <div className="space-y-3 border-t border-border-dark pt-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Recalled Memories
                    </h3>
                    {memoryHits.map((hit) => (
                      <div
                        key={hit.id}
                        className="space-y-2 rounded-lg border border-border-dark bg-surface-dark/50 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">
                            {hit.memory.title}
                          </span>
                          <span className="text-[10px] font-mono text-primary/70">
                            {Math.round(hit.score * 100)}% Match
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          {hit.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AdvancedChatInput
                onSendMessage={handleChatSubmit}
                projects={projectOptions}
                branches={branchOptions}
                fileSuggestions={task.candidateFiles || []}
                disabled={!task}
                placeholder="Add follow-up instructions or reference @files"
              />
            </>
          )}
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <section
            className={`flex flex-col border-r border-border-dark bg-[#1c140c] transition-all duration-300 ${
              isBrowserOpen ? "flex-[1.5]" : "w-12 flex-none"
            }`}
          >
            <div
              className="flex cursor-pointer items-center justify-between border-b border-border-dark bg-background-dark p-3 hover:bg-surface-dark/50"
              onClick={() => setIsBrowserOpen(!isBrowserOpen)}
            >
              {isBrowserOpen ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-slate-400">
                      desktop_windows
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      Desktop Browser ({viewportLabel})
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <div className="size-2.5 rounded-full bg-red-500/50" />
                      <div className="size-2.5 rounded-full bg-yellow-500/50" />
                      <div className="size-2.5 rounded-full bg-green-500/50" />
                    </div>
                    <span className="material-symbols-outlined hidden text-sm text-slate-500 md:block">
                      keyboard_double_arrow_left
                    </span>
                    <span className="material-symbols-outlined block text-sm text-slate-500 md:hidden">
                      keyboard_double_arrow_up
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex w-full flex-col items-center gap-4">
                  <span className="material-symbols-outlined text-sm text-slate-500">
                    keyboard_double_arrow_right
                  </span>
                  <span className="material-symbols-outlined text-sm text-slate-400">
                    desktop_windows
                  </span>
                </div>
              )}
            </div>

            {isBrowserOpen && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-4 border-b border-border-dark bg-surface-dark/40 px-4 py-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="material-symbols-outlined cursor-pointer text-sm hover:text-white">
                      arrow_back
                    </span>
                    <span className="material-symbols-outlined cursor-pointer text-sm hover:text-white">
                      arrow_forward
                    </span>
                    <span className="material-symbols-outlined cursor-pointer text-sm hover:text-white">
                      refresh
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-2 rounded border border-border-dark/50 bg-background-dark/80 px-3 py-1">
                    <span className="material-symbols-outlined text-xs text-slate-600">
                      lock
                    </span>
                    <span className="truncate text-[10px] font-mono text-slate-400">
                      {task.targetUrl || config.targetAppBaseUrl}
                    </span>
                  </div>
                </div>
                <div className="relative flex-1 overflow-auto bg-background-dark p-8">
                  <div className="mx-auto max-w-5xl">
                    {screenshotSrc ? (
                      <img
                        src={screenshotSrc}
                        alt="Live application screenshot"
                        className="w-full rounded-2xl border border-border-dark bg-black/30 shadow-2xl"
                      />
                    ) : (
                      <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-border-dark bg-surface-dark/30 text-center text-sm text-slate-500">
                        Waiting for sandbox capture from {task.targetUrl || config.targetAppBaseUrl}.
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-6 left-6 z-20 max-w-sm rounded-lg border border-primary/30 bg-primary/10 p-4 shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-primary">
                        visibility
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        {verificationResult ? "Verification Result" : "Vision Analysis"}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {browserSummary}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      {browserDetail}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
          <section
            className={`absolute bottom-0 right-0 z-40 flex flex-col border-t border-border-dark bg-background-dark shadow-2xl transition-all duration-300 md:static md:border-t-0 md:shadow-none ${
              isCodeOpen
                ? "h-[60vh] w-full md:h-auto md:w-auto md:flex-1"
                : "h-12 w-full md:h-auto md:w-12 md:flex-none"
            }`}
          >
            <div className="flex cursor-pointer border-b border-border-dark bg-surface-dark/20 hover:bg-surface-dark/40">
              {isCodeOpen ? (
                <>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setCodeTab("diff");
                    }}
                    className={`px-6 py-3 text-sm ${
                      codeTab === "diff"
                        ? "border-b-2 border-primary font-bold text-white"
                        : "font-medium text-slate-500 hover:text-white"
                    }`}
                  >
                    Diff
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setCodeTab("log");
                    }}
                    className={`px-6 py-3 text-sm ${
                      codeTab === "log"
                        ? "border-b-2 border-primary font-bold text-white"
                        : "font-medium text-slate-500 hover:text-white"
                    }`}
                  >
                    Logs
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setCodeTab("terminal");
                    }}
                    className={`px-6 py-3 text-sm ${
                      codeTab === "terminal"
                        ? "border-b-2 border-primary font-bold text-white"
                        : "font-medium text-slate-500 hover:text-white"
                    }`}
                  >
                    Terminal
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setCodeTab("vision_analysis");
                    }}
                    className={`px-6 py-3 text-sm ${
                      codeTab === "vision_analysis"
                        ? "border-b-2 border-primary font-bold text-white"
                        : "font-medium text-slate-500 hover:text-white"
                    }`}
                  >
                    Vision
                  </button>
                  <div
                    className="flex flex-1 items-center justify-end pr-4"
                    onClick={() => setIsCodeOpen(false)}
                  >
                    <span className="material-symbols-outlined text-sm text-slate-500">
                      keyboard_double_arrow_right
                    </span>
                  </div>
                </>
              ) : (
                <div
                  className="flex h-full w-full flex-row items-center justify-center gap-4 hover:bg-white/5 md:flex-col md:py-3"
                  onClick={() => setIsCodeOpen(true)}
                >
                  <span className="material-symbols-outlined hidden text-sm text-slate-500 md:block">
                    keyboard_double_arrow_left
                  </span>
                  <span className="material-symbols-outlined block text-sm text-slate-500 md:hidden">
                    keyboard_double_arrow_up
                  </span>
                  <span className="material-symbols-outlined text-sm text-slate-400">
                    code
                  </span>
                </div>
              )}
            </div>

            {isCodeOpen && (
              <>
                <div className="code-font flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-slate-300">
                  {codeTab === "vision_analysis" ? (
                    <div className="space-y-6">
                      {parsedVision && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-white">
                            Inspection Analysis
                          </h3>
                          <pre className="whitespace-pre-wrap text-slate-300">
                            {JSON.stringify(parsedVision, null, 2)}
                          </pre>
                        </div>
                      )}
                      {parsedVerification && (
                        <div className="space-y-3 border-t border-border-dark pt-4">
                          <h3 className="text-sm font-semibold text-white">
                            Verification Analysis
                          </h3>
                          <pre className="whitespace-pre-wrap text-slate-300">
                            {JSON.stringify(parsedVerification, null, 2)}
                          </pre>
                        </div>
                      )}
                      {!parsedVision && !parsedVerification && (
                        <div className="flex h-full items-center justify-center text-slate-500 italic">
                          No vision artifacts available yet...
                        </div>
                      )}
                    </div>
                  ) : activeCodeArtifact ? (
                    codeTab === "diff" ? (
                      <div>
                        {activeCodeArtifact.split("\n").map((line, index) => {
                          const isAdd = line.startsWith("+");
                          const isSub = line.startsWith("-");
                          const isHeader =
                            line.startsWith("@@") ||
                            line.startsWith("---") ||
                            line.startsWith("+++");

                          let lineClass = "group flex transition-colors hover:bg-white/5";
                          let numClass =
                            "w-12 select-none pr-4 text-right text-slate-600";
                          let textClass = "pl-2";

                          if (isHeader) {
                            textClass = "pl-2 font-bold text-slate-500";
                          } else if (isAdd && !line.startsWith("+++")) {
                            lineClass = "flex border-l-2 border-primary bg-primary/20";
                            numClass =
                              "w-12 select-none pr-4 text-right text-primary/50";
                            textClass = "pl-2 font-medium text-slate-100";
                          } else if (isSub && !line.startsWith("---")) {
                            lineClass =
                              "flex border-l-2 border-red-500 bg-red-900/20";
                            numClass =
                              "w-12 select-none pr-4 text-right text-red-500/50";
                            textClass = "pl-2 font-medium text-red-200";
                          }

                          return (
                            <div key={index} className={lineClass}>
                              <span className={numClass}>{index + 1}</span>
                              <span className={textClass}>{line}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-mono text-slate-300">
                        {activeCodeArtifact}
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-500 italic">
                      No {codeTab} artifacts available yet...
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-border-dark p-3 font-mono text-[10px] text-slate-500">
                  <div className="flex gap-4">
                    <span>UTF-8</span>
                    <span>TypeScript JSX</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-500">
                      {task.plusCount} insertions(+)
                    </span>
                    <span className="text-red-500">
                      {task.minusCount} deletion(-)
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="h-1 w-full overflow-hidden bg-surface-dark">
        <div
          className="h-full bg-primary transition-all duration-1000 ease-in-out"
          style={{ width: `${run?.progress || 0}%` }}
        />
      </footer>
    </div>
  );
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Task["category"]>("tasks");
  const [integrationState, setIntegrationState] = useState<IntegrationState>({
    loading: true,
    ready: false,
    issues: [],
    branches: [],
  });
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const loadIntegrationState = async () => {
    setIntegrationState((current) => ({ ...current, loading: true, issues: [] }));
    await initializeDb();

    const issues: string[] = [];
    let project: GitLabProjectSummary | undefined;
    let branches: GitLabBranchSummary[] = [];

    if (!config.isGitLabConfigured) {
      issues.push(
        "GitLab is not configured. Set VITE_LIVE_REPOSITORY_MODE=true, VITE_GITLAB_TOKEN, and VITE_GITLAB_PROJECT_ID.",
      );
    }

    if (!config.isGeminiConfigured) {
      issues.push(
        "Gemini is not configured. Set VITE_LIVE_MODE=true and VITE_GEMINI_API_KEY.",
      );
    }

    if (!config.isSandboxConfigured) {
      issues.push("Sandbox URL is not configured. Set VITE_SANDBOX_URL.");
    }

    if (config.isSandboxConfigured) {
      try {
        const sandboxHealthy = await sandboxAdapter.checkHealth();
        if (!sandboxHealthy) {
          issues.push(
            `Sandbox health check failed at ${config.sandboxUrl}. Start devpilot-sandbox before running tasks.`,
          );
        }
      } catch (error) {
        issues.push(
          `Sandbox is unreachable at ${config.sandboxUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (config.isGitLabConfigured) {
      const [projectResult, branchResult] = await Promise.all([
        gitlabRepositoryAdapter.getProject(),
        gitlabRepositoryAdapter.listBranches(),
      ]);

      if (!projectResult.success || !projectResult.data) {
        issues.push(projectResult.error || "Failed to load the configured GitLab project.");
      } else {
        project = projectResult.data;
      }

      if (!branchResult.success || !branchResult.data) {
        issues.push(branchResult.error || "Failed to load GitLab branches.");
      } else {
        branches = branchResult.data;
      }
    }

    setIntegrationState({
      loading: false,
      ready: issues.length === 0 && !!project && branches.length > 0,
      issues,
      project,
      branches,
    });
  };

  useEffect(() => {
    void loadIntegrationState();
  }, []);

  useEffect(() => {
    if (!integrationState.project) {
      setSelectedBranch("");
      return;
    }

    setSelectedBranch((currentBranch) => {
      if (
        currentBranch &&
        integrationState.branches.some((branch) => branch.name === currentBranch)
      ) {
        return currentBranch;
      }

      return (
        integrationState.branches.find((branch) => branch.isDefault)?.name ||
        integrationState.project.defaultBranch ||
        integrationState.branches[0]?.name ||
        ""
      );
    });
  }, [integrationState.branches, integrationState.project]);

  const navigate = (page: Page, taskId?: string) => {
    setCurrentPage(page);
    if (taskId) {
      setSelectedTask(taskId);
    }
  };

  const handleCreateTask = async (prompt: string) => {
    if (!integrationState.ready || !integrationState.project || !selectedBranch) {
      return;
    }

    setDashboardError(null);
    setIsCreatingTask(true);

    const now = Date.now();
    const taskId = crypto.randomUUID();
    const title =
      prompt.length > 88 ? `${prompt.slice(0, 85).trim()}...` : prompt.trim();

    try {
      await taskService.createTask({
        id: taskId,
        title,
        prompt: prompt.trim(),
        repo: integrationState.project.pathWithNamespace,
        repoName: integrationState.project.name,
        repoPath: integrationState.project.pathWithNamespace,
        branch: selectedBranch,
        defaultBranch: integrationState.project.defaultBranch,
        gitlabProjectId: String(integrationState.project.id),
        gitlabProjectWebUrl: integrationState.project.webUrl,
        status: "running",
        category: "tasks",
        createdAt: now,
        updatedAt: now,
        plusCount: 0,
        minusCount: 0,
        targetUrl: config.targetAppBaseUrl,
        viewportPreset: "desktop",
        inspectionStatus: "idle",
        codeFixStatus: "idle",
      });

      await runService.createAgentRun({
        id: crypto.randomUUID(),
        taskId,
        status: "running",
        currentStep: "Waiting to start UI inspection...",
        startedAt: now,
        updatedAt: now,
        progress: 0,
        totalSteps: 19,
        completedSteps: 0,
        mode: "live",
        phase: "inspection",
      });

      await gitlabDuoAdapter.initializeFlowRun(taskId, devpilotFlow.id);
      await taskService.appendAgentMessage({
        taskId,
        sender: "system",
        content: `Created live task for ${integrationState.project.pathWithNamespace}@${selectedBranch}. Target URL: ${config.targetAppBaseUrl}`,
        kind: "info",
        timestamp: now,
      });
      await runService.createAgentEvent({
        taskId,
        source: "orchestrator",
        type: "RUN_STARTED",
        title: "Task Created",
        description: "Initialized a live DevPilot task from the dashboard composer.",
        metadata: JSON.stringify({
          projectId: integrationState.project.id,
          branch: selectedBranch,
        }),
        timestamp: now,
      });

      navigate("task_detail", taskId);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingTask(false);
    }
  };

  const projectLabel =
    integrationState.project?.name ||
    config.gitlabProjectId ||
    "GitLab project unavailable";
  const projectPath =
    integrationState.project?.pathWithNamespace || config.gitlabProjectId || "";
  const branchNames = integrationState.branches.map((branch) => branch.name);

  if (currentPage === "task_detail" && selectedTask) {
    return (
      <TaskDetail
        taskId={selectedTask}
        onBack={() => navigate("dashboard")}
        projects={[projectPath || projectLabel]}
        branches={branchNames}
      />
    );
  }

  if (currentPage === "documentation") {
    return <Documentation onBack={() => navigate("dashboard")} />;
  }

  if (currentPage === "changelog") {
    return <Changelog onBack={() => navigate("dashboard")} />;
  }

  if (currentPage === "settings") {
    return <Settings onBack={() => navigate("dashboard")} />;
  }

  if (currentPage === "privacy") {
    return (
      <Legal
        title="Privacy Policy"
        lastUpdated="March 11, 2026"
        content={PrivacyPolicyContent}
        onBack={() => navigate("dashboard")}
      />
    );
  }

  if (currentPage === "terms") {
    return (
      <Legal
        title="Terms of Service"
        lastUpdated="March 11, 2026"
        content={TermsOfServiceContent}
        onBack={() => navigate("dashboard")}
      />
    );
  }

  if (currentPage === "support") {
    return <Support onBack={() => navigate("dashboard")} />;
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark font-display text-slate-100">
      <Header navigate={navigate} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <DashboardHeroComposer
          projectLabel={projectLabel}
          projectPath={projectPath}
          branches={branchNames}
          selectedBranch={selectedBranch}
          onBranchChange={setSelectedBranch}
          onSubmit={handleCreateTask}
          disabled={!integrationState.ready}
          isSubmitting={isCreatingTask || integrationState.loading}
          helperText={
            integrationState.ready
              ? "Routes through live inspection, patch proposal, GitLab handoff, and verification."
              : "Resolve the integration checks below to enable live DevPilot runs."
          }
        />

        {!integrationState.ready && (
          <section className="mb-8 rounded-2xl border border-border-subtle bg-surface/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Integration Setup Required
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  DevPilot no longer seeds demo data. Configure GitLab, Gemini,
                  and the sandbox so the dashboard can create live tasks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadIntegrationState()}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {integrationState.loading ? (
                <div className="rounded-xl border border-border-subtle bg-background-dark/40 px-4 py-3 text-sm text-slate-400">
                  Checking GitLab, Gemini, and sandbox readiness...
                </div>
              ) : (
                integrationState.issues.map((issue) => (
                  <div
                    key={issue}
                    className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-200"
                  >
                    {issue}
                  </div>
                ))
              )}

              {!integrationState.loading && dashboardError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                  {dashboardError}
                </div>
              )}
            </div>
          </section>
        )}

        {integrationState.ready && (
          <section className="mb-8 rounded-2xl border border-border-subtle bg-surface/20 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Live Repository Context
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {projectPath} on branch {selectedBranch}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadIntegrationState()}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5"
              >
                Refresh Integrations
              </button>
            </div>
            {dashboardError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                {dashboardError}
              </div>
            )}
          </section>
        )}

        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
        <TaskList
          activeTab={activeTab}
          onSelectTask={(taskId) => navigate("task_detail", taskId)}
        />
        <Footer navigate={navigate} />
      </main>
      <FloatingIndicator />
    </div>
  );
}
