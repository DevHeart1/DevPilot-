import React from 'react';

export const Changelog = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="min-h-screen bg-background-dark text-slate-100 font-display">
      <header className="flex items-center px-6 py-4 border-b border-border-subtle bg-background-dark/50 sticky top-0 z-50">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-medium">Back to Dashboard</span>
        </button>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Changelog</h1>
          <p className="text-lg text-slate-400">New updates and improvements to DevPilot.</p>
        </div>

        <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border-subtle before:to-transparent">

          {/* Release: March 23 (Night Update) */}
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-primary bg-surface-dark text-primary shadow-[0_0_15px_rgba(244,140,37,0.3)] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <span className="material-symbols-outlined text-sm">shield</span>
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl border border-border-subtle bg-surface/40 shadow-xl backdrop-blur-sm hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-xl text-white">v2.5.5</h3>
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">Latest</span>
              </div>
              <time className="block text-xs font-medium text-slate-500 mb-4">March 23, 2026</time>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Infrastructure</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1.5 ml-1">
                    <li>Resolved Sandbox CORS Policy block using dynamic origin matching</li>
                    <li>Fixed Vercel build failure by correcting service barrel exports</li>
                    <li>Enhanced Cloud Run middleware for robust preflight handling</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Dashboard UI</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1.5 ml-1">
                    <li>Repositioned "Go" button to the far right edge for professional layout</li>
                    <li>Fixed visual clipping issues in the Hero Composer shell</li>
                    <li>Resolved Dashboard runtime TypeError related to unitialized state</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Release: March 23 (Initial Refactor) */}

          {/* Release 2: March 16-19 (GitLab Duo & Composer) */}
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border-subtle bg-surface-dark text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <span className="material-symbols-outlined text-sm">account_tree</span>
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl border border-border-subtle bg-surface/20 shadow hover:border-slate-600 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-xl text-white">v2.4.5</h3>
              </div>
              <time className="block text-xs font-medium text-slate-500 mb-4">March 19, 2026</time>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Highlights</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1.5 ml-1">
                    <li>Implemented DashboardHeroComposer with command input</li>
                    <li>Integrated GitLab Duo agent mapping and custom flow orchestration</li>
                    <li>Added webhook event routing for repository state management</li>
                    <li>Verification preparation workflow for automated handoffs</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Release 3: March 13-15 (Vision & Architecture) */}
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border-subtle bg-surface-dark text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <span className="material-symbols-outlined text-sm">architecture</span>
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl border border-border-subtle bg-surface/20 shadow hover:border-slate-600 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-xl text-white">v2.4.2</h3>
              </div>
              <time className="block text-xs font-medium text-slate-500 mb-4">March 15, 2026</time>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Changes</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1.5 ml-1">
                    <li>Live UI inspection workflow with Gemini and Browserbase</li>
                    <li>Advanced chat input with dropdowns and autocompletion</li>
                    <li>Dexie-based local data architecture for offline persistence</li>
                    <li>Deployable Cloud Run sandbox service foundation</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
