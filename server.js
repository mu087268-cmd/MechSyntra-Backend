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

/*
   TEXT / MULTIMODAL MODEL

   Used for:
   - normal chat
   - image understanding
   - PDF/document understanding
   - audio understanding
*/
const PRIMARY_MODEL =
    "gemini-3.7-flash";

const FALLBACK_MODEL =
    "gemini-3.6-flash";

/*
   IMAGE MODEL

   Used for:
   - image generation
   - image editing
   - enhancement
   - adding/removing/modifying objects
   - preserving the original image as much as possible
*/
const IMAGE_MODEL =
    "gemini-3.1-flash-image";

/*
   JSON request body limit.

   Android sends media as base64. Keep individual media below
   the application limit; for larger files the Gemini Files API
   should be used instead of inline base64.
*/
const MAX_BODY_SIZE =
    "24mb";

const MAX_MEDIA_BYTES =
    8 * 1024 * 1024;

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
        "Add GEMINI_API_KEY in Vercel:"
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

const ai =
    new GoogleGenAI({
        apiKey:
            GEMINI_API_KEY
    });

/* =========================================================
   EXPRESS
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

Founder:
Usman Choudhary

You are a professional general-purpose AI assistant.

CORE ABILITIES:
- General questions
- Mathematics
- Science
- Technology
- Android development
- Programming
- Business
- Education
- Writing
- Translation
- Engineering
- Image understanding
- PDF/document understanding
- Audio understanding
- Project management

MEDIA RULES:
- If an image is attached, inspect the actual image.
- If a PDF/document is attached, inspect its real contents.
- If audio is attached, use the actual audio when answering.
- Never pretend a file was read when it was not actually supplied.
- Never invent text, measurements, calculations, components, prices, sources,
  test results, or observations.
- Clearly distinguish facts observed in the media from recommendations.

IMAGE EDITING RULES:
- When an image-edit request is explicitly made, the image should be edited,
  not merely described.
- Preserve the original person's face, identity, facial proportions,
  expression, hairstyle, skin texture and important clothing details unless
  the user explicitly asks to change them.
- Change only the requested area/object whenever possible.
- Preserve lighting, perspective, shadows, camera look and background unless
  the user explicitly asks to change them.
- For enhancement, improve clarity, lighting, detail and overall quality
  without changing the person's identity or facial structure.
- For add/remove/replace requests, make the result look naturally photographed.
- Do not add unrelated changes.
- If a requested edit cannot be performed reliably, explain what limitation
  exists instead of pretending it was done.

FILE RULES:
- Read supported text/document content when supplied.
- For text-like files, preserve the original structure unless the user asks
  to change it.
- When asked to edit a text-like file, return the complete revised content.
- Do not claim that a binary file was physically modified unless the server
  actually produced a modified binary file.
- For engineering files, never invent missing technical data.

RESPONSE STYLE:
1. Answer naturally and professionally.
2. Do not return JSON as the user-facing answer.
3. Do not use Markdown heading symbols.
4. Do not use unnecessary bold/italic Markdown.
5. Do not use raw LaTeX.
6. Use readable plain-text formulas.
7. Use bullets only when useful.
8. Never claim an action was completed when it was not.
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

function isImageMime(mimeType) {
    return (
        typeof mimeType === "string" &&
        mimeType.startsWith("image/")
    );
}

function isAudioMime(mimeType) {
    return (
        typeof mimeType === "string" &&
        mimeType.startsWith("audio/")
    );
}

function isSupportedChatMime(mimeType) {
    if (!mimeType) {
        return false;
    }

    if (
        isImageMime(mimeType) ||
        isAudioMime(mimeType)
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

function isEditableTextMime(mimeType) {
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
        comma >= 0
    ) {
        return value
            .slice(comma + 1)
            .trim();
    }

    return value.trim();
}

function decodeBase64(value) {
    const clean =
        stripDataUrlPrefix(
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
        clean.length >
        Math.ceil(
            MAX_MEDIA_BYTES * 1.37
        )
    ) {
        throw new Error(
            "Attached media is too large. Please use a file smaller than 8 MB."
        );
    }

    if (
        !/^[A-Za-z0-9+/=\s]+$/.test(
            clean
        )
    ) {
        throw new Error(
            "Invalid base64 media data."
        );
    }

    const buffer =
        Buffer.from(
            clean,
            "base64"
        );

    if (
        !buffer.length
    ) {
        throw new Error(
            "Could not decode the attached media."
        );
    }

    if (
        buffer.length >
        MAX_MEDIA_BYTES
    ) {
        throw new Error(
            "Attached media is too large. Please use a file smaller than 8 MB."
        );
    }

    return buffer;
}

/* =========================================================
   INPUT
========================================================= */

function getIncomingMedia(body) {
    const base64 =
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

    const mimeType =
        normalizeMimeType(
            body?.mimeType ||
            body?.mediaMimeType ||
            ""
        );

    const fileName =
        typeof body?.fileName ===
            "string"
            ? body.fileName.trim()
            : "Attachment";

    if (
        !base64
    ) {
        return null;
    }

    if (
        !mimeType
    ) {
        throw new Error(
            "MIME type is required for an attachment."
        );
    }

    if (
        !isSupportedChatMime(
            mimeType
        )
    ) {
        throw new Error(
            `Unsupported file type: ${mimeType}`
        );
    }

    const buffer =
        decodeBase64(
            base64
        );

    return {
        base64:
            buffer.toString(
                "base64"
            ),
        buffer,
        mimeType,
        fileName
    };
}

/* =========================================================
   GENERATE-CONTENT INPUT
========================================================= */

function buildChatContents(
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

async function generateText(
    contents
) {
    let lastError =
        null;

    const models = [
        PRIMARY_MODEL,
        FALLBACK_MODEL
    ];

    for (
        const model of models
    ) {
        try {
            console.log(
                "Text model:",
                model
            );

            return await ai.models.generateContent({
                model,
                contents,
                config: {
                    systemInstruction:
                        SYSTEM_INSTRUCTION
                }
            });

        } catch (
            error
        ) {
            lastError =
                error;

            console.error(
                "Text model failed:",
                model,
                error?.message
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
   IMAGE EDIT / GENERATION
========================================================= */

async function generateOrEditImage(
    prompt,
    media
) {
    if (
        !prompt.trim()
    ) {
        throw new Error(
            "An image instruction is required."
        );
    }

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
Edit the provided image according to this instruction:

${prompt}

Professional editing requirements:

- Keep the original person's identity and face unchanged unless the user explicitly asks otherwise.
- Preserve facial proportions, expression and recognizable features.
- Preserve the original camera perspective.
- Preserve the original person's skin tone and natural appearance.
- Preserve lighting and shadows unless the user asks for a change.
- Change only what was requested.
- Make inserted objects match the original scale and perspective.
- Make inserted objects match the original lighting and shadows.
- Make the final image look natural and professionally photographed.
- For enhancement, improve clarity, sharpness, lighting and overall quality
  without changing identity or facial structure.
- Do not add unrelated objects or effects.
                        `.trim()
                }
            ]
            : [
                {
                    type:
                        "text",
                    text:
                        prompt
                }
            ];

    const interaction =
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
        interaction?.output_image?.data
    ) {
        outputImage = {
            data:
                interaction.output_image.data,
            mimeType:
                interaction.output_image.mimeType ||
                "image/png"
        };
    }

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
            "The image model did not return an edited image."
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
}

/* =========================================================
   FILE EDITING
========================================================= */

async function editTextFile(
    fileContent,
    fileName,
    mimeType,
    instruction
) {
    const prompt = `
You are the MechSyntra AI file editor.

File name:
${fileName}

MIME type:
${mimeType}

User instruction:
${instruction}

Edit the file according to the instruction.

RULES:
- Preserve the original structure unless the user asks for restructuring.
- Preserve valid syntax where applicable.
- Do not invent missing data.
- Do not add explanatory commentary.
- Return the COMPLETE revised file content only.
- If the request is ambiguous, make the smallest reasonable change.
- Do not wrap the file in Markdown code fences.

ORIGINAL FILE:
${fileContent}
`.trim();

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
        response?.text
            ?.trim() || "";

    if (
        !edited
    ) {
        throw new Error(
            "Gemini returned an empty edited file."
        );
    }

    return cleanResponse(
        edited
    );
}

/* =========================================================
   STATUS / ERRORS
========================================================= */

function getErrorStatus(
    error
) {
    const status =
        error?.status ??
        error?.code ??
        error?.response?.status ??
        500;

    const number =
        Number(
            status
        );

    return Number.isFinite(
        number
    )
        ? number
        : 500;
}

function friendlyError(
    error
) {
    const status =
        getErrorStatus(
            error
        );

    console.error(
        "Gemini status:",
        status
    );

    console.error(
        "Gemini message:",
        error?.message
    );

    if (
        status === 400
    ) {
        return (
            "Gemini rejected the request. Please check the text, file type or media format."
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
            "Gemini API access was denied. Check your Google AI API key and project permissions."
        );
    }

    if (
        status === 404
    ) {
        return (
            "The configured Gemini model is unavailable for this project."
        );
    }

    if (
        status === 413
    ) {
        return (
            "The attached file is too large. Please use a smaller file."
        );
    }

    if (
        status === 429
    ) {
        return (
            "Gemini usage limit was reached. Please try again shortly."
        );
    }

    if (
        status >= 500
    ) {
        return (
            "Gemini is temporarily unavailable. Please try again in a moment."
        );
    }

    return (
        error?.message ||
        "MechSyntra AI could not complete the request."
    );
}

/* =========================================================
   RESPONSE CLEANING
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
            /`([^`]+)`/g,
            "$1"
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

    return result.trim();
}

/* =========================================================
   HOME / HEALTH
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
                PRIMARY_MODEL,
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
                PRIMARY_MODEL,
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
   CHAT
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

            const action =
                typeof req.body?.action ===
                    "string"
                    ? req.body.action.trim().toLowerCase()
                    : "chat";

            if (
                message.length >
                20000
            ) {
                return res.status(413).json({
                    success:
                        false,
                    error:
                        "Message is too long."
                });
            }

            const media =
                getIncomingMedia(
                    req.body
                );

            /* -----------------------------------------
               IMAGE EDITING
            ----------------------------------------- */

            if (
                action ===
                    "edit_image" ||
                action ===
                    "image_edit"
            ) {

                if (
                    !media ||
                    !isImageMime(
                        media.mimeType
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
                    await generateOrEditImage(
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
                        result.imageMimeType
                });
            }

            /* -----------------------------------------
               IMAGE GENERATION
            ----------------------------------------- */

            if (
                action ===
                    "generate_image"
            ) {

                const result =
                    await generateOrEditImage(
                        message,
                        null
                    );

                return res.status(200).json({
                    success:
                        true,
                    type:
                        "image_generation",
                    reply:
                        result.reply,
                    imageBase64:
                        result.imageBase64,
                    imageMimeType:
                        result.imageMimeType
                });
            }

            /* -----------------------------------------
               FILE EDITING
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

                if (
                    !isEditableTextMime(
                        media.mimeType
                    )
                ) {
                    return res.status(400).json({
                        success:
                            false,
                        error:
                            "This version can edit text-based files. PDF and other binary files can be read/analyzed, but are not physically rewritten here."
                    });
                }

                const original =
                    media.buffer.toString(
                        "utf8"
                    );

                const editedContent =
                    await editTextFile(
                        original,
                        media.fileName,
                        media.mimeType,
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
                    fileContent:
                        editedContent,
                    reply:
                        "File content edited successfully."
                });
            }

            /* -----------------------------------------
               NORMAL MULTIMODAL CHAT
            ----------------------------------------- */

            const contents =
                buildChatContents(
                    message,
                    media
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
                message ||
                    "(media only)"
            );
            console.log(
                "Media:",
                media
                    ? `${media.fileName} (${media.mimeType})`
                    : "none"
            );
            console.log(
                "========================================"
            );

            const response =
                await generateText(
                    contents
                );

            let answer =
                "";

            if (
                typeof response?.text ===
                "string"
            ) {
                answer =
                    response.text.trim();
            }

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

            const status =
                getErrorStatus(
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
                    )
            });
        }
    }
);

/* =========================================================
   DEDICATED IMAGE EDIT ENDPOINT
========================================================= */

app.post(
    "/edit-image",
    async (req, res) => {

        try {

            const prompt =
                typeof req.body?.prompt ===
                    "string"
                    ? req.body.prompt.trim()
                    : typeof req.body?.message ===
                        "string"
                        ? req.body.message.trim()
                        : "";

            const media =
                getIncomingMedia(
                    req.body
                );

            if (
                !media ||
                !isImageMime(
                    media.mimeType
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
                await generateOrEditImage(
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
                    result.imageMimeType
            });

        } catch (
            error
        ) {

            console.error(
                "Image edit error:",
                error
            );

            const status =
                getErrorStatus(
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
                    )
            });
        }
    }
);

/* =========================================================
   DEDICATED FILE EDIT ENDPOINT
========================================================= */

app.post(
    "/edit-file",
    async (req, res) => {

        try {

            const instruction =
                typeof req.body?.prompt ===
                    "string"
                    ? req.body.prompt.trim()
                    : typeof req.body?.message ===
                        "string"
                        ? req.body.message.trim()
                        : "";

            const media =
                getIncomingMedia(
                    req.body
                );

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

            if (
                !isEditableTextMime(
                    media.mimeType
                )
            ) {
                return res.status(400).json({
                    success:
                        false,
                    error:
                        "Only text-based files can be physically rewritten here. PDF and other binary files can still be analyzed."
                });
            }

            const original =
                media.buffer.toString(
                    "utf8"
                );

            const editedContent =
                await editTextFile(
                    original,
                    media.fileName,
                    media.mimeType,
                    instruction
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
                fileContent:
                    editedContent,
                reply:
                    "File edited successfully."
            });

        } catch (
            error
        ) {

            console.error(
                "File edit error:",
                error
            );

            const status =
                getErrorStatus(
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
                    )
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

app.use(
    "/edit-image",
    (req, res) => {
        return res.status(405).json({
            success:
                false,
            error:
                "Use POST /edit-image for image editing."
        });
    }
);

app.use(
    "/edit-file",
    (req, res) => {
        return res.status(405).json({
            success:
                false,
            error:
                "Use POST /edit-file for file editing."
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
            "EXPRESS SERVER ERROR:",
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
            `Local      : http://localhost:${PORT}`
        );

        console.log(
            `Health     : http://localhost:${PORT}/health`
        );

        console.log(
            `Chat       : http://localhost:${PORT}/chat`
        );

        console.log(
            `Edit Image : http://localhost:${PORT}/edit-image`
        );

        console.log(
            `Edit File  : http://localhost:${PORT}/edit-file`
        );

        console.log(
            `Text Model : ${PRIMARY_MODEL}`
        );

        console.log(
            `Image Model: ${IMAGE_MODEL}`
        );

        console.log(
            "Media      : IMAGE / PDF / AUDIO / TEXT"
        );

        console.log(
            "Features   : CHAT / IMAGE EDIT / FILE EDIT"
        );

        console.log(
            "Status     : ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);
