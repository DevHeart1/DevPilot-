import { ChildProcess, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import {
    CommandPlan,
    PackageManager,
    ToolingPreparationResult,
    VerificationCheck,
    WorkspaceAnalysis,
} from "./bootstrap.types";
import { workspaceService } from "./workspace.service";

const execAsync = promisify(exec);

type CommandKind = "build" | "dev" | "install" | "other" | "preview";

interface PreparedExecution {
    analysis: WorkspaceAnalysis;
    commandKind: CommandKind;
    commandPlan: CommandPlan;
    finalCommand: string;
    finalCwd: string;
    requestedCommand: string;
    toolingPreparation: ToolingPreparationResult;
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface UrlReadinessResult {
    ready: boolean;
    attempts: number;
    lastError: string | null;
    statusCode: number | null;
    targetUrl: string;
}

export class CommandService {
    private activeProcesses: Map<string, ChildProcess> = new Map();

    async prepareEnvironment(requestedCwd?: string): Promise<{
        analysis: WorkspaceAnalysis;
        commandPlan: CommandPlan;
        toolingPreparation: ToolingPreparationResult;
    }> {
        const analysis = await this.getWorkspaceAnalysis(requestedCwd);
        const commandPlan = this.buildCommandPlan(analysis);
        const toolingPreparation = await this.ensurePackageManagerTooling(analysis.packageManager);

        this.logToolingPreparation(analysis, commandPlan, toolingPreparation);

        return {
            analysis,
            commandPlan,
            toolingPreparation,
        };
    }

    async execute(command: string, requestedCwd?: string): Promise<ExecutionResult> {
        try {
            const prepared = await this.prepareExecution(command, requestedCwd);
            this.logExecutionStart(prepared);

            if (!this.hasPackageJson(prepared.analysis.appRoot)) {
                throw new Error(`Execution aborted: package.json is missing in detected app root ${prepared.analysis.appRoot}.`);
            }

            if (prepared.commandKind === "build") {
                const checks = await this.runPreBuildVerification(prepared.analysis, prepared.commandPlan, prepared.toolingPreparation);
                this.logVerificationChecks("PRE-BUILD", checks);

                const failedChecks = checks.filter((check) => check.status === "fail");
                if (failedChecks.length > 0) {
                    throw new Error(this.formatFailedChecks("Pre-build verification failed", failedChecks));
                }
            }

            const nodeEnv = this.resolveNodeEnv(prepared.commandKind);
            const { stdout, stderr } = await execAsync(prepared.finalCommand, {
                cwd: prepared.finalCwd,
                env: {
                    ...process.env,
                    CI: "true",
                    NODE_ENV: nodeEnv,
                },
            });

            return {
                stdout,
                stderr,
                exitCode: 0,
            };
        } catch (error: unknown) {
            return this.toExecutionErrorResult(command, requestedCwd, error);
        }
    }

    async startBackground(id: string, command: string, requestedCwd?: string): Promise<void> {
        const prepared = await this.prepareExecution(command, requestedCwd);

        if (this.activeProcesses.has(id)) {
            await this.stopBackground(id);
        }

        this.logBackgroundStart(id, prepared);

        const child = exec(prepared.finalCommand, {
            cwd: prepared.finalCwd,
            env: {
                ...process.env,
                CI: "true",
                NODE_ENV: this.resolveNodeEnv(prepared.commandKind),
            },
        });

        child.stdout?.on("data", (data) => console.log(`[${id}] ${data}`));
        child.stderr?.on("data", (data) => console.error(`[${id}] ${data}`));

        this.activeProcesses.set(id, child);
    }

    async waitForUrl(
        targetUrl: string,
        timeoutMs: number = 60_000,
        intervalMs: number = 2_000,
    ): Promise<UrlReadinessResult> {
        const deadline = Date.now() + timeoutMs;
        let attempts = 0;
        let lastError: string | null = null;
        let statusCode: number | null = null;

        console.log(`[RUNTIME] Waiting for ${targetUrl} to become ready from inside the sandbox.`);

        while (Date.now() < deadline) {
            attempts += 1;

            try {
                const response = await fetch(targetUrl, {
                    signal: AbortSignal.timeout(Math.min(intervalMs, 5_000)),
                });

                statusCode = response.status;
                if (response.ok || [301, 302, 307, 308].includes(response.status)) {
                    console.log(`[RUNTIME] ${targetUrl} is ready after ${attempts} attempt(s).`);
                    return {
                        ready: true,
                        attempts,
                        lastError: null,
                        statusCode,
                        targetUrl,
                    };
                }

                lastError = `Received HTTP ${response.status} from ${targetUrl}`;
            } catch (error) {
                lastError = this.getErrorMessage(error);
            }

            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        console.warn(`[RUNTIME] ${targetUrl} did not become ready within ${timeoutMs}ms.`);
        return {
            ready: false,
            attempts,
            lastError,
            statusCode,
            targetUrl,
        };
    }

    async stopBackground(id: string): Promise<void> {
        const child = this.activeProcesses.get(id);
        if (child) {
            console.log(`[COMMAND] Stopping background ID: ${id}`);
            child.kill();
            this.activeProcesses.delete(id);
        }
    }

    private async prepareExecution(command: string, requestedCwd?: string): Promise<PreparedExecution> {
        const { analysis, commandPlan, toolingPreparation } = await this.prepareEnvironment(requestedCwd);
        const commandKind = this.classifyCommand(command, commandPlan);
        const finalCommand = this.normalizeCommand(command, commandPlan);
        const finalCwd = requestedCwd
            ? path.resolve(requestedCwd)
            : commandKind === "install"
                ? analysis.installRoot
                : analysis.appRoot;

        return {
            analysis,
            commandKind,
            commandPlan,
            finalCommand,
            finalCwd,
            requestedCommand: command,
            toolingPreparation,
        };
    }

    private async getWorkspaceAnalysis(requestedCwd?: string): Promise<WorkspaceAnalysis> {
        const existingAnalysis = workspaceService.getCurrentWorkspaceAnalysis();
        if (existingAnalysis) {
            return existingAnalysis;
        }

        const repoRoot = requestedCwd
            ? path.resolve(requestedCwd)
            : path.resolve(process.cwd(), "workspace");

        return workspaceService.setupWorkspace(repoRoot);
    }

    private buildCommandPlan(analysis: WorkspaceAnalysis): CommandPlan {
        return {
            packageManager: analysis.packageManager,
            detectedLockfile: analysis.detectedLockfile,
            installCommandUsed: this.resolveInstallCommand(analysis.packageManager, analysis.detectedLockfile),
            buildCommandUsed: this.resolveRuntimeCommand(
                analysis.packageManager,
                analysis.framework.buildScriptName,
                analysis.framework.buildCommand,
            ),
            devCommandUsed: this.resolveRuntimeCommand(
                analysis.packageManager,
                analysis.framework.devScriptName,
                analysis.framework.devCommand,
            ),
            previewCommandUsed: this.resolveRuntimeCommand(
                analysis.packageManager,
                analysis.framework.previewScriptName,
                analysis.framework.previewCommand,
            ),
        };
    }

    private resolveInstallCommand(packageManager: PackageManager, lockfile: WorkspaceAnalysis["detectedLockfile"]): string {
        switch (packageManager) {
            case "pnpm":
                return lockfile === "pnpm-lock.yaml"
                    ? "pnpm install --frozen-lockfile"
                    : "pnpm install";
            case "yarn":
                return lockfile === "yarn.lock"
                    ? "yarn install --frozen-lockfile"
                    : "yarn install";
            case "npm":
            default:
                return lockfile === "package-lock.json"
                    ? "npm ci --include=dev"
                    : "npm install --include=dev";
        }
    }

    private resolveRuntimeCommand(
        packageManager: PackageManager,
        scriptName: string | null,
        rawCommand: string | null,
    ): string | null {
        if (scriptName) {
            return `${packageManager} run ${scriptName}`;
        }

        if (!rawCommand) {
            return null;
        }

        switch (packageManager) {
            case "pnpm":
                return `pnpm exec ${rawCommand}`;
            case "yarn":
                return `yarn ${rawCommand}`;
            case "npm":
            default:
                return `npx ${rawCommand}`;
        }
    }

    private classifyCommand(command: string, commandPlan: CommandPlan): CommandKind {
        const normalized = command.trim().toLowerCase();

        if (/^(npm|pnpm|yarn)\s+(install|ci)\b/.test(normalized) || normalized === commandPlan.installCommandUsed.toLowerCase()) {
            return "install";
        }

        if (
            normalized === commandPlan.buildCommandUsed?.toLowerCase() ||
            /^(npm|pnpm|yarn)\s+(run\s+)?build\b/.test(normalized)
        ) {
            return "build";
        }

        if (
            normalized === commandPlan.devCommandUsed?.toLowerCase() ||
            /^(npm|pnpm|yarn)\s+(run\s+)?dev\b/.test(normalized)
        ) {
            return "dev";
        }

        if (
            normalized === commandPlan.previewCommandUsed?.toLowerCase() ||
            /^(npm|pnpm|yarn)\s+(run\s+)?(preview|start)\b/.test(normalized)
        ) {
            return "preview";
        }

        return "other";
    }

    private normalizeCommand(command: string, commandPlan: CommandPlan): string {
        const trimmed = command.trim();
        if (
            trimmed === commandPlan.installCommandUsed ||
            trimmed === commandPlan.buildCommandUsed ||
            trimmed === commandPlan.devCommandUsed ||
            trimmed === commandPlan.previewCommandUsed
        ) {
            return trimmed;
        }

        const match = /^(npm|pnpm|yarn)\s+(.+)$/.exec(trimmed);

        if (!match) {
            return trimmed;
        }

        const originalPackageManager = match[1] as PackageManager;
        const remainder = match[2].trim();
        const normalizedRemainder = remainder.toLowerCase();

        if (normalizedRemainder.startsWith("install") || normalizedRemainder.startsWith("ci")) {
            return commandPlan.installCommandUsed;
        }

        if (normalizedRemainder.startsWith("run ")) {
            const requestedScript = normalizedRemainder.slice(4).trim();
            return this.resolveScriptRequest(requestedScript, commandPlan, true) ?? trimmed;
        }

        const directScriptRequest = this.resolveScriptRequest(normalizedRemainder, commandPlan, false);
        if (directScriptRequest) {
            return directScriptRequest;
        }

        if (originalPackageManager !== commandPlan.packageManager) {
            return `${commandPlan.packageManager} ${remainder}`;
        }

        return trimmed;
    }

    private resolveScriptRequest(
        scriptRequest: string,
        commandPlan: CommandPlan,
        allowUnknownScript: boolean,
    ): string | null {
        const scriptName = scriptRequest.split(/\s+/)[0];

        switch (scriptName) {
            case "build":
                return commandPlan.buildCommandUsed;
            case "dev":
                return commandPlan.devCommandUsed ?? commandPlan.previewCommandUsed;
            case "preview":
            case "start":
                return commandPlan.previewCommandUsed ?? commandPlan.devCommandUsed;
            default:
                return allowUnknownScript ? `${commandPlan.packageManager} run ${scriptRequest}` : null;
        }
    }

    private async ensurePackageManagerTooling(packageManager: PackageManager): Promise<ToolingPreparationResult> {
        const verificationChecks: VerificationCheck[] = [];
        const warnings: string[] = [];

        const isAlreadyAvailable = await this.isBinaryAvailable(packageManager);
        if (isAlreadyAvailable) {
            verificationChecks.push({
                name: `${packageManager}-binary`,
                status: "pass",
                detail: `${packageManager} is already available in the sandbox runtime.`,
            });

            return {
                packageManager,
                packageManagerBinaryReady: true,
                installedWith: "preinstalled",
                verificationChecks,
                warnings,
            };
        }

        verificationChecks.push({
            name: `${packageManager}-binary`,
            status: "warn",
            detail: `${packageManager} was not found in PATH. Attempting to install or activate it.`,
        });

        if (await this.isBinaryAvailable("corepack")) {
            try {
                console.log(`[BOOTSTRAP] Enabling Corepack for ${packageManager}.`);
                await this.runBootstrapCommand("corepack enable");
                await this.runBootstrapCommand(
                    packageManager === "yarn"
                        ? "corepack prepare yarn@stable --activate"
                        : `corepack prepare ${packageManager}@latest --activate`,
                );

                if (await this.isBinaryAvailable(packageManager)) {
                    verificationChecks.push({
                        name: `${packageManager}-corepack`,
                        status: "pass",
                        detail: `${packageManager} was activated via Corepack.`,
                    });

                    return {
                        packageManager,
                        packageManagerBinaryReady: true,
                        installedWith: "corepack",
                        verificationChecks,
                        warnings,
                    };
                }
            } catch (error) {
                warnings.push(`Corepack activation for ${packageManager} failed: ${this.getErrorMessage(error)}`);
            }
        }

        if (await this.isBinaryAvailable("npm")) {
            try {
                console.log(`[BOOTSTRAP] Installing ${packageManager} globally with npm.`);
                await this.runBootstrapCommand(`npm install -g ${packageManager}`);

                if (await this.isBinaryAvailable(packageManager)) {
                    verificationChecks.push({
                        name: `${packageManager}-npm-global`,
                        status: "pass",
                        detail: `${packageManager} was installed globally with npm.`,
                    });

                    return {
                        packageManager,
                        packageManagerBinaryReady: true,
                        installedWith: "npm-global",
                        verificationChecks,
                        warnings,
                    };
                }
            } catch (error) {
                warnings.push(`Global npm install for ${packageManager} failed: ${this.getErrorMessage(error)}`);
            }
        }

        verificationChecks.push({
            name: `${packageManager}-availability`,
            status: "fail",
            detail: `Unable to make ${packageManager} available in the sandbox runtime.`,
        });

        return {
            packageManager,
            packageManagerBinaryReady: false,
            installedWith: "unavailable",
            verificationChecks,
            warnings,
        };
    }

    private async runPreBuildVerification(
        analysis: WorkspaceAnalysis,
        commandPlan: CommandPlan,
        toolingPreparation: ToolingPreparationResult,
    ): Promise<VerificationCheck[]> {
        const checks: VerificationCheck[] = [...toolingPreparation.verificationChecks];

        checks.push({
            name: "build-command",
            status: commandPlan.buildCommandUsed ? "pass" : "fail",
            detail: commandPlan.buildCommandUsed
                ? `Build command resolved to '${commandPlan.buildCommandUsed}'.`
                : `No build command could be resolved for framework '${analysis.framework.framework}'.`,
        });

        const installArtifactsPresent = this.hasInstalledDependencies(analysis.installRoot);
        checks.push({
            name: "install-artifacts",
            status: installArtifactsPresent ? "pass" : "fail",
            detail: installArtifactsPresent
                ? `Dependency installation artifacts were found in ${analysis.installRoot}.`
                : `No dependency installation artifacts were found in ${analysis.installRoot}. Run the install command before building.`,
        });

        for (const binary of analysis.framework.requiredBinaries) {
            const hasLocalBinary = this.hasLocalBinary(analysis.installRoot, binary) || this.hasLocalBinary(analysis.appRoot, binary);
            const hasGlobalBinary = hasLocalBinary ? false : await this.isBinaryAvailable(binary);

            checks.push({
                name: `binary:${binary}`,
                status: hasLocalBinary ? "pass" : hasGlobalBinary ? "warn" : "fail",
                detail: hasLocalBinary
                    ? `Required binary '${binary}' was found in local dependencies.`
                    : hasGlobalBinary
                        ? `Required binary '${binary}' was only found globally.`
                        : `Required binary '${binary}' was not found in local dependencies or PATH.`,
            });
        }

        return checks;
    }

    private hasInstalledDependencies(installRoot: string): boolean {
        return (
            fs.existsSync(path.join(installRoot, "node_modules")) ||
            fs.existsSync(path.join(installRoot, ".pnp.cjs")) ||
            fs.existsSync(path.join(installRoot, ".yarn"))
        );
    }

    private hasLocalBinary(rootDir: string, binary: string): boolean {
        const binaryNames = process.platform === "win32"
            ? [`${binary}.cmd`, `${binary}.ps1`, binary]
            : [binary];

        return binaryNames.some((binaryName) =>
            fs.existsSync(path.join(rootDir, "node_modules", ".bin", binaryName)),
        );
    }

    private async isBinaryAvailable(binary: string): Promise<boolean> {
        const lookupCommand = process.platform === "win32"
            ? `where ${binary}`
            : `command -v ${binary}`;

        try {
            await execAsync(lookupCommand);
            return true;
        } catch {
            return false;
        }
    }

    private async runBootstrapCommand(command: string): Promise<void> {
        await execAsync(command, {
            env: {
                ...process.env,
                CI: "true",
                NODE_ENV: "development",
            },
        });
    }

    private resolveNodeEnv(commandKind: CommandKind): string {
        return commandKind === "other"
            ? process.env.NODE_ENV || "development"
            : "development";
    }

    private hasPackageJson(dir: string): boolean {
        return fs.existsSync(path.join(dir, "package.json"));
    }

    private logToolingPreparation(
        analysis: WorkspaceAnalysis,
        commandPlan: CommandPlan,
        toolingPreparation: ToolingPreparationResult,
    ): void {
        console.log(`[BOOTSTRAP] Detected package manager: ${analysis.packageManager}`);
        console.log(`[BOOTSTRAP] Detected lockfile: ${analysis.detectedLockfile ?? "none"}`);
        console.log(`[BOOTSTRAP] Install command used: ${commandPlan.installCommandUsed}`);
        console.log(`[BOOTSTRAP] Build command used: ${commandPlan.buildCommandUsed ?? "none"}`);
        console.log(`[BOOTSTRAP] Dev command used: ${commandPlan.devCommandUsed ?? "none"}`);
        console.log(`[BOOTSTRAP] Preview command used: ${commandPlan.previewCommandUsed ?? "none"}`);
        console.log(
            `[BOOTSTRAP] Package manager binary status: ${toolingPreparation.packageManagerBinaryReady ? "ready" : "not ready"} (${toolingPreparation.installedWith})`,
        );

        if (toolingPreparation.warnings.length > 0) {
            for (const warning of toolingPreparation.warnings) {
                console.warn(`[BOOTSTRAP] Warning: ${warning}`);
            }
        }
    }

    private logExecutionStart(prepared: PreparedExecution): void {
        console.log(`\n--- [COMMAND EXECUTION] ---`);
        console.log(`Repo Root:           ${prepared.analysis.repoRoot}`);
        console.log(`App Root:            ${prepared.analysis.appRoot}`);
        console.log(`Install Root:        ${prepared.analysis.installRoot}`);
        console.log(`Framework:           ${prepared.analysis.framework.framework}`);
        console.log(`Requested Command:   "${prepared.requestedCommand}"`);
        console.log(`Detected PackageMgr: ${prepared.analysis.packageManager}`);
        console.log(`Detected Lockfile:   ${prepared.analysis.detectedLockfile ?? "none"}`);
        console.log(`Install Command:     ${prepared.commandPlan.installCommandUsed}`);
        console.log(`Build Command:       ${prepared.commandPlan.buildCommandUsed ?? "none"}`);
        console.log(`Dev Command:         ${prepared.commandPlan.devCommandUsed ?? "none"}`);
        console.log(`Preview Command:     ${prepared.commandPlan.previewCommandUsed ?? "none"}`);
        console.log(`Final Command:       "${prepared.finalCommand}"`);
        console.log(`Exact CWD Used:      ${prepared.finalCwd}`);
        console.log(`---------------------------\n`);
    }

    private logBackgroundStart(id: string, prepared: PreparedExecution): void {
        console.log(`\n--- [BACKGROUND PROCESS START] ---`);
        console.log(`ID:                 ${id}`);
        console.log(`Framework:          ${prepared.analysis.framework.framework}`);
        console.log(`Requested Command:  "${prepared.requestedCommand}"`);
        console.log(`Final Command:      "${prepared.finalCommand}"`);
        console.log(`Exact CWD Used:     ${prepared.finalCwd}`);
        console.log(`----------------------------------\n`);
    }

    private logVerificationChecks(label: string, checks: VerificationCheck[]): void {
        console.log(`[${label}] Verification checks:`);
        for (const check of checks) {
            console.log(`  - [${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
        }
    }

    private formatFailedChecks(prefix: string, checks: VerificationCheck[]): string {
        const details = checks.map((check) => `- ${check.name}: ${check.detail}`).join("\n");
        return `${prefix}:\n${details}`;
    }

    private async toExecutionErrorResult(
        command: string,
        requestedCwd: string | undefined,
        error: unknown,
    ): Promise<ExecutionResult> {
        const message = this.getErrorMessage(error);
        console.error(`[EXECUTION FAILED] "${command}"`);

        let finalCwd = requestedCwd ? path.resolve(requestedCwd) : "n/a";
        let directoryListing = "n/a";
        let bootstrapSummary = "bootstrap metadata unavailable";

        try {
            const analysis = workspaceService.getCurrentWorkspaceAnalysis();
            if (analysis) {
                finalCwd = analysis.appRoot;
                bootstrapSummary = `appRoot=${analysis.appRoot}, installRoot=${analysis.installRoot}, framework=${analysis.framework.framework}, packageManager=${analysis.packageManager}, lockfile=${analysis.detectedLockfile ?? "none"}`;
            }

            if (finalCwd !== "n/a" && fs.existsSync(finalCwd)) {
                directoryListing = fs.readdirSync(finalCwd).slice(0, 50).join(", ");
            }
        } catch {
            directoryListing = "n/a";
        }

        const errorWithStreams = error as Partial<ExecutionResult> & { code?: number; message?: string };
        const stdout = errorWithStreams.stdout || "";
        const stderr = errorWithStreams.stderr || "";
        const outputTail = [...stdout.split("\n").slice(-20), ...stderr.split("\n").slice(-20)]
            .filter(Boolean)
            .join("\n");

        return {
            stdout,
            stderr: `${message}\n\n[OUTPUT TAIL]\n${outputTail}\n\n[DEBUG] finalCwd: ${finalCwd}\n[DEBUG] bootstrap: ${bootstrapSummary}\n[DEBUG] Files in CWD (first 50): ${directoryListing}`,
            exitCode: errorWithStreams.code || 1,
        };
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}

export const commandService = new CommandService();
