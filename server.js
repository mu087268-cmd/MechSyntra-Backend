"use strict";

/*
|--------------------------------------------------------------------------
| MECHSYNTRA AI BACKEND
|--------------------------------------------------------------------------
| Production-oriented Express backend
| Works locally + Vercel serverless
|--------------------------------------------------------------------------
*/

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

/* ==========================================================================
   OPTIONAL DOCUMENT GENERATOR
============================================================================ */

let createWordDocument = null;
let createPdfDocument = null;

try {
  const documentGenerator = require(
    "./features/documentGenerator"
  );

  createWordDocument =
    documentGenerator.createWordDocument;

  createPdfDocument =
    documentGenerator.createPdfDocument;
} catch (error) {
  console.warn(
    "[MechSyntra] Document generator unavailable:",
    error.message
  );
}

/* ==========================================================================
   OPTIONAL PPTX
============================================================================ */

let PptxGenJS = null;

try {
  PptxGenJS = require("pptxgenjs");
} catch (error) {
  console.warn(
    "[MechSyntra] pptxgenjs unavailable. PPTX disabled."
  );
}

/* ==========================================================================
   APP CONFIG
============================================================================ */

const app = express();

app.disable("x-powered-by");

const PORT = Number(
  process.env.PORT || 3000
);

const IS_VERCEL =
  process.env.VERCEL === "1" ||
  !!process.env.VERCEL_ENV;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL ||
  "gemini-3.7-flash";

const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL ||
  "gemini-3.5-flash-lite";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-3.1-flash-image";

const MAX_BODY_SIZE = "24mb";

const MAX_HISTORY_MESSAGES = 40;

const MAX_HISTORY_CHARS = 50000;

const MAX_CONTEXT_CHARS = 18000;

const REQUEST_TIMEOUT_MS = 90000;

const GENERATED_DIR = IS_VERCEL
  ? path.join(
      "/tmp",
      "mechsyntra-generated"
    )
  : path.join(
      __dirname,
      "generated"
    );

const CONVERSATION_FILE = IS_VERCEL
  ? path.join(
      "/tmp",
      "mechsyntra-conversations.json"
    )
  : path.join(
      __dirname,
      "conversation-state.json"
    );

/* ==========================================================================
   GEMINI CLIENT
============================================================================ */

let aiClient = null;

function getGeminiClient() {
  const key =
    process.env.GEMINI_API_KEY ||
    GEMINI_API_KEY;

  if (!key) {
    const error = new Error(
      "GEMINI_API_KEY is not configured on the server."
    );

    error.status = 500;
    error.code =
      "MECHSYNTRA_MISSING_API_KEY";

    throw error;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
    });
  }

  return aiClient;
}

/* ==========================================================================
   DIRECTORY INITIALIZATION
============================================================================ */

function ensureDirectory() {
  try {
    fs.mkdirSync(
      GENERATED_DIR,
      {
        recursive: true,
      }
    );

    return true;
  } catch (error) {
    console.error(
      "[MechSyntra] Generated directory error:",
      error
    );

    return false;
  }
}

ensureDirectory();

/* ==========================================================================
   EXPRESS MIDDLEWARE
============================================================================ */

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  })
);

app.use(
  express.json({
    limit: MAX_BODY_SIZE,
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: MAX_BODY_SIZE,
  })
);

/*
 * This directory is useful locally.
 * On Vercel files are temporary and should
 * primarily be returned directly as base64.
 */

app.use(
  "/generated",
  express.static(
    GENERATED_DIR
  )
);

/* ==========================================================================
   HELPERS
============================================================================ */

function cleanString(value) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value.trim();
}

function makeId(
  prefix = "id"
) {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(5)
    .toString("hex")}`;
}

function normalizeMimeType(
  value
) {
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

function removeDataUrlPrefix(
  value
) {
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
      .slice(
        comma + 1
      )
      .trim();
  }

  return value.trim();
}

function validBase64(
  value
) {
  const clean =
    removeDataUrlPrefix(
      value
    );

  return (
    !!clean &&
    /^[A-Za-z0-9+/=\s]+$/.test(
      clean
    )
  );
}

function isSupportedMime(
  mime
) {
  return (
    mime.startsWith(
      "image/"
    ) ||
    mime.startsWith(
      "audio/"
    ) ||
    mime ===
      "application/pdf" ||
    [
      "text/plain",
      "text/csv",
      "text/html",
      "text/css",
      "text/markdown",
      "text/xml",
      "application/json",
      "application/rtf",
    ].includes(mime)
  );
}

function safeFileName(
  name,
  fallback =
    "MechSyntra_Document"
) {
  const value = String(
    name || fallback
  )
    .replace(
      /[\\/:*?"<>|]/g,
      "_"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

  return (
    value || fallback
  ).slice(
    0,
    100
  );
}

function cleanText(
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
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function clamp(
  value,
  min,
  max,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      number
    )
  );
}

/* ==========================================================================
   ERROR HELPERS
============================================================================ */

function getErrorStatus(
  error
) {
  const status =
    Number(
      error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        500
    );

  if (
    Number.isFinite(status) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }

  return 500;
}

function getErrorMessage(
  error
) {
  if (!error) {
    return "Unknown error.";
  }

  if (
    typeof error === "string"
  ) {
    return error;
  }

  if (
    typeof error.message ===
    "string"
  ) {
    return error.message;
  }

  try {
    return JSON.stringify(
      error
    );
  } catch (_) {
    return "Unknown error.";
  }
}

function friendlyError(
  error
) {
  const status =
    getErrorStatus(
      error
    );

  const message =
    getErrorMessage(
      error
    );

  console.error(
    "[MechSyntra]",
    status,
    message
  );

  if (
    message.includes(
      "GEMINI_API_KEY"
    )
  ) {
    return (
      "Gemini API key is not configured on the server."
    );
  }

  if (
    message.includes(
      "no longer available"
    )
  ) {
    return (
      "The configured Gemini model is no longer available."
    );
  }

  if (
    message.includes(
      "NOT_FOUND"
    )
  ) {
    return (
      "The configured Gemini model is unavailable."
    );
  }

  if (status === 400) {
    return (
      "Gemini rejected the request. Check the request or attachment."
    );
  }

  if (status === 401) {
    return (
      "Gemini authentication failed. Check GEMINI_API_KEY."
    );
  }

  if (status === 403) {
    return (
      "Gemini access was denied for this project."
    );
  }

  if (status === 404) {
    return (
      "The requested Gemini model or endpoint is unavailable."
    );
  }

  if (status === 413) {
    return (
      "The request or attachment is too large."
    );
  }

  if (status === 429) {
    return (
      "Gemini is rate limited. Please try again shortly."
    );
  }

  if (
    message
      .toLowerCase()
      .includes("timeout")
  ) {
    return (
      "The AI request timed out. Please try again."
    );
  }

  return (
    "MechSyntra AI could not complete the request."
  );
}

/* ==========================================================================
   TIMEOUT
============================================================================ */

function withTimeout(
  promise,
  milliseconds,
  label
) {
  let timer = null;

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timer =
          setTimeout(
            () => {
              const error =
                new Error(
                  `${label || "Request"} timed out after ${milliseconds}ms.`
                );

              error.code =
                "MECHSYNTRA_TIMEOUT";

              reject(error);
            },
            milliseconds
          );
      }
    );

  return Promise.race([
    Promise.resolve(
      promise
    ).finally(() => {
      if (timer) {
        clearTimeout(
          timer
        );
      }
    }),

    timeoutPromise,
  ]);
}

/* ==========================================================================
   SYSTEM INSTRUCTION
============================================================================ */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI, a professional AI assistant and project copilot.

Founder:
Usman Choudhary.

You must understand continuous conversations rather than treating every
message as a new independent question.

CURRENT CONVERSATION RULES:

If you asked:
"What is the presentation topic?"

and the user replies:
"Artificial Intelligence"

understand that the user answered your question.

Do NOT restart the conversation.

Do NOT ask what the user wants to do with Artificial Intelligence.

Continue the active task.

Understand:

this
that
it
same
previous
above
continue
do it
generate it
make it
change it
my project
the project
the report
the presentation
the component

using current conversation context and project context.

Latest explicit user instruction always has priority.

Never fabricate:

research papers
citations
DOIs
prices
suppliers
availability
technical specifications
experimental results
measurements

For engineering requests distinguish:

KNOWN INFORMATION
ASSUMPTIONS
CALCULATIONS
RECOMMENDATION

For proposed engineering designs use:
"Recommended Design"

For component recommendations use:
"Recommendation to verify"

Never claim test results that were not provided.

When information is missing, ask only the next necessary question.

The user should not have to repeatedly explain the same project.

PROJECT COPILOT:

Help with:

Project Definition
Requirements
Research
Research Papers
Research Gap
Components
Component Sourcing
Design
Wiring
Assembly
Programming
Engineering Calculations
Testing
Troubleshooting
Optimization
Documentation
Final Report

PROJECT CONTEXT:

Use the current project information when supplied.

CONTEXT PRIORITY:

1. Latest explicit user instruction
2. Active task
3. Conversation context
4. Previously collected information
5. Current project information
6. Older relevant history

For presentations:

If the user says:
"Generate presentation"

and the topic is not known,
ask for the topic.

Once the topic is supplied, continue the presentation workflow.

For documents and presentations:
create the requested content when the application endpoint supports generation.

Never falsely claim that a file was generated.

Reply in the same language as the user's latest message.

Be professional, direct and concise when possible.
`;

/* ==========================================================================
   MEDIA PARSER
============================================================================ */

function parseMedia(
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
    normalizeMimeType(
      body?.mimeType ||
        body?.mediaMimeType ||
        ""
    );

  if (!mimeType) {
    throw new Error(
      "MIME type is required."
    );
  }

  if (
    !isSupportedMime(
      mimeType
    )
  ) {
    throw new Error(
      `Unsupported media type: ${mimeType}`
    );
  }

  const data =
    removeDataUrlPrefix(
      raw
    );

  if (!validBase64(data)) {
    throw new Error(
      "Invalid media data."
    );
  }

  if (
    data.length >
    14 * 1024 * 1024
  ) {
    throw new Error(
      "Attachment is too large."
    );
  }

  return {
    data,
    mimeType,

    fileName:
      safeFileName(
        body?.fileName ||
          "attachment",
        "attachment"
      ),
  };
}

/* ==========================================================================
   HISTORY
============================================================================ */

function parseHistory(
  history
) {
  if (
    !Array.isArray(
      history
    )
  ) {
    return [];
  }

  const output = [];

  let totalChars = 0;

  for (
    const item of history.slice(
      -MAX_HISTORY_MESSAGES
    )
  ) {
    const role =
      item?.role ===
      "model"
        ? "model"
        : "user";

    const text =
      cleanString(
        item?.text ??
          item?.message ??
          item?.content ??
          ""
      );

    if (!text) {
      continue;
    }

    if (
      totalChars + text.length >
      MAX_HISTORY_CHARS
    ) {
      break;
    }

    output.push({
      role,
      parts: [
        {
          text,
        },
      ],
    });

    totalChars +=
      text.length;
  }

  return output;
}

/* ==========================================================================
   CONVERSATION STATE
============================================================================ */

const conversationStore =
  new Map();

function newConversationState(
  conversationId
) {
  return {
    conversationId,

    currentIntent: "",

    currentTask: "",

    currentSubTask: "",

    waitingFor: "",

    conversationGoal: "",

    collectedInformation: {},

    missingInformation: [],

    lastUserMessage: "",

    lastAIQuestion: "",

    lastAIResponse: "",

    nextExpectedAction: "",

    currentProjectId: "",

    currentArtifactId: "",

    currentArtifact: null,

    projectContext: {},

    updatedAt:
      new Date().toISOString(),
  };
}

function getConversation(
  conversationId
) {
  const id =
    cleanString(
      conversationId
    ) || "default";

  if (
    !conversationStore.has(
      id
    )
  ) {
    conversationStore.set(
      id,
      newConversationState(
        id
      )
    );
  }

  return conversationStore.get(
    id
  );
}

function saveConversationStore() {
  try {
    fs.writeFileSync(
      CONVERSATION_FILE,
      JSON.stringify(
        Object.fromEntries(
          conversationStore
        ),
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    /*
     * Vercel storage is temporary.
     * Failure here must never crash chat.
     */
    console.warn(
      "[MechSyntra] Conversation persistence warning:",
      error.message
    );
  }
}

function loadConversationStore() {
  try {
    if (
      !fs.existsSync(
        CONVERSATION_FILE
      )
    ) {
      return;
    }

    const parsed =
      JSON.parse(
        fs.readFileSync(
          CONVERSATION_FILE,
          "utf8"
        )
      );

    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {
      return;
    }

    for (
      const [
        id,
        state,
      ] of Object.entries(
        parsed
      )
    ) {
      conversationStore.set(
        id,
        {
          ...newConversationState(
            id
          ),
          ...state,
        }
      );
    }
  } catch (error) {
    console.warn(
      "[MechSyntra] Could not load conversation state:",
      error.message
    );
  }
}

loadConversationStore();

/* ==========================================================================
   PROJECT CONTEXT
============================================================================ */

function readProjectContext(
  body
) {
  const project =
    body?.projectContext;

  if (
    !project ||
    typeof project !==
      "object"
  ) {
    return {};
  }

  return {
    projectId:
      cleanString(
        project.projectId
      ),

    projectName:
      cleanString(
        project.projectName ||
          project.name
      ),

    description:
      cleanString(
        project.description
      ),

    objective:
      cleanString(
        project.objective
      ),

    problem:
      cleanString(
        project.problem
      ),

    projectType:
      cleanString(
        project.projectType
      ),

    currentStage:
      cleanString(
        project.currentStage
      ),

    status:
      cleanString(
        project.status
      ),

    health:
      cleanString(
        project.health
      ),

    expectedOutcome:
      cleanString(
        project.expectedOutcome
      ),

    components:
      Array.isArray(
        project.components
      )
        ? project.components
        : [],

    requirements:
      Array.isArray(
        project.requirements
      )
        ? project.requirements
        : [],

    additionalContext:
      cleanString(
        project.additionalContext
      ),
  };
}

/* ==========================================================================
   INTENT DETECTION
============================================================================ */

function detectIntent(
  message,
  state
) {
  const text =
    message
      .toLowerCase()
      .trim();

  /*
   * If the AI is explicitly waiting for an answer,
   * preserve the current intent.
   */

  if (
    state.waitingFor &&
    state.currentIntent
  ) {
    return {
      intent:
        state.currentIntent,

      isAnswer:
        true,
    };
  }

  if (
    /\b(generate|create|make|build)\b/.test(
      text
    ) &&
    /\bpresentation\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Generate Presentation",

      isAnswer:
        false,
    };
  }

  if (
    /\b(generate|create|make|write)\b/.test(
      text
    ) &&
    /\b(report|assignment|document)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Generate Document",

      isAnswer:
        false,
    };
  }

  if (
    /\bresearch\b/.test(
      text
    ) ||
    /\bresearch papers?\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Research",

      isAnswer:
        false,
    };
  }

  if (
    /\b(component|motor|sensor|module|parts?)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Component Assistance",

      isAnswer:
        false,
    };
  }

  if (
    /\b(design|architecture)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Design Guidance",

      isAnswer:
        false,
    };
  }

  if (
    /\b(wiring|wire|pin|connection|connect)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Wiring Guidance",

      isAnswer:
        false,
    };
  }

  if (
    /\b(calculation|calculate|torque|stress|strain|rpm)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Engineering Calculation",

      isAnswer:
        false,
    };
  }

  if (
    /\b(test|testing|validation)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Testing",

      isAnswer:
        false,
    };
  }

  if (
    /\b(troubleshoot|not working|error|fault)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Troubleshooting",

      isAnswer:
        false,
    };
  }

  if (
    /\b(image|photo|picture)\b/.test(
      text
    ) &&
    /\b(generate|create|edit)\b/.test(
      text
    )
  ) {
    return {
      intent:
        "Image Task",

      isAnswer:
        false,
    };
  }

  return {
    intent:
      state.currentIntent ||
      "General Conversation",

    isAnswer:
      false,
  };
}

/* ==========================================================================
   CONTEXT PROMPT
============================================================================ */

function buildConversationContext(
  state
) {
  const collected =
    JSON.stringify(
      state.collectedInformation ||
        {},
      null,
      2
    );

  const missing =
    JSON.stringify(
      state.missingInformation ||
        [],
      null,
      2
    );

  const project =
    JSON.stringify(
      state.projectContext ||
        {},
      null,
      2
    );

  const context = `
CURRENT MECHSYNTRA CONVERSATION STATE

conversationId:
${state.conversationId}

currentIntent:
${state.currentIntent || "none"}

currentTask:
${state.currentTask || "none"}

currentSubTask:
${state.currentSubTask || "none"}

waitingFor:
${state.waitingFor || "none"}

conversationGoal:
${state.conversationGoal || "none"}

lastUserMessage:
${state.lastUserMessage || "none"}

lastAIQuestion:
${state.lastAIQuestion || "none"}

nextExpectedAction:
${state.nextExpectedAction || "none"}

currentProjectId:
${state.currentProjectId || "none"}

currentArtifactId:
${state.currentArtifactId || "none"}

collectedInformation:
${collected}

missingInformation:
${missing}

projectContext:
${project}

RULE:
If waitingFor has a value and the latest message is a plausible answer,
interpret the message as the answer instead of treating it as a new request.

Do not make the user repeat the original request.

The latest explicit instruction has priority.
`;

  return context.slice(
    0,
    MAX_CONTEXT_CHARS
  );
}

/* ==========================================================================
   BODY PARTS FOR GEMINI
============================================================================ */

function buildParts(
  message,
  media
) {
  const parts = [];

  if (message) {
    parts.push({
      text: message,
    });
  }

  if (media) {
    parts.push({
      text:
        `Attached file: ${media.fileName}`,
    });

    parts.push({
      inlineData: {
        mimeType:
          media.mimeType,

        data:
          media.data,
      },
    });
  }

  if (!parts.length) {
    throw new Error(
      "Message or media is required."
    );
  }

  return parts;
}

/* ==========================================================================
   TEXT GENERATION
============================================================================ */

async function generateText(
  contents,
  model
) {
  const client =
    getGeminiClient();

  return withTimeout(
    client.models.generateContent(
      {
        model:
          model ||
          TEXT_MODEL,

        contents,

        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
        },
      }
    ),
    REQUEST_TIMEOUT_MS,
    `Gemini ${model}`
  );
}

async function generateTextWithFallback(
  contents
) {
  let primaryError =
    null;

  try {
    console.log(
      `[MechSyntra] Primary model: ${TEXT_MODEL}`
    );

    return await generateText(
      contents,
      TEXT_MODEL
    );
  } catch (error) {
    primaryError =
      error;

    console.error(
      "[MechSyntra] Primary model failed:",
      getErrorMessage(
        error
      )
    );
  }

  if (
    !FALLBACK_MODEL ||
    FALLBACK_MODEL ===
      TEXT_MODEL
  ) {
    throw primaryError;
  }

  try {
    console.log(
      `[MechSyntra] Fallback model: ${FALLBACK_MODEL}`
    );

    return await generateText(
      contents,
      FALLBACK_MODEL
    );
  } catch (fallbackError) {
    const combined =
      new Error(
        "Both Gemini text models failed."
      );

    combined.status =
      getErrorStatus(
        fallbackError
      );

    combined.primary =
      getErrorMessage(
        primaryError
      );

    combined.fallback =
      getErrorMessage(
        fallbackError
      );

    throw combined;
  }
}

function extractResponseText(
  response
) {
  try {
    return cleanText(
      response?.text ||
        ""
    );
  } catch (_) {
    return "";
  }
}

/* ==========================================================================
   IMAGE GENERATION / EDITING
============================================================================ */

async function generateImage(
  prompt,
  media
) {
  const client =
    getGeminiClient();

  const input = [];

  if (media) {
    input.push({
      type: "image",

      mime_type:
        media.mimeType,

      data:
        media.data,
    });
  }

  input.push({
    type: "text",

    text:
      prompt ||
      (
        media
          ? "Edit the supplied image according to the user's instructions."
          : "Generate the requested image."
      ),
  });

  const interaction =
    await withTimeout(
      client.interactions.create(
        {
          model:
            IMAGE_MODEL,

          input,

          response_format: {
            type: "image",
            image_size: "2K",
          },
        }
      ),
      REQUEST_TIMEOUT_MS,
      "Image generation"
    );

  let imageBase64 =
    "";

  let imageMimeType =
    "image/png";

  let text =
    "";

  for (
    const step of
      interaction?.steps ||
      []
  ) {
    if (
      step?.type !==
      "model_output"
    ) {
      continue;
    }

    for (
      const block of
        step?.content ||
        []
    ) {
      if (
        block?.type ===
        "text"
      ) {
        text +=
          `${block.text || ""}\n`;
      }

      if (
        block?.type ===
          "image" &&
        block?.data
      ) {
        imageBase64 =
          block.data;

        imageMimeType =
          block.mime_type ||
          block.mimeType ||
          "image/png";
      }
    }
  }

  if (!imageBase64) {
    throw new Error(
      "The image model returned no image."
    );
  }

  return {
    reply:
      cleanText(text) ||
      (
        media
          ? "Image edited successfully."
          : "Image generated successfully."
      ),

    imageBase64,

    imageMimeType,
  };
}

/* ==========================================================================
   FILE HELPERS
============================================================================ */

function readFileBase64(
  filePath
) {
  return fs
    .readFileSync(
      filePath
    )
    .toString(
      "base64"
    );
}

function generatedFile(
  type,
  fileName,
  mimeType
) {
  const fullPath =
    path.join(
      GENERATED_DIR,
      fileName
    );

  if (
    !fs.existsSync(
      fullPath
    )
  ) {
    throw new Error(
      `Generated file does not exist: ${fileName}`
    );
  }

  return {
    type,

    fileName,

    mimeType,

    dataBase64:
      readFileBase64(
        fullPath
      ),
  };
}

/* ==========================================================================
   DOCUMENT FILES
============================================================================ */

async function makeDocuments(
  title,
  content,
  format = "both",
  fileName
) {
  if (
    !createWordDocument &&
    !createPdfDocument
  ) {
    throw new Error(
      "Document generator is not available."
    );
  }

  const results = [];

  const baseName =
    safeFileName(
      fileName ||
        title
    );

  if (
    (
      format === "word" ||
      format === "both"
    ) &&
    createWordDocument
  ) {
    const word =
      await createWordDocument(
        {
          title,
          content,
          fileName:
            baseName,
          outputDir:
            GENERATED_DIR,
        }
      );

    const wordName =
      word?.fileName ||
      word?.name ||
      `${baseName}.docx`;

    const wordMime =
      word?.mimeType ||
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    results.push(
      generatedFile(
        "word",
        wordName,
        wordMime
      )
    );
  }

  if (
    (
      format === "pdf" ||
      format === "both"
    ) &&
    createPdfDocument
  ) {
    const pdf =
      await createPdfDocument(
        {
          title,
          content,
          fileName:
            baseName,
          outputDir:
            GENERATED_DIR,
        }
      );

    const pdfName =
      pdf?.fileName ||
      pdf?.name ||
      `${baseName}.pdf`;

    const pdfMime =
      pdf?.mimeType ||
      "application/pdf";

    results.push(
      generatedFile(
        "pdf",
        pdfName,
        pdfMime
      )
    );
  }

  if (!results.length) {
    throw new Error(
      "Requested document format is unavailable."
    );
  }

  return results;
}

/* ==========================================================================
   PPTX
============================================================================ */

async function makePresentation(
  title,
  content,
  fileName
) {
  if (!PptxGenJS) {
    throw new Error(
      "PPTX generation is not installed."
    );
  }

  const pptx =
    new PptxGenJS();

  pptx.layout =
    "LAYOUT_WIDE";

  pptx.author =
    "MechSyntra AI";

  pptx.company =
    "MechSyntra AI";

  pptx.subject =
    title;

  pptx.title =
    title;

  pptx.lang =
    "en-US";

  const lines =
    cleanText(content)
      .split(/\n+/)
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const slides = [];

  let current = [];

  for (
    const line of lines
  ) {
    if (
      (
        /^slide\s+\d+/i.test(
          line
        ) ||
        /^\d+\./.test(
          line
        )
      ) &&
      current.length
    ) {
      slides.push(
        current
      );

      current = [];
    }

    current.push(
      line
    );

    if (
      current.join(
        " "
      ).length >
      1100
    ) {
      slides.push(
        current
      );

      current = [];
    }
  }

  if (
    current.length
  ) {
    slides.push(
      current
    );
  }

  if (!slides.length) {
    slides.push([
      title,
    ]);
  }

  slides
    .slice(
      0,
      20
    )
    .forEach(
      (
        slideLines,
        index
      ) => {
        const slide =
          pptx.addSlide();

        slide.background =
          {
            color:
              "080B12",
          };

        const heading =
          index === 0
            ? title
            : slideLines[0];

        const body =
          (
            slideLines
              .slice(1)
              .join(
                "\n\n"
              )
          ) ||
          slideLines.join(
            "\n"
          );

        slide.addText(
          heading,
          {
            x: 0.6,
            y: 0.5,
            w: 12.0,
            h: 0.8,
            fontFace:
              "Aptos Display",
            fontSize: 26,
            bold: true,
            color:
              "3B82F6",
            margin: 0,
          }
        );

        slide.addText(
          body,
          {
            x: 0.75,
            y: 1.5,
            w: 11.7,
            h: 5.2,
            fontFace:
              "Aptos",
            fontSize: 18,
            color:
              "F5F7FA",
            valign:
              "top",
            margin:
              0.04,
          }
        );

        slide.addText(
          `MECHSYNTRA AI  •  ${
            index + 1
          }`,
          {
            x: 0.75,
            y: 7.0,
            w: 11.6,
            h: 0.25,
            fontSize: 8,
            color:
              "8B96A8",
            margin: 0,
          }
        );
      }
    );

  const outputName =
    `${safeFileName(
      fileName ||
        title
    )}.pptx`;

  const outputPath =
    path.join(
      GENERATED_DIR,
      outputName
    );

  await pptx.writeFile(
    {
      fileName:
        outputPath,
    }
  );

  return generatedFile(
    "pptx",
    outputName,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}

/* ==========================================================================
   AI DOCUMENT CONTENT
============================================================================ */

async function generateDocumentContent(
  {
    prompt,
    language = "English",
    slides = 8,
    pages = 5,
    presentation = false,
  }
) {
  const instruction =
    presentation
      ? `
Create a professional presentation.

Topic:
${prompt}

Slides:
${clamp(
  slides,
  3,
  20,
  8
)}

Language:
${language}

Return slide-ready content.

Use:
1. Clear titles
2. Concise points
3. Logical flow
4. Practical examples
5. Conclusion

Do not return an essay.
Do not invent experimental results.
Do not invent references.
`
      : `
Create a professional academic document.

Topic:
${prompt}

Language:
${language}

Target pages:
${clamp(
  pages,
  1,
  50,
  5
)}

Include:
- Title
- Introduction
- Main sections
- Examples when useful
- Conclusion

Only include reliable references.
Do not invent references.
`;

  const response =
    await generateTextWithFallback(
      [
        {
          role:
            "user",

          parts:
            [
              {
                text:
                  instruction,
              },
            ],
        },
      ]
    );

  const content =
    extractResponseText(
      response
    );

  if (!content) {
    throw new Error(
      "Gemini returned empty content."
    );
  }

  return content;
}

/* ==========================================================================
   ROOT
============================================================================ */

app.get(
  "/",
  (_req, res) => {
    res.json({
      success:
        true,

      service:
        "MechSyntra AI",

      status:
        "online",

      environment:
        IS_VERCEL
          ? "vercel"
          : "local",

      textModel:
        TEXT_MODEL,

      fallbackTextModel:
        FALLBACK_MODEL,

      imageModel:
        IMAGE_MODEL,

      multimodal:
        true,

      documents:
        !!(
          createWordDocument ||
          createPdfDocument
        ),

      presentations:
        !!PptxGenJS,

      conversationContext:
        true,

      projectCopilot:
        true,
    });
  }
);

/* ==========================================================================
   HEALTH
============================================================================ */

app.get(
  "/health",
  (_req, res) => {
    res.json({
      success:
        true,

      status:
        "healthy",

      environment:
        IS_VERCEL
          ? "vercel"
          : "local",

      textModel:
        TEXT_MODEL,

      fallbackTextModel:
        FALLBACK_MODEL,

      imageModel:
        IMAGE_MODEL,

      multimodal:
        true,

      documents:
        !!(
          createWordDocument ||
          createPdfDocument
        ),

      presentations:
        !!PptxGenJS,

      assignment:
        true,

      conversationContext:
        true,

      projectCopilot:
        true,

      writableStorage:
        GENERATED_DIR,
    });
  }
);

/* ==========================================================================
   CONVERSATION STATE
============================================================================ */

app.get(
  "/conversation/:conversationId",
  (
    req,
    res
  ) => {
    const id =
      cleanString(
        req.params
          .conversationId
      );

    if (!id) {
      return res
        .status(400)
        .json({
          success:
            false,

          error:
            "Conversation ID is required.",
        });
    }

    const state =
      getConversation(
        id
      );

    return res.json({
      success:
        true,

      state,
    });
  }
);

/* ==========================================================================
   ASSIGNMENT
============================================================================ */

app.post(
  "/generate-assignment",
  async (
    req,
    res
  ) => {
    try {
      const topic =
        cleanString(
          req.body?.topic
        );

      if (!topic) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Assignment topic is required.",
          });
      }

      const format =
        [
          "word",
          "pdf",
          "both",
        ].includes(
          req.body?.format
        )
          ? req.body.format
          : "both";

      const content =
        await generateDocumentContent(
          {
            prompt:
              topic,

            language:
              req.body?.language ||
              "English",

            pages:
              req.body?.pages ||
              5,

            presentation:
              false,
          }
        );

      const files =
        await makeDocuments(
          topic,
          content,
          format,
          req.body?.fileName
        );

      return res.json({
        success:
          true,

        type:
          "assignment_generation",

        title:
          topic,

        content,

        files,

        reply:
          "Your assignment has been generated successfully.",
      });
    } catch (error) {
      console.error(
        "/generate-assignment:",
        error
      );

      return res
        .status(
          getErrorStatus(
            error
          )
        )
        .json({
          success:
            false,

          error:
            friendlyError(
              error
            ),
        });
    }
  }
);

/* ==========================================================================
   DOCUMENT
============================================================================ */

app.post(
  "/generate-document",
  async (
    req,
    res
  ) => {
    try {
      const content =
        cleanString(
          req.body?.content
        );

      if (!content) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Document content is required.",
          });
      }

      const format =
        [
          "word",
          "pdf",
          "both",
        ].includes(
          req.body?.format
        )
          ? req.body.format
          : "both";

      const title =
        cleanString(
          req.body?.title
        ) ||
        "MechSyntra Document";

      const files =
        await makeDocuments(
          title,
          content,
          format,
          req.body?.fileName
        );

      return res.json({
        success:
          true,

        type:
          "document_generation",

        files,
      });
    } catch (error) {
      console.error(
        "/generate-document:",
        error
      );

      return res
        .status(
          getErrorStatus(
            error
          )
        )
        .json({
          success:
            false,

          error:
            friendlyError(
              error
            ),
        });
    }
  }
);

/* ==========================================================================
   PRESENTATION
============================================================================ */

app.post(
  "/generate-presentation",
  async (
    req,
    res
  ) => {
    try {
      const topic =
        cleanString(
          req.body?.topic
        );

      if (!topic) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Presentation topic is required.",
          });
      }

      const content =
        await generateDocumentContent(
          {
            prompt:
              topic,

            language:
              req.body?.language ||
              "English",

            slides:
              req.body?.slides ||
              8,

            presentation:
              true,
          }
        );

      const file =
        await makePresentation(
          topic,
          content,
          req.body?.fileName
        );

      return res.json({
        success:
          true,

        type:
          "presentation_generation",

        content,

        files:
          [file],

        reply:
          "Your presentation has been generated successfully.",
      });
    } catch (error) {
      console.error(
        "/generate-presentation:",
        error
      );

      return res
        .status(
          getErrorStatus(
            error
          )
        )
        .json({
          success:
            false,

          error:
            friendlyError(
              error
            ),
        });
    }
  }
);

/* ==========================================================================
   CHAT
============================================================================ */

app.post(
  "/chat",
  async (
    req,
    res
  ) => {
    const requestId =
      makeId(
        "chat"
      );

    try {
      const body =
        req.body ||
        {};

      const message =
        cleanString(
          body.message
        );

      const conversationId =
        cleanString(
          body.conversationId
        ) ||
        "default";

      const action =
        cleanString(
          body.action
        ).toLowerCase() ||
        "chat";

      if (
        message.length >
        20000
      ) {
        return res
          .status(413)
          .json({
            success:
              false,

            error:
              "Message is too long.",

            requestId,
          });
      }

      const media =
        parseMedia(
          body
        );

      /* ------------------------------------------------------------------
         IMAGE GENERATION
      ------------------------------------------------------------------ */

      if (
        action ===
          "generate_image" ||
        action ===
          "image_generate"
      ) {
        if (!message) {
          return res
            .status(400)
            .json({
              success:
                false,

              error:
                "Describe the image you want to generate.",

              requestId,
            });
        }

        const result =
          await generateImage(
            message,
            null
          );

        return res.json({
          success:
            true,

          type:
            "image_generation",

          requestId,

          ...result,
        });
      }

      /* ------------------------------------------------------------------
         IMAGE EDITING
      ------------------------------------------------------------------ */

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
          return res
            .status(400)
            .json({
              success:
                false,

              error:
                "Please attach an image for image editing.",

              requestId,
            });
        }

        const result =
          await generateImage(
            message ||
              "Edit this image as requested.",
            media
          );

        return res.json({
          success:
            true,

          type:
            "image_edit",

          requestId,

          ...result,
        });
      }

      /* ------------------------------------------------------------------
         DOCUMENT GENERATION
      ------------------------------------------------------------------ */

      if (
        action ===
        "generate_document"
      ) {
        if (!message) {
          return res
            .status(400)
            .json({
              success:
                false,

              error:
                "Document request is required.",

              requestId,
            });
        }

        const format =
          [
            "word",
            "pdf",
            "both",
          ].includes(
            body.format
          )
            ? body.format
            : "both";

        const content =
          await generateDocumentContent(
            {
              prompt:
                message,

              language:
                body.language ||
                "English",

              pages:
                body.pages ||
                5,

              presentation:
                false,
            }
          );

        const files =
          await makeDocuments(
            body.title ||
              message,

            content,

            format,

            body.fileName
          );

        return res.json({
          success:
            true,

          type:
            "document_generation",

          requestId,

          content,

          files,

          reply:
            "Your document has been generated successfully.",
        });
      }

      /* ------------------------------------------------------------------
         PRESENTATION GENERATION
      ------------------------------------------------------------------ */

      if (
        action ===
        "generate_presentation"
      ) {
        if (!message) {
          return res
            .status(400)
            .json({
              success:
                false,

              error:
                "Presentation request is required.",

              requestId,
            });
        }

        const content =
          await generateDocumentContent(
            {
              prompt:
                message,

              language:
                body.language ||
                "English",

              slides:
                body.slides ||
                8,

              presentation:
                true,
            }
          );

        const file =
          await makePresentation(
            body.title ||
              message,

            content,

            body.fileName
          );

        return res.json({
          success:
            true,

          type:
            "presentation_generation",

          requestId,

          content,

          files:
            [file],

          reply:
            "Your presentation has been generated successfully.",
        });
      }

      /* ------------------------------------------------------------------
         NORMAL CHAT
      ------------------------------------------------------------------ */

      if (
        !message &&
        !media
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Message or media is required.",

            requestId,
          });
      }

      const state =
        getConversation(
          conversationId
        );

      /* Project context */

      const incomingProject =
        readProjectContext(
          body
        );

      if (
        Object.keys(
          incomingProject
        ).length
      ) {
        state.projectContext =
          {
            ...state.projectContext,
            ...incomingProject,
          };

        if (
          incomingProject.projectId
        ) {
          state.currentProjectId =
            incomingProject.projectId;
        }
      }

      /* Detect intent */

      const intent =
        detectIntent(
          message,
          state
        );

      if (
        intent.intent
      ) {
        state.currentIntent =
          intent.intent;
      }

      /* Resolve answer to previous question */

      if (
        intent.isAnswer &&
        state.waitingFor
      ) {
        const waitingField =
          state.waitingFor;

        /*
         * Special resolution:
         * "My project" means current project.
         */

        let value =
          message;

        if (
          /^my project$/i.test(
            message
          ) &&
          state.projectContext
            ?.projectName
        ) {
          value =
            state.projectContext
              .projectName;
        }

        state.collectedInformation[
          waitingField
        ] = value;

        state.waitingFor =
          "";

        state.missingInformation =
          state.missingInformation.filter(
            (item) =>
              item !==
              waitingField
          );
      }

      state.lastUserMessage =
        message;

      /*
       * Presentation continuation.
       *
       * Generate presentation
       * -> topic question
       * -> user's topic becomes
       * presentationTopic
       */

      if (
        state.currentIntent ===
          "Generate Presentation" &&
        state.waitingFor ===
          "presentationTopic"
      ) {
        state.collectedInformation.presentationTopic =
          message;

        state.waitingFor =
          "";

        state.currentTask =
          "Presentation Creation";

        state.currentSubTask =
          "Topic Received";

        state.nextExpectedAction =
          "Continue the presentation generation workflow.";
      }

      /* Project continuation */

      if (
        state.currentIntent ===
        "Research"
      ) {
        state.currentTask =
          "Project Research";
      }

      if (
        state.currentIntent ===
        "Component Assistance"
      ) {
        state.currentTask =
          "Component Selection";
      }

      /* History */

      const history =
        parseHistory(
          body.history
        );

      /* Context */

      const context =
        buildConversationContext(
          state
        );

      /* Gemini request */

      const contents = [
        {
          role:
            "user",

          parts:
            [
              {
                text:
                  context,
              },
            ],
        },

        ...history,

        {
          role:
            "user",

          parts:
            buildParts(
              message,
              media
            ),
        },
      ];

      const response =
        await generateTextWithFallback(
          contents
        );

      const reply =
        extractResponseText(
          response
        );

      if (!reply) {
        return res
          .status(502)
          .json({
            success:
              false,

            error:
              "Gemini returned an empty response.",

            requestId,
          });
      }

      state.lastAIResponse =
        reply;

      /*
       * Question detection.
       */

      if (
        /\?$/.test(
          reply.trim()
        )
      ) {
        state.lastAIQuestion =
          reply.trim();
      }

      /*
       * Presentation question detection.
       */

      const lower =
        reply.toLowerCase();

      if (
        state.currentIntent ===
          "Generate Presentation" &&
        (
          lower.includes(
            "what is the topic"
          ) ||
          lower.includes(
            "presentation topic"
          )
        )
      ) {
        state.waitingFor =
          "presentationTopic";

        state.currentTask =
          "Presentation Creation";

        state.currentSubTask =
          "Collecting Topic";

        if (
          !state.missingInformation.includes(
            "presentationTopic"
          )
        ) {
          state.missingInformation.push(
            "presentationTopic"
          );
        }

        state.nextExpectedAction =
          "Wait for the presentation topic.";
      }

      /*
       * Generic research question state.
       */

      if (
        state.currentIntent ===
          "Research" &&
        /\?$/.test(
          reply.trim()
        ) &&
        (
          lower.includes(
            "topic"
          ) ||
          lower.includes(
            "research"
          )
        )
      ) {
        state.waitingFor =
          "researchTopic";

        state.currentTask =
          "Research";

        state.currentSubTask =
          "Collecting Research Topic";
      }

      state.updatedAt =
        new Date().toISOString();

      saveConversationStore();

      return res.json({
        success:
          true,

        type:
          "chat",

        requestId,

        reply,

        conversationId,

        conversationState:
          state,
      });
    } catch (error) {
      console.error(
        "--------------------------------------------------"
      );

      console.error(
        `[MechSyntra] Chat failure: ${requestId}`
      );

      console.error(
        getErrorMessage(
          error
        )
      );

      console.error(
        "--------------------------------------------------"
      );

      if (
        res.headersSent
      ) {
        return;
      }

      return res
        .status(
          getErrorStatus(
            error
          )
        )
        .json({
          success:
            false,

          type:
            "chat_error",

          requestId,

          error:
            friendlyError(
              error
            ),
        });
    }
  }
);

/* ==========================================================================
   404
============================================================================ */

app.use(
  (
    _req,
    res
  ) => {
    res
      .status(404)
      .json({
        success:
          false,

        error:
          "Endpoint not found.",
      });
  }
);

/* ==========================================================================
   GLOBAL ERROR HANDLER
============================================================================ */

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(
      "[MechSyntra] Express error:",
      error
    );

    if (
      res.headersSent
    ) {
      return;
    }

    res
      .status(500)
      .json({
        success:
          false,

        error:
          "Internal server error.",
      });
  }
);

/* ==========================================================================
   PROCESS PROTECTION
============================================================================ */

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "[MechSyntra] Unhandled rejection:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "[MechSyntra] Uncaught exception:",
      error
    );
  }
);

/* ==========================================================================
   LOCAL SERVER
============================================================================ */

if (
  require.main ===
  module
) {
  const server =
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
          `Local      : http://localhost:${PORT}`
        );

        console.log(
          `Health     : http://localhost:${PORT}/health`
        );

        console.log(
          `Chat       : http://localhost:${PORT}/chat`
        );

        console.log(
          `Assignment : http://localhost:${PORT}/generate-assignment`
        );

        console.log(
          `Document   : http://localhost:${PORT}/generate-document`
        );

        console.log(
          `Presentation: http://localhost:${PORT}/generate-presentation`
        );

        console.log(
          `Text model : ${TEXT_MODEL}`
        );

        console.log(
          `Fallback   : ${FALLBACK_MODEL}`
        );

        console.log(
          `Image model: ${IMAGE_MODEL}`
        );

        console.log(
          `PPTX       : ${
            PptxGenJS
              ? "enabled"
              : "disabled"
          }`
        );

        console.log(
          `Environment: ${
            IS_VERCEL
              ? "VERCEL"
              : "LOCAL"
          }`
        );

        console.log(
          "Context    : enabled"
        );

        console.log(
          "Copilot    : enabled"
        );

        console.log(
          "STATUS     : ONLINE"
        );

        console.log(
          "========================================"
        );
      }
    );

  server.on(
    "error",
    (error) => {
      console.error(
        "[MechSyntra] Server error:",
        error
      );
    }
  );
}

/* ==========================================================================
   EXPORT FOR VERCEL
============================================================================ */

module.exports = app;