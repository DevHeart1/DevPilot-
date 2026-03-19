import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Folder,
  GitBranch,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

interface HeroControlChipProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

const HeroControlChip = ({
  icon: Icon,
  label,
  value,
  accent = false,
  onClick,
  disabled = false,
}: HeroControlChipProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={[
      "group flex min-w-[148px] flex-1 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-200 sm:flex-none disabled:cursor-not-allowed disabled:opacity-60",
      accent
        ? "border-primary/20 bg-primary/10 hover:border-primary/[0.35] hover:bg-primary/[0.14]"
        : "border-white/[0.06] bg-chip/80 hover:border-white/[0.12] hover:bg-white/[0.07]",
    ].join(" ")}
  >
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
          accent
            ? "bg-primary/[0.14] text-primary"
            : "bg-white/5 text-slate-400 group-hover:text-slate-200",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </span>
        <span
          className={[
            "block truncate text-sm font-semibold",
            accent ? "text-orange-50" : "text-slate-100",
          ].join(" ")}
        >
          {value}
        </span>
      </span>
    </span>
    <ChevronDown
      className={[
        "h-4 w-4 shrink-0 transition-colors",
        accent ? "text-primary/80" : "text-slate-600 group-hover:text-slate-400",
      ].join(" ")}
    />
  </button>
);

interface DashboardHeroComposerProps {
  projectLabel: string;
  projectPath?: string;
  branches: string[];
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  placeholder?: string;
  helperText?: string;
}

export const DashboardHeroComposer: React.FC<DashboardHeroComposerProps> = ({
  projectLabel,
  projectPath,
  branches,
  selectedBranch,
  onBranchChange,
  onSubmit,
  disabled = false,
  isSubmitting = false,
  placeholder = "Describe the UI defect, repository task, or verification goal",
  helperText = "Routes through vision inspection, patch proposal, and verification before GitLab handoff.",
}) => {
  const [content, setContent] = useState("");
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsBranchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isSubmitting || !content.trim()) {
      return;
    }

    onSubmit(content.trim());
    setContent("");
    setIsBranchOpen(false);
  };

  return (
    <section className="dashboard-hero relative mb-10 px-2 sm:mb-12 sm:px-0">
      <div className="relative flex flex-col items-center text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/[0.15] bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          <Sparkles className="h-3.5 w-3.5" />
          GitLab Duo Flow
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
          What should we automate next?
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
          Describe a UI defect, repository task, or verification goal. DevPilot
          will route the work through inspection, patch preparation, and GitLab
          handoff.
        </p>

        <div
          className="hero-composer-shell mt-8 w-full max-w-4xl rounded-[30px] border border-white/[0.08] bg-surface-elevated/95 p-2 backdrop-blur-xl transition-all duration-300"
          ref={containerRef}
        >
          <div className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]">
            <div className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]" />

            <form
              className="flex flex-col gap-3 px-4 py-4 sm:px-5"
              onSubmit={submit}
            >
              {/* Command Input — full-width row on top */}
              <div className="flex min-w-0 items-center gap-3 rounded-[20px] border border-white/5 bg-black/[0.15] px-3 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.12] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Search className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0 flex-1 text-left">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Command Input
                  </div>
                  <input
                    type="text"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    disabled={disabled || isSubmitting}
                    className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500 sm:text-base"
                    placeholder={placeholder}
                  />
                </div>
              </div>

              {/* Repository · Branch · Run Mode — second row beneath */}
              <div className="flex w-full flex-wrap items-stretch gap-2 sm:flex-nowrap">
                <HeroControlChip
                  icon={Folder}
                  label="Repository"
                  value={projectPath || projectLabel}
                  disabled
                />

                <div className="relative">
                  <HeroControlChip
                    icon={GitBranch}
                    label="Branch"
                    value={selectedBranch || "No branch"}
                    onClick={() => {
                      if (disabled || branches.length === 0) {
                        return;
                      }
                      setIsBranchOpen((current) => !current);
                    }}
                    disabled={disabled || branches.length === 0}
                  />

                  {isBranchOpen && branches.length > 0 && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-2xl border border-white/[0.08] bg-[#151515] p-2 shadow-2xl">
                      {branches.map((branch) => (
                        <button
                          key={branch}
                          type="button"
                          className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${branch === selectedBranch
                              ? "bg-primary/10 text-primary"
                              : "text-slate-300 hover:bg-white/[0.06]"
                            }`}
                          onClick={() => {
                            onBranchChange(branch);
                            setIsBranchOpen(false);
                          }}
                        >
                          {branch}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={disabled || isSubmitting || !content.trim()}
                  className="group flex min-w-[132px] flex-1 items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-3.5 py-2.5 text-left transition-all duration-200 hover:border-primary/[0.35] hover:bg-primary/[0.14] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/[0.14] text-primary">
                      <Zap className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Run Mode
                      </span>
                      <span className="block truncate text-sm font-semibold text-orange-50">
                        {isSubmitting ? "Submitting" : "1x"}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Go
                  </span>
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-3 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex flex-wrap items-center gap-2 text-slate-500">
                <span className="rounded-full border border-primary/[0.15] bg-primary/10 px-2 py-1 font-semibold text-primary/90">
                  /plan
                </span>
                <span>{helperText}</span>
              </div>

              <div className="flex items-center gap-2 font-medium text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>ui_inspector -&gt; code_fixer -&gt; verifier</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
