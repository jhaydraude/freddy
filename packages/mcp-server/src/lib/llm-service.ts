import { GoogleGenerativeAI } from "@google/generative-ai";

export interface IExplainPrompt {
    system: string;
    user: string;
}

/**
 * Calls Gemini to generate an explanation.
 */
export async function generateExplanation(prompt: IExplainPrompt): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY in environment variables.");
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        // Gemini supports system instructions in a specific way or just via prompt concatenation.
        // 1.5 Flash supports system instructions via the API but sometimes it's easier to just combine them if using the simple generateContent.
        // However, let's try the cleaner config approach if supported, or just combine them.
        // For simplicity and robustness:

        const finalPrompt = `${prompt.system}\n\nUser Input:\n${prompt.user}`;

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        return text || "Could not generate explanation.";
    } catch (error: any) {
        console.error("LLM Call Failed:", error);
        return `Error generating explanation: ${error.message}`;
    }
}
