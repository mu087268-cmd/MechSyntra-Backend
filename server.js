const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sharp = require("sharp");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   MECHSYNTRA AI
   TEXT  -> GEMINI
   IMAGE -> CLOUDFLARE WORKERS AI
========================================================= */

const PORT =
    Number(process.env.PORT || 3000);

/* ---------------- GEMINI ---------------- */

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const TEXT_MODEL =
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-3.5-flash-lite";

const TEXT_FALLBACK_MODEL =
    process.env.GEMINI_TEXT_FALLBACK_MODEL ||
    "gemini-3.6-flash";

/* ---------------- CLOUDFLARE ---------------- */

const CLOUDFLARE_API_TOKEN =
    process.env.CLOUDFLARE_API_TOKEN;

const CLOUDFLARE_ACCOUNT_ID =
    process.env.CLOUDFLARE_ACCOUNT_ID;

const CLOUDFLARE_IMAGE_MODEL =
    process.env.CLOUDFLARE_IMAGE_MODEL ||
    "@cf/black-forest-labs/flux-2-klein-4b";

/* ---------------- LIMITS ---------------- */

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

LANGUAGE:
Understand English, Urdu, Roman Urdu and mixed Pakistani language.

STRICT LANGUAGE RULE:
- If the user explicitly requests a language, answer only in that language.
- If the user says Roman Urdu, answer in Roman Urdu.
- If the user says Urdu, answer in Urdu script.
- If the user asks for another language, answer in that language.
- Otherwise match the language of the user's latest message.

GENERAL:
- Be accurate.
- Be professional.
- Do not invent facts.
- Do not claim an action was performed if it was not.
- Do not pretend an attachment exists if it is missing.
- Keep simple answers concise.

MATHEMATICS:
- Calculate carefully.
- Verify arithmetic.
- Preserve units.
- Use readable symbols such as ×, ÷, ≈, π, θ, τ and σ.
- For numerical questions use:
  Given
  Formula
  Substitution
  Calculation
  Final Answer
- Do not output raw LaTeX.

MEDIA:
- Inspect supplied media.
- Analyze actual content.
- Never pretend to have seen missing media.

PROJECT MANAGER:
- Only use confirmed project data.
- If only title and deadline are known, do not invent requirements.
- Ask 2 or 3 intelligent questions based on the project title.
- After answers, help build requirements, components, tasks, risks, dependencies and next actions.
`;

/* =========================================================
   STATUS HELPERS
========================================================= */

function getStatus(error) {

    const value =
        Number(
            error?.status ??
            error?.code ??
            error?.response?.status ??
            500
        );

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

function isTemporary(
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

/* =========================================================
   RESPONSE CLEANER
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

/* =========================================================
   MEDIA HELPERS
========================================================= */

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
            "Invalid Base64 media data."
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
        bytes,
        base64:
            bytes.toString(
                "base64"
            )
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

/* =========================================================
   GEMINI TEXT
========================================================= */

function buildTextContents(
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
            (value, index, list) =>
                value &&
                list.indexOf(
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
                `[MechSyntra] text ${model} -> ${status}`
            );

            if (
                is429(status)
            ) {
                continue;
            }

            if (
                isTemporary(status) &&
                i <
                    models.length - 1
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
   CLOUDFLARE IMAGE
========================================================= */

function cloudflareImageUrl() {

    if (
        !CLOUDFLARE_API_TOKEN ||
        !CLOUDFLARE_ACCOUNT_ID
    ) {

        const error =
            new Error(
                "Cloudflare image environment variables are missing."
            );

        error.status =
            500;

        throw error;
    }

    return (
        "https://api.cloudflare.com/client/v4/accounts/" +
        encodeURIComponent(
            CLOUDFLARE_ACCOUNT_ID
        ) +
        "/ai/run/" +
        encodeURIComponent(
            CLOUDFLARE_IMAGE_MODEL
        )
    );
}

/*
   Cloudflare FLUX.2 Klein reference images must be
   smaller than 512x512. Resize them before sending.
*/
async function prepareCloudflareImage(
    media
) {

    if (!media) {
        return null;
    }

    if (
        !media.mimeType.startsWith(
            "image/"
        )
    ) {
        throw new Error(
            "The supplied media is not an image."
        );
    }

    const resized =
        await sharp(
            media.bytes
        )
            .resize(
                512,
                512,
                {
                    fit:
                        "inside",
                    withoutEnlargement:
                        true
                }
            )
            .jpeg({
                quality:
                    88
            })
            .toBuffer();

    return {
        bytes:
            resized,
        mimeType:
            "image/jpeg",
        fileName:
            "mechsyntra-reference.jpg"
    };
}

async function parseCloudflareResponse(
    response
) {

    const contentType =
        normalizeMime(
            response.headers.get(
                "content-type"
            ) ||
            ""
        );

    if (
        contentType.startsWith(
            "image/"
        )
    ) {

        const arrayBuffer =
            await response.arrayBuffer();

        return {
            imageBase64:
                Buffer
                    .from(
                        arrayBuffer
                    )
                    .toString(
                        "base64"
                    ),
            imageMimeType:
                contentType
        };
    }

    const payload =
        await response.json();

    if (
        payload?.success === false ||
        (
            Array.isArray(
                payload?.errors
            ) &&
            payload.errors.length
        )
    ) {

        const message =
            payload
                ?.errors
                ?.map(
                    item =>
                        item?.message
                )
                .filter(
                    Boolean
                )
                .join(
                    " | "
                ) ||
            "Cloudflare Workers AI returned an error.";

        const error =
            new Error(
                message
            );

        error.status =
            response.status;

        throw error;
    }

    const result =
        payload?.result ??
        payload;

    /*
       Current FLUX.2 Klein REST output is a Base64
       encoded generated image in result.image.
    */
    let image =
        result?.image ??
        result?.output_image ??
        result?.data ??
        null;

    if (
        image &&
        typeof image ===
            "object"
    ) {
        image =
            image.data ??
            image.image ??
            null;
    }

    if (
        typeof image ===
        "string"
    ) {

        image =
            stripDataPrefix(
                image
            );

        if (
            image
        ) {
            return {
                imageBase64:
                    image,
                imageMimeType:
                    "image/png"
            };
        }
    }

    throw new Error(
        "Cloudflare returned no generated image."
    );
}

async function cloudflareImageOperation(
    prompt,
    media
) {

    const url =
        cloudflareImageUrl();

    const form =
        new FormData();

    form.append(
        "prompt",
        String(
            prompt ||
            (
                media
                    ? "Edit this image professionally."
                    : "Generate a professional image."
            )
        )
    );

    form.append(
        "width",
        "1024"
    );

    form.append(
        "height",
        "1024"
    );

    if (
        media
    ) {

        const prepared =
            await prepareCloudflareImage(
                media
            );

        form.append(
            "input_image_0",
            new Blob(
                [
                    prepared.bytes
                ],
                {
                    type:
                        prepared.mimeType
                }
            ),
            prepared.fileName
        );
    }

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () =>
                controller.abort(),
            IMAGE_TIMEOUT_MS
        );

    try {

        const response =
            await fetch(
                url,
                {
                    method:
                        "POST",
                    headers: {
                        Authorization:
                            `Bearer ${CLOUDFLARE_API_TOKEN}`
                    },
                    body:
                        form,
                    signal:
                        controller.signal
                }
            );

        if (
            !response.ok
        ) {

            let message =
                "";

            try {

                const body =
                    await response.json();

                message =
                    body?.errors
                        ?.map(
                            item =>
                                item?.message
                        )
                        .filter(
                            Boolean
                        )
                        .join(
                            " | "
                        ) ||
                    body?.message ||
                    "";

            } catch {

                message =
                    await response.text();
            }

            const error =
                new Error(
                    message ||
                    `Cloudflare image request failed (${response.status}).`
                );

            error.status =
                response.status;

            throw error;
        }

        return await parseCloudflareResponse(
            response
        );

    } finally {

        clearTimeout(
            timeout
        );
    }
}

/* =========================================================
   FILE EDITING
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
Edit this file professionally.

File:
${media.fileName}

Type:
${media.mimeType}

Instruction:
${instruction}

Rules:
- Return the COMPLETE revised file.
- Preserve valid syntax.
- Preserve structure unless instructed otherwise.
- Do not invent missing information.
- No explanations.
- No Markdown fences.

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
            "The edited file is empty."
        );
    }

    return result;
}

/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(
    error
) {

    const status =
        getStatus(
            error
        );

    if (
        status === 400
    ) {
        return (
            "MechSyntra could not accept this request. Please check the message or image."
        );
    }

    if (
        status === 401 ||
        status === 403
    ) {
        return (
            "AI service authentication failed. Check the API credentials."
        );
    }

    if (
        status === 404
    ) {
        return (
            "The configured AI model or endpoint is unavailable."
        );
    }

    if (
        status === 408
    ) {
        return (
            "The AI request timed out."
        );
    }

    if (
        status === 413
    ) {
        return (
            "The attached media is too large."
        );
    }

    if (
        status === 429
    ) {
        return (
            "The AI service is temporarily rate-limited. Please try again shortly."
        );
    }

    if (
        status >= 500
    ) {
        return (
            "The AI service is temporarily unavailable."
        );
    }

    return (
        error?.message ||
        "MechSyntra AI could not process the request."
    );
}

/* =========================================================
   HEALTH
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
                CLOUDFLARE_IMAGE_MODEL,
            imageProvider:
                "Cloudflare Workers AI",
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

        return res.status(
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
                CLOUDFLARE_IMAGE_MODEL,
            cloudflareConfigured:
                Boolean(
                    CLOUDFLARE_API_TOKEN &&
                    CLOUDFLARE_ACCOUNT_ID
                ),
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
                GEMINI_API_KEY &&
                CLOUDFLARE_API_TOKEN &&
                CLOUDFLARE_ACCOUNT_ID
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
   /chat
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

            /* ---------------- IMAGE GENERATION ---------------- */

            if (
                action ===
                    "generate_image" ||
                action ===
                    "image_generate"
            ) {

                if (
                    !message
                ) {

                    return res.status(
                        400
                    ).json({
                        success:
                            false,
                        error:
                            "Describe the image you want to generate."
                    });
                }

                const result =
                    await cloudflareImageOperation(
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
                        "Image generated successfully by MechSyntra AI.",
                    imageBase64:
                        result.imageBase64,
                    imageMimeType:
                        result.imageMimeType,
                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /* ---------------- IMAGE EDIT ---------------- */

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
                            "Please attach an image for editing."
                    });
                }

                const result =
                    await cloudflareImageOperation(
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
                        "Image edited successfully by MechSyntra AI.",
                    imageBase64:
                        result.imageBase64,
                    imageMimeType:
                        result.imageMimeType,
                    latencyMs:
                        Date.now() -
                        started
                });
            }

            /* ---------------- FILE EDIT ---------------- */

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
                            "Please attach a file."
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

            /* ---------------- NORMAL CHAT ---------------- */

            const contents =
                buildTextContents(
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
                "[MechSyntra] /chat",
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
   /edit-image
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
                await cloudflareImageOperation(
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
                    "Image edited successfully by MechSyntra AI.",
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
   /edit-file
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
                `Image Provider: Cloudflare Workers AI`
            );

            console.log(
                `Image Model: ${CLOUDFLARE_IMAGE_MODEL}`
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
