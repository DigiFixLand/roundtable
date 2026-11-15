import { describe, it, expect } from "vitest";
import { classifyModel, enforceModelPolicy } from "@/lib/model-policy";

describe("Free-first server-side routing", () => {
  const local = { accessClass: "local" as const, providerName: "Ollama MSI", modelId: "qwen3:4b" };
  const cloud = {
    accessClass: "free-cloud" as const,
    providerName: "Gemini Free",
    modelId: "gemini-flash",
  };
  const paid = { accessClass: "paid-cloud" as const, providerName: "OpenAI", modelId: "gpt-4.1" };

  it("accepts actual loopback Ollama models as local", () => {
    expect(classifyModel("ollama", "http://127.0.0.1:11434/v1", "qwen3:4b", undefined)).toBe(
      "local",
    );
    expect(classifyModel("ollama", "http://localhost:11434/v1/", "gemma3:4b", undefined)).toBe(
      "local",
    );
  });
  it("classifies approved model families as separate trusted loopback local seats", () => {
    for (const [provider, model] of [
      ["deepseek-local", "deepseek-r1:7b"],
      ["phi-local", "phi4-mini:3.8b"],
      ["llama-local", "llama3.2:3b"],
    ]) {
      expect(classifyModel(provider, "http://127.0.0.1:11434/v1", model, undefined)).toBe("local");
      expect(classifyModel(provider, "https://remote-ai.example/v1", model, undefined)).toBe(
        "paid-cloud",
      );
      expect(classifyModel(provider, "http://127.0.0.1:9999/v1", model, undefined)).toBe(
        "paid-cloud",
      );
    }
    expect(classifyModel("kimi-local", "http://127.0.0.1:11434/v1", "Kimi-Web", undefined)).toBe(
      "paid-cloud",
    );
    expect(classifyModel("notebooklm", "http://127.0.0.1:11434/v1", "notebooklm", undefined)).toBe(
      "paid-cloud",
    );
  });

  it("rejects cloud-through-local, spoofed or non-loopback runtimes", () => {
    expect(classifyModel("ollama", "http://127.0.0.1:11434/v1", "qwen3:4b-cloud", undefined)).toBe(
      "paid-cloud",
    );
    expect(classifyModel("ollama", "https://ollama.com/v1", "qwen3:4b", undefined)).toBe(
      "paid-cloud",
    );
    expect(classifyModel("ollama", "http://192.168.1.64:11434/v1", "qwen3:4b", undefined)).toBe(
      "paid-cloud",
    );
    expect(classifyModel("openai", "http://127.0.0.1:11434/v1", "gpt-4.1", undefined)).toBe(
      "paid-cloud",
    );
  });
  it("requires explicit, allowlisted free cloud routing and :free for OpenRouter", () => {
    expect(
      classifyModel(
        "openrouter-free",
        "https://openrouter.ai/api/v1",
        "meta-llama/llama-3.3:free",
        "free",
      ),
    ).toBe("free-cloud");
    expect(
      classifyModel("openrouter-free", "https://openrouter.ai/api/v1", "openrouter/free", "free"),
    ).toBe("free-cloud");
    expect(
      classifyModel("openrouter-free", "https://openrouter.ai/api/v1", "openrouter/auto", "free"),
    ).toBe("paid-cloud");
    expect(
      classifyModel(
        "openrouter-free",
        "https://openrouter.ai/api/v1",
        "anthropic/claude-sonnet-4",
        "free",
      ),
    ).toBe("paid-cloud");
    expect(
      classifyModel(
        "groq-free",
        "https://api.groq.com/openai/v1",
        "llama-3.3-70b-versatile",
        "free",
      ),
    ).toBe("paid-cloud");
    expect(
      classifyModel(
        "gemini-free",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "gemini-2.5-flash-lite",
        "free",
      ),
    ).toBe("paid-cloud");
    expect(
      classifyModel(
        "openrouter-free",
        "https://evil.example/api/v1",
        "meta-llama/llama-3.3:free",
        "free",
      ),
    ).toBe("paid-cloud");
    expect(
      classifyModel(
        "openrouter-free",
        "http://openrouter.ai/api/v1",
        "meta-llama/llama-3.3:free",
        "free",
      ),
    ).toBe("paid-cloud");
    expect(classifyModel("openai", "https://api.openai.com/v1", "gpt-4.1", "free")).toBe(
      "paid-cloud",
    );
    expect(classifyModel("groq-free", "https://api.groq.com/openai/v1", "llama3", undefined)).toBe(
      "paid-cloud",
    );
  });
  it("starts local-only and free-only even when request omits all options", () => {
    expect(enforceModelPolicy([local], {}, false)).toBeNull();
    expect(enforceModelPolicy([cloud], {}, false)).toMatch(/Local only/);
    expect(enforceModelPolicy([paid], {}, false)).toMatch(/Local only/);
  });
  it("allows free cloud only with explicit privacy choice", () => {
    expect(
      enforceModelPolicy(
        [local, cloud],
        { privacyMode: "cloud-allowed", costMode: "free-only" },
        false,
      ),
    ).toBeNull();
    expect(
      enforceModelPolicy([local, cloud], { privacyMode: "ask-before-sharing" }, false),
    ).toMatch(/requires confirmation/);
    expect(
      enforceModelPolicy(
        [local, cloud],
        { privacyMode: "ask-before-sharing", cloudApproved: true },
        false,
      ),
    ).toBeNull();
  });
  it("blocks paid calls even with user opt-in unless server paid gate opens", () => {
    const options = {
      privacyMode: "cloud-allowed" as const,
      costMode: "paid-allowed" as const,
      paidApproved: true,
    };
    expect(enforceModelPolicy([paid], { privacyMode: "cloud-allowed" }, false)).toMatch(/Paid API/);
    expect(enforceModelPolicy([paid], options, false)).toMatch(/Paid API/);
    expect(enforceModelPolicy([paid], { ...options, paidApproved: false }, true)).toMatch(
      /Paid API/,
    );
    expect(enforceModelPolicy([paid], options, true)).toBeNull();
  });
});
