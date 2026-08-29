const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   MECHSYNTRA AI - FINAL SERVER
========================================================= */

const PORT =
    Number(process.env.PORT || 3000);

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const TEXT_MODEL =
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-3.5-flash-lite";

const TEXT_FALLBACK_MODEL =
    process.env.GEMINI_TEXT_FALLBACK_MODEL ||
    "gemini-3.6-flash";

const IMAGE_MODEL =
    process.env.GEMINI_IMAGE_MODEL ||
    "gemini-3.1-flash-image";

const IMAGE_FALLBACK_MODEL =
    process.env.GEMINI_IMAGE_FALLBACK_MODEL ||
    "gemini-3.1-flash-lite-image";

const JSON_LIMIT =
    process.env.JSON_LIMIT ||
    "16mb";

const MAX_MEDIA_BYTES =
    8 * 1024 * 1024;

const MAX_MESSAGE_CHARS =
    20000;

const TEXT_TIMEOUT_MS =
    35000;

const IMAGE_TIMEOUT_MS =
    120000;

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
   EXPRESS
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

You are a professional AI assistant.

You understand:
- English
- Urdu
- Roman Urdu
- Mixed Pakistani language

Reply naturally in the user's language.

General:
- Be accurate.
- Be professional.
- Do not invent facts.
- Do not claim to have performed an action that you did not perform.
- Never pretend an attachment exists when it is missing.
- Keep simple questions concise.
- Give detail when the task requires it.

Engineering and mathematics:
- Calculate carefully.
- Verify arithmetic.
- Preserve units.
- Use proper symbols such as ×, ÷, ≈, π, θ, τ, σ.
- For numerical solutions use:
  Given
  Formula
  Substitution
  Calculation
  Final Answer
- Do not output raw LaTeX syntax.

Media:
- Inspect the supplied attachment.
- Analyze the actual image/document/audio supplied.
- Never claim to have seen missing media.

Image editing:
- Actually edit the supplied image when an edit is requested.
- Preserve the original person's identity and face unless explicitly requested.
- Do not unnecessarily alter facial proportions, expression, skin tone or recognizable features.
- Change only what the user asks.
- Preserve natural perspective, composition and lighting.
- Match added objects to scale, shadows, perspective and lighting.
- For enhancement, improve clarity, sharpness, lighting and detail without changing identity.
- Return an actual edited image.

Project Manager:
- Work only with the supplied project information.
- If only project title and deadline are known, do not invent requirements.
- Ask 2 or 3 intelligent questions based on the project title.
- After the user answers, build requirements, components, tasks, risks, dependencies and next actions.
- Keep Project Manager answers scoped to that project.
`;

/* =========================================================
   HELPERS
========================================================= */

function getStatus(error) {

    const raw =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const value =
        Number(raw);

    return Number.isFinite(
        value
    )
        ? value
        : 500;
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

function is429(
    status
) {
    return status === 429;
}

function isTemporaryServerError(
    status
) {
    return (
        status === 408 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
}

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
            /`([^`]+)`/g,
            "$1"
        )
        .replace(
            /`/g,
            ""
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
            /\\circ/g,
            "°"
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
            /\\left/g,
            ""
        )
        .replace(
            /\\right/g,
            ""
        )
        .replace(
            /\n{3,}/g,
            "\n\n"
        )
        .trim();
}

function normalizeMime(
    value
) {

    return typeof value ===
        "string"
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
        value.startsWith(
            "data:"
        ) &&
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

    if (!clean) {
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

function readMedia(
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

    if (!raw) {
        return null;
    }

    const mimeType =
        normalizeMime(
            body?.mimeType ||
            body?.mediaMimeType ||
            ""
        );

    if (!mimeType) {
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

function buildContents(
    message,
    media
) {

    const parts = [];

    if (
        message &&
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
   FRIENDLY ERRORS
========================================================= */

function friendlyError(
    error
) {

    const status =
        getStatus(
            error
        );

    console.error(
        "[MechSyntra]",
        {
            status,
            message:
                error?.message ||
                String(error)
        }
    );

    if (
        status === 400
    ) {

        return (
            "MechSyntra could not accept this request. Please check the message or attachment."
        );
    }

    if (
        status === 401 ||
        status === 403
    ) {

        return (
            "Gemini authentication or project access failed. Check the Gemini API key and project permissions."
        );
    }

    if (
        status === 404
    ) {

        return (
            "The configured Gemini model is unavailable."
        );
    }

    if (
        status === 408
    ) {

        return (
            "MechSyntra timed out while waiting for the AI."
        );
    }

    if (
        status === 413
    ) {

        return (
            "The attachment is too large."
        );
    }

    if (
        status === 429
    ) {

        return (
            "Gemini quota or rate limit was reached. Please try again shortly."
        );
    }

    if (
        status >= 500
    ) {

        return (
            "MechSyntra could not reach the AI service right now."
        );
    }

    return (
        error?.message ||
        "MechSyntra AI could not process the request."
    );
}

/* =========================================================
   TEXT GENERATION
   IMPORTANT:
   429 is NOT repeatedly retried.
========================================================= */

async function generateText(
    contents
) {

    if (!ai) {

        throw new Error(
            "GEMINI_API_KEY is missing."
        );
    }

    const models =
        [
            TEXT_MODEL,
            TEXT_FALLBACK_MODEL
        ].filter(
            (value, index, array) =>
                value &&
                array.indexOf(
                    value
                ) === index
        );

    let lastError =
        null;

    for (
        let i = 0;
        i < models.length;
        i++
    ) {

        const model =
            models[i];

        try {

            const request =
                ai.models.generateContent({
                    model,
                    contents,
                    config: {
                        systemInstruction:
                            SYSTEM_INSTRUCTION,
                        maxOutputTokens:
                            1400
                    }
                });

            return await Promise.race([
                request,
                new Promise(
                    (_, reject) =>
                        setTimeout(
                            () =>
                                reject(
                                    Object.assign(
                                        new Error(
                                            "Text request timed out."
                                        ),
                                        {
                                            status:
                                                408
                                        }
                                    )
                                ),
                            TEXT_TIMEOUT_MS
                        )
                )
            ]);

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
                `[MechSyntra] text model ${model} failed with ${status}`
            );

            /*
               If primary model hits 429, try the one fallback model once.
               Never keep retrying the same quota-limited model.
            */
            if (
                is429(
                    status
                )
            ) {
                continue;
            }

            if (
                i <
                    models.length - 1 &&
                isTemporaryServerError(
                    status
                )
            ) {
                await sleep(
                    500
                );
                continue;
            }

            throw error;
        }
    }

    throw (
        lastError ||
        new Error(
            "All text models failed."
        )
    );
}

/* =========================================================
   IMAGE GENERATION / EDITING
========================================================= */

function extractImage(
    interaction
) {

    let image =
        null;

    let reply =
        "";

    if (
        interaction?.output_image?.data
    ) {

        image = {
            data:
                interaction.output_image.data,
            mimeType:
                interaction.output_image.mimeType ||
                "image/png"
        };
    }

    const steps =
        Array.isArray(
            interaction?.steps
        )
            ? interaction.steps
            : [];

    for (
        const step of
            steps
    ) {

        if (
            step?.type !==
            "model_output"
        ) {
            continue;
        }

        const content =
            Array.isArray(
                step?.content
            )
                ? step.content
                : [];

        for (
            const block of
                content
        ) {

            if (
                block?.type ===
                    "image" &&
                block?.data &&
                !image
            ) {

                image = {
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

                reply +=
                    String(
                        block.text ||
                        ""
                    );
            }
        }
    }

    return {
        image,
        reply:
            cleanResponse(
                reply
            )
    };
}

async function imageOperation(
    prompt,
    media
) {

    if (!ai) {

        throw new Error(
            "GEMINI_API_KEY is missing."
        );
    }

    const models =
        [
            IMAGE_MODEL,
            IMAGE_FALLBACK_MODEL
        ].filter(
            (value, index, array) =>
                value &&
                array.indexOf(
                    value
                ) === index
        );

    let lastError =
        null;

    const input =
        media
            ? [
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

${prompt || "Enhance this image professionally."}

Rules:
- Preserve the original person's identity and face.
- Do not change facial proportions unnecessarily.
- Preserve natural skin tone and recognizable features.
- Change only the requested content.
- Preserve original composition and perspective.
- Make inserted objects look physically natural.
- Match lighting, shadows, scale and perspective.
- For enhancement, improve clarity, sharpness, lighting and detail without changing identity.
- Return the actual edited image.
                        `.trim()
                }
            ]
            : prompt;

    for (
        const model of
            models
    ) {

        try {

            const request =
                ai.interactions.create({
                    model,
                    input,
                    response_format: {
                        type:
                            "image",
                        image_size:
                            "2K"
                    }
                });

            const interaction =
                await Promise.race([
                    request,
                    new Promise(
                        (_, reject) =>
                            setTimeout(
                                () =>
                                    reject(
                                        Object.assign(
                                            new Error(
                                                "Image request timed out."
                                            ),
                                            {
                                                status:
                                                    408
                                            }
                                        )
                                    ),
                                IMAGE_TIMEOUT_MS
                            )
                    )
                ]);

            const result =
                extractImage(
                    interaction
                );

            if (
                !result.image
            ) {

                throw new Error(
                    "Image model returned no image."
                );
            }

            return {
                imageBase64:
                    result.image.data,
                imageMimeType:
                    result.image.mimeType ||
                    "image/png",
                reply:
                    result.reply ||
                    "Image generated successfully by MechSyntra AI."
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
                `[MechSyntra] image model ${model} failed with ${status}`
            );

            /*
               A 429 moves directly to the one fallback model.
               No endless retry loop.
            */
            if (
                is429(
                    status
                )
            ) {
                continue;
            }

            if (
                isTemporaryServerError(
                    status
                ) &&
                model !==
                    models[
                        models.length - 1
                    ]
            ) {
                await sleep(
                    700
                );
                continue;
            }

            break;
        }
    }

    throw (
        lastError ||
        new Error(
            "All image models failed."
        )
    );
}

/* =========================================================
   TEXT FILE EDITING
========================================================= */

const EDITABLE_TEXT_TYPES =
    new Set([
        "text/plain",
        "text/csv",
        "text/html",
        "text/css",
        "text/markdown",
        "text/xml",
        "application/json",
        "application/rtf",
        "application/javascript",
        "text/javascript"
    ]);

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
- Return the complete revised file.
- Preserve valid syntax.
- Preserve the original structure unless the instruction requires a change.
- Do not invent missing information.
- Do not add explanations.
- Do not use Markdown code fences.

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

    const result =
        cleanResponse(
            response?.text ||
            ""
        );

    if (!result) {

        throw new Error(
            "Gemini returned an empty edited file."
        );
    }

    return result;
}

/* =========================================================
   HOME / HEALTH
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.status(
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
            textFallback:
                TEXT_FALLBACK_MODEL,
            imageModel:
                IMAGE_MODEL,
            imageFallback:
                IMAGE_FALLBACK_MODEL,
            multimodal:
                true,
            imageGeneration:
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

        res.status(
            200
        ).json({
            success:
                true,
            status:
                "healthy",
            service:
                "MechSyntra AI",
            textModel:
                TEXT_MODEL,
            imageModel:
                IMAGE_MODEL,
            timestamp:
                new Date().toISOString()
        });
    }
);

app.get(
    "/ready",
    (req, res) => {

        const ready =
            Boolean(
                GEMINI_API_KEY
            );

        res.status(
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
   MAIN CHAT ENDPOINT
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
                readMedia(
                    req.body
                );

            /* IMAGE GENERATION */

            if (
                action ===
                    "generate_image" ||
                action ===
                    "image_generate"
            ) {

                if (!message) {

                    return res.status(
                        400
                    ).json({
                        success:
                            false,
                        error:
                            "Describe the image you want MechSyntra AI to generate."
                    });
                }

                const result =
                    await imageOperation(
                        message,
                        null
                    );

                return res.status(
                    200
                ).json({
                    success:
                        true,
                    type:
                        "image_generation",
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

            /* IMAGE EDITING */

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

                    return res.status(
                        400
                    ).json({
                        success:
                            false,
                        error:
                            "Please attach an image for image editing."
                    });
                }

                const result =
                    await imageOperation(
                        message,
                        media
                    );

                return res.status(
                    200
                ).json({
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

            /* FILE EDITING */

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
                    !EDITABLE_TEXT_TYPES.has(
                        media.mimeType
                    )
                ) {

                    return res.status(
                        400
                    ).json({
                        success:
                            false,
                        error:
                            "This editor rewrites text-based files only."
                    });
                }

                const content =
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
                    fileName:
                        media.fileName,
                    mimeType:
                        media.mimeType,
                    fileContent:
                        content,
                    reply:
                        "File edited successfully.",
                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /* NORMAL CHAT + MEDIA ANALYSIS */

            const contents =
                buildContents(
                    message,
                    media
                );

            const response =
                await generateText(
                    contents
                );

            const reply =
                cleanResponse(
                    response?.text ||
                    ""
                );

            if (!reply) {

                return res.status(
                    502
                ).json({
                    success:
                        false,
                    error:
                        "MechSyntra AI returned an empty response."
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
                "[MechSyntra] /chat:",
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
   DIRECT IMAGE ENDPOINT
========================================================= */

app.post(
    "/edit-image",
    async (req, res) => {

        const started =
            Date.now();

        try {

            const media =
                readMedia(
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

            const result =
                await imageOperation(
                    prompt,
                    media
                );

            return res.status(
                200
            ).json({
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
   DIRECT FILE ENDPOINT
========================================================= */

app.post(
    "/edit-file",
    async (req, res) => {

        try {

            const media =
                readMedia(
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

            if (!media) {

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
                !EDITABLE_TEXT_TYPES.has(
                    media.mimeType
                )
            ) {

                return res.status(
                    400
                ).json({
                    success:
                        false,
                    error:
                        "Only text-based files can be rewritten."
                });
            }

            const content =
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
                fileName:
                    media.fileName,
                mimeType:
                    media.mimeType,
                fileContent:
                    content,
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
   GLOBAL ERROR
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
                `Image: http://localhost:${PORT}/edit-image`
            );

            console.log(
                `File: http://localhost:${PORT}/edit-file`
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
