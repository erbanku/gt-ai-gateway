import type { AnthropicThinkingConfig } from "./protocolTypes";

export enum ReasoningEffort {
    NONE = "none",
    MINIMAL = "minimal",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    XHIGH = "xhigh",
}

export interface ThinkingConfig {
    enabled: boolean;
    effort?: ReasoningEffort;
    budgetTokens?: number;
}

export const EFFORT_TO_BUDGET_TOKENS: Record<ReasoningEffort, number> = {
    [ReasoningEffort.NONE]: 0,
    [ReasoningEffort.MINIMAL]: 1024,
    [ReasoningEffort.LOW]: 3000,
    [ReasoningEffort.MEDIUM]: 5000,
    [ReasoningEffort.HIGH]: 10000,
    [ReasoningEffort.XHIGH]: 16000,
};

function normalizeReasoningEffort(effort?: string): ReasoningEffort | undefined {
    switch (effort) {
        case ReasoningEffort.NONE:
            return ReasoningEffort.NONE;
        case ReasoningEffort.MINIMAL:
            return ReasoningEffort.MINIMAL;
        case ReasoningEffort.LOW:
            return ReasoningEffort.LOW;
        case ReasoningEffort.MEDIUM:
            return ReasoningEffort.MEDIUM;
        case ReasoningEffort.HIGH:
            return ReasoningEffort.HIGH;
        case ReasoningEffort.XHIGH:
            return ReasoningEffort.XHIGH;
        default:
            return undefined;
    }
}

function effortFromBudgetTokens(budgetTokens?: number): ReasoningEffort {
    if (budgetTokens === undefined) {
        return ReasoningEffort.HIGH;
    }

    if (budgetTokens <= 0) {
        return ReasoningEffort.NONE;
    }
    if (budgetTokens <= 1500) {
        return ReasoningEffort.MINIMAL;
    }
    if (budgetTokens <= 4000) {
        return ReasoningEffort.LOW;
    }
    if (budgetTokens <= 7500) {
        return ReasoningEffort.MEDIUM;
    }
    if (budgetTokens <= 12000) {
        return ReasoningEffort.HIGH;
    }

    return ReasoningEffort.XHIGH;
}

function buildThinkingConfigFromReasoningEffort(effort?: string): ThinkingConfig | undefined {
    const normalizedEffort = normalizeReasoningEffort(effort);
    if (!normalizedEffort) {
        return undefined;
    }

    return {
        enabled: normalizedEffort !== ReasoningEffort.NONE,
        effort: normalizedEffort,
        budgetTokens: normalizedEffort === ReasoningEffort.NONE
            ? undefined
            : EFFORT_TO_BUDGET_TOKENS[normalizedEffort],
    };
}

export function buildThinkingConfigFromAnthropic(
    thinking?: AnthropicThinkingConfig,
): ThinkingConfig | undefined {
    if (!thinking) {
        return undefined;
    }

    if (thinking.type === "disabled") {
        return {
            enabled: false,
            effort: ReasoningEffort.NONE,
        };
    }

    const effort = effortFromBudgetTokens(thinking.budget_tokens);
    return {
        enabled: effort !== ReasoningEffort.NONE,
        effort,
        budgetTokens: thinking.budget_tokens,
    };
}

export function buildThinkingConfigFromOpenAI(
    reasoningEffort?: string,
    reasoning?: { effort?: string },
): ThinkingConfig | undefined {
    return buildThinkingConfigFromReasoningEffort(reasoningEffort || reasoning?.effort);
}

export function buildThinkingConfigFromOpenAIResponses(
    reasoning?: { effort?: string },
): ThinkingConfig | undefined {
    return buildThinkingConfigFromReasoningEffort(reasoning?.effort);
}

export function thinkingConfigToAnthropic(
    config?: ThinkingConfig,
): AnthropicThinkingConfig | undefined {
    if (!config) {
        return undefined;
    }

    if (!config.enabled || config.effort === ReasoningEffort.NONE) {
        return { type: "disabled" };
    }

    const effort = config.effort || ReasoningEffort.HIGH;
    return {
        type: "enabled",
        budget_tokens: config.budgetTokens && config.budgetTokens > 0
            ? config.budgetTokens
            : EFFORT_TO_BUDGET_TOKENS[effort],
    };
}

export function thinkingConfigToOpenAI(config?: ThinkingConfig): ReasoningEffort | undefined {
    if (!config) {
        return undefined;
    }

    if (!config.enabled) {
        return ReasoningEffort.NONE;
    }

    return config.effort || ReasoningEffort.HIGH;
}

export function thinkingConfigToOpenAIResponses(
    config?: ThinkingConfig,
): { effort: ReasoningEffort } | undefined {
    const effort = thinkingConfigToOpenAI(config);
    if (!effort) {
        return undefined;
    }

    return { effort };
}
