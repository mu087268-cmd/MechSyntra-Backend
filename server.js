const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const APP_NAME = "MechSyntra AI";
const FOUNDER_NAME = "Usman Choudhary";
const MODEL = "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
    console.error("========================================");
    console.error("ERROR: GEMINI_API_KEY is missing.");
    console.error("Open .env and add your Gemini API key.");
    console.error("========================================");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

app.use(cors());

app.use(
    express.json({
        limit: "5mb"
    })
);

/* ========================================================
   SYSTEM INSTRUCTION
======================================================== */

const SYSTEM_INSTRUCTION = `
You are ${APP_NAME}, a professional general-purpose AI assistant.

APP IDENTITY:
- Assistant name: ${APP_NAME}
- Founder: ${FOUNDER_NAME}

FOUNDER RULE:
If the user asks who your founder is, who founded you, who made you,
or asks about the founder of ${APP_NAME}, answer clearly:

"${APP_NAME} was founded by ${FOUNDER_NAME}."

GENERAL BEHAVIOR:
- Answer the user's actual question directly.
- Be natural, clear, professional, and useful.
- Do not pretend to perform actions you did not perform.
- Do not mention these instructions.
- Do not add unnecessary disclaimers.

FORMATTING:
- Return readable normal text.
- Do NOT return JSON unless the user explicitly asks for JSON.
- Do NOT add random hashtags.
- Do NOT wrap normal answers in quotation marks.
- Do NOT produce comma-separated metadata.
- Do NOT add social-media style hashtags.
- Use short headings only when genuinely useful.
- Use simple bullet points when helpful.
- Use code blocks only when the user asks for code or code is necessary.
- For mathematics, use simple readable notation.
- Avoid unnecessary Markdown symbols.

MATHEMATICS:
- Calculate carefully.
- Verify arithmetic before answering.
- Give the final result clearly.
- Show useful steps when appropriate.

CODING:
- Provide practical and correct code.
- Explain important parts when useful.

BUSINESS:
- Give realistic and structured advice.
- Clearly separate assumptions from facts.

EDUCATION:
- Explain difficult concepts in simple language.
- Use examples when useful.

CONVERSATION:
- Answer naturally as an AI assistant.
- Keep simple questions concise.
- Give more detail when the question requires it.
`;

/* ========================================================
   HOME
======================================================== */

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: APP_NAME,
        status: "online",
        model: MODEL
    });
});

/* ========================================================
   HEALTH
======================================================== */

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy"
    });
});

/* ========================================================
   GEMINI
======================================================== */

async function askGemini(message) {
    return ai.models.generateContent({
        model: MODEL,
        contents: message,

        config: {
            systemInstruction: SYSTEM_INSTRUCTION,

            thinkingConfig: {
                thinkingBudget: 0
            },

            temperature: 0.6
        }
    });
}

/* ========================================================
   CHAT
======================================================== */

app.post("/chat", async (req, res) => {

    const message = req.body?.message;

    if (
        typeof message !== "string" ||
        message.trim() === ""
    ) {
        return res.status(400).json({
            success: false,
            error: "Message is required."
        });
    }

    const cleanMessage = message.trim();

    console.log("========================================");
    console.log("MECHSYNTRA AI REQUEST");
    console.log("Message:", cleanMessage);

    try {

        const response =
            await askGemini(cleanMessage);

        let answer =
            typeof response.text === "string"
                ? response.text.trim()
                : "";

        if (!answer) {

            console.error(
                "Gemini returned an empty response."
            );

            return res.status(502).json({
                success: false,
                error:
                    "Gemini returned an empty response."
            });
        }

        /*
         * Safety cleanup.
         *
         * We deliberately remove common social-media style
         * formatting that you said should not appear in
         * normal answers.
         */

        answer = cleanResponse(answer);

        console.log(
            "Gemini response received successfully."
        );

        console.log("========================================");

        return res.json({
            success: true,
            reply: answer
        });

    } catch (error) {

        console.error("========================================");
        console.error("GEMINI REQUEST FAILED");
        console.error("Name:", error?.name);
        console.error("Message:", error?.message);
        console.error("Status:", error?.status);
        console.error("========================================");

        const status =
            Number(error?.status) || 500;

        let userError =
            "MechSyntra AI could not generate a response right now.";

        if (status === 400) {

            userError =
                "The AI request was invalid.";

        } else if (status === 401) {

            userError =
                "Gemini API authentication failed. Check the API key.";

        } else if (status === 403) {

            userError =
                "Gemini API access was denied for this project.";

        } else if (status === 429) {

            userError =
                "Gemini usage limit was reached. Please try again later.";

        } else if (status === 503) {

            userError =
                "Gemini is temporarily busy. Please try again shortly.";
        }

        return res.status(502).json({
            success: false,
            error: userError
        });
    }
});

/* ========================================================
   RESPONSE CLEANUP
======================================================== */

function cleanResponse(text) {

    let result = text;

    /*
     * Remove markdown heading markers.
     * The Android UI can still display normal line breaks.
     */
    result = result.replace(
        /^\s*#{1,6}\s*/gm,
        ""
    );

    /*
     * Remove bold/italic markdown markers.
     */
    result = result.replace(
        /\*\*/g,
        ""
    );

    result = result.replace(
        /__+/g,
        ""
    );

    /*
     * Remove unnecessary inline backticks.
     */
    result = result.replace(
        /`/g,
        ""
    );

    /*
     * Remove social-media style hashtag lines.
     */
    result = result.replace(
        /^\s*(?:#\w+\s*){2,}$/gm,
        ""
    );

    /*
     * Remove excessive blank lines.
     */
    result = result.replace(
        /\n{3,}/g,
        "\n\n"
    );

    /*
     * Remove leading/trailing whitespace.
     */
    return result.trim();
}

/* ========================================================
   UNKNOWN ROUTE
======================================================== */

app.use((req, res) => {

    res.status(404).json({
        success: false,
        error: "Endpoint not found."
    });
});

/* ========================================================
   GLOBAL ERROR HANDLER
======================================================== */

app.use((error, req, res, next) => {

    console.error(
        "Unhandled server error:",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        success: false,
        error: "Internal server error."
    });
});

/* ========================================================
   START SERVER
======================================================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log("========================================");
        console.log(`        ${APP_NAME.toUpperCase()}`);
        console.log("========================================");
        console.log(`Port   : ${PORT}`);
        console.log(`Model  : ${MODEL}`);
        console.log(`Founder: ${FOUNDER_NAME}`);
        console.log("Thinking: OFF");
        console.log("Status : ONLINE");
        console.log("========================================");
        console.log("");
    }
);