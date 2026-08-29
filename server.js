const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   MECHSYNTRA AI — PRODUCTION SERVER
   Text chat + multimodal analysis + image editing + file editing
========================================================= */

const PORT =
    process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

/*
 * Configurable from Vercel Environment Variables:
 *
 * GEMINI_TEXT_MODEL
 * GEMINI_IMAGE_MODEL
 */

const TEXT_MODEL =
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-3.6-flash";

const IMAGE_MODEL =
    process.env.GEMINI_IMAGE_MODEL ||
    "gemini-3.1-flash-image";

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
    [300, 900];

/* =========================================================
   GEMINI CLIENT
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
- Numerical calculations
- Engineering
- Science
- Technology
- Android development
- Programming
- Coding
- Business
- Education
- Writing
- Translation
- Project management
- Image understanding
- Image editing
- File/document understanding

GENERAL RESPONSE RULES:
- Answer accurately and naturally.
- Never invent facts.
- Never claim an action was performed when it was not performed.
- Use concise answers for simple questions.
- Use clear step-by-step explanations for complex questions.
- Use readable plain text.
- Avoid unnecessary Markdown.
- Do not use raw LaTeX when plain mathematical notation is sufficient.

NUMERICAL / ENGINEERING:
- Show:
  Given
  Formula
  Substitution
  Calculation
  Final Answer
- Keep units together, for example:
  9.81 m/s²
  94.31 N/mm²
- Use proper symbols such as:
  × ÷ ≈ π θ v₀ τₘₐₓ σₘₐₓ
- Check arithmetic carefully.
- Do not mix variable names or invent values.

MEDIA:
- Inspect the actual attached media.
- If an image is attached, analyze what is actually visible.
- If a supported text document is attached, read its actual content.
- Never claim to have inspected an attachment that was not successfully supplied.

IMAGE EDITING:
- When the user asks to edit an attached image, actually edit it.
- Preserve the person's identity and recognizable face unless explicitly asked to change it.
- Do not unnecessarily change facial proportions, expression, skin tone or identity.
- Change only the requested object/area.
- Preserve the original composition and perspective unless the user requests otherwise.
- Match lighting, shadows, reflections, color, scale and perspective.
- For enhancement, improve quality without unnecessarily changing identity.
- Do not add unrelated objects.
- Make edits look natural and professional.

FILE EDITING:
- For text-based files, preserve syntax and structure unless the user requests structural changes.
- Return the complete revised file.
- Do not invent missing content.
`;

/* =========================================================
   ERROR / STATUS HELPERS
========================================================= */

function getStatus(
    error
) {
    const candidate =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const numeric =
        Number(
            candidate
        );

    return Number.isFinite(
        numeric
    )
        ? numeric
        : 500;
}

function isRetryable(
    status
) {
    return (
        status === 408 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
}

function sleep(
    milliseconds
) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}

function friendlyError(
    error
) {
    const status =
        getStatus(
            error
        );

    console.error(
        "[MechSyntra] Gemini status:",
        status
    );

    console.error(
        "[MechSyntra] Gemini error:",
        error?.message || error
    );

    switch (
        status
    ) {
        case 400:
            return "Gemini rejected the request. Please check the message or attachment.";

        case 401:
            return "Gemini API authentication failed. Check GEMINI_API_KEY.";

        case 403:
            return "Gemini API access was denied. Check API permissions, billing and quota.";

        case 404:
            return "The configured Gemini model is unavailable. Check the model name.";

        case 408:
            return "The AI request timed out. Please try again.";

        case 413:
            return "The attached file is too large. Please choose a smaller file.";

        case 429:
            return "Gemini quota or rate limit was reached. Please try again shortly.";

        default:
            if (
                status >= 500
            ) {
                return "Gemini is temporarily unavailable. Please try again shortly.";
            }

            return (
                error?.message ||
                "MechSyntra AI could not process the request."
            );
    }
}

/* =========================================================
   TEXT CLEANING
========================================================= */

function cleanText(
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

    const commaIndex =
        value.indexOf(",");

    if (
        value.startsWith("data:") &&
        commaIndex >= 0
    ) {
        return value
            .slice(
                commaIndex + 1
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
            "Attached media is larger than 6 MB."
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
   IMAGE EDIT INTENT
========================================================= */

function hasImageEditIntent(
    text
) {
    const value =
        String(
            text || ""
        )
            .toLowerCase()
            .trim();

    if (
        !value
    ) {
        return false;
    }

    const keywords = [
        "edit image",
        "edit this image",
        "edit the image",
        "change image",
        "change this image",
        "modify image",
        "modify this image",
        "add to image",
        "add this to image",
        "remove from image",
        "remove this from image",
        "delete from image",
        "replace in image",
        "enhance image",
        "enhance this image",
        "improve image",
        "improve this image",
        "retouch image",
        "retouch this image",
        "background",
        "add cap",
        "add a cap",
        "remove object",
        "add object",
        "put on the image",
        "put this on the image",
        "change the background",
        "make this image",
        "make the image"
    ];

    return keywords.some(
        keyword =>
            value.includes(
                keyword
            )
    );
}

/* =========================================================
   TEXT MODEL
========================================================= */

async function generateText(
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
                `[MechSyntra] text attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${status}`
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
            "Text model request failed."
        )
    );
}

/* =========================================================
   IMAGE EDITING
========================================================= */

async function editImage(
    media,
    instruction
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
Edit the supplied image according to this instruction:

${instruction}

STRICT EDITING REQUIREMENTS:
- Preserve the original person's identity and face.
- Do not alter facial proportions or recognizable features unless explicitly requested.
- Preserve natural skin appearance.
- Change only the requested object, area or property.
- Preserve the original composition and perspective unless the user requests otherwise.
- Match lighting, shadows, reflections, texture and scale.
- Make inserted objects look naturally photographed.
- For enhancement, improve quality, clarity, sharpness and lighting without changing identity.
- Do not add unrelated objects.
- Return the edited image.
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

            const interaction =
                await ai.interactions.create({
                    model:
                        IMAGE_MODEL,

                    input
                });

            let imageBase64 =
                "";

            let imageMimeType =
                "image/png";

            let textReply =
                "";

            if (
                Array.isArray(
                    interaction?.steps
                )
            ) {

                for (
                    const step of
                        interaction.steps
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
                            "image"
                        ) {

                            if (
                                block.data &&
                                !imageBase64
                            ) {

                                imageBase64 =
                                    block.data;

                                imageMimeType =
                                    block.mime_type ||
                                    block.mimeType ||
                                    "image/png";
                            }
                        }

                        if (
                            block?.type ===
                            "text"
                        ) {

                            textReply +=
                                String(
                                    block.text ||
                                    ""
                                );
                        }
                    }
                }
            }

            /*
               Compatibility path.
            */
            if (
                !imageBase64 &&
                interaction?.output_image?.data
            ) {

                imageBase64 =
                    interaction.output_image.data;

                imageMimeType =
                    interaction.output_image.mimeType ||
                    "image/png";
            }

            if (
                !imageBase64
            ) {

                throw new Error(
                    "Gemini image model returned no edited image."
                );
            }

            return {

                imageBase64,

                imageMimeType,

                reply:
                    cleanText(
                        textReply
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
                `[MechSyntra] image attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${status}`
            );

            console.error(
                error?.message || ""
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
   TEXT FILE EDITING
========================================================= */

const EDITABLE_TEXT_MIMES = [
    "text/plain",
    "text/csv",
    "text/html",
    "text/css",
    "text/markdown",
    "text/xml",
    "application/json",
    "application/rtf"
];

async function editTextFile(
    media,
    instruction
) {
    const original =
        media.bytes.toString(
            "utf8"
        );

    const prompt = `
You are MechSyntra AI file editor.

File name:
${media.fileName}

MIME type:
${media.mimeType}

User instruction:
${instruction}

Rules:
- Return the complete revised file.
- Preserve valid syntax.
- Preserve the original structure unless instructed otherwise.
- Do not invent missing content.
- Do not add explanations.
- Do not use Markdown fences.

ORIGINAL FILE:
${original}
`;

    const response =
        await generateText([
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
        cleanText(
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
   ROOT
========================================================= */

app.get(
    "/",
    (req, res) => {

        return res.status(
            200
        ).json({

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

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/health",
    (req, res) => {

        return res.status(
            200
        ).json({

            success:
                true,

            status:
                "healthy",

            imageEditing:
                true,

            fileEditing:
                true,

            multimodal:
                true,

            textModel:
                TEXT_MODEL,

            imageModel:
                IMAGE_MODEL,

            timestamp:
                new Date().toISOString()
        });
    }
);

/* =========================================================
   READY
========================================================= */

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
                    ? req.body.action
                        .trim()
                        .toLowerCase()
                    : "chat";

            if (
                message.length >
                MAX_MESSAGE_CHARS
            ) {

                return res.status(
                    413
                ).json({

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

            /*
               IMPORTANT:
               If an image is attached and the user asks for an edit,
               automatically use the image model even when Android
               accidentally sends action="chat".
            */

            const shouldEditImage =
                Boolean(
                    media &&
                    media.mimeType.startsWith(
                        "image/"
                    ) &&
                    (
                        action ===
                            "edit_image" ||
                        action ===
                            "image_edit" ||
                        hasImageEditIntent(
                            message
                        )
                    )
                );

            if (
                shouldEditImage
            ) {

                const edited =
                    await editImage(
                        media,
                        message
                    );

                return res.status(
                    200
                ).json({

                    success:
                        true,

                    type:
                        "image_edit",

                    reply:
                        edited.reply,

                    imageBase64:
                        edited.imageBase64,

                    imageMimeType:
                        edited.imageMimeType,

                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /*
               TEXT FILE EDIT
            */

            if (
                action ===
                "edit_file"
            ) {

                if (
                    !media
                ) {

                    return res.status(
                        400
                    ).json({

                        success:
                            false,

                        error:
                            "Please attach a file to edit."
                    });
                }

                if (
                    !EDITABLE_TEXT_MIMES.includes(
                        media.mimeType
                    )
                ) {

                    return res.status(
                        400
                    ).json({

                        success:
                            false,

                        error:
                            "This file type can be analyzed, but only supported text-based files can be rewritten."
                    });
                }

                const fileContent =
                    await editTextFile(
                        media,
                        message
                    );

                return res.status(
                    200
                ).json({

                    success:
                        true,

                    type:
                        "file_edit",

                    reply:
                        "File edited successfully.",

                    fileContent,

                    fileName:
                        media.fileName,

                    mimeType:
                        media.mimeType,

                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /*
               NORMAL TEXT OR MULTIMODAL ANALYSIS
            */

            const parts = [];

            if (
                message
            ) {

                parts.push({
                    text:
                        message
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
                parts.length ===
                0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Message or attachment is required."
                });
            }

            const response =
                await generateText([
                    {
                        role:
                            "user",

                        parts
                    }
                ]);

            const reply =
                cleanText(
                    response?.text ||
                    ""
                );

            if (
                !reply
            ) {

                return res.status(
                    502
                ).json({

                    success:
                        false,

                    error:
                        "Gemini returned an empty response."
                });
            }

            return res.status(
                200
            ).json({

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
                "[MechSyntra] /chat error:",
                status,
                error?.message ||
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

                status,

                latencyMs:
                    Date.now() -
                    started
            });
        }
    }
);

/* =========================================================
   DIRECT IMAGE EDIT
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

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Please provide an image."
                });
            }

            if (
                !prompt
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Please describe what you want changed in the image."
                });
            }

            const edited =
                await editImage(
                    media,
                    prompt
                );

            return res.status(
                200
            ).json({

                success:
                    true,

                type:
                    "image_edit",

                reply:
                    edited.reply,

                imageBase64:
                    edited.imageBase64,

                imageMimeType:
                    edited.imageMimeType,

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
                "[MechSyntra] /edit-image error:",
                status,
                error?.message ||
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

                status,

                latencyMs:
                    Date.now() -
                    started
            });
        }
    }
);

/* =========================================================
   DIRECT FILE EDIT
========================================================= */

app.post(
    "/edit-file",
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
                !media
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Please provide a file."
                });
            }

            if (
                !EDITABLE_TEXT_MIMES.includes(
                    media.mimeType
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "Only supported text-based files can be rewritten."
                });
            }

            const fileContent =
                await editTextFile(
                    media,
                    prompt
                );

            return res.status(
                200
            ).json({

                success:
                    true,

                type:
                    "file_edit",

                reply:
                    "File edited successfully.",

                fileContent,

                fileName:
                    media.fileName,

                mimeType:
                    media.mimeType,

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

        return res.status(
            404
        ).json({

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

        return res.status(
            500
        ).json({

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
                `Image Edit: http://localhost:${PORT}/edit-image`
            );

            console.log(
                `File Edit: http://localhost:${PORT}/edit-file`
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
