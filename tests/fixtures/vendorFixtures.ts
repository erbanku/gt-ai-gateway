import { randomUUID } from "crypto";
import config from "../config";

/**
 * Vendor Test Data Fixtures
 */

const VENDOR_FIXTURES = {
    openai: () => {
        const upstreamConfig = config.getCurrentUpstreamConfig();
        return {
            type: "other",
            name: config.isRealMode ? "OpenAI" : "Mock OpenAI",
            token: config.isRealMode
                ? upstreamConfig.openai.apiKey
                : `openai-token-${randomUUID()}`,
            urls: {
                openai: upstreamConfig.openai.url,
            },
        };
    },
    anthropic: () => {
        const upstreamConfig = config.getCurrentUpstreamConfig();
        return {
            type: "other",
            name: config.isRealMode ? "Anthropic" : "Mock Anthropic",
            token: config.isRealMode
                ? upstreamConfig.anthropic.apiKey
                : `anthropic-token-${randomUUID()}`,
            urls: {
                anthropic: upstreamConfig.anthropic.url,
            },
        };
    },
    custom: {
        type: "other",
        name: "Custom Vendor",
        token: `custom-token-${randomUUID()}`,
        urls: {
            openai: "https://api.custom.com/v1/chat",
        },
    },
    aliyun: {
        type: "aliyun",
        name: "Aliyun Vendor",
        token: `aliyun-token-${randomUUID()}`,
        urls: {
            openai: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        },
    },
    deepseek: {
        type: "deepseek",
        name: "DeepSeek Vendor",
        token: `deepseek-token-${randomUUID()}`,
        urls: {
            openai: "https://api.deepseek.com/v1/chat/completions",
        },
    },
};

function createRandomVendor(
    overrides: Partial<{
        type: string;
        name: string;
        token: string;
        urls: Record<string, string>;
    }> = {},
) {
    return {
        type: overrides.type || "other",
        name: overrides.name || `Test Vendor ${Date.now()}`,
        token: overrides.token || `vendor-token-${randomUUID()}`,
        urls: overrides.urls || { openai: "https://api.example.com/v1/chat" },
    };
}

export default {
    VENDOR_FIXTURES,
    createRandomVendor,
};
