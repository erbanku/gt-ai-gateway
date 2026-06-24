import { SgUser } from "../model/sgUser";

type ClientName = "claude-code" | "codex";
type ConnectionMode = "gateway" | "vendor";
type ClientProtocol = "anthropic" | "responses";

interface ApplyClientConfigParams {
    client: ClientName;
    connectionMode?: ConnectionMode;
    protocol?: ClientProtocol;
    gatewayUrl: string;
    apiKey: string;
    model: string;
}

interface RestoreClientConfigParams {
    client: ClientName;
}

interface ClientConfigStatus {
    client: ClientName;
    displayName: string;
    installed: boolean;
    configured: boolean;
    backupExists: boolean;
    currentConfig: CurrentClientConfig | null;
    configPath: string;
    backupPath: string;
    message?: string;
}

interface CurrentClientConfig {
    configPath: string;
    backendUrl: string;
    token: string;
    model: string;
    protocol: ClientProtocol;
    gatewayUser: GatewayUserInfo | null;
}

interface GatewayUserInfo {
    id: number;
    name: string;
    type: string;
    status: string;
}

interface FileSystemApi {
    access(path: string): Promise<void>;
    copyFile(source: string, target: string): Promise<void>;
    mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
    readFile(path: string, encoding: "utf-8"): Promise<string>;
    writeFile(path: string, content: string, encoding: "utf-8"): Promise<void>;
}

interface PathApi {
    dirname(path: string): string;
    join(...paths: string[]): string;
}

interface ConfigAdapter {
    readonly client: ClientName;
    readonly displayName: string;
    readonly configPath: string;
    readonly backupPath: string;

    getStatus(): Promise<ClientConfigStatus>;
    apply(params: ApplyClientConfigParams): Promise<ClientConfigStatus>;
    restore(): Promise<ClientConfigStatus>;
}

function normalizeGatewayUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function buildClaudeCodeBaseUrl(params: ApplyClientConfigParams): string {
    const url = normalizeGatewayUrl(params.gatewayUrl);
    if ((params.connectionMode || "gateway") === "vendor") {
        return url
            .replace(/\/v1\/messages\/?$/, "")
            .replace(/\/v1\/?$/, "");
    }

    return `${url}/llm`;
}

function buildCodexBaseUrl(params: ApplyClientConfigParams): string {
    const url = normalizeGatewayUrl(params.gatewayUrl);
    if ((params.connectionMode || "gateway") === "vendor") {
        return url
            .replace(/\/responses\/?$/, "")
            .replace(/\/chat\/completions\/?$/, "");
    }

    return `${url}/llm/v1`;
}

function getHomeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || "";
}

async function loadNodeApis(): Promise<{ fs: FileSystemApi; path: PathApi }> {
    const fs = await import("fs/promises");
    const path = await import("path");
    return { fs, path };
}

async function pathExists(fs: FileSystemApi, path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

function parseJsonConfig(content: string): Record<string, any> {
    if (!content.trim()) {
        return {};
    }

    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config file must contain a JSON object");
    }

    return parsed;
}

async function ensureBackup(fs: FileSystemApi, configPath: string, backupPath: string): Promise<void> {
    if (await pathExists(fs, backupPath)) {
        return;
    }

    if (await pathExists(fs, configPath)) {
        await fs.copyFile(configPath, backupPath);
    }
}

function escapeTomlString(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}

function buildTomlString(value: string): string {
    return `"${escapeTomlString(value)}"`;
}

function upsertRootTomlValue(content: string, key: string, value: string): string {
    const tableMatch = content.match(/^(\s*\[)/m);
    const tableIndex = tableMatch?.index ?? content.length;
    let root = content.slice(0, tableIndex);
    const rest = content.slice(tableIndex);
    const keyPattern = new RegExp(`^\\s*${key}\\s*=.*(?:\\n|$)`, "m");

    if (keyPattern.test(root)) {
        root = root.replace(keyPattern, `${key} = ${value}\n`);
    } else {
        root = `${root.replace(/\s*$/, "")}\n${key} = ${value}\n`;
    }

    return `${root}${rest ? `\n${rest.replace(/^\n+/, "")}` : ""}`.replace(/^\n+/, "");
}

function upsertTomlTable(content: string, tableName: string, values: Record<string, string>): string {
    const tablePattern = new RegExp(`^\\[${tableName.replace(/\./g, "\\.")}\\]\\n[\\s\\S]*?(?=^\\[|\\s*$)`, "m");
    const lines = [`[${tableName}]`];

    for (const [key, value] of Object.entries(values)) {
        lines.push(`${key} = ${value}`);
    }

    const tableContent = `${lines.join("\n")}\n`;
    if (tablePattern.test(content)) {
        return content.replace(tablePattern, tableContent);
    }

    return `${content.replace(/\s*$/, "")}\n\n${tableContent}`;
}

function getTomlValue(content: string, key: string): string | null {
    const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
    return match?.[1] ?? null;
}

function getTomlTableValue(content: string, tableName: string, key: string): string | null {
    const lines = content.split(/\r?\n/);
    let inTable = false;

    for (const line of lines) {
        const tableMatch = line.match(/^\s*\[([^\]]+)]\s*$/);
        if (tableMatch) {
            inTable = tableMatch[1] === tableName;
            continue;
        }

        if (!inTable) {
            continue;
        }

        const valueMatch = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`));
        if (valueMatch) {
            return valueMatch[1] || "";
        }
    }

    return null;
}

async function findGatewayUserByToken(token: string): Promise<GatewayUserInfo | null> {
    if (!token) {
        return null;
    }

    const normalizedToken = token.replace(/^Bearer\s+/i, "");
    let user: SgUser | null = null;
    try {
        user = await SgUser.query().where("token", normalizedToken).first();
    } catch {
        return null;
    }

    if (!user) {
        return null;
    }

    return {
        id: user.id,
        name: user.name,
        type: user.type,
        status: user.status,
    };
}

class BaseConfigAdapter {
    protected fs: FileSystemApi;
    protected path: PathApi;
    readonly client: ClientName;
    readonly displayName: string;
    readonly configPath: string;
    readonly backupPath: string;

    constructor(fs: FileSystemApi, path: PathApi, client: ClientName, displayName: string, configPath: string) {
        this.fs = fs;
        this.path = path;
        this.client = client;
        this.displayName = displayName;
        this.configPath = configPath;
        this.backupPath = `${configPath}.gt-ai-gateway.bak`;
    }

    protected async isInstalled(): Promise<boolean> {
        return await pathExists(this.fs, this.path.dirname(this.configPath));
    }

    protected async readConfigFile(): Promise<string> {
        if (!(await pathExists(this.fs, this.configPath))) {
            return "";
        }

        return await this.fs.readFile(this.configPath, "utf-8");
    }

    protected async writeConfigFile(content: string): Promise<void> {
        await this.fs.mkdir(this.path.dirname(this.configPath), { recursive: true });
        await ensureBackup(this.fs, this.configPath, this.backupPath);
        await this.fs.writeFile(this.configPath, content, "utf-8");
    }

    async restore(): Promise<ClientConfigStatus> {
        if (!(await pathExists(this.fs, this.backupPath))) {
            throw new Error(`${this.displayName} backup file not found`);
        }

        await this.fs.copyFile(this.backupPath, this.configPath);
        return await (this as unknown as ConfigAdapter).getStatus();
    }
}

class ClaudeCodeConfigAdapter extends BaseConfigAdapter implements ConfigAdapter {
    constructor(fs: FileSystemApi, path: PathApi, homeDir: string) {
        super(fs, path, "claude-code", "Claude Code", path.join(homeDir, ".claude", "settings.json"));
    }

    async getStatus(): Promise<ClientConfigStatus> {
        const installed = await this.isInstalled();
        let configured = false;
        let message: string | undefined;
        let currentConfig: CurrentClientConfig | null = null;

        if (installed && await pathExists(this.fs, this.configPath)) {
            try {
                const config = parseJsonConfig(await this.readConfigFile());
                const backendUrl = config.env?.ANTHROPIC_BASE_URL || "";
                const token = config.env?.ANTHROPIC_AUTH_TOKEN || config.env?.ANTHROPIC_API_KEY || "";
                configured = Boolean(backendUrl && token);
                if (configured) {
                    currentConfig = {
                        configPath: this.configPath,
                        backendUrl,
                        token,
                        model: config.model || "",
                        protocol: "anthropic",
                        gatewayUser: await findGatewayUserByToken(token),
                    };
                }
            } catch (error) {
                message = `配置文件解析失败: ${String(error)}`;
            }
        }

        return {
            client: this.client,
            displayName: this.displayName,
            installed,
            configured,
            backupExists: await pathExists(this.fs, this.backupPath),
            currentConfig,
            configPath: this.configPath,
            backupPath: this.backupPath,
            message,
        };
    }

    async apply(params: ApplyClientConfigParams): Promise<ClientConfigStatus> {
        if (!(await this.isInstalled())) {
            throw new Error("Claude Code config directory not found");
        }

        const config = parseJsonConfig(await this.readConfigFile());
        config.env = {
            ...(config.env || {}),
            ANTHROPIC_BASE_URL: buildClaudeCodeBaseUrl(params),
            ANTHROPIC_AUTH_TOKEN: params.apiKey,
            CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
        };

        if (params.model.trim()) {
            config.model = params.model.trim();
        }

        await this.writeConfigFile(`${JSON.stringify(config, null, 4)}\n`);
        return await this.getStatus();
    }
}

class CodexConfigAdapter extends BaseConfigAdapter implements ConfigAdapter {
    constructor(fs: FileSystemApi, path: PathApi, homeDir: string) {
        const codexHome = process.env.CODEX_HOME || path.join(homeDir, ".codex");
        super(fs, path, "codex", "Codex", path.join(codexHome, "config.toml"));
    }

    async getStatus(): Promise<ClientConfigStatus> {
        const installed = await this.isInstalled();
        let configured = false;
        let message: string | undefined;
        let currentConfig: CurrentClientConfig | null = null;

        if (installed && await pathExists(this.fs, this.configPath)) {
            try {
                const content = await this.readConfigFile();
                const provider = getTomlValue(content, "model_provider") || "";
                const providerTable = provider ? `model_providers.${provider}` : "";
                const backendUrl = providerTable ? getTomlTableValue(content, providerTable, "base_url") || "" : "";
                const token = providerTable ? getTomlTableValue(content, providerTable, "experimental_bearer_token") || "" : "";
                configured = Boolean(provider && backendUrl && token);
                if (configured) {
                    currentConfig = {
                        configPath: this.configPath,
                        backendUrl,
                        token,
                        model: getTomlValue(content, "model") || "",
                        protocol: "responses",
                        gatewayUser: await findGatewayUserByToken(token),
                    };
                }
            } catch (error) {
                message = `配置文件读取失败: ${String(error)}`;
            }
        }

        return {
            client: this.client,
            displayName: this.displayName,
            installed,
            configured,
            backupExists: await pathExists(this.fs, this.backupPath),
            currentConfig,
            configPath: this.configPath,
            backupPath: this.backupPath,
            message,
        };
    }

    async apply(params: ApplyClientConfigParams): Promise<ClientConfigStatus> {
        if (!(await this.isInstalled())) {
            throw new Error("Codex config directory not found");
        }

        let content = await this.readConfigFile();
        content = upsertRootTomlValue(content, "model_provider", buildTomlString("gt_ai_gateway"));

        if (params.model.trim()) {
            content = upsertRootTomlValue(content, "model", buildTomlString(params.model.trim()));
        }

        content = upsertTomlTable(content, "model_providers.gt_ai_gateway", {
            name: buildTomlString("GT AI Gateway"),
            base_url: buildTomlString(buildCodexBaseUrl(params)),
            wire_api: buildTomlString("responses"),
            experimental_bearer_token: buildTomlString(params.apiKey),
        });

        await this.writeConfigFile(`${content.trim()}\n`);
        return await this.getStatus();
    }
}

async function getAdapters(): Promise<ConfigAdapter[]> {
    const homeDir = getHomeDir();
    if (!homeDir) {
        throw new Error("Cannot determine user home directory");
    }

    const { fs, path } = await loadNodeApis();
    return [
        new ClaudeCodeConfigAdapter(fs, path, homeDir),
        new CodexConfigAdapter(fs, path, homeDir),
    ];
}

async function getAdapter(client: string): Promise<ConfigAdapter> {
    const adapters = await getAdapters();
    const adapter = adapters.find(item => item.client === client);
    if (!adapter) {
        throw new Error(`Unsupported client: ${client}`);
    }

    return adapter;
}

async function getStatus(): Promise<{ clients: ClientConfigStatus[] }> {
    const adapters = await getAdapters();
    const clients = await Promise.all(adapters.map(adapter => adapter.getStatus()));
    return { clients };
}

async function applyConfig(params: ApplyClientConfigParams): Promise<ClientConfigStatus> {
    if (!params.gatewayUrl?.trim()) {
        throw new Error("Gateway URL is required");
    }

    if (!params.apiKey?.trim()) {
        throw new Error("API key is required");
    }

    const adapter = await getAdapter(params.client);
    return await adapter.apply({
        ...params,
        connectionMode: params.connectionMode || "gateway",
        protocol: params.protocol,
        gatewayUrl: params.gatewayUrl.trim(),
        apiKey: params.apiKey.trim(),
        model: params.model?.trim() || "",
    });
}

async function restoreConfig(params: RestoreClientConfigParams): Promise<ClientConfigStatus> {
    const adapter = await getAdapter(params.client);
    return await adapter.restore();
}

export default {
    getStatus,
    applyConfig,
    restoreConfig,
};

export type {
    ClientName,
    ConnectionMode,
    ClientProtocol,
    ApplyClientConfigParams,
    ClientConfigStatus,
    CurrentClientConfig,
};
