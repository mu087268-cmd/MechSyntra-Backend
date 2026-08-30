const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT =
    process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const PRIMARY_MODEL =
    "gemini-3.6-flash";

const FALLBACK_MODEL =
    "gemini-3.5-flash-lite";

const MAX_BODY_SIZE =
    "18mb";

const MAX_MEDIA_BASE64_LENGTH =
    14 * 1024 * 1024;

/* =========================================================
   ENVIRONMENT CHECK
========================================================= */

if (!GEMINI_API_KEY) {
    console.error("");
    console.error(
        "========================================"
    );
    console.error(
        "       MECHSYNTRA AI BACKEND ERROR"
    );
    console.error(
        "========================================"
    );
    console.error(
        "GEMINI_API_KEY is missing."
    );
    console.error(
        "Add GEMINI_API_KEY to Vercel:"
    );
    console.error(
        "Project Settings → Environment Variables"
    );
    console.error(
        "Environment: Production"
    );
    console.error(
        "========================================"
    );
    console.error("");
    process.exit(1);
}

/* =========================================================
   GEMINI CLIENT
========================================================= */

const ai =
    new GoogleGenAI({
        apiKey:
            GEMINI_API_KEY
    });

/* =========================================================
   EXPRESS MIDDLEWARE
========================================================= */

app.use(
    cors({
        origin: "*",
        methods: [
            "GET",
            "POST",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Accept"
        ]
    })
);

app.use(
    express.json({
        limit:
            MAX_BODY_SIZE
    })
);

/* =========================================================
   SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI.

You are a professional general-purpose AI assistant.

Founder:
Usman Choudhary

PURPOSE:
Provide clear, natural, accurate and useful answers.

SUPPORTED TASKS:
- General questions
- Mathematics
- Numerical calculations
- Science
- Technology
- Android development
- Programming
- Coding
- Business
- Education
- Writing
- Translation
- Productivity
- Engineering
- Image understanding
- PDF/document understanding
- Audio understanding

MEDIA RULES:
- If an image is attached, actually inspect the image and answer using what is visible in it.
- If a PDF or supported document is attached, inspect its contents before answering.
- If audio is attached, use the audio content when answering.
- Never claim that you viewed, read, heard or analyzed a file if no media was actually supplied.
- If media is unclear or unreadable, say so.
- Never invent values, measurements, text, test results, component specifications, prices, sources or observations that are not present.
- When the user asks about engineering or safety-critical matters, clearly distinguish observed information from recommendations and advise professional verification where appropriate.

RESPONSE STYLE:
1. Answer like a normal modern AI chat assistant.
2. Use clear readable text.
3. Do NOT return JSON to the user.
4. Do NOT put the entire answer inside quotation marks.
5. Do NOT use Markdown heading symbols such as #, ##, ###.
6. Do NOT use Markdown bold syntax such as **text**.
7. Do NOT use Markdown italic syntax unnecessarily.
8. Do NOT use code fences around normal answers.
9. Do NOT use raw LaTeX.
10. Do NOT use:
   \\frac
   \\cdot
   \\text{}
   \\circ
   $$
   $
11. Do NOT output escaped JSON.
12. Do NOT use unnecessary hashtags.
13. Do NOT use Markdown horizontal rules.
14. Use normal line breaks.
15. Use simple bullets only when useful.
16. Keep simple questions concise.
17. Give more detail when the question requires it.

MATHEMATICS:
- Calculate carefully.
- Verify arithmetic before answering.
- Show useful steps when appropriate.
- Give the final answer clearly.
- Use readable plain-text formulas rather than LaTeX.

IDENTITY:
Your name is MechSyntra AI.
Your founder is Usman Choudhary.

CODING:
Provide practical and correct code.

BUSINESS:
Give realistic, structured advice.
Do not invent facts.

IMPORTANT:
Never claim you performed an action you did not actually perform.
`;

/* =========================================================
   MIME HELPERS
========================================================= */

function normalizeMimeType(value) {
    if (
        typeof value !== "string"
    ) {
        return "";
    }

    return value
        .split(";")[0]
        .trim()
        .toLowerCase();
}

function isSupportedMediaMime(mimeType) {
    if (!mimeType) {
        return false;
    }

    if (
        mimeType.startsWith(
            "image/"
        )
    ) {
        return true;
    }

    if (
        mimeType.startsWith(
            "audio/"
        )
    ) {
        return true;
    }

    if (
        mimeType ===
            "application/pdf"
    ) {
        return true;
    }

    return [
        "text/plain",
        "text/csv",
        "text/html",
        "text/css",
        "text/markdown",
        "text/xml",
        "application/json",
        "application/rtf"
    ].includes(
        mimeType
    );
}

function stripDataUrlPrefix(base64) {
    if (
        typeof base64 !==
        "string"
    ) {
        return "";
    }

    const commaIndex =
        base64.indexOf(",");

    if (
        base64.startsWith(
            "data:"
        ) &&
        commaIndex >= 0
    ) {
        return base64
            .slice(
                commaIndex + 1
            )
            .trim();
    }

    return base64.trim();
}

function looksLikeBase64(value) {
    if (
        typeof value !==
        "string"
    ) {
        return false;
    }

    const clean =
        stripDataUrlPrefix(
            value
        );

    if (
        clean.length === 0 ||
        clean.length >
            MAX_MEDIA_BASE64_LENGTH
    ) {
        return false;
    }

    return /^[A-Za-z0-9+/=\s]+$/.test(
        clean
    );
}

function createInlineDataPart(
    mimeType,
    base64Data
) {
    return {
        inlineData: {
            mimeType:
                mimeType,
            data:
                stripDataUrlPrefix(
                    base64Data
                )
        }
    };
}

/* =========================================================
   INPUT NORMALIZATION
========================================================= */

function buildUserParts(body) {
    const parts = [];

    const message =
        typeof body?.message === "string"
            ? body.message.trim()
            : "";

    const mediaBase64 =
        typeof body?.mediaBase64 === "string"
            ? body.mediaBase64
            : typeof body?.imageBase64 === "string"
                ? body.imageBase64
                : typeof body?.fileBase64 === "string"
                    ? body.fileBase64
                    : "";

    const mimeType =
        normalizeMimeType(
            body?.mimeType ||
            body?.mediaMimeType ||
            ""
        );

    const fileName =
        typeof body?.fileName === "string"
            ? body.fileName.trim()
            : "";

    if (message) {
        parts.push({
            text:
                message
        });
    }

    if (mediaBase64) {
        if (
            !mimeType
        ) {
            throw new Error(
                "MIME type is required when a file or image is attached."
            );
        }

        if (
            !isSupportedMediaMime(
                mimeType
            )
        ) {
            throw new Error(
                `Unsupported media type: ${mimeType}`
            );
        }

        if (
            !looksLikeBase64(
                mediaBase64
            )
        ) {
            throw new Error(
                "Invalid or oversized base64 media data."
            );
        }

        if (fileName) {
            parts.push({
                text:
                    `Attached file name: ${fileName}`
            });
        }

        parts.push(
            createInlineDataPart(
                mimeType,
                mediaBase64
            )
        );
    }

    if (
        parts.length === 0
    ) {
        throw new Error(
            "Message or media is required."
        );
    }

    return parts;
}

/* =========================================================
   STATUS HELPER
========================================================= */

function getErrorStatus(error) {
    const possibleStatus =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const numericStatus =
        Number(
            possibleStatus
        );

    return Number.isFinite(
        numericStatus
    )
        ? numericStatus
        : 500;
}

/* =========================================================
   FRIENDLY ERROR
========================================================= */

function getFriendlyError(
    error
) {
    const status =
        getErrorStatus(
            error
        );

    const rawMessage =
        String(
            error?.message ||
            ""
        );

    console.error(
        "Gemini status:",
        status
    );

    console.error(
        "Gemini message:",
        rawMessage
    );

    if (status === 400) {
        return (
            "Gemini rejected the request. " +
            "Please check the text, file type or media format."
        );
    }

    if (status === 401) {
        return (
            "Gemini API authentication failed. " +
            "Check GEMINI_API_KEY in Vercel Production."
        );
    }

    if (status === 403) {
        return (
            "Gemini API access was denied. " +
            "Check your Google AI API key and project permissions."
        );
    }

    if (status === 404) {
        return (
            "The configured Gemini model is unavailable for this project."
        );
    }

    if (status === 413) {
        return (
            "The attached file is too large. " +
            "Please use a smaller file."
        );
    }

    if (status === 429) {
        return (
            "Gemini usage limit was reached. " +
            "Please try again shortly."
        );
    }

    if (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    ) {
        return (
            "Gemini is temporarily unavailable. " +
            "Please try again in a moment."
        );
    }

    return (
        "MechSyntra AI could not generate a response right now."
    );
}

/* =========================================================
   RESPONSE CLEANING
========================================================= */

function cleanResponse(text) {
    if (
        typeof text !==
        "string"
    ) {
        return "";
    }

    let result =
        text.trim();

    result =
        result.replace(
            /^```(?:text|markdown|md)?\s*/i,
            ""
        );

    result =
        result.replace(
            /\s*```$/i,
            ""
        );

    result =
        result.replace(
            /^#{1,6}\s*/gm,
            ""
        );

    result =
        result.replace(
            /\*\*(.*?)\*\*/gs,
            "$1"
        );

    result =
        result.replace(
            /__(.*?)__/gs,
            "$1"
        );

    result =
        result.replace(
            /\*(.*?)\*/gs,
            "$1"
        );

    result =
        result.replace(
            /`([^`]+)`/g,
            "$1"
        );

    result =
        result.replace(
            /`/g,
            ""
        );

    result =
        result.replace(
            /^\s*[-*_]{3,}\s*$/gm,
            ""
        );

    result =
        result.replace(
            /\\cdot/g,
            " × "
        );

    result =
        result.replace(
            /\\times/g,
            " × "
        );

    result =
        result.replace(
            /\\div/g,
            " ÷ "
        );

    result =
        result.replace(
            /\\approx/g,
            " ≈ "
        );

    result =
        result.replace(
            /\\rightarrow/g,
            " → "
        );

    result =
        result.replace(
            /\\circ/g,
            "°"
        );

    result =
        result.replace(
            /\\text\s*\{([^{}]*)\}/g,
            "$1"
        );

    result =
        result.replace(
            /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
            "($1) / ($2)"
        );

    result =
        result.replace(
            /\$\$/g,
            ""
        );

    result =
        result.replace(
            /\$/g,
            ""
        );

    result =
        result.replace(
            /\\left/g,
            ""
        );

    result =
        result.replace(
            /\\right/g,
            ""
        );

    result =
        result.replace(
            /\n{3,}/g,
            "\n\n"
        );

    result =
        result.replace(
            /[ \t]{2,}/g,
            " "
        );

    return result.trim();
}

/* =========================================================
   GENERATE CONTENT
========================================================= */

async function generateWithModel(
    model,
    contents
) {
    return await ai.models.generateContent({
        model:
            model,
        contents:
            contents,
        config: {
            systemInstruction:
                SYSTEM_INSTRUCTION
        }
    });
}

/* =========================================================
   HOME / HEALTH
========================================================= */

app.get(
    "/",
    (req, res) => {
        return res.status(200).json({
            success: true,
            service:
                "MechSyntra AI",
            status:
                "online",
            model:
                PRIMARY_MODEL,
            multimodal:
                true
        });
    }
);

app.get(
    "/health",
    (req, res) => {
        return res.status(200).json({
            success: true,
            status:
                "healthy",
            model:
                PRIMARY_MODEL,
            multimodal:
                true
        });
    }
);

/* =========================================================
   CHAT / MULTIMODAL CHAT
========================================================= */

app.post(
    "/chat",
    async (req, res) => {

        try {

            const message =
                typeof req.body?.message ===
                "string"
                    ? req.body.message.trim()
                    : "";

            if (
                message.length >
                20000
            ) {
                return res.status(413).json({
                    success: false,
                    error:
                        "Message is too long."
                });
            }

            const mediaBase64 =
                typeof req.body?.mediaBase64 ===
                "string"
                    ? req.body.mediaBase64
                    : "";

            if (
                mediaBase64 &&
                mediaBase64.length >
                    MAX_MEDIA_BASE64_LENGTH
            ) {
                return res.status(413).json({
                    success: false,
                    error:
                        "Attached media is too large."
                });
            }

            let contents;

            try {

                const parts =
                    buildUserParts(
                        req.body
                    );

                contents = [
                    {
                        role:
                            "user",
                        parts:
                            parts
                    }
                ];

            } catch (
                inputError
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        inputError.message
                });
            }

            const hasMedia =
                contents[0]
                    .parts
                    .some(
                        part =>
                            !!part.inlineData
                    );

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "MECHSYNTRA AI REQUEST"
            );

            console.log(
                "Message:",
                message || "(media only)"
            );

            console.log(
                "Media:",
                hasMedia
                    ? (
                        req.body?.fileName ||
                        req.body?.mimeType ||
                        "attached"
                    )
                    : "none"
            );

            console.log(
                "Primary model:",
                PRIMARY_MODEL
            );

            let response =
                null;

            let lastError =
                null;

            /* -----------------------------------------
               PRIMARY MODEL
            ----------------------------------------- */

            for (
                let attempt = 1;
                attempt <= 2;
                attempt++
            ) {

                try {

                    console.log(
                        `Primary attempt ${attempt}/2`
                    );

                    response =
                        await generateWithModel(
                            PRIMARY_MODEL,
                            contents
                        );

                    if (
                        response
                    ) {
                        break;
                    }

                } catch (
                    error
                ) {

                    lastError =
                        error;

                    const status =
                        getErrorStatus(
                            error
                        );

                    console.error(
                        "Primary error status:",
                        status
                    );

                    console.error(
                        "Primary error:",
                        error?.message
                    );

                    const retryable =
                        status === 429 ||
                        status === 500 ||
                        status === 502 ||
                        status === 503 ||
                        status === 504;

                    if (
                        !retryable ||
                        attempt >= 2
                    ) {
                        break;
                    }

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                1200 *
                                    attempt
                            )
                    );
                }
            }

            /* -----------------------------------------
               FALLBACK
            ----------------------------------------- */

            if (
                !response
            ) {

                try {

                    console.log(
                        "Trying fallback model:",
                        FALLBACK_MODEL
                    );

                    response =
                        await generateWithModel(
                            FALLBACK_MODEL,
                            contents
                        );

                } catch (
                    error
                ) {

                    lastError =
                        error;

                    console.error(
                        "Fallback error status:",
                        getErrorStatus(
                            error
                        )
                    );

                    console.error(
                        "Fallback error:",
                        error?.message
                    );
                }
            }

            /* -----------------------------------------
               FAILED
            ----------------------------------------- */

            if (
                !response
            ) {

                return res.status(502).json({

                    success:
                        false,

                    error:
                        getFriendlyError(
                            lastError
                        ),

                    status:
                        getErrorStatus(
                            lastError
                        )
                });
            }

            /* -----------------------------------------
               EXTRACT TEXT
            ----------------------------------------- */

            let answer =
                "";

            try {

                if (
                    typeof response.text ===
                    "string"
                ) {

                    answer =
                        response.text.trim();
                }

            } catch (
                extractionError
            ) {

                console.error(
                    "Response extraction error:",
                    extractionError?.message
                );
            }

            if (
                !answer
            ) {

                return res.status(502).json({

                    success:
                        false,

                    error:
                        "Gemini returned an empty response."
                });
            }

            /* -----------------------------------------
               CLEAN
            ----------------------------------------- */

            answer =
                cleanResponse(
                    answer
                );

            if (
                !answer
            ) {

                return res.status(502).json({

                    success:
                        false,

                    error:
                        "The AI returned an empty readable response."
                });
            }

            console.log(
                "Gemini response received successfully."
            );

            console.log(
                "========================================"
            );

            return res.status(200).json({

                success:
                    true,

                reply:
                    answer
            });

        } catch (
            error
        ) {

            console.error(
                "Unhandled /chat error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "MechSyntra AI server could not process the request."
            });
        }
    }
);

/* =========================================================
   METHOD NOT ALLOWED
========================================================= */

app.use(
    "/chat",
    (req, res) => {

        return res.status(405).json({

            success:
                false,

            error:
                "Use POST /chat for AI messages."
        });
    }
);

/* =========================================================
   UNKNOWN ROUTE
========================================================= */

app.use(
    (req, res) => {

        return res.status(404).json({

            success:
                false,

            error:
                "Endpoint not found."
        });
    }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "========================================"
        );

        console.error(
            "EXPRESS SERVER ERROR"
        );

        console.error(
            "Message:",
            error?.message
        );

        console.error(
            "========================================"
        );

        if (
            res.headersSent
        ) {

            return next(
                error
            );
        }

        return res.status(500).json({

            success:
                false,

            error:
                "MechSyntra AI server could not process the request."
        });
    }
);

/* =========================================================
   LOCAL SERVER
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "          MECHSYNTRA AI BACKEND"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Local  : http://localhost:${PORT}`
        );

        console.log(
            `Health : http://localhost:${PORT}/health`
        );

        console.log(
            `Chat   : http://localhost:${PORT}/chat`
        );

        console.log(
            `Primary: ${PRIMARY_MODEL}`
        );

        console.log(
            `Backup : ${FALLBACK_MODEL}`
        );

        console.log(
            "Media  : IMAGE / AUDIO / PDF / TEXT"
        );

        console.log(
            "Status : ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);