import React, { useState, useRef, useEffect } from 'react';
import { Search, Folder, GitBranch, ChevronDown } from 'lucide-react';

interface AdvancedChatInputProps {
  onSendMessage: (content: string, project: string, branch: string) => void;
  projects: string[];
  branches: string[];
}

export const AdvancedChatInput: React.FC<AdvancedChatInputProps> = ({
  onSendMessage,
  projects = ['DevPilot'],
  branches = ['main']
}) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedProject, setSelectedProject] = useState(projects[0] || 'DevPilot');
  const [selectedBranch, setSelectedBranch] = useState(branches[0] || 'main');

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

  // Suggestions state
  const [suggestionType, setSuggestionType] = useState<'command' | 'file' | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const mockCommands = [
    { name: '/plan', description: 'Create a plan before executing' },
    { name: '/fix', description: 'Automatically apply fixes to the code' },
    { name: '/explain', description: 'Explain the selected component or issue' }
  ];

  const mockFiles = [
    'src/App.tsx',
    'src/index.css',
    'src/lib/services/task.service.ts',
    'package.json',
    'devpilot-sandbox/start.sh'
  ];

  const activeSuggestions = suggestionType === 'command'
    ? mockCommands.filter(c => c.name.startsWith(suggestionQuery))
    : suggestionType === 'file'
      ? mockFiles.filter(f => f.toLowerCase().includes(suggestionQuery.toLowerCase())).map(f => ({ name: f, description: 'File' }))
      : [];

  useEffect(() => {
    // Basic parser for triggers
    const words = content.split(' ');
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('/')) {
      setSuggestionType('command');
      setSuggestionQuery(lastWord);
      setSuggestionIndex(0);
    } else if (lastWord.startsWith('@')) {
      setSuggestionType('file');
      setSuggestionQuery(lastWord.slice(1));
      setSuggestionIndex(0);
    } else {
      setSuggestionType(null);
    }
  }, [content]);

  const applySuggestion = (suggestion: string) => {
    const words = content.split(' ');
    words.pop(); // remove the trigger word
    const newContent = [...words, suggestion, ''].join(' ').trimStart();
    setContent(newContent);
    setSuggestionType(null);
  };


  // Close dropdowns on outside click
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionType && activeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % activeSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + activeSuggestions.length) % activeSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestionType === 'command' ? activeSuggestions[suggestionIndex].name : '@' + activeSuggestions[suggestionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestionType(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !suggestionType && content.trim() !== '') {
      e.preventDefault();
      onSendMessage(content, selectedProject, selectedBranch);
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  return (
    <div className="p-3 bg-[#111111] border-t border-[#2A2A2A]" ref={containerRef}>
      <div className="relative flex items-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">


        {/* Auto-complete Suggestions */}
        {suggestionType && activeSuggestions.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 w-64 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl py-1 z-50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[#2A2A2A] bg-[#151515]">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {suggestionType === 'command' ? 'Commands' : 'Files'}
                </span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {activeSuggestions.map((s, idx) => (
                <button
                  key={s.name}
                  className={`w-full text-left px-3 py-2 flex flex-col transition-colors ${idx === suggestionIndex ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-[#252525] border-l-2 border-transparent'}`}
                  onClick={() => applySuggestion(suggestionType === 'command' ? s.name : '@' + s.name)}
                >
                  <span className={`text-sm font-medium ${idx === suggestionIndex ? 'text-primary-light' : 'text-slate-300'}`}>{s.name}</span>
                  {s.description && <span className="text-xs text-slate-500 truncate mt-0.5">{s.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Icon & Input */}
        <div className="flex flex-1 items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              // Auto-expand logic
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none py-1 resize-none overflow-hidden"
            placeholder="Ask a question with /plan"
            rows={1}
            style={{ minHeight: '28px' }}
          />
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-[#2A2A2A] mx-2"></div>

        {/* Selectors */}
        <div className="flex items-center gap-1.5">

          {/* Project Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setIsProjectDropdownOpen(!isProjectDropdownOpen);
                setIsBranchDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-[#252525] text-xs font-medium text-slate-300 transition-colors bg-[#202020]"
            >
              <Folder className="w-3.5 h-3.5 text-slate-400" />
              <span>{selectedProject}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {isProjectDropdownOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-40 bg-[#1A1A1A] border border-[#2A2A2A] rounded-md shadow-lg py-1 z-50">
                {projects.map(proj => (
                  <button
                    key={proj}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-[#252525] hover:text-white transition-colors"
                    onClick={() => {
                      setSelectedProject(proj);
                      setIsProjectDropdownOpen(false);
                    }}
                  >
                    {proj}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Branch Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setIsBranchDropdownOpen(!isBranchDropdownOpen);
                setIsProjectDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-[#252525] text-xs font-medium text-slate-300 transition-colors bg-[#202020]"
            >
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              <span>{selectedBranch}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-40 bg-[#1A1A1A] border border-[#2A2A2A] rounded-md shadow-lg py-1 z-50">
                {branches.map(branch => (
                  <button
                    key={branch}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-[#252525] hover:text-white transition-colors"
                    onClick={() => {
                      setSelectedBranch(branch);
                      setIsBranchDropdownOpen(false);
                    }}
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
