import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Folder, GitBranch, Search } from "lucide-react";

export interface ChatSuggestion {
  name: string;
  description: string;
}

interface AdvancedChatInputProps {
  onSendMessage: (content: string, project: string, branch: string) => void;
  projects: string[];
  branches: string[];
  fileSuggestions?: string[];
  commandSuggestions?: ChatSuggestion[];
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_COMMAND_SUGGESTIONS: ChatSuggestion[] = [
  {
    name: "/plan",
    description: "Structure the request before the workflow runs",
  },
];

export const AdvancedChatInput: React.FC<AdvancedChatInputProps> = ({
  onSendMessage,
  projects,
  branches,
  fileSuggestions = [],
  commandSuggestions = DEFAULT_COMMAND_SUGGESTIONS,
  disabled = false,
  placeholder = "Add context, files, or follow-up instructions",
}) => {
  const [content, setContent] = useState("");
  const [selectedProject, setSelectedProject] = useState(projects[0] || "");
  const [selectedBranch, setSelectedBranch] = useState(branches[0] || "");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [suggestionType, setSuggestionType] = useState<"command" | "file" | null>(
    null,
  );
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedProject((currentProject) =>
      projects.includes(currentProject) ? currentProject : projects[0] || "",
    );
  }, [projects]);

  useEffect(() => {
    setSelectedBranch((currentBranch) =>
      branches.includes(currentBranch) ? currentBranch : branches[0] || "",
    );
  }, [branches]);

  const activeSuggestions = useMemo(() => {
    if (suggestionType === "command") {
      return commandSuggestions.filter((command) =>
        command.name.startsWith(suggestionQuery),
      );
    }

    if (suggestionType === "file") {
      return fileSuggestions
        .filter((file) =>
          file.toLowerCase().includes(suggestionQuery.toLowerCase()),
        )
        .map((file) => ({ name: file, description: "Repository file" }));
    }

    return [];
  }, [
    commandSuggestions,
    fileSuggestions,
    suggestionQuery,
    suggestionType,
  ]);

  useEffect(() => {
    const words = content.split(" ");
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith("/")) {
      setSuggestionType("command");
      setSuggestionQuery(lastWord);
      setSuggestionIndex(0);
      return;
    }

    if (lastWord.startsWith("@")) {
      setSuggestionType("file");
      setSuggestionQuery(lastWord.slice(1));
      setSuggestionIndex(0);
      return;
    }

    setSuggestionType(null);
  }, [content]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsProjectDropdownOpen(false);
        setIsBranchDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const applySuggestion = (suggestion: string) => {
    const words = content.split(" ");
    words.pop();
    const newContent = [...words, suggestion, ""].join(" ").trimStart();
    setContent(newContent);
    setSuggestionType(null);
  };

  const submit = () => {
    if (disabled || !content.trim() || !selectedProject || !selectedBranch) {
      return;
    }

    onSendMessage(content.trim(), selectedProject, selectedBranch);
    setContent("");
    setSuggestionType(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionType && activeSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestionIndex((current) => (current + 1) % activeSuggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestionIndex(
          (current) => (current - 1 + activeSuggestions.length) % activeSuggestions.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const suggestion = activeSuggestions[suggestionIndex];
        applySuggestion(
          suggestionType === "command" ? suggestion.name : `@${suggestion.name}`,
        );
        return;
      }

      if (event.key === "Escape") {
        setSuggestionType(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="border-t border-[#2A2A2A] bg-[#111111] p-3"
      ref={containerRef}
    >
      <div className="relative flex items-center rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
        {suggestionType && activeSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] py-1 shadow-2xl">
            <div className="border-b border-[#2A2A2A] bg-[#151515] px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {suggestionType === "command" ? "Commands" : "Files"}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {activeSuggestions.map((suggestion, index) => (
                <button
                  key={`${suggestionType}-${suggestion.name}`}
                  className={`flex w-full flex-col border-l-2 px-3 py-2 text-left transition-colors ${
                    index === suggestionIndex
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-[#252525]"
                  }`}
                  onClick={() =>
                    applySuggestion(
                      suggestionType === "command"
                        ? suggestion.name
                        : `@${suggestion.name}`,
                    )
                  }
                  type="button"
                >
                  <span
                    className={`text-sm font-medium ${
                      index === suggestionIndex
                        ? "text-primary-light"
                        : "text-slate-300"
                    }`}
                  >
                    {suggestion.name}
                  </span>
                  <span className="mt-0.5 truncate text-xs text-slate-500">
                    {suggestion.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none overflow-hidden border-none bg-transparent py-1 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            style={{ minHeight: "28px" }}
          />
        </div>

        <div className="mx-2 h-6 w-px bg-[#2A2A2A]" />

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (disabled || projects.length === 0) {
                  return;
                }
                setIsProjectDropdownOpen(!isProjectDropdownOpen);
                setIsBranchDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-md bg-[#202020] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#252525] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || projects.length === 0}
            >
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span>{selectedProject || "No project"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {isProjectDropdownOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-md border border-[#2A2A2A] bg-[#1A1A1A] py-1 shadow-lg">
                {projects.map((project) => (
                  <button
                    key={project}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-[#252525] hover:text-white"
                    onClick={() => {
                      setSelectedProject(project);
                      setIsProjectDropdownOpen(false);
                    }}
                    type="button"
                  >
                    {project}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (disabled || branches.length === 0) {
                  return;
                }
                setIsBranchDropdownOpen(!isBranchDropdownOpen);
                setIsProjectDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-md bg-[#202020] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#252525] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || branches.length === 0}
            >
              <GitBranch className="h-3.5 w-3.5 text-slate-400" />
              <span>{selectedBranch || "No branch"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-md border border-[#2A2A2A] bg-[#1A1A1A] py-1 shadow-lg">
                {branches.map((branch) => (
                  <button
                    key={branch}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-[#252525] hover:text-white"
                    onClick={() => {
                      setSelectedBranch(branch);
                      setIsBranchDropdownOpen(false);
                    }}
                    type="button"
                  >
                    {branch}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
