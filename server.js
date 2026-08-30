const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const {
    createWordDocument,
    createPdfDocument
} = require("./features/documentGenerator");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

const MAX_BODY_SIZE = "18mb";
const MAX_MEDIA_BASE64_LENGTH = 14 * 1024 * 1024;

/* =========================================================
   ENVIRONMENT
========================================================= */

if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing.");
    process.exit(1);
}

/* =========================================================
   GEMINI
========================================================= */

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

/* =========================================================
   EXPRESS MIDDLEWARE
========================================================= */

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept"]
    })
);

app.use(
    express.json({
        limit: MAX_BODY_SIZE
    })
);

/* =========================================================
   GENERATED FILES
========================================================= */

app.use(
    "/generated",
    express.static(
        path.join(__dirname, "generated")
    )
);

/* =========================================================
   SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI.

Founder:
Usman Choudhary

You are a professional general-purpose AI assistant.

LANGUAGE RULE:
- Detect the language used by the user.
- Normally reply in the same language as the user.
- If the user explicitly requests a language, always use that language.
- Support English, Urdu, Roman Urdu and other languages supported by the model.
- If the user says "Roman Urdu mein batao", reply in Roman Urdu.
- If the user says "Urdu mein batao", reply in Urdu.
- If the user says "English mein batao", reply in English.
- Do not automatically switch to English when the user is using Roman Urdu.

GENERAL:
- Give accurate, useful and natural answers.
- Do not invent facts.
- Do not claim an action was performed if it was not performed.
- Keep simple questions concise.
- Give detailed answers when required.

MEDIA:
- Inspect supplied images, PDFs and audio when supported.
- Never claim a file was inspected if no file was supplied.
- If media is unclear or unreadable, say so.
- Never invent information from attachments.

MATHEMATICS:
- Calculate carefully.
- Verify arithmetic.
- Show useful steps when appropriate.
- Use readable plain-text formulas.

CODING:
- Provide practical and correct code.

ENGINEERING:
- Clearly separate observations from recommendations.
- For safety-critical matters, recommend professional verification.

ASSIGNMENTS:
- When the user asks for an assignment, create a complete academic assignment.
- Include a suitable title.
- Include Introduction.
- Include relevant sections and subtopics.
- Include examples where useful.
- Include Conclusion.
- Include References only when reliable references are available.
- Do not fabricate references, studies, statistics or citations.
- Match the requested language.
- Match the requested educational level when provided.

DOCUMENTS:
- If the user asks for an assignment, report, notes or other content as Word/DOCX/PDF, generate complete structured content.
- The backend can convert assignment content into Word and PDF files.

RESPONSE:
- Use readable normal text.
- Do not use unnecessary Markdown.
- Do not use Markdown headings with #.
- Do not return JSON as the normal AI answer.
`;

/* =========================================================
   HELPERS
========================================================= */

function normalizeMimeType(value) {
    if (typeof value !== "string") {
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

    if (mimeType.startsWith("image/")) {
        return true;
    }

    if (mimeType.startsWith("audio/")) {
        return true;
    }

    if (mimeType === "application/pdf") {
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
        clean.length === 0 ||
        clean.length > MAX_MEDIA_BASE64_LENGTH
    ) {
        return false;
    }

    return /^[A-Za-z0-9+/=\s]+$/.test(clean);
}

function createInlineDataPart(
    mimeType,
    base64Data
) {
    return {
        inlineData: {
            mimeType: mimeType,
            data: stripDataUrlPrefix(base64Data)
        }
    };
}

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

    const mimeType = normalizeMimeType(
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
            text: message
        });
    }

    if (mediaBase64) {
        if (!mimeType) {
            throw new Error(
                "MIME type is required when a file or image is attached."
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

    if (parts.length === 0) {
        throw new Error(
            "Message or media is required."
        );
    }

    return parts;
}

function getErrorStatus(error) {
    const possibleStatus =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const numericStatus = Number(possibleStatus);

    return Number.isFinite(numericStatus)
        ? numericStatus
        : 500;
}

function getFriendlyError(error) {
    const status = getErrorStatus(error);

    console.error(
        "Gemini status:",
        status
    );

    console.error(
        "Gemini message:",
        error?.message || ""
    );

    if (status === 400) {
        return "Gemini rejected the request. Please check the message, file type or media format.";
    }

    if (status === 401) {
        return "Gemini API authentication failed. Please check the API key.";
    }

    if (status === 403) {
        return "Gemini API access was denied. Please check project permissions.";
    }

    if (status === 404) {
        return "The configured Gemini model is unavailable for this project.";
    }

    if (status === 413) {
        return "The attached file is too large. Please use a smaller file.";
    }

    if (status === 429) {
        return "Gemini is temporarily rate-limited. Please try again shortly.";
    }

    if (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    ) {
        return "Gemini is temporarily unavailable. Please try again shortly.";
    }

    return "MechSyntra AI could not generate a response right now.";
}

function cleanResponse(text) {
    if (typeof text !== "string") {
        return "";
    }

    let result = text.trim();

    result = result.replace(
        /^```(?:text|markdown|md)?\s*/i,
        ""
    );

    result = result.replace(
        /\s*```$/i,
        ""
    );

    result = result.replace(
        /^#{1,6}\s*/gm,
        ""
    );

    result = result.replace(
        /\*\*(.*?)\*\*/gs,
        "$1"
    );

    result = result.replace(
        /__(.*?)__/gs,
        "$1"
    );

    result = result.replace(
        /`([^`]+)`/g,
        "$1"
    );

    result = result.replace(
        /`/g,
        ""
    );

    result = result.replace(
        /^\s*[-*_]{3,}\s*$/gm,
        ""
    );

    result = result.replace(
        /\n{3,}/g,
        "\n\n"
    );

    return result.trim();
}

async function generateWithModel(
    model,
    contents
) {
    return await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
            systemInstruction:
                SYSTEM_INSTRUCTION
        }
    });
}

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        service: "MechSyntra AI",
        status: "online",
        model: PRIMARY_MODEL,
        multimodal: true,
        documents: true
    });
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {
    return res.status(200).json({
        success: true,
        status: "healthy",
        model: PRIMARY_MODEL,
        multimodal: true,
        documents: true
    });
});

/* =========================================================
   GENERATE ASSIGNMENT
========================================================= */

app.post(
    "/generate-assignment",
    async (req, res) => {

        try {
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
                return res.status(400).json({
                    success: false,
                    error:
                        "Assignment topic is required."
                });
            }

            const requestedLanguage =
                typeof language === "string" &&
                language.trim()
                    ? language.trim()
                    : "English";

            const requestedPages =
                Math.min(
                    Math.max(
                        Number(pages) || 5,
                        1
                    ),
                    50
                );

            const assignmentPrompt = `
Create a complete academic assignment.

Topic:
${topic.trim()}

Required language:
${requestedLanguage}

Target length:
Approximately ${requestedPages} pages.

Requirements:
- Write entirely in the requested language.
- If the requested language is Roman Urdu, write Urdu using English/Roman letters.
- Do not switch language unnecessarily.
- Include a clear title.
- Include Introduction.
- Include relevant sections and subtopics.
- Explain the topic properly and academically.
- Include examples where useful.
- Include Conclusion.
- Include References only if reliable references can be provided.
- Never invent citations, statistics, studies or references.
- Do not mention that you are an AI.
- Return only the assignment content.
`;

            const contents = [
                {
                    role: "user",
                    parts: [
                        {
                            text:
                                assignmentPrompt
                        }
                    ]
                }
            ];

            let response = null;
            let lastError = null;

            try {
                console.log(
                    "Generating assignment with:",
                    PRIMARY_MODEL
                );

                response =
                    await generateWithModel(
                        PRIMARY_MODEL,
                        contents
                    );

            } catch (error) {
                lastError = error;

                console.error(
                    "Assignment primary error:",
                    getErrorStatus(error),
                    error?.message
                );
            }

            if (!response) {
                try {
                    console.log(
                        "Trying assignment fallback:",
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
                        getErrorStatus(error),
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
                if (
                    typeof response.text ===
                    "string"
                ) {
                    assignmentContent =
                        response.text.trim();
                }
            } catch (error) {
                console.error(
                    "Assignment extraction error:",
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

            const cleanTitle =
                topic
                    .trim()
                    .slice(0, 120);

            const generatedFiles = [];

            if (
                format === "word" ||
                format === "both"
            ) {
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

                generatedFiles.push({
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
                    await createPdfDocument({
                        title:
                            cleanTitle,
                        content:
                            assignmentContent,
                        fileName:
                            fileName ||
                            cleanTitle
                    });

                generatedFiles.push({
                    type: "pdf",
                    fileName:
                        pdf.fileName,
                    url:
                        `/generated/${pdf.fileName}`,
                    mimeType:
                        pdf.mimeType
                });
            }

            if (
                generatedFiles.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Format must be word, pdf or both."
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Assignment generated successfully.",
                title:
                    cleanTitle,
                language:
                    requestedLanguage,
                files:
                    generatedFiles,
                reply:
                    "Your assignment has been generated successfully."
            });

        } catch (error) {

            console.error(
                "Generate assignment error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
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
                content,
                format = "both",
                fileName
            } = req.body || {};

            if (
                typeof content !== "string" ||
                !content.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Document content is required."
                });
            }

            const cleanTitle =
                typeof title === "string" &&
                title.trim()
                    ? title.trim()
                    : "MechSyntra Assignment";

            const results = [];

            if (
                format === "word" ||
                format === "both"
            ) {
                const word =
                    await createWordDocument({
                        title:
                            cleanTitle,
                        content:
                            content,
                        fileName:
                            fileName
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
            }

            if (
                format === "pdf" ||
                format === "both"
            ) {
                const pdf =
                    await createPdfDocument({
                        title:
                            cleanTitle,
                        content:
                            content,
                        fileName:
                            fileName
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
            }

            if (results.length === 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Format must be word, pdf or both."
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Document generated successfully.",
                files:
                    results
            });

        } catch (error) {

            console.error(
                "Document generation error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Could not generate the requested document."
            });
        }
    }
);

/* =========================================================
   CHAT
========================================================= */

app.post(
    "/chat",
    async (req, res) => {

        try {
            const message =
                typeof req.body?.message === "string"
                    ? req.body.message.trim()
                    : "";

            if (message.length > 20000) {
                return res.status(413).json({
                    success: false,
                    error:
                        "Message is too long."
                });
            }

            const mediaBase64 =
                typeof req.body?.mediaBase64 === "string"
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
                        role: "user",
                        parts: parts
                    }
                ];

            } catch (inputError) {

                return res.status(400).json({
                    success: false,
                    error:
                        inputError.message
                });
            }

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
                    "Primary error:",
                    getErrorStatus(error),
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
                        "Fallback error:",
                        getErrorStatus(error),
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

            let answer = "";

            try {
                if (
                    typeof response.text ===
                    "string"
                ) {
                    answer =
                        response.text.trim();
                }
            } catch (error) {
                console.error(
                    "Response extraction error:",
                    error?.message
                );
            }

            answer =
                cleanResponse(
                    answer
                );

            if (!answer) {
                return res.status(502).json({
                    success: false,
                    error:
                        "Gemini returned an empty response."
                });
            }

            return res.status(200).json({
                success: true,
                reply:
                    answer
            });

        } catch (error) {

            console.error(
                "Unhandled /chat error:",
                error
            );

            return res.status(500).json({
                success: false,
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
            success: false,
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
            success: false,
            error:
                "Endpoint not found."
        });
    }
);

/* =========================================================
   SERVER
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
            `Docs   : http://localhost:${PORT}/generate-document`
        );
        console.log(
            `Assignment : http://localhost:${PORT}/generate-assignment`
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
            "Documents : WORD / PDF"
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