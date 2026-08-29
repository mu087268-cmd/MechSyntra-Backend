const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   MECHSYNTRA AI - PRODUCTION BACKEND
========================================================= */

const PORT =
    process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

/*
   Models can be changed from Vercel Environment Variables:

   GEMINI_TEXT_MODEL
   GEMINI_IMAGE_MODEL
*/

const TEXT_MODEL =
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-3.6-flash";

const IMAGE_MODEL =
    process.env.GEMINI_IMAGE_MODEL ||
    "gemini-3.1-flash-image";

/*
   Base64 uploads increase request size.
   Keep media reasonably small for fast mobile requests.
*/

const JSON_LIMIT =
    process.env.JSON_LIMIT ||
    "16mb";

const MAX_MEDIA_BYTES =
    6 * 1024 * 1024;

const MAX_MESSAGE_CHARS =
    20000;

const MAX_RETRIES =
    2;

const RETRY_DELAYS_MS =
    [350, 900];

/* =========================================================
   API CLIENT
========================================================= */

const ai =
    GEMINI_API_KEY
        ? new GoogleGenAI({
            apiKey:
                GEMINI_API_KEY
        })
        : null;

if (!GEMINI_API_KEY) {
    console.error(
        "[MechSyntra] GEMINI_API_KEY is missing."
    );
}

/* =========================================================
   EXPRESS CONFIG
========================================================= */

app.disable(
    "x-powered-by"
);

app.use(
    cors({
        origin: true,
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
            JSON_LIMIT
    })
);

/* =========================================================
   SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI.

Founder:
Usman Choudhary

You are a professional general-purpose AI assistant.

SUPPORTED:
- General questions
- Mathematics
- Science
- Technology
- Android development
- Programming
- Coding
- Business
- Education
- Writing
- Translation
- Engineering
- Image understanding
- PDF/document understanding
- Audio understanding
- Project management

GENERAL RULES:
- Answer naturally and professionally.
- Be accurate.
- Do not invent facts.
- Do not claim an action was performed when it was not.
- Use concise answers for simple questions.
- Give more detail when needed.
- Use readable plain text.
- Do not use unnecessary Markdown headings.
- Do not use raw LaTeX.

MEDIA:
- Inspect actual attached media when supplied.
- If an image is attached, analyze what is actually visible.
- If a PDF/document is attached, inspect its actual content.
- If audio is attached, use the supplied audio.
- Never pretend to have read or seen a missing attachment.

IMAGE EDITING:
- When the user asks to edit an image, edit the image instead of merely describing it.
- Preserve the original person's identity and face unless explicitly asked to change it.
- Preserve facial proportions, expression and recognizable features.
- Preserve skin tone and natural appearance.
- Modify only what the user requested.
- Preserve original perspective and composition where possible.
- Match inserted objects to the original lighting, shadows, scale and perspective.
- For enhancement, improve clarity, sharpness, lighting and detail without unnecessarily changing identity.
- Do not add unrelated objects or effects.
- Make edits look professional and naturally photographed.

FILE EDITING:
- Read supported files when supplied.
- For text-based files, preserve syntax and structure unless instructed otherwise.
- When asked to edit a text file, return the complete revised file.
- Do not invent missing information.
- Do not claim binary files were physically edited unless they were actually generated.

ENGINEERING:
- Distinguish known facts from recommendations.
- Do not invent technical specifications.
- For safety-critical decisions, recommend professional verification.
`;

/* =========================================================
   ERROR / STATUS HELPERS
========================================================= */

function getStatus(error) {
    const value =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const numeric =
        Number(value);

    return Number.isFinite(
        numeric
    )
        ? numeric
        : 500;
}

function isRetryable(status) {
    return (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
}

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

function friendlyError(error) {
    const status =
        getStatus(error);

    console.error(
        "[MechSyntra] status:",
        status
    );

    console.error(
        "[MechSyntra] error:",
        error?.message || error
    );

    if (
        status === 400
    ) {
        return (
            "Gemini rejected the request. Please check the message or attached media."
        );
    }

    if (
        status === 401
    ) {
        return (
            "Gemini API authentication failed. Check GEMINI_API_KEY."
        );
    }

    if (
        status === 403
    ) {
        return (
            "Gemini API access was denied. Check API permissions, billing and quota."
        );
    }

    if (
        status === 404
    ) {
        return (
            "The configured Gemini model is unavailable. Check the model configuration."
        );
    }

    if (
        status === 408
    ) {
        return (
            "The AI request timed out. Please try again."
        );
    }

    if (
        status === 413
    ) {
        return (
            "The attached file is too large. Please choose a smaller file."
        );
    }

    if (
        status === 429
    ) {
        return (
            "Gemini is temporarily rate-limited or the project quota is exhausted. Please try again shortly."
        );
    }

    if (
        status >= 500
    ) {
        return (
            "Gemini is temporarily unavailable. Please try again shortly."
        );
    }

    return (
        error?.message ||
        "MechSyntra AI could not process the request."
    );
}

/* =========================================================
   TEXT CLEANER
========================================================= */

function cleanResponse(
    text
) {
    if (
        typeof text !==
        "string"
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
            /^#{1,6}\s*/gm,
            ""
        )
        .replace(
            /\*\*(.*?)\*\*/gs,
            "$1"
        )
        .replace(
            /__(.*?)__/gs,
            "$1"
        )
        .replace(
            /\\cdot/g,
            " × "
        )
        .replace(
            /\\times/g,
            " × "
        )
        .replace(
            /\\div/g,
            " ÷ "
        )
        .replace(
            /\\approx/g,
            " ≈ "
        )
        .replace(
            /\\rightarrow/g,
            " → "
        )
        .replace(
            /\\text\s*\{([^{}]*)\}/g,
            "$1"
        )
        .replace(
            /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
            "($1) / ($2)"
        )
        .replace(
            /\$\$/g,
            ""
        )
        .replace(
            /\$/g,
            ""
        )
        .replace(
            /\n{3,}/g,
            "\n\n"
        )
        .trim();
}

/* =========================================================
   MIME HELPERS
========================================================= */

function normalizeMime(
    value
) {
    return typeof value === "string"
        ? value
            .split(";")[0]
            .trim()
            .toLowerCase()
        : "";
}

function stripDataPrefix(
    value
) {
    if (
        typeof value !==
        "string"
    ) {
        return "";
    }

    const comma =
        value.indexOf(",");

    if (
        value.startsWith("data:") &&
        comma >= 0
    ) {
        return value
            .slice(
                comma + 1
            )
            .trim();
    }

    return value.trim();
}

function decodeBase64(
    value
) {
    const clean =
        stripDataPrefix(
            value
        );

    if (
        !clean
    ) {
        throw new Error(
            "Media data is empty."
        );
    }

    if (
        !/^[A-Za-z0-9+/=\s]+$/.test(
            clean
        )
    ) {
        throw new Error(
            "Invalid media data."
        );
    }

    const bytes =
        Buffer.from(
            clean,
            "base64"
        );

    if (
        !bytes.length
    ) {
        throw new Error(
            "Unable to decode media."
        );
    }

    if (
        bytes.length >
        MAX_MEDIA_BYTES
    ) {
        throw new Error(
            "Attached media is too large."
        );
    }

    return {
        base64:
            bytes.toString(
                "base64"
            ),
        bytes
    };
}

function getMedia(
    body
) {
    const raw =
        typeof body?.mediaBase64 ===
            "string"
            ? body.mediaBase64
            : typeof body?.imageBase64 ===
                "string"
                ? body.imageBase64
                : typeof body?.fileBase64 ===
                    "string"
                    ? body.fileBase64
                    : "";

    if (
        !raw
    ) {
        return null;
    }

    const mimeType =
        normalizeMime(
            body?.mimeType ||
            body?.mediaMimeType ||
            ""
        );

    if (
        !mimeType
    ) {
        throw new Error(
            "MIME type is required."
        );
    }

    const decoded =
        decodeBase64(
            raw
        );

    return {
        base64:
            decoded.base64,
        bytes:
            decoded.bytes,
        mimeType,
        fileName:
            typeof body?.fileName ===
                "string"
                ? body.fileName.trim() ||
                    "Attachment"
                : "Attachment"
    };
}

/* =========================================================
   CONTENT BUILDER
========================================================= */

function buildContents(
    message,
    media
) {
    const parts = [];

    if (
        message.trim()
    ) {
        parts.push({
            text:
                message.trim()
        });
    }

    if (
        media
    ) {
        parts.push({
            inlineData: {
                mimeType:
                    media.mimeType,
                data:
                    media.base64
            }
        });

        parts.push({
            text:
                `Attached file: ${media.fileName}`
        });
    }

    if (
        parts.length === 0
    ) {
        throw new Error(
            "Message or media is required."
        );
    }

    return [
        {
            role:
                "user",
            parts
        }
    ];
}

/* =========================================================
   TEXT MODEL
========================================================= */

async function callTextModel(
    contents
) {
    if (
        !ai
    ) {
        throw new Error(
            "GEMINI_API_KEY is missing."
        );
    }

    let lastError =
        null;

    for (
        let attempt = 0;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            return await ai.models.generateContent({
                model:
                    TEXT_MODEL,
                contents,
                config: {
                    systemInstruction:
                        SYSTEM_INSTRUCTION,

                    maxOutputTokens:
                        1200
                }
            });

        } catch (
            error
        ) {

            lastError =
                error;

            const status =
                getStatus(
                    error
                );

            console.error(
                `[MechSyntra] text attempt ${attempt + 1} status=${status}`
            );

            if (
                !isRetryable(
                    status
                ) ||
                attempt >= MAX_RETRIES
            ) {
                break;
            }

            await sleep(
                RETRY_DELAYS_MS[
                    attempt
                ]
            );
        }
    }

    throw (
        lastError ||
        new Error(
            "Text generation failed."
        )
    );
}

/* =========================================================
   IMAGE EDITOR
========================================================= */

async function editImage(
    prompt,
    media
) {
    if (
        !ai
    ) {
        throw new Error(
            "GEMINI_API_KEY is missing."
        );
    }

    const input = [
        {
            type:
                "image",
            mime_type:
                media.mimeType,
            data:
                media.base64
        },
        {
            type:
                "text",
            text:
                `
Edit this image according to the user's instruction.

User instruction:
${prompt}

Professional rules:
1. Preserve the person's identity.
2. Do not change the face, facial proportions or recognizable features unless explicitly requested.
3. Preserve natural skin appearance.
4. Change only what the user requests.
5. Preserve original composition and perspective when possible.
6. Match lighting, reflections, shadows and object scale.
7. Make inserted objects look physically natural.
8. For enhancement, increase clarity, detail, sharpness and lighting without changing identity.
9. Do not add unrelated objects.
10. Return a professionally edited image.
                `.trim()
        }
    ];

    let lastError =
        null;

    for (
        let attempt = 0;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            const response =
                await ai.interactions.create({
                    model:
                        IMAGE_MODEL,
                    input,
                    response_format: {
                        type:
                            "image",
                        image_size:
                            "2K"
                    }
                });

            let outputImage =
                null;

            let outputText =
                "";

            if (
                response?.output_image?.data
            ) {
                outputImage = {
                    data:
                        response.output_image.data,
                    mimeType:
                        response.output_image.mimeType ||
                        "image/png"
                };
            }

            if (
                Array.isArray(
                    response?.steps
                )
            ) {

                for (
                    const step of
                        response.steps
                ) {

                    if (
                        step?.type !==
                        "model_output"
                    ) {
                        continue;
                    }

                    const blocks =
                        Array.isArray(
                            step?.content
                        )
                            ? step.content
                            : [];

                    for (
                        const block of
                            blocks
                    ) {

                        if (
                            block?.type ===
                                "image" &&
                            block?.data &&
                            !outputImage
                        ) {
                            outputImage = {
                                data:
                                    block.data,
                                mimeType:
                                    block.mime_type ||
                                    "image/png"
                            };
                        }

                        if (
                            block?.type ===
                            "text"
                        ) {
                            outputText +=
                                String(
                                    block.text ||
                                    ""
                                );
                        }
                    }
                }
            }

            if (
                !outputImage
            ) {
                throw new Error(
                    "Image model returned no image."
                );
            }

            return {
                imageBase64:
                    outputImage.data,

                imageMimeType:
                    outputImage.mimeType,

                reply:
                    cleanResponse(
                        outputText
                    ) ||
                    "Image edited successfully by MechSyntra AI."
            };

        } catch (
            error
        ) {

            lastError =
                error;

            const status =
                getStatus(
                    error
                );

            console.error(
                `[MechSyntra] image attempt ${attempt + 1} status=${status}`
            );

            if (
                !isRetryable(
                    status
                ) ||
                attempt >= MAX_RETRIES
            ) {
                break;
            }

            await sleep(
                RETRY_DELAYS_MS[
                    attempt
                ]
            );
        }
    }

    throw (
        lastError ||
        new Error(
            "Image editing failed."
        )
    );
}

/* =========================================================
   TEXT FILE EDITOR
========================================================= */

async function editTextFile(
    media,
    instruction
) {
    const original =
        media.bytes.toString(
            "utf8"
        );

    const prompt = `
You are the MechSyntra AI file editor.

File name:
${media.fileName}

MIME type:
${media.mimeType}

User instruction:
${instruction}

Rules:
- Return the COMPLETE revised file.
- Preserve valid syntax.
- Preserve the original structure unless requested otherwise.
- Do not invent missing information.
- Do not add explanations.
- Do not use Markdown code fences.

ORIGINAL FILE:
${original}
`;

    const response =
        await callTextModel([
            {
                role:
                    "user",
                parts: [
                    {
                        text:
                            prompt
                    }
                ]
            }
        ]);

    const edited =
        cleanResponse(
            response?.text ||
            ""
        );

    if (
        !edited
    ) {
        throw new Error(
            "Gemini returned an empty edited file."
        );
    }

    return edited;
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/",
    (req, res) => {

        return res.status(200).json({

            success:
                true,

            service:
                "MechSyntra AI",

            status:
                "online",

            textModel:
                TEXT_MODEL,

            imageModel:
                IMAGE_MODEL,

            multimodal:
                true,

            imageEditing:
                true,

            fileEditing:
                true
        });
    }
);

app.get(
    "/health",
    (req, res) => {

        return res.status(200).json({

            success:
                true,

            status:
                "healthy",

            textModel:
                TEXT_MODEL,

            imageModel:
                IMAGE_MODEL,

            multimodal:
                true,

            imageEditing:
                true,

            fileEditing:
                true,

            timestamp:
                new Date().toISOString()
        });
    }
);

/*
   /ready does NOT call Gemini and therefore does not
   consume Gemini quota.
*/

app.get(
    "/ready",
    (req, res) => {

        const ready =
            Boolean(
                GEMINI_API_KEY
            );

        return res.status(
            ready
                ? 200
                : 503
        ).json({

            success:
                ready,

            ready,

            service:
                "MechSyntra AI"
        });
    }
);

/* =========================================================
   MAIN CHAT
========================================================= */

app.post(
    "/chat",
    async (req, res) => {

        const started =
            Date.now();

        try {

            const message =
                typeof req.body?.message ===
                    "string"
                    ? req.body.message.trim()
                    : "";

            const action =
                typeof req.body?.action ===
                    "string"
                    ? req.body.action.trim().toLowerCase()
                    : "chat";

            if (
                message.length >
                MAX_MESSAGE_CHARS
            ) {
                return res.status(413).json({

                    success:
                        false,

                    error:
                        "Message is too long."
                });
            }

            const media =
                getMedia(
                    req.body
                );

            /* -----------------------------------------
               IMAGE EDIT
            ----------------------------------------- */

            if (
                action ===
                    "edit_image" ||
                action ===
                    "image_edit"
            ) {

                if (
                    !media ||
                    !media.mimeType.startsWith(
                        "image/"
                    )
                ) {
                    return res.status(400).json({

                        success:
                            false,

                        error:
                            "Please attach an image for image editing."
                    });
                }

                const result =
                    await editImage(
                        message,
                        media
                    );

                return res.status(200).json({

                    success:
                        true,

                    type:
                        "image_edit",

                    reply:
                        result.reply,

                    imageBase64:
                        result.imageBase64,

                    imageMimeType:
                        result.imageMimeType,

                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /* -----------------------------------------
               FILE EDIT
            ----------------------------------------- */

            if (
                action ===
                "edit_file"
            ) {

                if (
                    !media
                ) {
                    return res.status(400).json({

                        success:
                            false,

                        error:
                            "Please attach a file to edit."
                    });
                }

                const editable =
                    [
                        "text/plain",
                        "text/csv",
                        "text/html",
                        "text/css",
                        "text/markdown",
                        "text/xml",
                        "application/json",
                        "application/rtf"
                    ].includes(
                        media.mimeType
                    );

                if (
                    !editable
                ) {
                    return res.status(400).json({

                        success:
                            false,

                        error:
                            "This file can be analyzed, but this editor only rewrites text-based files."
                    });
                }

                const fileContent =
                    await editTextFile(
                        media,
                        message
                    );

                return res.status(200).json({

                    success:
                        true,

                    type:
                        "file_edit",

                    fileName:
                        media.fileName,

                    mimeType:
                        media.mimeType,

                    fileContent,

                    reply:
                        "File edited successfully.",

                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /* -----------------------------------------
               NORMAL CHAT / MEDIA ANALYSIS
            ----------------------------------------- */

            const contents =
                buildContents(
                    message,
                    media
                );

            const response =
                await callTextModel(
                    contents
                );

            const reply =
                cleanResponse(
                    response?.text ||
                    ""
                );

            if (
                !reply
            ) {
                return res.status(502).json({

                    success:
                        false,

                    error:
                        "Gemini returned an empty response."
                });
            }

            return res.status(200).json({

                success:
                    true,

                type:
                    media
                        ? "multimodal_chat"
                        : "chat",

                reply,

                latencyMs:
                    Date.now() -
                    started
            });

        } catch (
            error
        ) {

            const status =
                getStatus(
                    error
                );

            console.error(
                `[MechSyntra] /chat failed status=${status}`
            );

            return res.status(
                status >= 400 &&
                        status < 600
                    ? status
                    : 500
            ).json({

                success:
                    false,

                error:
                    friendlyError(
                        error
                    ),

                status,

                latencyMs:
                    Date.now() -
                    started
            });
        }
    }
);

/* =========================================================
   IMAGE EDIT ENDPOINT
========================================================= */

app.post(
    "/edit-image",
    async (req, res) => {

        const started =
            Date.now();

        try {

            const media =
                getMedia(
                    req.body
                );

            const prompt =
                typeof req.body?.prompt ===
                    "string"
                    ? req.body.prompt.trim()
                    : typeof req.body?.message ===
                        "string"
                        ? req.body.message.trim()
                        : "";

            if (
                !media ||
                !media.mimeType.startsWith(
                    "image/"
                )
            ) {
                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Please provide an image."
                });
            }

            const result =
                await editImage(
                    prompt,
                    media
                );

            return res.status(200).json({

                success:
                    true,

                type:
                    "image_edit",

                reply:
                    result.reply,

                imageBase64:
                    result.imageBase64,

                imageMimeType:
                    result.imageMimeType,

                latencyMs:
                    Date.now() -
                    started
            });

        } catch (
            error
        ) {

            const status =
                getStatus(
                    error
                );

            console.error(
                `[MechSyntra] /edit-image failed status=${status}`
            );

            return res.status(
                status >= 400 &&
                        status < 600
                    ? status
                    : 500
            ).json({

                success:
                    false,

                error:
                    friendlyError(
                        error
                    ),

                status,

                latencyMs:
                    Date.now() -
                    started
            });
        }
    }
);

/* =========================================================
   FILE EDIT ENDPOINT
========================================================= */

app.post(
    "/edit-file",
    async (req, res) => {

        try {

            const media =
                getMedia(
                    req.body
                );

            const prompt =
                typeof req.body?.prompt ===
                    "string"
                    ? req.body.prompt.trim()
                    : typeof req.body?.message ===
                        "string"
                        ? req.body.message.trim()
                        : "";

            if (
                !media
            ) {
                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Please provide a file."
                });
            }

            const editable =
                [
                    "text/plain",
                    "text/csv",
                    "text/html",
                    "text/css",
                    "text/markdown",
                    "text/xml",
                    "application/json",
                    "application/rtf"
                ].includes(
                    media.mimeType
                );

            if (
                !editable
            ) {
                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Only text-based files can be rewritten by this file editor."
                });
            }

            const fileContent =
                await editTextFile(
                    media,
                    prompt
                );

            return res.status(200).json({

                success:
                    true,

                type:
                    "file_edit",

                fileName:
                    media.fileName,

                mimeType:
                    media.mimeType,

                fileContent,

                reply:
                    "File edited successfully."
            });

        } catch (
            error
        ) {

            const status =
                getStatus(
                    error
                );

            return res.status(
                status >= 400 &&
                        status < 600
                    ? status
                    : 500
            ).json({

                success:
                    false,

                error:
                    friendlyError(
                        error
                    ),

                status
            });
        }
    }
);

/* =========================================================
   404
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
            "[MechSyntra] Express error:",
            error
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
   VERCEL + LOCAL
========================================================= */

/*
   Vercel uses the exported Express application.
   Local `node server.js` still works.
*/

module.exports =
    app;

if (
    require.main ===
    module
) {

    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                "========================================"
            );

            console.log(
                "        MECHSYNTRA AI BACKEND"
            );

            console.log(
                "========================================"
            );

            console.log(
                `Local: http://localhost:${PORT}`
            );

            console.log(
                `Health: http://localhost:${PORT}/health`
            );

            console.log(
                `Chat: http://localhost:${PORT}/chat`
            );

            console.log(
                `Edit Image: http://localhost:${PORT}/edit-image`
            );

            console.log(
                `Edit File: http://localhost:${PORT}/edit-file`
            );

            console.log(
                `Text Model: ${TEXT_MODEL}`
            );

            console.log(
                `Image Model: ${IMAGE_MODEL}`
            );

            console.log(
                "Status: ONLINE"
            );

            console.log(
                "========================================"
            );
        }
    );
}
