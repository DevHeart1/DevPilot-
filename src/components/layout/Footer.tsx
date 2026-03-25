import React from "react";

import { Link } from "react-router-dom";

export const Footer: React.FC = () => (
    <div className="mt-20 flex flex-col items-center justify-between gap-4 border-t border-border-subtle py-8 md:flex-row">
        <p className="text-xs text-slate-600">(c) 2026 DevPilot Automation Platform</p>
        <div className="flex gap-6">
            <Link
                to="/privacy"
                className="text-xs text-slate-500 transition-colors hover:text-primary"
            >
                Privacy Policy
            </Link>
            <Link
                to="/terms"
                className="text-xs text-slate-500 transition-colors hover:text-primary"
            >
                Terms of Service
            </Link>
            <Link
                to="/support"
                className="text-xs text-slate-500 transition-colors hover:text-primary"
            >
                Support
            </Link>
        </div>
    </div>
);
