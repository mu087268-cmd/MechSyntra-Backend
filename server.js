"use strict";

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

/* =========================================================
   APP CONFIGURATION
========================================================= */

const app = express();

const PORT = Number(process.env.PORT) || 3000;
<<<<<<< HEAD
const HOST = process.env.HOST || "0.0.0.0";
=======
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

const NODE_ENV =
    process.env.NODE_ENV || "development";

const APP_NAME = "MechSyntra AI";
const APP_VERSION = "1.0.0";

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const PRIMARY_MODEL =
    process.env.PRIMARY_MODEL ||
    "gemini-3.6-flash";

const FALLBACK_MODEL =
    process.env.FALLBACK_MODEL ||
    "gemini-3.5-flash-lite";

const IMAGE_MODEL =
    process.env.IMAGE_MODEL ||
    "gemini-2.5-flash-image";

const MAX_BODY_SIZE =
    process.env.MAX_BODY_SIZE || "25mb";

const MAX_MESSAGE_LENGTH = 20000;

const MAX_HISTORY_MESSAGES =
    Number(process.env.MAX_HISTORY_MESSAGES) || 30;

const MAX_MEDIA_BASE64_LENGTH =
    18 * 1024 * 1024;

const GENERATED_DIR =
    path.join(__dirname, "generated");

/* =========================================================
   STARTUP VALIDATION
========================================================= */

if (!GEMINI_API_KEY) {
<<<<<<< HEAD
    console.error(
        "[FATAL] GEMINI_API_KEY is missing."
    );

=======
    console.error("");
    console.error("========================================");
    console.error("       MECHSYNTRA AI BACKEND ERROR");
    console.error("========================================");
    console.error("GEMINI_API_KEY is missing.");
    console.error("Check your .env file.");
    console.error("========================================");
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
    process.exit(1);
}

if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(
        GENERATED_DIR,
        { recursive: true }
    );
}

/* =========================================================
   AI CLIENT
========================================================= */

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

/* =========================================================
<<<<<<< HEAD
   SECURITY
=======
   EXPRESS
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
========================================================= */

const allowedOrigins =
    process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS
            .split(",")
            .map(origin => origin.trim())
            .filter(Boolean)
        : ["*"];

app.use(
    cors({
        origin: (origin, callback) => {

            if (
                allowedOrigins.includes("*") ||
                !origin
            ) {
                return callback(null, true);
            }

            if (
                allowedOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            return callback(
                new Error(
                    "CORS origin not allowed."
                )
            );
        },

        methods: [
            "GET",
            "POST",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Accept",
            "Authorization",
            "X-Request-ID"
        ],

        credentials: true
    })
);

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.disable("x-powered-by");

app.use((req, res, next) => {

    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    res.setHeader(
        "X-Frame-Options",
        "DENY"
    );

    res.setHeader(
        "Referrer-Policy",
        "no-referrer"
    );

    res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=()"
    );

    next();
});

/* =========================================================
   REQUEST ID
========================================================= */

app.use((req, res, next) => {

    const incoming =
        req.headers["x-request-id"];

    const requestId =
        typeof incoming === "string" &&
        incoming.length <= 100
            ? incoming
            : crypto.randomUUID();

    req.requestId = requestId;

    res.setHeader(
        "X-Request-ID",
        requestId
    );

    next();
});

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use((req, res, next) => {

    const start =
        process.hrtime.bigint();

    res.on("finish", () => {

        const duration =
            Number(
                process.hrtime.bigint() -
                start
            ) / 1e6;

        console.log(
            `[HTTP] ${req.method} ${req.originalUrl} ` +
            `${res.statusCode} ${duration.toFixed(2)}ms ` +
            `[${req.requestId}]`
        );
    });

    next();
});

/* =========================================================
   RATE LIMITER
========================================================= */

const rateLimitStore =
    new Map();

const RATE_LIMIT_WINDOW =
    60 * 1000;

const RATE_LIMIT_MAX =
    Number(
        process.env.RATE_LIMIT_MAX
    ) || 60;

function rateLimiter(req, res, next) {

    const key =
        req.ip || "unknown";

    const now =
        Date.now();

    const existing =
        rateLimitStore.get(key);

    if (
        !existing ||
        now - existing.start >
        RATE_LIMIT_WINDOW
    ) {

        rateLimitStore.set(key, {
            start: now,
            count: 1
        });

        return next();
    }

    existing.count++;

    if (
        existing.count >
        RATE_LIMIT_MAX
    ) {

        return res.status(429).json({

            success: false,

            error:
                "Too many requests. Please try again shortly.",

            requestId:
                req.requestId
        });
    }

    next();
}

app.use(rateLimiter);

/* =========================================================
   BODY PARSING
========================================================= */

app.use(
    express.json({
        limit: MAX_BODY_SIZE
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: MAX_BODY_SIZE
    })
);

/* =========================================================
   GENERATED FILES
========================================================= */

app.use(
    "/generated",
    express.static(
        GENERATED_DIR,
        {
            maxAge:
                NODE_ENV === "production"
                    ? "1h"
                    : 0,

            index: false
        }
    )
);

/* =========================================================
   SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI.

Founder:
Usman Choudhary

You are a professional general-purpose AI assistant
with strong capabilities in engineering, education,
research, programming, documents and productivity.

<<<<<<< HEAD
CONVERSATION MEMORY:

Treat the supplied history as the same continuous conversation.

Use previous messages to understand:

- Context
- Pending requests
- User intent
- Previous answers
- Topics
- File/document requests
- Presentation requests

If the user says:

"yes"
"okay"
"continue"
"do it"
"make it"
"generate it"
"same"
"this one"

interpret the message using the previous conversation.

Do not unnecessarily ask the user to repeat information
already established in the conversation.

LANGUAGE:

Detect the user's language.

Normally respond in the same language.

Support:
- English
- Urdu
- Roman Urdu
- Other supported languages

If the user explicitly requests a language,
follow that request.

GENERAL:

- Be accurate.
- Do not invent facts.
- Do not fabricate sources.
- Do not claim a file was generated unless the application
  actually generated it.
- Keep simple responses concise.
- Give detailed answers when necessary.

MEDIA:

Only analyze media that is actually supplied.

Never pretend that an attachment was inspected when
no attachment exists.

CODING:

Provide practical and correct code.

ENGINEERING:

Be technically careful.

Separate:
- Known information
- Assumptions
- Recommendations

Never invent measurements, calculations,
experimental results or engineering test data.

DOCUMENTS:

When the application provides a document-generation endpoint,
return structured content appropriate for that document.

PRESENTATIONS:

When presentation generation is requested,
produce presentation-ready slide content rather than
a normal explanatory answer.

CHAT:

Respond naturally and directly.

Do not output JSON unless the endpoint specifically requires it.
=======
LANGUAGE:
- Reply normally in the user's language.
- Support English, Urdu and Roman Urdu.
- If the user explicitly requests a language, follow it.
- If the user says Roman Urdu, use Roman Urdu.
- Do not unnecessarily switch languages.

GENERAL:
- Give accurate and useful answers.
- Do not invent facts.
- Do not claim an action was completed unless it was actually completed.
- Keep simple questions concise.
- Give detailed answers when required.

MEDIA:
- Analyze supplied images, PDFs, audio and text when supported.
- Never pretend that an attachment was inspected if it was not supplied.
- Never invent information from attachments.

ASSIGNMENTS:
- Create complete academic assignments when requested.
- Include a suitable title.
- Include Introduction.
- Include relevant sections and subtopics.
- Include examples where useful.
- Include Conclusion.
- Include References only when reliable references are available.
- Never fabricate citations, studies or statistics.
- Follow the requested language and educational level.

DOCUMENTS:
- Word/DOCX and PDF generation is supported by the backend.
- The backend generates the actual files.

RESPONSE:
- Use clean readable text.
- Do not use unnecessary Markdown.
- Do not return JSON as the normal AI answer.
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
`;

/* =========================================================
   HELPERS
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

function stripDataUrlPrefix(value) {

    if (
        typeof value !== "string"
    ) {
        return "";
    }

    const comma =
        value.indexOf(",");

    if (
        value.startsWith("data:") &&
        comma !== -1
    ) {
        return value
            .slice(comma + 1)
            .trim();
    }

    return value.trim();
}

function looksLikeBase64(value) {

    if (
        typeof value !== "string"
    ) {
        return false;
    }

    const clean =
        stripDataUrlPrefix(value);

    if (!clean) {
        return false;
    }

    if (
        clean.length >
        MAX_MEDIA_BASE64_LENGTH
    ) {
        return false;
    }

    return /^[A-Za-z0-9+/=\s]+$/
        .test(clean);
}

function isSupportedMediaMime(
    mimeType
) {

    if (!mimeType) {
        return false;
    }

    if (
        mimeType.startsWith("image/")
    ) {
        return true;
    }

    if (
        mimeType.startsWith("audio/")
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
    ].includes(mimeType);
}

<<<<<<< HEAD
=======
function stripDataUrlPrefix(base64) {
    if (typeof base64 !== "string") {
        return "";
    }

    const commaIndex = base64.indexOf(",");

    if (
        base64.startsWith("data:") &&
        commaIndex >= 0
    ) {
        return base64
            .slice(commaIndex + 1)
            .trim();
    }

    return base64.trim();
}

function looksLikeBase64(value) {
    if (typeof value !== "string") {
        return false;
    }

    const clean = stripDataUrlPrefix(value);

    if (
        !clean ||
        clean.length > MAX_MEDIA_BASE64_LENGTH
    ) {
        return false;
    }

    return /^[A-Za-z0-9+/=\s]+$/.test(clean);
}

>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
function createInlineDataPart(
    mimeType,
    base64
) {

    return {
        inlineData: {
            mimeType,
<<<<<<< HEAD
            data:
                stripDataUrlPrefix(
                    base64
                )
=======
            data: stripDataUrlPrefix(base64Data)
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        }
    };
}

/* =========================================================
   HISTORY
========================================================= */

function normalizeHistory(
    history
) {

    if (
        !Array.isArray(history)
    ) {
        return [];
    }

    return history
        .slice(-MAX_HISTORY_MESSAGES)
        .map(item => {

            const role =
                item?.role === "model" ||
                item?.role === "assistant"
                    ? "model"
                    : "user";

            const text =
                typeof item?.text === "string"
                    ? item.text.trim()
                    : typeof item?.message === "string"
                        ? item.message.trim()
                        : typeof item?.content === "string"
                            ? item.content.trim()
                            : "";

            if (!text) {
                return null;
            }

            return {
                role,
                parts: [
                    {
                        text
                    }
                ]
            };
        })
        .filter(Boolean);
}

function buildConversationContents(
    message,
    history = [],
    media = null
) {

    const contents = [];

    const normalizedHistory =
        normalizeHistory(history);

    contents.push(
        ...normalizedHistory
    );

    const currentParts = [];

    if (
        typeof message === "string" &&
        message.trim()
    ) {

        currentParts.push({
            text: message.trim()
        });
    }

    if (
        media?.base64 &&
        media?.mimeType
    ) {

        currentParts.push(
            createInlineDataPart(
                media.mimeType,
                media.base64
            )
        );
    }

    if (
        currentParts.length === 0
    ) {

        throw new Error(
            "Message or media is required."
        );
    }

    contents.push({
        role: "user",
        parts: currentParts
    });

    return contents;
}

/* =========================================================
   MEDIA
========================================================= */

function getMediaFromBody(
    body
) {

    const base64 =
        typeof body?.mediaBase64 === "string"
            ? body.mediaBase64
            : typeof body?.imageBase64 === "string"
                ? body.imageBase64
                : typeof body?.fileBase64 === "string"
                    ? body.fileBase64
                    : "";

    if (!base64) {
        return null;
    }

<<<<<<< HEAD
    const mimeType =
        normalizeMimeType(
            body?.mimeType ||
            body?.mediaMimeType ||
            "image/jpeg"
=======
    if (mediaBase64) {
        if (!mimeType) {
            throw new Error(
                "MIME type is required when a file is attached."
            );
        }

        if (!isSupportedMediaMime(mimeType)) {
            throw new Error(
                `Unsupported media type: ${mimeType}`
            );
        }

        if (!looksLikeBase64(mediaBase64)) {
            throw new Error(
                "Invalid or oversized base64 media data."
            );
        }

        if (fileName) {
            parts.push({
                text: `Attached file name: ${fileName}`
            });
        }

        parts.push(
            createInlineDataPart(
                mimeType,
                mediaBase64
            )
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        );

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
            base64
        )
    ) {

        throw new Error(
            "Invalid or oversized media data."
        );
    }

    return {
        base64,
        mimeType
    };
}

<<<<<<< HEAD
/* =========================================================
   ERROR HANDLING
========================================================= */

function getErrorStatus(
    error
) {

    const value =
=======
function getErrorStatus(error) {
    const status =
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

<<<<<<< HEAD
    const status =
        Number(value);

    return Number.isFinite(status)
        ? status
=======
    const numberStatus = Number(status);

    return Number.isFinite(numberStatus)
        ? numberStatus
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        : 500;
}

function getFriendlyError(
    error
) {

    const status =
        getErrorStatus(error);

    console.error(
        "[AI ERROR]",
        error?.message || error
    );

    switch (status) {

<<<<<<< HEAD
        case 400:
            return "The request was invalid. Please check your message or media.";

        case 401:
            return "Gemini authentication failed. Please check the API key.";

        case 403:
            return "Gemini access was denied. Please check API permissions.";

        case 404:
            return "The configured AI model is unavailable.";

        case 413:
            return "The uploaded content is too large.";

        case 429:
            return "AI rate limit reached. Please try again shortly.";

        case 500:
        case 502:
        case 503:
        case 504:
            return "The AI service is temporarily unavailable.";

        default:
            return "MechSyntra AI could not complete the request.";
    }
=======
    if (status === 400) {
        return "Gemini rejected the request. Please check the request.";
    }

    if (status === 401) {
        return "Gemini API authentication failed. Check GEMINI_API_KEY.";
    }

    if (status === 403) {
        return "Gemini API access was denied. Check your Google AI project permissions.";
    }

    if (status === 404) {
        return "The configured Gemini model is unavailable.";
    }

    if (status === 413) {
        return "The attached file is too large.";
    }

    if (status === 429) {
        return "Gemini is rate-limited. Please try again shortly.";
    }

    if (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    ) {
        return "Gemini is temporarily unavailable.";
    }

    return "MechSyntra AI could not generate a response.";
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
}

function sendError(
    res,
    req,
    status,
    message
) {

    return res.status(status).json({

        success: false,

        error: message,

        requestId:
            req.requestId
    });
}

/* =========================================================
   RESPONSE CLEANER
========================================================= */

function cleanResponse(
    text
) {

    if (
        typeof text !== "string"
    ) {
        return "";
    }

    return text
        .trim()
        .replace(
            /^```(?:text|markdown|md)?\s*/i,
            ""
        )
        .replace(
            /\s*```$/i,
            ""
        )
        .replace(
            /\n{3,}/g,
            "\n\n"
        )
        .trim();
}

/* =========================================================
<<<<<<< HEAD
   GEMINI
=======
   GEMINI REQUEST
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
========================================================= */

async function generateWithModel(
    model,
    contents
) {
<<<<<<< HEAD

    return ai.models.generateContent({

        model,

        contents,

=======
    return await ai.models.generateContent({
        model,
        contents,
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        config: {

            systemInstruction:
                SYSTEM_INSTRUCTION,

            temperature: 0.7
        }
    });
}

async function generateAI(
    contents
) {

    let response;
    let primaryError;

    try {

        console.log(
            `[AI] Primary: ${PRIMARY_MODEL}`
        );

        response =
            await generateWithModel(
                PRIMARY_MODEL,
                contents
            );

    } catch (error) {

        primaryError =
            error;

        console.error(
            "[AI] Primary failed:",
            error?.message
        );
    }

    if (!response) {

        try {

            console.log(
                `[AI] Fallback: ${FALLBACK_MODEL}`
            );

            response =
                await generateWithModel(
                    FALLBACK_MODEL,
                    contents
                );

        } catch (fallbackError) {

            console.error(
                "[AI] Fallback failed:",
                fallbackError?.message
            );

            throw (
                fallbackError ||
                primaryError
            );
        }
    }

    let text = "";

    try {

        if (
            typeof response.text ===
            "string"
        ) {

            text =
                response.text.trim();
        }

    } catch (error) {

        console.error(
            "[AI] Response parsing failed:",
            error?.message
        );
    }

    text =
        cleanResponse(text);

    if (!text) {

        throw new Error(
            "AI returned an empty response."
        );
    }

    return text;
}

/* =========================================================
   API INFO
========================================================= */

app.get("/", (req, res) => {
<<<<<<< HEAD

    res.json({

        success: true,

        service: APP_NAME,

        version:
            APP_VERSION,

        status:
            "online",

        environment:
            NODE_ENV,

        requestId:
            req.requestId,

        capabilities: {

            chat: true,

            multimodal: true,

            conversationMemory: true,

            assignments: true,

            documents: true,

            presentations: true,

            imageEditing: true

        }
=======
    res.json({
        success: true,
        service: "MechSyntra AI",
        status: "online",
        model: PRIMARY_MODEL,
        multimodal: true,
        documents: true,
        assignment: true
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
    });
});

/* =========================================================
   HEALTH
========================================================= */

<<<<<<< HEAD
app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            success: true,

            status: "healthy",

            service:
                APP_NAME,

            version:
                APP_VERSION,

            uptime:
                Math.floor(
                    process.uptime()
                ),

            timestamp:
                new Date().toISOString(),

            requestId:
                req.requestId
        });
    }
);
=======
app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        model: PRIMARY_MODEL,
        multimodal: true,
        documents: true,
        assignment: true
    });
});
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

/* =========================================================
   READINESS
========================================================= */

app.get(
    "/ready",
    (req, res) => {

        const ready =
            Boolean(
                GEMINI_API_KEY
            );

        return res
            .status(
                ready ? 200 : 503
            )
            .json({

                success:
                    ready,

                status:
                    ready
                        ? "ready"
                        : "not_ready",

                aiConfigured:
                    ready,

                requestId:
                    req.requestId
            });
    }
);

/* =========================================================
   CHAT HANDLER
========================================================= */

async function chatHandler(
    req,
    res
) {

    try {

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        const history =
            Array.isArray(
                req.body?.history
            )
                ? req.body.history
                : Array.isArray(
                    req.body?.messages
                )
                    ? req.body.messages
                    : [];

        if (
            message.length >
            MAX_MESSAGE_LENGTH
        ) {

            return sendError(
                res,
                req,
                413,
                "Message is too long."
            );
        }

        const media =
            getMediaFromBody(
                req.body
            );

        if (
            !message &&
            !media
        ) {

            return sendError(
                res,
                req,
                400,
                "Message or media is required."
            );
        }

        const contents =
            buildConversationContents(
                message,
                history,
                media
            );

        const answer =
            await generateAI(
                contents
            );

        return res.status(200).json({

            success: true,

            reply:
                answer,

            requestId:
                req.requestId,

            conversationMemory:
                true,

            historyUsed:
                normalizeHistory(
                    history
                ).length
        });

    } catch (error) {

        console.error(
            "[CHAT ERROR]",
            error
        );

        const status =
            getErrorStatus(error);

        return sendError(
            res,
            req,
            status >= 400 &&
            status < 600
                ? status
                : 500,
            getFriendlyError(
                error
            )
        );
    }
}

/* =========================================================
   CHAT ROUTES
========================================================= */

app.post(
    "/chat",
    chatHandler
);

app.post(
    "/api/v1/chat",
    chatHandler
);

/* =========================================================
   PRESENTATION GENERATOR
========================================================= */

async function presentationHandler(
    req,
    res
) {

    try {

        const topic =
            typeof req.body?.topic === "string"
                ? req.body.topic.trim()
                : "";

        const language =
            typeof req.body?.language === "string"
                ? req.body.language.trim()
                : "English";

        const slides =
            Math.min(
                Math.max(
                    Number(
                        req.body?.slides
                    ) || 10,
                    3
                ),
                40
            );

        if (!topic) {

            return sendError(
                res,
                req,
                400,
                "Presentation topic is required."
            );
        }

        const prompt = `
Create a professional presentation.

Topic:
${topic}

Language:
${language}

Number of slides:
${slides}

Return presentation-ready content.

Structure:

TITLE:
[Title]

SLIDE 1:
Title:
Content:
Speaker Notes:

SLIDE 2:
Title:
Content:
Speaker Notes:

Continue until ${slides} slides.

Include relevant:
- Introduction
- Main concepts
- Examples
- Applications
- Important points
- Conclusion

Do not ask for the topic again.
`;

        const contents =
            buildConversationContents(
                prompt
            );

        const content =
            await generateAI(
                contents
            );

        return res.status(200).json({

            success: true,

            type:
                "presentation",

            topic,

            language,

            slides,

            content,

            requestId:
                req.requestId
        });

    } catch (error) {

        console.error(
            "[PRESENTATION ERROR]",
            error
        );

        return sendError(
            res,
            req,
            500,
            getFriendlyError(
                error
            )
        );
    }
}

app.post(
    "/generate-presentation",
    presentationHandler
);

app.post(
    "/api/v1/generate-presentation",
    presentationHandler
);

/* =========================================================
   DOCUMENT GENERATOR
========================================================= */

let documentGenerator = null;

try {

    documentGenerator =
        require(
            "./features/documentGenerator"
        );

    console.log(
        "[SYSTEM] Document generator loaded."
    );

} catch (error) {

    console.warn(
        "[SYSTEM] Document generator unavailable:",
        error?.message
    );
}

/* =========================================================
   DOCUMENT ROUTE
========================================================= */

app.post(
    [
        "/generate-document",
        "/api/v1/generate-document"
    ],
    async (req, res) => {

        try {

<<<<<<< HEAD
            if (!documentGenerator) {

                return sendError(
                    res,
                    req,
                    500,
                    "Document generator module is unavailable."
                );
            }

            const {
                title,
                content,
                format = "both",
                fileName
            } = req.body || {};

            if (
                typeof content !== "string" ||
                !content.trim()
            ) {

                return sendError(
                    res,
                    req,
                    400,
                    "Document content is required."
                );
            }

            if (
                ![
                    "word",
                    "pdf",
                    "both"
                ].includes(format)
            ) {

                return sendError(
                    res,
                    req,
                    400,
                    "Format must be word, pdf or both."
                );
            }

            const cleanTitle =
                typeof title === "string" &&
                title.trim()
                    ? title.trim()
                    : "MechSyntra Document";

            const files = [];

            if (
                format === "word" ||
                format === "both"
            ) {

                const word =
                    await documentGenerator
                        .createWordDocument({

                            title:
                                cleanTitle,

                            content,

                            fileName
                        });

                files.push({

                    type: "word",

                    fileName:
                        word.fileName,

                    url:
                        `/generated/${word.fileName}`,

                    mimeType:
                        word.mimeType
                });
            }

            if (
                format === "pdf" ||
                format === "both"
            ) {

                const pdf =
                    await documentGenerator
                        .createPdfDocument({

                            title:
                                cleanTitle,

                            content,

                            fileName
                        });

                files.push({

                    type: "pdf",

                    fileName:
                        pdf.fileName,

                    url:
                        `/generated/${pdf.fileName}`,

                    mimeType:
                        pdf.mimeType
                });
            }

            return res.status(200).json({

                success: true,

                message:
                    "Document generated successfully.",

                files,

                requestId:
                    req.requestId
            });

        } catch (error) {

            console.error(
                "[DOCUMENT ERROR]",
                error
            );

            return sendError(
                res,
                req,
                500,
                error?.message ||
                "Could not generate the document."
            );
        }
    }
);

/* =========================================================
   ASSIGNMENT
========================================================= */

app.post(
    [
        "/generate-assignment",
        "/api/v1/generate-assignment"
    ],
    async (req, res) => {

        try {

=======
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            const {
                topic,
                language = "English",
                pages = 5,
                format = "both",
                fileName
            } = req.body || {};

            if (
                typeof topic !== "string" ||
                !topic.trim()
            ) {

                return sendError(
                    res,
                    req,
                    400,
                    "Assignment topic is required."
                );
            }

            const requestedPages =
                Math.min(
                    Math.max(
                        Number(pages) || 5,
                        1
                    ),
                    50
                );

<<<<<<< HEAD
=======
            const requestedFormat =
                String(format || "both")
                    .toLowerCase()
                    .trim();

            if (
                !["word", "pdf", "both"]
                    .includes(requestedFormat)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Format must be word, pdf or both."
                });
            }

>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            const prompt = `
Create a complete academic assignment.

Topic:
${topic.trim()}

Language:
<<<<<<< HEAD
${language}
=======
${requestedLanguage}
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

Target length:
Approximately ${requestedPages} pages.

<<<<<<< HEAD
Include:

- Title
- Introduction
- Relevant sections
- Detailed explanations
- Examples where useful
- Conclusion
- References only when reliable

Never invent citations or sources.

Return assignment content only.
`;

            const content =
                await generateAI(
                    buildConversationContents(
                        prompt
                    )
=======
Requirements:
- Write entirely in the requested language.
- If Roman Urdu is requested, use Roman Urdu.
- Include a clear title.
- Include Introduction.
- Include relevant sections and subtopics.
- Explain the topic properly.
- Include examples where useful.
- Include Conclusion.
- Include References only if reliable references can be provided.
- Never invent citations or references.
- Do not mention that you are an AI.
- Return only the assignment content.
`;

            const contents = [
                {
                    role: "user",
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ];

            let response = null;
            let lastError = null;

            try {
                console.log(
                    "Assignment primary:",
                    PRIMARY_MODEL
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
                );

            if (!documentGenerator) {

<<<<<<< HEAD
                return sendError(
                    res,
                    req,
                    500,
                    "Document generator module is unavailable."
                );
            }

            const files = [];
=======
            } catch (error) {

                lastError = error;

                console.error(
                    "Assignment primary error:",
                    error?.message
                );
            }

            if (!response) {

                try {

                    console.log(
                        "Assignment fallback:",
                        FALLBACK_MODEL
                    );

                    response =
                        await generateWithModel(
                            FALLBACK_MODEL,
                            contents
                        );

                } catch (error) {

                    lastError = error;

                    console.error(
                        "Assignment fallback error:",
                        error?.message
                    );
                }
            }

            if (!response) {
                return res.status(502).json({
                    success: false,
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

            let assignmentContent = "";

            try {
                assignmentContent =
                    typeof response.text === "string"
                        ? response.text.trim()
                        : "";
            } catch (error) {
                console.error(
                    "Assignment text extraction error:",
                    error?.message
                );
            }

            assignmentContent =
                cleanResponse(
                    assignmentContent
                );

            if (!assignmentContent) {
                return res.status(502).json({
                    success: false,
                    error:
                        "Gemini returned empty assignment content."
                });
            }
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

            const cleanTitle =
                topic.trim().slice(0, 120);

<<<<<<< HEAD
=======
            const generatedFiles = [];

            /* WORD */

>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            if (
                requestedFormat === "word" ||
                requestedFormat === "both"
            ) {
<<<<<<< HEAD
=======

                console.log(
                    "Creating Word document..."
                );

                const word =
                    await createWordDocument({
                        title:
                            cleanTitle,
                        content:
                            assignmentContent,
                        fileName:
                            fileName ||
                            cleanTitle
                    });
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

                const word =
                    await documentGenerator
                        .createWordDocument({

                            title:
                                cleanTitle,

                            content,

                            fileName:
                                fileName ||
                                cleanTitle
                        });

                files.push({

                    type: "word",

                    fileName:
                        word.fileName,

                    url:
                        `/generated/${word.fileName}`,

                    mimeType:
                        word.mimeType
                });

                console.log(
                    "Word created:",
                    word.filePath
                );
            }

            /* PDF */

            if (
                requestedFormat === "pdf" ||
                requestedFormat === "both"
            ) {
<<<<<<< HEAD
=======

                console.log(
                    "Creating PDF document..."
                );

                const pdf =
                    await createPdfDocument({
                        title:
                            cleanTitle,
                        content:
                            assignmentContent,
                        fileName:
                            fileName ||
                            cleanTitle
                    });
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

                const pdf =
                    await documentGenerator
                        .createPdfDocument({

                            title:
                                cleanTitle,

                            content,

                            fileName:
                                fileName ||
                                cleanTitle
                        });

                files.push({

                    type: "pdf",

                    fileName:
                        pdf.fileName,

                    url:
                        `/generated/${pdf.fileName}`,

                    mimeType:
                        pdf.mimeType
                });

<<<<<<< HEAD
=======
                console.log(
                    "PDF created:",
                    pdf.filePath
                );
            }

>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            return res.status(200).json({

                success: true,

                message:
                    "Assignment generated successfully.",

                title:
                    cleanTitle,

                language,

<<<<<<< HEAD
=======
            console.error("");
            console.error(
                "========================================"
            );
            console.error(
                "GENERATE ASSIGNMENT ERROR"
            );
            console.error(
                error
            );
            console.error(
                "========================================"
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Could not generate the assignment."
            });
        }
    }
);

/* =========================================================
   GENERATE DOCUMENT
========================================================= */

app.post(
    "/generate-document",
    async (req, res) => {

        try {

            const {
                title,
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
                content,

                files,

<<<<<<< HEAD
                requestId:
                    req.requestId
=======
            const requestedFormat =
                String(format || "both")
                    .toLowerCase()
                    .trim();

            if (
                !["word", "pdf", "both"]
                    .includes(requestedFormat)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Format must be word, pdf or both."
                });
            }

            const cleanTitle =
                typeof title === "string" &&
                title.trim()
                    ? title.trim()
                    : "MechSyntra Assignment";

            const results = [];

            /* WORD */

            if (
                requestedFormat === "word" ||
                requestedFormat === "both"
            ) {

                console.log(
                    "Creating Word document..."
                );

                const word =
                    await createWordDocument({
                        title:
                            cleanTitle,
                        content:
                            content,
                        fileName:
                            fileName ||
                            cleanTitle
                    });

                results.push({
                    type: "word",
                    fileName:
                        word.fileName,
                    url:
                        `/generated/${word.fileName}`,
                    mimeType:
                        word.mimeType
                });

                console.log(
                    "Word created:",
                    word.filePath
                );
            }

            /* PDF */

            if (
                requestedFormat === "pdf" ||
                requestedFormat === "both"
            ) {

                console.log(
                    "Creating PDF document..."
                );

                const pdf =
                    await createPdfDocument({
                        title:
                            cleanTitle,
                        content:
                            content,
                        fileName:
                            fileName ||
                            cleanTitle
                    });

                results.push({
                    type: "pdf",
                    fileName:
                        pdf.fileName,
                    url:
                        `/generated/${pdf.fileName}`,
                    mimeType:
                        pdf.mimeType
                });

                console.log(
                    "PDF created:",
                    pdf.filePath
                );
            }

            return res.status(200).json({
                success: true,
                message:
                    "Document generated successfully.",
                files:
                    results
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            });

        } catch (error) {

            console.error(
<<<<<<< HEAD
                "[ASSIGNMENT ERROR]",
                error
            );

            return sendError(
                res,
                req,
                500,
                error?.message ||
                "Could not generate the assignment."
            );
=======
                "DOCUMENT GENERATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Could not generate the requested document."
            });
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        }
    }
);

/* =========================================================
   IMAGE EDITING
========================================================= */

app.post(
    [
        "/edit-image",
        "/api/v1/edit-image"
    ],
    async (req, res) => {

        try {

<<<<<<< HEAD
            const prompt =
                typeof req.body?.prompt === "string"
                    ? req.body.prompt.trim()
                    : "";

            const media =
                getMediaFromBody(
                    req.body
                );

            if (!prompt) {

                return sendError(
                    res,
                    req,
                    400,
                    "Image editing instruction is required."
                );
            }

            if (!media) {

                return sendError(
                    res,
                    req,
                    400,
                    "An image is required."
                );
=======
            const message =
                typeof req.body?.message === "string"
                    ? req.body.message.trim()
                    : "";

            const mediaBase64 =
                typeof req.body?.mediaBase64 === "string"
                    ? req.body.mediaBase64
                    : "";

            if (
                message.length > 20000
            ) {
                return res.status(413).json({
                    success: false,
                    error:
                        "Message is too long."
                });
            }

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

            let parts;

            try {
                parts =
                    buildUserParts(
                        req.body
                    );
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error:
                        error.message
                });
            }

            const contents = [
                {
                    role: "user",
                    parts
                }
            ];

            let response = null;
            let lastError = null;

            try {

                response =
                    await generateWithModel(
                        PRIMARY_MODEL,
                        contents
                    );

            } catch (error) {

                lastError = error;

                console.error(
                    "Chat primary error:",
                    error?.message
                );
            }

            if (!response) {

                try {

                    response =
                        await generateWithModel(
                            FALLBACK_MODEL,
                            contents
                        );

                } catch (error) {

                    lastError = error;

                    console.error(
                        "Chat fallback error:",
                        error?.message
                    );
                }
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
            }

            if (
                !media.mimeType.startsWith(
                    "image/"
                )
            ) {

                return sendError(
                    res,
                    req,
                    400,
                    "Only image files can be edited."
                );
            }

            const response =
                await ai.models.generateContent({

                    model:
                        IMAGE_MODEL,

                    contents: [
                        {
                            role: "user",

                            parts: [

                                {
                                    text:
                                        prompt
                                },

                                createInlineDataPart(
                                    media.mimeType,
                                    media.base64
                                )
                            ]
                        }
                    ]
                });

<<<<<<< HEAD
            const parts =
                response
                    ?.candidates?.[0]
                    ?.content?.parts || [];

            let imagePart = null;
            let responseText = "";

            for (
                const part of parts
            ) {

                if (
                    part?.inlineData?.data
                ) {

                    imagePart =
                        part.inlineData;
                }

                if (
                    typeof part?.text ===
                    "string"
                ) {

                    responseText +=
                        part.text;
                }
            }

            if (!imagePart) {

                return sendError(
                    res,
                    req,
                    502,
                    responseText.trim() ||
                    "The AI model did not return an edited image."
                );
            }
=======
            let answer =
                typeof response.text === "string"
                    ? response.text.trim()
                    : "";
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)

            const extension =
                imagePart.mimeType ===
                "image/png"
                    ? "png"
                    : "jpg";

            const fileName =
                `mechsyntra-edit-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;

            const outputPath =
                path.join(
                    GENERATED_DIR,
                    fileName
                );

            fs.writeFileSync(
                outputPath,
                Buffer.from(
                    imagePart.data,
                    "base64"
                )
            );

            return res.status(200).json({

                success: true,

                type:
                    "image",

                fileName,

                url:
                    `/generated/${fileName}`,

                mimeType:
                    imagePart.mimeType,

                message:
                    "Image edited successfully.",

                requestId:
                    req.requestId
            });

        } catch (error) {

            console.error(
<<<<<<< HEAD
                "[IMAGE ERROR]",
                error
            );

            return sendError(
                res,
                req,
                500,
                getFriendlyError(
                    error
                )
            );
=======
                "CHAT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "MechSyntra AI server could not process the request."
            });
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
        }
    }
);

/* =========================================================
<<<<<<< HEAD
   404
=======
   METHOD NOT ALLOWED
========================================================= */

app.use(
    "/chat",
    (req, res) => {

        return res.status(405).json({
            success: false,
            error:
                "Use POST /chat for AI messages."
        });
    }
);

/* =========================================================
   UNKNOWN ROUTE
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
========================================================= */

app.use(
    (req, res) => {

        return res.status(404).json({

            success: false,

            error:
                "API endpoint not found.",

            path:
                req.originalUrl,

            requestId:
                req.requestId
        });
    }
);

/* =========================================================
<<<<<<< HEAD
   GLOBAL ERROR HANDLER
=======
   START SERVER
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
========================================================= */

app.use(
    (error, req, res, next) => {

        console.error(
            "[GLOBAL ERROR]",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        return res.status(500).json({

            success: false,

            error:
                NODE_ENV === "production"
                    ? "Internal server error."
                    : error?.message ||
                      "Internal server error.",

            requestId:
                req.requestId
        });
    }
);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

const server =
    app.listen(
        PORT,
        HOST,
        () => {

            console.log("");
            console.log(
                "╔══════════════════════════════════════════════╗"
            );
            console.log(
                "║              MECHSYNTRA AI                  ║"
            );
            console.log(
                "║        NEXT-GENERATION BACKEND              ║"
            );
            console.log(
                "╚══════════════════════════════════════════════╝"
            );

            console.log(
                `Environment : ${NODE_ENV}`
            );

            console.log(
                `Version     : ${APP_VERSION}`
            );

            console.log(
                `Server      : http://localhost:${PORT}`
            );

            console.log(
                `Health      : http://localhost:${PORT}/health`
            );

            console.log(
                `Ready       : http://localhost:${PORT}/ready`
            );

            console.log(
                `Chat        : /api/v1/chat`
            );

            console.log(
                `Assignment  : /api/v1/generate-assignment`
            );

            console.log(
                `Documents   : /api/v1/generate-document`
            );

            console.log(
                `Presentation: /api/v1/generate-presentation`
            );

            console.log(
                `Image Edit  : /api/v1/edit-image`
            );

            console.log(
                `Primary AI  : ${PRIMARY_MODEL}`
            );

            console.log(
                `Fallback AI : ${FALLBACK_MODEL}`
            );

            console.log(
                `Image AI    : ${IMAGE_MODEL}`
            );

            console.log(
                "Status      : ONLINE"
            );

            console.log(
                "══════════════════════════════════════════════"
            );
            console.log("");
        }
    );

/* =========================================================
   PROCESS SAFETY
========================================================= */

process.on(
    "SIGTERM",
    () => {

        console.log(
            "[SYSTEM] SIGTERM received. Shutting down..."
        );
<<<<<<< HEAD

        server.close(() => {

            console.log(
                "[SYSTEM] Server closed."
            );

            process.exit(0);
        });
=======
        console.log(
            "          MECHSYNTRA AI BACKEND"
        );
        console.log(
            "========================================"
        );

        console.log(
            `Local      : http://localhost:${PORT}`
        );

        console.log(
            `Health     : http://localhost:${PORT}/health`
        );

        console.log(
            `Chat       : http://localhost:${PORT}/chat`
        );

        console.log(
            `Documents  : http://localhost:${PORT}/generate-document`
        );

        console.log(
            `Assignment : http://localhost:${PORT}/generate-assignment`
        );

        console.log(
            `Primary    : ${PRIMARY_MODEL}`
        );

        console.log(
            `Backup     : ${FALLBACK_MODEL}`
        );

        console.log(
            "Media      : IMAGE / AUDIO / PDF / TEXT"
        );

        console.log(
            "Documents  : WORD / PDF"
        );

        console.log(
            "Status     : ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log("");
>>>>>>> 0ebed39 (feat(platform): establish production-grade MechSyntra AI infrastructure)
    }
);

process.on(
    "SIGINT",
    () => {

        console.log(
            "[SYSTEM] SIGINT received. Shutting down..."
        );

        server.close(() => {

            console.log(
                "[SYSTEM] Server closed."
            );

            process.exit(0);
        });
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "[FATAL] Unhandled promise rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "[FATAL] Uncaught exception:",
            error
        );

        process.exit(1);
    }
);
