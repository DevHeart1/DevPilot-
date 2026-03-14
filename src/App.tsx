import { startMockOrchestrator } from "./lib/orchestrator";
import { runUiInspectionWorkflow } from "./lib/workflows/uiInspection.workflow";
import { runVerificationPreparationWorkflow } from "./lib/workflows/verificationPreparation.workflow";
import { patchProposalService } from "./lib/services/patchProposal.service";
import { config } from "./lib/config/env";
import { useLiveQuery } from "dexie-react-hooks";
import { taskService } from "./lib/services";
import { runService } from "./lib/services/run.service";
import { memoryService } from "./lib/services/memory.service";
import { initializeDb } from "./lib/seeds";
import { Task } from "./types";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Documentation } from './pages/Documentation';
import { Changelog } from './pages/Changelog';
import { Settings } from './pages/Settings';
import { Legal, PrivacyPolicyContent, TermsOfServiceContent } from './pages/Legal';
import { Support } from './pages/Support';

const Header = ({ navigate }: { navigate: (page: string) => void }) => (
  <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border-subtle bg-background-dark/50 backdrop-blur-md sticky top-0 z-50">
    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('dashboard')}>
      <div className="flex size-8 items-center justify-center rounded bg-primary text-black">
        <span className="material-symbols-outlined text-[20px] font-bold">bolt</span>
      </div>
      <h2 className="text-slate-100 text-lg font-semibold tracking-tight">DevPilot</h2>
    </div>
    <div className="flex items-center gap-4">
      <div className="hidden md:flex items-center gap-6 mr-6">
        <button onClick={() => navigate('documentation')} className="text-sm font-medium text-slate-500 hover:text-primary transition-colors">Documentation</button>
        <button onClick={() => navigate('changelog')} className="text-sm font-medium text-slate-500 hover:text-primary transition-colors">Changelog</button>
      </div>
      <button className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors">
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <button onClick={() => navigate('settings')} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors">
        <span className="material-symbols-outlined">settings</span>
      </button>
      <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-orange-200 border border-white/10 cursor-pointer" onClick={() => navigate('settings')}></div>
    </div>
  </header>
);

const Hero = () => (
  <div className="flex flex-col items-center text-center mb-8 sm:mb-10 px-2 sm:px-0">
    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-6 sm:mb-8">
      What should we automate next?
    </h1>
    <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-xl shadow-2xl focus-within:border-primary/50 transition-all p-1">
      <div className="flex flex-col md:flex-row items-center gap-1">
        <div className="flex-1 flex items-center px-4 py-3 min-w-0 w-full">
          <span className="material-symbols-outlined text-slate-400 mr-3">search</span>
          <input 
            className="bg-transparent border-none focus:outline-none focus:ring-0 text-base w-full text-slate-100 placeholder:text-slate-500" 
            placeholder="Ask a question with /plan" 
            type="text"
          />
        </div>
        <div className="flex items-center gap-1 p-1 w-full md:w-auto overflow-x-auto whitespace-nowrap">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-400 transition-colors">
            <span className="material-symbols-outlined text-sm">folder</span>
            DevPilot
            <span className="material-symbols-outlined text-xs">expand_more</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-400 transition-colors">
            <span className="material-symbols-outlined text-sm">fork_right</span>
            main
            <span className="material-symbols-outlined text-xs">expand_more</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-400 transition-colors">
            <span className="material-symbols-outlined text-sm">bolt</span>
            1x
            <span className="material-symbols-outlined text-xs">expand_more</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);

const Tabs = ({ activeTab, onTabChange }: { activeTab: Task['category'], onTabChange: (tab: Task['category']) => void }) => {
  const tabs: { id: Task['category'], label: string }[] = [
    { id: 'tasks', label: 'Tasks' },
    { id: 'code_reviews', label: 'Code reviews' },
    { id: 'archive', label: 'Archive' }
  ];

  return (
    <div className="flex items-center border-b border-border-subtle mb-6 sm:mb-8 gap-4 sm:gap-8 overflow-x-auto whitespace-nowrap hide-scrollbar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`pb-4 text-sm transition-colors ${activeTab === tab.id ? 'font-semibold text-primary border-b-2 border-primary' : 'font-medium text-slate-500 hover:text-slate-300'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

interface TaskProps {
  id?: string;
  key?: React.Key;
  title: string;
  status: string;
  time: string;
  branch: string;
  additions: number;
  deletions: number;
  group?: string;
  onClick?: () => void;
}

const TaskItem = ({ title, status, time, branch, additions, deletions, onClick }: TaskProps) => {
  let statusClasses = "";
  if (status === "MERGED") {
    statusClasses = "bg-purple-500/10 text-purple-400 border-purple-500/20";
  } else if (status === "RUNNING") {
    statusClasses = "bg-primary/10 text-primary border-primary/20";
  } else if (status === "CLOSED") {
    statusClasses = "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }

  return (
    <div onClick={onClick} className="group flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-5 hover:bg-surface-dark/50 hover:scale-[1.01] hover:shadow-lg hover:z-10 relative transition-all duration-200 border-t border-border-subtle first:border-t-0 cursor-pointer">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
          <span className="text-sm font-medium text-slate-100 group-hover:text-primary transition-colors line-clamp-2 md:line-clamp-1 break-words">{title}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${statusClasses}`}>
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
      <div className="flex items-center gap-4 mt-4 md:mt-0">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-emerald-500 font-bold">+{additions}</span>
          <span className="text-rose-500 font-bold">-{deletions}</span>
        </div>
        <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-300 transition-colors">chevron_right</span>
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
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp);
};

const getTaskGroup = (timestamp: number) => {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  return days <= 7 ? "Last 7 Days" : "Older";
};

const TaskList = ({ onSelectTask, activeTab }: { onSelectTask: (id: string) => void, activeTab: Task['category'] }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const dbTasks = useLiveQuery(() => taskService.getTasksByCategory(activeTab), [activeTab]);

  const allTasks = (dbTasks || []).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status.toUpperCase(),
    time: formatTimeAgo(t.createdAt),
    branch: `${t.repo}/${t.branch}`,
    additions: t.plusCount,
    deletions: t.minusCount,
    group: getTaskGroup(t.createdAt)
  }));

  const filteredTasks = allTasks.filter(task => 
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    task.branch.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recentTasks = filteredTasks.filter(t => t.group === "Last 7 Days");
  const olderTasks = filteredTasks.filter(t => t.group === "Older");

  return (
    <div className="space-y-8">
      {/* Search Input */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">search</span>
        <input 
          type="text" 
          placeholder="Filter tasks by title or branch..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface/30 border border-border-subtle rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
        />
      </div>

      <div className="space-y-12">
        {recentTasks.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-slate-500 mb-4 uppercase">Last 7 Days</h3>
            <div className="space-y-px rounded-xl overflow-hidden border border-border-subtle bg-surface/30">
              {recentTasks.map(task => (
                <TaskItem key={task.id} {...task} onClick={() => onSelectTask(task.id)} />
              ))}
            </div>
          </div>
        )}

        {olderTasks.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-slate-500 mb-4 uppercase">Older</h3>
            <div className="space-y-px rounded-xl overflow-hidden border border-border-subtle bg-surface/30">
              {olderTasks.map(task => (
                <TaskItem key={task.id} {...task} onClick={() => onSelectTask(task.id)} />
              ))}
            </div>
          </div>
        )}

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No tasks found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

const Footer = ({ navigate }: { navigate: (page: string) => void }) => (
  <div className="mt-20 py-8 border-t border-border-subtle flex flex-col md:flex-row justify-between items-center gap-4">
    <p className="text-xs text-slate-600">© 2026 DevPilot Automation Platform</p>
    <div className="flex gap-6">
      <button onClick={() => navigate('privacy')} className="text-xs text-slate-500 hover:text-primary transition-colors">Privacy Policy</button>
      <button onClick={() => navigate('terms')} className="text-xs text-slate-500 hover:text-primary transition-colors">Terms of Service</button>
      <button onClick={() => navigate('support')} className="text-xs text-slate-500 hover:text-primary transition-colors">Support</button>
    </div>
  </div>
);

const FloatingIndicator = () => (
  <div className="fixed bottom-6 right-6 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle rounded-full text-[10px] font-bold text-slate-500 tracking-wider">
    <span className="px-1.5 py-0.5 bg-white/5 rounded">⌘</span>
    <span className="px-1.5 py-0.5 bg-white/5 rounded">K</span>
    <span>TO SEARCH</span>
  </div>
);

const TaskDetail = ({ taskId, onBack }: { taskId: string, onBack: () => void }) => {
  const [isAgentOpen, setIsAgentOpen] = useState(true);
  const [isBrowserOpen, setIsBrowserOpen] = useState(true);
  const [isCodeOpen, setIsCodeOpen] = useState(true);
  const [codeTab, setCodeTab] = useState<'diff' | 'log' | 'terminal' | 'vision_analysis'>('diff');

  const task = useLiveQuery(() => taskService.getTaskById(taskId), [taskId]);
  const messages = useLiveQuery(() => taskService.getMessagesByTaskId(taskId), [taskId]);
  const run = useLiveQuery(() => taskService.getActiveAgentRun(taskId), [taskId]);
  const currentArtifact = useLiveQuery(() => taskService.getArtifactsByTaskIdAndType(taskId, codeTab), [taskId, codeTab]);
  const memoryHits = useLiveQuery(() => memoryService.getTaskMemoryHits(taskId), [taskId]);
  const runSteps = useLiveQuery(() => run ? runService.getRunStepsByRunId(run.id) : [], [run?.id]);
  const latestProposal = useLiveQuery(() => patchProposalService.getLatestProposalForTask(taskId), [taskId]);
  const patchFiles = useLiveQuery(() => latestProposal ? patchProposalService.getPatchFilesForProposal(latestProposal.id) : [], [latestProposal?.id]);

  useEffect(() => {
    if (task && task.status === 'running') {
      if (config.liveMode && task.inspectionStatus === 'idle') {
        runUiInspectionWorkflow(taskId);
      } else {
        startMockOrchestrator(taskId);
      }
    }
  }, [task?.status, taskId, task?.inspectionStatus]);

  const handleApprove = async () => {
    if (config.liveMode && latestProposal && latestProposal.status === 'ready_for_review') {
      runVerificationPreparationWorkflow(taskId, latestProposal.id);
    } else {
      await taskService.appendAgentMessage({
        taskId,
        sender: 'system',
        content: 'Changes approved and merged.',
        kind: 'success',
        timestamp: Date.now()
      });

      await runService.createAgentEvent({
        taskId,
        source: "ui_agent",
        type: "STATUS_CHANGED",
        title: "Task Approved",
        description: "User approved the generated patch.",
        metadata: JSON.stringify({ action: "approve" }),
        timestamp: Date.now()
      });

      await taskService.updateTaskStatus(taskId, 'merged');
    }

    // Requirement 9: Update artifacts with final completion content
    if (task) {
      // Mock final completion content
      const diffContent = `--- a/src/components/MomentsGrid.tsx\n+++ b/src/components/MomentsGrid.tsx\n@@ -45,7 +45,7 @@\n-      <div className="card-header overflow-hidden">\n+      <div className="card-header overflow-hidden w-full overflow-x-auto whitespace-nowrap">\n         <div className="title text-lg font-bold">Moments</div>\n         <div className="actions flex gap-2">`;

      const logContent = `[SUCCESS] Build completed successfully.\n[INFO] Tests passed: 42/42\n[INFO] Coverage: 95.5%\n[SUCCESS] Deployment artifact generated.`;

      const terminalContent = `> npm run build\n\n> vite build\nvite v6.4.1 building for production...\n✓ 45 modules transformed.\nrendering chunks...\ncomputing gzip size...\ndist/index.html                   0.83 kB │ gzip:   0.44 kB\n✓ built in 3.77s`;

      await taskService.updateTaskArtifact(taskId, 'diff', diffContent);
      await taskService.updateTaskArtifact(taskId, 'log', logContent);
      await taskService.updateTaskArtifact(taskId, 'terminal', terminalContent);
    }

    if (run) {
      await runService.updateAgentRunProgress(run.id, run.totalSteps, "Completed", "completed");
      if (runSteps) {
         for (const step of runSteps) {
            if (step.status === 'running' || step.status === 'pending') {
               await runService.updateRunStepStatus(step.id, 'completed', "Approved");
            }
         }
      }
      await runService.createAgentEvent({
        taskId,
        source: "orchestrator",
        type: "RUN_COMPLETED",
        title: "Workflow Completed",
        description: "Task workflow merged and closed.",
        metadata: "{}",
        timestamp: Date.now()
      });
      await memoryService.storeMemoryRecord({
        scope: "bug_fix",
        title: `Fix pattern for ${task?.title || taskId}`,
        content: "Successfully resolved UI overflow using horizontal scrolling container approach.",
        tags: ["ui", "layout", "mobile", "approved"],
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
  };

  if (!task) return <div className="p-8 text-center text-slate-500 flex items-center justify-center h-screen bg-background-dark font-display"><span className="material-symbols-outlined animate-spin mr-2">sync</span>Loading task workspace...</div>;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background-dark text-slate-100 font-display selection:bg-primary/30">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border-dark px-4 sm:px-6 py-3 bg-background-dark gap-4 sm:gap-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-slate-400 cursor-pointer hover:text-slate-300" onClick={onBack}>
            <span className="material-symbols-outlined text-primary text-xl mr-2">rocket_launch</span>
            <span>{task.repo}</span>
            <span>/</span>
            <span className="capitalize">{task.category.replace('_', ' ')}</span>
            <span>/</span>
            <span className="font-semibold text-white">#{task.id.slice(0, 4)}</span>
          </div>
          <h1 className="text-base font-bold text-white ml-2">{task.title}</h1>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] uppercase font-bold tracking-wider">
            {task.status === 'running' ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            ) : task.status === 'merged' ? (
              <span className="material-symbols-outlined text-[12px] text-green-500">check_circle</span>
            ) : null}
            {task.status}
          </div>
          {run && run.totalSteps > 0 && (
            <>
              <div className="h-4 w-px bg-border-dark mx-2"></div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-slate-400 border border-border-dark text-[10px] font-bold tracking-wider">
                <span>{run.completedSteps}/{run.totalSteps} STEPS</span>
                {run.progress > 0 && <span className="text-primary">{run.progress}%</span>}
              </div>
            </>
          )}
          <div className="h-4 w-px bg-border-dark mx-2"></div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">account_tree</span>
              <span>{task.branch}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-dark border border-border-dark text-sm font-semibold hover:bg-surface-dark/80 transition-colors">
            <span className="material-symbols-outlined text-primary text-lg">visibility</span>
            <span>View PR</span>
          </button>
          <button
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-background-dark text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleApprove}
            disabled={task.status !== 'running'}
          >
            <span>Approve & Commit</span>
          </button>
          <div className="size-8 rounded-full bg-surface-dark border border-border-dark flex items-center justify-center overflow-hidden">
             <div className="size-full bg-gradient-to-tr from-primary to-orange-200"></div>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left Sidebar: AI Chat */}
        <aside className={`absolute md:relative z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none' : 'w-12 border-r'} h-full md:h-auto border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>
          <div 
            className="p-4 border-b border-border-dark flex items-center justify-between cursor-pointer hover:bg-surface-dark/50"
            onClick={() => setIsAgentOpen(!isAgentOpen)}
          >
            {isAgentOpen ? (
              <>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Agent Intelligence</span>
                <span className="material-symbols-outlined text-slate-500 text-sm hidden md:block">keyboard_double_arrow_left</span><span className="material-symbols-outlined text-slate-500 text-sm block md:hidden">keyboard_double_arrow_up</span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full py-3">
                <span className="material-symbols-outlined text-slate-500 text-sm">keyboard_double_arrow_right</span>
                <span className="material-symbols-outlined text-slate-400 text-sm">smart_toy</span>
              </div>
            )}
          </div>
          
          {isAgentOpen && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {(messages || []).map(msg => (
                  <div key={msg.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`size-6 rounded flex items-center justify-center ${msg.kind === 'success' ? 'bg-green-500/20 text-green-500' : msg.kind === 'warning' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-primary/20 text-primary'}`}>
                        <span className="material-symbols-outlined text-sm">{msg.sender === 'system' ? 'dns' : 'smart_toy'}</span>
                      </div>
                      <span className="text-xs font-bold capitalize">{msg.sender}</span>
                      <span className="text-[10px] text-slate-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className={`p-3 rounded-lg border text-sm leading-relaxed ${msg.kind === 'success' ? 'bg-green-900/10 border-green-500/20 text-green-200' : msg.kind === 'warning' ? 'bg-yellow-900/10 border-yellow-500/20 text-yellow-200' : 'bg-surface-dark border-border-dark text-slate-300'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {run?.status === 'running' && (
                  <div className="flex items-center gap-3 py-2 px-1">
                    <span className="material-symbols-outlined text-primary animate-pulse">sync</span>
                    <span className="text-xs text-slate-400">{run.currentStep}</span>
                  </div>
                )}

                {memoryHits && memoryHits.length > 0 && (
                  <div className="pt-4 border-t border-border-dark space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recalled Memories</h3>
                    {memoryHits.map(hit => (
                      <div key={hit.id} className="bg-surface-dark/50 border border-border-dark rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">{hit.memory.title}</span>
                          <span className="text-[10px] font-mono text-primary/70">{Math.round(hit.score * 100)}% Match</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{hit.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-border-dark">
                <div className="relative">
                  <input className="w-full bg-surface-dark border border-border-dark rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none" placeholder="Ask the agent..." type="text" />
                  <button className="absolute right-2 top-1.5 text-slate-500 hover:text-primary">
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Center Content Area: Desktop Browser Simulator */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <section className={`${isBrowserOpen ? 'flex-[1.5]' : 'w-12 flex-none'} flex flex-col border-r border-border-dark bg-[#1c140c] transition-all duration-300`}>
            <div 
              className="p-3 flex items-center justify-between border-b border-border-dark bg-background-dark cursor-pointer hover:bg-surface-dark/50"
              onClick={() => setIsBrowserOpen(!isBrowserOpen)}
            >
              {isBrowserOpen ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-sm">desktop_windows</span>
                    <span className="text-xs font-medium text-slate-400">Desktop Browser (1280x800)</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <div className="size-2.5 rounded-full bg-red-500/50"></div>
                      <div className="size-2.5 rounded-full bg-yellow-500/50"></div>
                      <div className="size-2.5 rounded-full bg-green-500/50"></div>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 text-sm hidden md:block">keyboard_double_arrow_left</span><span className="material-symbols-outlined text-slate-500 text-sm block md:hidden">keyboard_double_arrow_up</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  <span className="material-symbols-outlined text-slate-500 text-sm">keyboard_double_arrow_right</span>
                  <span className="material-symbols-outlined text-slate-400 text-sm">desktop_windows</span>
                </div>
              )}
            </div>
            
            {isBrowserOpen && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="bg-surface-dark/40 px-4 py-2 border-b border-border-dark flex items-center gap-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="material-symbols-outlined text-sm cursor-pointer hover:text-white">arrow_back</span>
                    <span className="material-symbols-outlined text-sm cursor-pointer hover:text-white">arrow_forward</span>
                    <span className="material-symbols-outlined text-sm cursor-pointer hover:text-white">refresh</span>
                  </div>
                  <div className="flex-1 bg-background-dark/80 rounded px-3 py-1 flex items-center gap-2 border border-border-dark/50">
                    <span className="material-symbols-outlined text-xs text-slate-600">lock</span>
                    <span className="text-[10px] text-slate-400 font-mono">localhost:3000/dashboard/matches</span>
                  </div>
                </div>
                <div className="flex-1 bg-background-dark p-8 overflow-auto relative">
                  {/* Simulated Desktop Web App Content */}
                  <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                      <div className="h-8 w-48 bg-surface-dark rounded"></div>
                      <div className="flex gap-2">
                        <div className="h-8 w-8 bg-surface-dark rounded-full"></div>
                        <div className="h-8 w-24 bg-surface-dark rounded"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-6">
                      {/* Target element for overflow detection */}
                      <div className="aspect-video bg-surface-dark rounded-xl border-2 border-primary/50 relative">
                        {/* Gemini Vision Overlay Indicator */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="size-20 rounded-full border border-primary animate-ping opacity-20"></div>
                          <div className="size-14 rounded-full border-2 border-primary/40"></div>
                          <div className="size-4 rounded-full bg-primary/80"></div>
                        </div>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-background-dark text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-10">
                          OVERFLOW DETECTED
                        </div>
                        <div className="absolute bottom-4 left-4 right-4 h-3 bg-red-500/20 rounded"></div>
                      </div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                      <div className="aspect-video bg-surface-dark/50 rounded-xl"></div>
                    </div>
                    <div className="mt-12 space-y-4">
                      <div className="h-4 w-1/3 bg-surface-dark/50 rounded"></div>
                      <div className="h-4 w-full bg-surface-dark/30 rounded"></div>
                      <div className="h-4 w-full bg-surface-dark/30 rounded"></div>
                      <div className="h-4 w-2/3 bg-surface-dark/30 rounded"></div>
                    </div>
                  </div>
                  {/* AI Insight Overlay */}
                  <div className="absolute bottom-6 left-6 max-w-sm bg-primary/10 border border-primary/30 backdrop-blur-md p-4 rounded-lg shadow-2xl z-20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-base">visibility</span>
                      <span className="text-xs font-bold text-primary uppercase tracking-wider">Vision Analysis</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Element <code className="text-primary bg-primary/5 px-1 rounded">.card-header</code> is clipping outside its parent container in the <code className="text-slate-200">MomentsGrid</code> component at 1280px width.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Code & Diff Panel */}
          <section className={`absolute bottom-0 right-0 z-40 md:static ${isCodeOpen ? 'w-full h-[60vh] md:h-auto md:flex-1 md:w-auto shadow-2xl md:shadow-none border-t md:border-t-0' : 'w-full h-12 md:h-auto md:w-12 flex-none border-t md:border-t-0'} flex flex-col bg-background-dark transition-all duration-300`}>
            <div 
              className="flex border-b border-border-dark bg-surface-dark/20 cursor-pointer hover:bg-surface-dark/40"
            >
              {isCodeOpen ? (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setCodeTab('diff'); }} className={`px-6 py-3 text-sm ${codeTab === 'diff' ? 'font-bold border-b-2 border-primary text-white' : 'font-medium text-slate-500 hover:text-white'}`}>Diff</button>
                  <button onClick={(e) => { e.stopPropagation(); setCodeTab('log'); }} className={`px-6 py-3 text-sm ${codeTab === 'log' ? 'font-bold border-b-2 border-primary text-white' : 'font-medium text-slate-500 hover:text-white'}`}>Logs</button>
                  <button onClick={(e) => { e.stopPropagation(); setCodeTab('terminal'); }} className={`px-6 py-3 text-sm ${codeTab === 'terminal' ? 'font-bold border-b-2 border-primary text-white' : 'font-medium text-slate-500 hover:text-white'}`}>Terminal</button>
                  <button onClick={(e) => { e.stopPropagation(); setCodeTab('vision_analysis'); }} className={`px-6 py-3 text-sm ${codeTab === 'vision_analysis' ? 'font-bold border-b-2 border-primary text-white' : 'font-medium text-slate-500 hover:text-white'}`}>Vision</button>
                                          <div className="flex-1 flex justify-end items-center pr-4" onClick={() => setIsCodeOpen(false)}>
                    <span className="material-symbols-outlined text-slate-500 text-sm">keyboard_double_arrow_right</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-row md:flex-col items-center justify-center gap-4 w-full h-full md:py-3 cursor-pointer hover:bg-white/5" onClick={() => setIsCodeOpen(true)}>
                  <span className="material-symbols-outlined text-slate-500 text-sm hidden md:block">keyboard_double_arrow_left</span><span className="material-symbols-outlined text-slate-500 text-sm block md:hidden">keyboard_double_arrow_up</span>
                  <span className="material-symbols-outlined text-slate-400 text-sm">code</span>
                </div>
              )}
            </div>
            
            {isCodeOpen && (
              <>
                <div className="flex-1 overflow-auto p-4 code-font text-xs whitespace-pre-wrap font-mono text-slate-300">
                  {currentArtifact ? (
                    codeTab === 'diff' ? (
                      <div>
                        {(patchFiles && patchFiles.length > 0 ? patchFiles.map(f => f.patch).join('\n\n') : currentArtifact.content).split('\n').map((line, i) => {
                          const isAdd = line.startsWith('+');
                          const isSub = line.startsWith('-');
                          const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');

                          let lineClass = "flex hover:bg-white/5 transition-colors group";
                          let numClass = "w-12 text-right pr-4 text-slate-600 select-none";
                          let textClass = "pl-2";

                          if (isHeader) {
                            textClass = "pl-2 text-slate-500 font-bold";
                          } else if (isAdd && !line.startsWith('+++')) {
                            lineClass = "flex bg-primary/20 border-l-2 border-primary";
                            numClass = "w-12 text-right pr-4 text-primary/50 select-none";
                            textClass = "pl-2 text-slate-100 font-medium";
                          } else if (isSub && !line.startsWith('---')) {
                            lineClass = "flex bg-red-900/20 border-l-2 border-red-500";
                            numClass = "w-12 text-right pr-4 text-red-500/50 select-none";
                            textClass = "pl-2 text-red-200 font-medium";
                          }

                          return (
                            <div key={i} className={lineClass}>
                              <span className={numClass}>{i + 1}</span>
                              <span className={textClass}>{line}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : codeTab === 'vision_analysis' ? (
                      <div className="font-mono text-slate-300 whitespace-pre-wrap">
                        {(() => {
                          try {
                            const data = JSON.parse(currentArtifact.content);
                            return `### Vision Analysis Results ###\n\nIssue Type: ${data.issueType}\nSeverity: ${data.severity}\nSuspected Component: ${data.suspectedComponent}\n\nSummary:\n${data.summary}\n\nExplanation:\n${data.explanation}\n\nRecommended Fix:\n${data.recommendedFix}\n\nConfidence: ${data.confidence}`;
                          } catch (e) {
                            return currentArtifact.content;
                          }
                        })()}
                      </div>
                    ) : (
                      <div className="font-mono text-slate-300 whitespace-pre">
                        {currentArtifact.content}
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 italic">
                      No {codeTab} artifacts available yet...
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-border-dark flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <div className="flex gap-4">
                    <span>UTF-8</span>
                    <span>TypeScript JSX</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-500">{task.plusCount} insertions(+)</span>
                    <span className="text-red-500">{task.minusCount} deletion(-)</span>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Footer / Global Progress Bar */}
      <footer className="h-1 bg-surface-dark w-full overflow-hidden">
        <div className="h-full bg-primary w-[65%] transition-all duration-1000 ease-in-out"></div>
      </footer>
    </div>
  );
};


export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Task['category']>('tasks');

  useEffect(() => {
    initializeDb();
  }, []);

  const navigate = (page: string, taskId?: string) => {
    setCurrentPage(page);
    if (taskId) setSelectedTask(taskId);
  };

  if (currentPage === 'task_detail') {
    return <TaskDetail taskId={selectedTask!} onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'documentation') {
    return <Documentation onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'changelog') {
    return <Changelog onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'settings') {
    return <Settings onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'privacy') {
    return <Legal title="Privacy Policy" lastUpdated="March 11, 2026" content={PrivacyPolicyContent} onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'terms') {
    return <Legal title="Terms of Service" lastUpdated="March 11, 2026" content={TermsOfServiceContent} onBack={() => navigate('dashboard')} />;
  }

  if (currentPage === 'support') {
    return <Support onBack={() => navigate('dashboard')} />;
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark text-slate-100 font-display">
      <Header navigate={navigate} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        <Hero />
        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
        <TaskList activeTab={activeTab} onSelectTask={(id) => navigate('task_detail', id)} />
        <Footer navigate={navigate} />
      </main>
      <FloatingIndicator />
    </div>
  );
}
