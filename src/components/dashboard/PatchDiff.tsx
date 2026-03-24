import React from "react";
import { FileCode, Activity } from "lucide-react";

interface PatchDiffProps {
    filePath: string;
    patch: string;
}

export const PatchDiff: React.FC<PatchDiffProps> = ({ filePath, patch }) => {
    const lines = patch.split("\n");

    return (
        <div className="mb-8 overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-lg">
            <div className="flex items-center gap-2 border-b border-border-dark bg-background-dark/50 px-4 py-2.5">
                <FileCode className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-slate-200">{filePath}</span>
            </div>
            <div className="p-4 font-mono text-[11px] leading-relaxed overflow-x-auto">
                {lines.map((line, i) => {
                    const isAddition = line.startsWith("+") && !line.startsWith("+++");
                    const isDeletion = line.startsWith("-") && !line.startsWith("---");
                    const isHeader = line.startsWith("@@");

                    let colorClass = "text-slate-400";
                    let bgClass = "";

                    if (isAddition) {
                        colorClass = "text-green-400";
                        bgClass = "bg-green-500/10 -mx-4 px-4";
                    } else if (isDeletion) {
                        colorClass = "text-red-400";
                        bgClass = "bg-red-500/10 -mx-4 px-4";
                    } else if (isHeader) {
                        colorClass = "text-primary/70";
                        bgClass = "bg-primary/5 -mx-4 px-4 font-bold italic";
                    }

                    return (
                        <div key={i} className={`${bgClass} whitespace-pre`}>
                            <span className={colorClass}>{line}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
