const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

/*
   IMPORTANT:
   Current stable Gemini models.
*/
const PRIMARY_MODEL =
    "gemini-3.6-flash";

const FALLBACK_MODEL =
    "gemini-3.5-flash-lite";

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
        limit: "10mb"
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

Your purpose is to answer users clearly, naturally and professionally.

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
- Everyday questions

IMPORTANT RESPONSE STYLE:

1. Answer like a normal modern AI chat assistant.
2. Use clear readable text.
3. Do NOT return JSON to the user.
4. Do NOT put the whole answer inside quotation marks.
5. Do NOT use markdown heading symbols such as:
   #
   ##
   ###
6. Do NOT use markdown bold syntax such as:
   **
7. Do NOT use markdown italic syntax unnecessarily.
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
13. Do NOT use markdown horizontal rules.
14. Use normal line breaks.
15. Use simple bullet points only when they improve readability.
16. Keep simple questions concise.
17. Give more detail when the question requires it.

MATHEMATICS:

Calculate carefully.

Always verify arithmetic.

For simple calculations, answer clearly.

Example:

Question:
25 × 48

Answer:
25 × 48 = 1200.

For formulas, use readable plain text.

Example:

Simple Interest = (Principal × Rate × Time) / 100

Do not use LaTeX.

IDENTITY:

Your name is MechSyntra AI.

Your founder is Usman Choudhary.

CODING:

Provide practical and correct code.

BUSINESS:

Give realistic and structured advice.

Do not invent facts.

IMPORTANT:

Never claim that you performed an action that you did not actually perform.

Answer naturally and professionally.
`;

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

    if (
        Number.isFinite(
            numericStatus
        )
    ) {

        return numericStatus;
    }

    return 500;
}

/* =========================================================
   ERROR MESSAGE
========================================================= */

function getFriendlyError(error) {

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

    if (
        status === 400
    ) {

        return (
            "Gemini rejected the request. " +
            "Please check the request format and model configuration."
        );
    }

    if (
        status === 401
    ) {

        return (
            "Gemini API authentication failed. " +
            "Check GEMINI_API_KEY in Vercel Production."
        );
    }

    if (
        status === 403
    ) {

        return (
            "Gemini API access was denied. " +
            "Check your Google AI API key and project permissions."
        );
    }

    if (
        status === 404
    ) {

        return (
            "The selected Gemini model is unavailable for this project. " +
            "Please check the configured model."
        );
    }

    if (
        status === 429
    ) {

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
   CLEAN RESPONSE
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

    /* Remove code fences */

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

    /* Remove heading markers */

    result =
        result.replace(
            /^#{1,6}\s*/gm,
            ""
        );

    /* Remove bold */

    result =
        result.replace(
            /\*\*(.*?)\*\*/gs,
            "$1"
        );

    /* Remove underline markdown */

    result =
        result.replace(
            /__(.*?)__/gs,
            "$1"
        );

    /* Remove italic markdown */

    result =
        result.replace(
            /\*(.*?)\*/gs,
            "$1"
        );

    /* Remove inline backticks */

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

    /* Remove horizontal rules */

    result =
        result.replace(
            /^\s*[-*_]{3,}\s*$/gm,
            ""
        );

    /* Math commands */

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

    /* LaTeX text */

    result =
        result.replace(
            /\\text\s*\{([^{}]*)\}/g,
            "$1"
        );

    /* Simple frac */

    result =
        result.replace(
            /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
            "($1) / ($2)"
        );

    /* Remove math dollar signs */

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

    /* Remove left/right */

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

    /* Remove excessive blank lines */

    result =
        result.replace(
            /\n{3,}/g,
            "\n\n"
        );

    /* Remove excessive spaces */

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
    message
) {

    return await ai.models.generateContent({

        model:
            model,

        contents:
            message,

        config: {

            systemInstruction:
                SYSTEM_INSTRUCTION
        }
    });
}

/* =========================================================
   HOME
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

            model:
                PRIMARY_MODEL
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

            model:
                PRIMARY_MODEL
        });
    }
);

/* =========================================================
   CHAT
========================================================= */

app.post(
    "/chat",
    async (req, res) => {

        const incomingMessage =
            req.body?.message;

        /* -----------------------------------------
           VALIDATE INPUT
        ----------------------------------------- */

        if (
            typeof incomingMessage !==
            "string"
        ) {

            return res.status(
                400
            ).json({

                success:
                    false,

                error:
                    "Message is required."
            });
        }

        const message =
            incomingMessage.trim();

        if (
            message.length ===
            0
        ) {

            return res.status(
                400
            ).json({

                success:
                    false,

                error:
                    "Message is required."
            });
        }

        if (
            message.length >
            20000
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

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "MECHSYNTRA AI REQUEST"
        );

        console.log(
            "Message:",
            message
        );

        console.log(
            "Primary model:",
            PRIMARY_MODEL
        );

        let response =
            null;

        let lastError =
            null;

        /* =========================================
           PRIMARY MODEL RETRIES
        ========================================= */

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
                        message
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

                /*
                   Retry only temporary failures.
                */

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
                            1200 * attempt
                        )
                );
            }
        }

        /* =========================================
           FALLBACK MODEL
        ========================================= */

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
                        message
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

        /* =========================================
           BOTH FAILED
        ========================================= */

        if (
            !response
        ) {

            const status =
                getErrorStatus(
                    lastError
                );

            const friendlyMessage =
                getFriendlyError(
                    lastError
                );

            console.error(
                "ALL GEMINI REQUESTS FAILED"
            );

            console.error(
                "Final status:",
                status
            );

            return res.status(
                502
            ).json({

                success:
                    false,

                error:
                    friendlyMessage,

                status:
                    status
            });
        }

        /* =========================================
           EXTRACT RESPONSE TEXT
        ========================================= */

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
            error
        ) {

            console.error(
                "Response extraction error:",
                error?.message
            );
        }

        /* =========================================
           EMPTY RESPONSE
        ========================================= */

        if (
            !answer
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

        /* =========================================
           CLEAN RESPONSE
        ========================================= */

        answer =
            cleanResponse(
                answer
            );

        if (
            !answer
        ) {

            return res.status(
                502
            ).json({

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

        /* =========================================
           SUCCESS
        ========================================= */

        return res.status(
            200
        ).json({

            success:
                true,

            reply:
                answer
        });
    }
);

/* =========================================================
   UNKNOWN ROUTE
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
            "Status : ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);
