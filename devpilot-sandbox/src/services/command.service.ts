import { exec, ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { workspaceService } from "./workspace.service";

const execAsync = promisify(exec);

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class CommandService {
    private activeProcesses: Map<string, ChildProcess> = new Map();

    /**
     * Resolves the working directory intelligently.
     */
    private async getCwd(): Promise<string> {
        // Workspace is created/cloned in the 'workspace' subfolder of the sandbox root
        const workspaceBase = path.resolve(process.cwd(), "workspace");
        const { appPath } = await workspaceService.setupWorkspace(workspaceBase);
        return appPath;
    }


    /**
     * Executes a command in the resolved workspace.
     */
    async execute(command: string, requestedCwd?: string): Promise<ExecutionResult> {
        const finalCwd = requestedCwd ? path.resolve(requestedCwd) : await this.getCwd();
        const info = workspaceService.getWorkspaceInfo();

        console.log(`\n--- [COMMAND EXECUTION] ---`);
        console.log(`Resolved Repo Path: ${info.repoPath}`);
        console.log(`Resolved App Path:  ${info.appPath}`);
        console.log(`Package.json found: ${info.packageJsonExists}`);
        console.log(`Command:           "${command}"`);
        // Intelligence for package manager
        const { packageManager } = workspaceService.getWorkspaceInfo();
        let finalCommand = command;

        // Smart swapping for install/ci
        if (command === "npm install" || command === "npm ci") {
            if (packageManager === "npm") {
                const hasLock = fs.existsSync(path.join(finalCwd, "package-lock.json"));
                finalCommand = hasLock ? "npm ci --include=dev" : "npm install --include=dev";
            } else {
                finalCommand = `${packageManager} install`;
            }
            console.log(`[INTELLIGENCE] Swapped to: ${finalCommand}`);
        } else if (command.startsWith("npm ") && packageManager !== "npm") {
            finalCommand = command.replace("npm ", `${packageManager} `);
            console.log(`[INTELLIGENCE] Swapped 'npm' to '${packageManager}'`);
        }

        // Pre-build health check
        if (command.includes("build") || command.includes("tsc")) {
            const vitePath = path.join(finalCwd, "node_modules", "vite");
            const hasVite = fs.existsSync(vitePath);
            console.log(`[HEALTH CHECK] Vite module exists: ${hasVite} at ${vitePath}`);
        }

        // Pre-check for manifest
        if (!fs.existsSync(path.join(finalCwd, "package.json"))) {
            const files = fs.readdirSync(finalCwd).slice(0, 50).join(", ");
            throw new Error(`Execution aborted: package.json missing in ${finalCwd}. Files present: ${files}`);
        }

        console.log(`[EXEC] Running: ${finalCommand}`);
        console.log(`Exact CWD used:     ${finalCwd}`);
        console.log(`---------------------------\n`);

        try {
            if (!fs.existsSync(finalCwd)) {
                throw new Error(`Directory does not exist: ${finalCwd}`);
            }

            const isInstall = command === "npm install" || command === "npm ci" || command.endsWith(" install");
            const nodeEnv = isInstall || command.includes("build") || command.includes("dev") ? "development" : (process.env.NODE_ENV || "development");

            const { stdout, stderr } = await execAsync(finalCommand, {
                cwd: finalCwd,
                env: { ...process.env, CI: "true", NODE_ENV: nodeEnv },
            });

            return {
                stdout,
                stderr,
                exitCode: 0,
            };
        } catch (error: any) {
            console.error(`[EXECUTION FAILED] "${command}" in ${finalCwd}`);

            const lastOutput = (error.stdout || "").split('\n').slice(-20).join('\n') +
                "\n" +
                (error.stderr || "").split('\n').slice(-20).join('\n');

            let dirList = "n/a";
            try { dirList = fs.readdirSync(finalCwd).slice(0, 50).join(", "); } catch (e) { }

            return {
                stdout: error.stdout || "",
                stderr: `${error.message}\n\n[OUTPUT TAIL]\n${lastOutput}\n\n[DEBUG] finalCwd: ${finalCwd}\n[DEBUG] Files in CWD (first 50): ${dirList}`,
                exitCode: error.code || 1,
            };
        }
    }

    /**
     * Starts a command in the background.
     */
    async startBackground(id: string, command: string, requestedCwd?: string): Promise<void> {
        const finalCwd = requestedCwd ? path.resolve(requestedCwd) : await this.getCwd();
        const info = workspaceService.getWorkspaceInfo();

        if (this.activeProcesses.has(id)) {
            await this.stopBackground(id);
        }

        console.log(`\n--- [BACKGROUND PROCESS START] ---`);
        console.log(`ID:                ${id}`);
        console.log(`Resolved Repo Path: ${info.repoPath}`);
        console.log(`Resolved App Path:  ${info.appPath}`);
        console.log(`Command:           "${command}"`);
        console.log(`Exact CWD used:     ${finalCwd}`);
        console.log(`----------------------------------\n`);

        const child = exec(command, {
            cwd: finalCwd,
            env: { ...process.env, CI: "true" },
        });

        child.stdout?.on("data", (data) => console.log(`[${id}] ${data}`));
        child.stderr?.on("data", (data) => console.error(`[${id}] ${data}`));

        this.activeProcesses.set(id, child);
    }

    /**
     * Stops a background command.
     */
    async stopBackground(id: string): Promise<void> {
        const child = this.activeProcesses.get(id);
        if (child) {
            console.log(`[COMMAND] Stopping background ID: ${id}`);
            child.kill();
            this.activeProcesses.delete(id);
        }
    }
}

export const commandService = new CommandService();
