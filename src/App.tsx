/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Routes, Route, useNavigate, useParams, Navigate } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { DashboardHeroComposer } from "./components/DashboardHeroComposer";
import { Tabs } from "./components/dashboard/Tabs";
import { TaskList } from "./components/dashboard/TaskList";
import { TaskDetail } from "./components/dashboard/TaskDetail";
import { Changelog } from "./pages/Changelog";
import { Documentation } from "./pages/Documentation";
import { Legal, PrivacyPolicyContent, TermsOfServiceContent } from "./pages/Legal";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Support";
import { useTaskHub } from "./hooks/useTaskHub";
import { Task } from "./types";

type Page =
  | "dashboard"
  | "task_detail"
  | "documentation"
  | "changelog"
  | "settings"
  | "privacy"
  | "terms"
  | "support";

const TaskDetailRoute = ({ projects, branches }: { projects: string[]; branches: string[] }) => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  if (!taskId) return <Navigate to="/" replace />;

  return (
    <TaskDetail
      taskId={taskId}
      onBack={() => navigate("/")}
      projects={projects}
      branches={branches}
    />
  );
};

export default function App() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Task["category"]>("tasks");

  const {
    integrationState,
    selectedBranch,
    setSelectedBranch,
    isCreatingTask,
    dashboardError,
    userConfig,
    setUserConfig,
    createTask,
    handleProjectChange,
  } = useTaskHub();

  const handleCreateTask = async (prompt: string) => {
    const taskId = await createTask(prompt);
    if (taskId) navigate(`/task/${taskId}`);
  };

  const projectPath = integrationState.project?.pathWithNamespace || "";
  const branchNames = integrationState.branches.map((branch) => branch.name);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="min-h-screen bg-background-dark font-display text-slate-100 selection:bg-primary/30">
            <Header />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <DashboardHeroComposer
                projectLabel={integrationState.project?.name || "Select Project"}
                projectPath={projectPath}
                branches={branchNames}
                selectedBranch={selectedBranch}
                onBranchChange={setSelectedBranch}
                onSubmit={handleCreateTask}
                isReady={integrationState.ready}
                isSubmitting={isCreatingTask}
                availableProjects={integrationState.availableProjects}
                onProjectChange={handleProjectChange}
              />

              <section className="mt-16">
                <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
                <TaskList
                  onSelectTask={(id) => navigate(`/task/${id}`)}
                  activeTab={activeTab}
                />
              </section>

              <Footer />
            </main>
          </div>
        }
      />
      <Route path="/task/:taskId" element={<TaskDetailRoute projects={[projectPath]} branches={branchNames} />} />
      <Route path="/documentation" element={<Documentation onBack={() => navigate("/")} />} />
      <Route path="/changelog" element={<Changelog onBack={() => navigate("/")} />} />
      <Route
        path="/settings"
        element={<Settings onBack={() => navigate("/")} userConfig={userConfig} onUpdateConfig={setUserConfig} />}
      />
      <Route
        path="/privacy"
        element={<Legal title="Privacy Policy" lastUpdated="March 11, 2026" content={PrivacyPolicyContent} onBack={() => navigate("/")} />}
      />
      <Route
        path="/terms"
        element={<Legal title="Terms of Service" lastUpdated="March 11, 2026" content={TermsOfServiceContent} onBack={() => navigate("/")} />}
      />
      <Route path="/support" element={<Support onBack={() => navigate("/")} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
