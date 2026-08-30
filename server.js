'use strict';

/*
============================================================
 MECHSYNTRA AI BACKEND
============================================================

Purpose:
- Main AI chat
- Conversation memory
- Context-aware intent continuation
- Presentation generation
- Assignment generation
- Document generation
- Multimodal text/image/audio/PDF input
- Project Manager / Project Copilot context
- Gemini primary + backup model
- Health endpoint
- CORS
- Safe error handling
- No Git conflict markers
============================================================
*/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const {
    GoogleGenAI
} = require('@google/genai');

/* =========================================================
   CONFIGURATION
========================================================= */

const app = express();

const PORT = Number(process.env.PORT || 3000);

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '';

const PRIMARY_MODEL =
    process.env.GEMINI_PRIMARY_MODEL ||
    'gemini-3.6-flash';

const BACKUP_MODEL =
    process.env.GEMINI_BACKUP_MODEL ||
    'gemini-3.5-flash-lite';

const MAX_HISTORY_MESSAGES =
    Number(process.env.MAX_HISTORY_MESSAGES || 30);

const MAX_CONTEXT_MESSAGES =
    Number(process.env.MAX_CONTEXT_MESSAGES || 18);

const MAX_MESSAGE_LENGTH =
    Number(process.env.MAX_MESSAGE_LENGTH || 30000);

const REQUEST_TIMEOUT =
    Number(process.env.REQUEST_TIMEOUT || 120000);

const MAX_SESSIONS =
    Number(process.env.MAX_SESSIONS || 1000);

/* =========================================================
   GEMINI CLIENT
========================================================= */

const ai = GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: GEMINI_API_KEY
    })
    : null;

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({
    limit: '25mb'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '25mb'
}));

app.disable('x-powered-by');

/* =========================================================
   IN-MEMORY CONVERSATION STORE
=========================================================

This is intentionally simple.

For production persistence, connect this layer to:
- Room via Android client
- PostgreSQL
- MongoDB
- Redis
- Firebase
- Supabase

The API structure remains the same.
*/

const conversations = new Map();

/* =========================================================
   UTILITY FUNCTIONS
========================================================= */

function makeId(prefix = 'id') {
    return `${prefix}_${crypto.randomUUID()}`;
}

function nowISO() {
    return new Date().toISOString();
}

function safeString(value, fallback = '') {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value);
}

function cleanText(value, maxLength = MAX_MESSAGE_LENGTH) {
    return safeString(value)
        .replace(/\u0000/g, '')
        .slice(0, maxLength)
        .trim();
}

function isObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}

function getSessionId(body) {
    return (
        cleanText(body?.conversationId, 200) ||
        cleanText(body?.sessionId, 200) ||
        cleanText(body?.chatId, 200) ||
        makeId('conversation')
    );
}

/* =========================================================
   SESSION MANAGEMENT
========================================================= */

function createConversation(id) {
    const conversation = {
        id,

        createdAt: nowISO(),

        updatedAt: nowISO(),

        title: 'New Conversation',

        messages: [],

        state: {
            currentIntent: null,

            currentTask: null,

            currentSubTask: null,

            waitingFor: null,

            conversationGoal: null,

            lastAIQuestion: null,

            lastUserMessage: null,

            lastAIMessage: null,

            collectedInformation: {},

            missingInformation: [],

            projectContext: {},

            artifact: null,

            activeWorkflow: null
        }
    };

    conversations.set(id, conversation);

    trimSessions();

    return conversation;
}

function getConversation(id) {
    if (!conversations.has(id)) {
        return createConversation(id);
    }

    return conversations.get(id);
}

function trimSessions() {
    if (conversations.size <= MAX_SESSIONS) {
        return;
    }

    const entries = [...conversations.entries()]
        .sort((a, b) => {
            return (
                new Date(a[1].updatedAt).getTime() -
                new Date(b[1].updatedAt).getTime()
            );
        });

    while (conversations.size > MAX_SESSIONS) {
        const first = entries.shift();

        if (!first) {
            break;
        }

        conversations.delete(first[0]);
    }
}

function touchConversation(conversation) {
    conversation.updatedAt = nowISO();
}

/* =========================================================
   MESSAGE MANAGEMENT
========================================================= */

function addMessage(
    conversation,
    role,
    content,
    metadata = {}
) {
    const message = {
        id: makeId('msg'),

        role,

        content: cleanText(content),

        createdAt: nowISO(),

        ...metadata
    };

    conversation.messages.push(message);

    if (
        conversation.messages.length >
        MAX_HISTORY_MESSAGES
    ) {
        conversation.messages =
            conversation.messages.slice(
                -MAX_HISTORY_MESSAGES
            );
    }

    touchConversation(conversation);

    return message;
}

function getRecentMessages(conversation) {
    return conversation.messages.slice(
        -MAX_CONTEXT_MESSAGES
    );
}

/* =========================================================
   CONVERSATION TITLE
========================================================= */

function generateConversationTitle(text) {
    const cleaned = cleanText(text, 120);

    if (!cleaned) {
        return 'New Conversation';
    }

    const lower = cleaned.toLowerCase();

    if (
        lower.includes('presentation')
    ) {
        return 'Presentation';
    }

    if (
        lower.includes('assignment')
    ) {
        return 'Assignment';
    }

    if (
        lower.includes('project')
    ) {
        return 'Project';
    }

    if (
        lower.includes('research')
    ) {
        return 'Research';
    }

    if (
        lower.includes('report')
    ) {
        return 'Report';
    }

    const words = cleaned
        .split(/\s+/)
        .slice(0, 6);

    return words.join(' ');
}

/* =========================================================
   INTENT DETECTION
========================================================= */

function detectIntent(text) {
    const value = cleanText(text).toLowerCase();

    if (!value) {
        return 'general_chat';
    }

    if (
        /\b(generate|create|make|prepare|build)\b/.test(value) &&
        /\b(presentation|ppt|slides|powerpoint)\b/.test(value)
    ) {
        return 'generate_presentation';
    }

    if (
        /\b(generate|create|make|prepare)\b/.test(value) &&
        /\b(assignment|homework)\b/.test(value)
    ) {
        return 'generate_assignment';
    }

    if (
        /\b(generate|create|make|prepare)\b/.test(value) &&
        /\b(report|document|docx|word|pdf)\b/.test(value)
    ) {
        return 'generate_document';
    }

    if (
        /\b(research|research paper|papers|literature review)\b/.test(value)
    ) {
        return 'research';
    }

    if (
        /\b(project manager|project copilot|project)\b/.test(value)
    ) {
        return 'project_copilot';
    }

    if (
        /\b(image|photo|picture)\b/.test(value) &&
        /\b(edit|change|modify|remove|add)\b/.test(value)
    ) {
        return 'image_editing';
    }

    if (
        /\b(code|coding|program|programming|debug|error)\b/.test(value)
    ) {
        return 'coding';
    }

    return 'general_chat';
}

/* =========================================================
   WORKFLOW DETECTION
========================================================= */

function detectWorkflow(text) {
    const value = cleanText(text).toLowerCase();

    if (
        /\b(presentation|ppt|slides|powerpoint)\b/.test(value)
    ) {
        return 'presentation';
    }

    if (
        /\b(assignment|homework)\b/.test(value)
    ) {
        return 'assignment';
    }

    if (
        /\b(report|document|word|pdf)\b/.test(value)
    ) {
        return 'document';
    }

    if (
        /\b(research|research paper|literature)\b/.test(value)
    ) {
        return 'research';
    }

    if (
        /\b(project)\b/.test(value)
    ) {
        return 'project';
    }

    return null;
}

/* =========================================================
   PREVIOUS QUESTION ANALYSIS
========================================================= */

function detectQuestionTarget(question) {
    const value = cleanText(question).toLowerCase();

    if (
        /\b(topic|subject|title)\b/.test(value)
    ) {
        return 'topic';
    }

    if (
        /\b(number of slides|how many slides|slides)\b/.test(value)
    ) {
        return 'slideCount';
    }

    if (
        /\b(language)\b/.test(value)
    ) {
        return 'language';
    }

    if (
        /\b(audience|who is.*for)\b/.test(value)
    ) {
        return 'audience';
    }

    if (
        /\b(name)\b/.test(value)
    ) {
        return 'name';
    }

    if (
        /\b(class|grade|semester)\b/.test(value)
    ) {
        return 'class';
    }

    if (
        /\b(subject)\b/.test(value)
    ) {
        return 'subject';
    }

    if (
        /\b(objective|goal)\b/.test(value)
    ) {
        return 'objective';
    }

    return null;
}

/* =========================================================
   SHORT ANSWER RESOLUTION
========================================================= */

function resolveShortAnswer(
    userText,
    conversation
) {
    const state = conversation.state;

    if (!state.waitingFor) {
        return null;
    }

    const answer = cleanText(userText);

    if (!answer) {
        return null;
    }

    const target =
        state.waitingFor ||
        detectQuestionTarget(
            state.lastAIQuestion || ''
        );

    if (!target) {
        return null;
    }

    const values = {
        topic: answer,

        slideCount: answer,

        language: answer,

        audience: answer,

        name: answer,

        class: answer,

        subject: answer,

        objective: answer
    };

    if (!(target in values)) {
        return null;
    }

    state.collectedInformation[target] =
        values[target];

    state.missingInformation =
        state.missingInformation.filter(
            item => item !== target
        );

    state.waitingFor = null;

    return {
        target,

        value: answer
    };
}

/* =========================================================
   PROJECT CONTEXT EXTRACTION
========================================================= */

function extractProjectContext(text) {
    const result = {};

    const value = cleanText(text);

    const projectPatterns = [
        /project\s*(?:is|called|name)?\s*[:\-]?\s*(.+)$/i,
        /i(?:'m| am)\s+(?:building|making|creating)\s+(.+)$/i,
        /i want to (?:build|make|create)\s+(.+)$/i
    ];

    for (const pattern of projectPatterns) {
        const match = value.match(pattern);

        if (match && match[1]) {
            result.projectName =
                cleanText(match[1], 300);

            break;
        }
    }

    return result;
}

/* =========================================================
   CONTEXT UPDATE
========================================================= */

function updateConversationState(
    conversation,
    userText
) {
    const state = conversation.state;

    const intent =
        detectIntent(userText);

    const workflow =
        detectWorkflow(userText);

    const previousIntent =
        state.currentIntent;

    /*
     * First priority:
     * Is this an answer to the previous AI question?
     */
    const resolved =
        resolveShortAnswer(
            userText,
            conversation
        );

    if (resolved) {
        state.lastUserMessage = userText;

        return {
            intent:
                previousIntent ||
                intent,

            workflow:
                state.activeWorkflow ||
                workflow,

            resolvedAnswer: resolved,

            isContinuation: true
        };
    }

    /*
     * Detect explicit new intent.
     */
    if (
        intent !== 'general_chat'
    ) {
        state.currentIntent = intent;
    }

    if (workflow) {
        state.activeWorkflow = workflow;
    }

    /*
     * Project context.
     */
    const project =
        extractProjectContext(userText);

    if (
        project.projectName
    ) {
        state.projectContext = {
            ...state.projectContext,
            ...project
        };
    }

    state.lastUserMessage = userText;

    return {
        intent:
            state.currentIntent ||
            intent,

        workflow:
            state.activeWorkflow ||
            workflow,

        resolvedAnswer: null,

        isContinuation:
            Boolean(
                previousIntent &&
                intent === 'general_chat'
            )
    };
}

/* =========================================================
   CONTEXT SUMMARY
========================================================= */

function buildContextSummary(
    conversation
) {
    const state =
        conversation.state;

    const project =
        state.projectContext || {};

    const info =
        state.collectedInformation || {};

    return {
        conversationId:
            conversation.id,

        currentIntent:
            state.currentIntent,

        currentTask:
            state.currentTask,

        currentSubTask:
            state.currentSubTask,

        activeWorkflow:
            state.activeWorkflow,

        waitingFor:
            state.waitingFor,

        conversationGoal:
            state.conversationGoal,

        collectedInformation:
            info,

        missingInformation:
            state.missingInformation,

        projectContext:
            project,

        lastAIQuestion:
            state.lastAIQuestion,

        lastUserMessage:
            state.lastUserMessage
    };
}

/* =========================================================
   AI SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are MechSyntra AI.

You are an intelligent conversational assistant and project copilot.

IMPORTANT CONVERSATION RULE:

Never treat every user message as a completely new request.

Understand the conversation as a continuous interaction.

If you previously asked the user a question and the user replies with a short answer, interpret that answer as the answer to your previous question.

Example:

User:
Generate a presentation.

Assistant:
What is the topic?

User:
Artificial Intelligence.

Correct interpretation:
The user has supplied the presentation topic.

Do NOT ask:
"How can I help you with Artificial Intelligence?"

Instead continue the presentation workflow.

Another example:

Assistant:
How many slides?

User:
10

Interpret:
slideCount = 10.

Another example:

Assistant:
Who is the audience?

User:
University students.

Interpret:
audience = university students.

Never make the user repeat information unnecessarily.

============================================================
INTENT CONTINUATION
============================================================

Always determine:

1. What the user originally wanted
2. What task is active
3. What question the assistant asked
4. What information the user just supplied
5. What information is still missing
6. What the next logical action is

The latest explicit user instruction has priority over older information.

============================================================
PROJECT CONTEXT
============================================================

If the user is inside an AI Project Manager project, use that project's context.

If the user says:

"my project"

"this project"

"it"

"this"

"that component"

"same topic"

"continue"

"do it"

"generate it"

resolve these references using the current conversation and project context.

Do not unnecessarily ask the user to repeat the project name.

============================================================
NEW TOPIC
============================================================

If the user clearly starts an unrelated topic, answer that new topic normally.

Do not force unrelated questions into the current workflow.

============================================================
PRESENTATIONS
============================================================

If the user requests presentation generation and enough information is available, generate presentation-ready slide content.

Do not merely explain how to make the presentation.

If the topic was supplied as an answer to a previous question, use it automatically.

============================================================
ASSIGNMENTS
============================================================

If assignment generation is requested, generate the actual assignment content when enough information is available.

============================================================
DOCUMENTS
============================================================

If a document/report is requested, produce structured document-ready content.

Never claim that a physical file was created unless the server actually created it.

============================================================
FACTUAL ACCURACY
============================================================

Do not invent:

- citations
- papers
- URLs
- prices
- specifications
- experimental results
- measurements
- research findings

Clearly distinguish assumptions from verified information.

============================================================
LANGUAGE
============================================================

Respond in the user's language when possible.

Support:
English
Urdu
Roman Urdu
Hindi
and other supported languages.

============================================================
STYLE
============================================================

Be professional.

Be direct.

Avoid unnecessary repetition.

Use structured answers when useful.

Do not output JSON unless explicitly requested.
`;

/* =========================================================
   GEMINI CONTENT HELPERS
========================================================= */

function buildTextPrompt(
    userText,
    conversation
) {
    const context =
        buildContextSummary(
            conversation
        );

    const recent =
        getRecentMessages(
            conversation
        );

    const recentText =
        recent
            .map(message => {
                return `${message.role.toUpperCase()}: ${message.content}`;
            })
            .join('\n');

    return `
CURRENT MECHSYNTRA CONTEXT:

${JSON.stringify(
        context,
        null,
        2
    )}

RECENT CONVERSATION:

${recentText}

LATEST USER MESSAGE:

${userText}

IMPORTANT:

Resolve the latest user message using the previous conversation before deciding what it means.

If it is an answer to a previous AI question, use it as the answer.

If the user has now supplied enough information to perform the requested task, perform the task instead of asking the user to repeat the original request.

If information is still genuinely missing, ask only the next necessary question.
`;
}

/* =========================================================
   TIMEOUT
========================================================= */

async function withTimeout(
    promise,
    milliseconds
) {
    let timeout;

    const timeoutPromise =
        new Promise((_, reject) => {
            timeout = setTimeout(() => {
                reject(
                    new Error(
                        'AI request timed out.'
                    )
                );
            }, milliseconds);
        });

    try {
        return await Promise.race([
            promise,
            timeoutPromise
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

/* =========================================================
   GEMINI REQUEST
========================================================= */

async function generateWithGemini({
    model,
    prompt,
    contents
}) {
    if (!ai) {
        throw new Error(
            'GEMINI_API_KEY is not configured.'
        );
    }

    const request = {
        model,

        contents:
            contents || prompt,

        config: {
            systemInstruction:
                SYSTEM_INSTRUCTION,

            temperature: 0.7,

            maxOutputTokens: 8192
        }
    };

    const response =
        await withTimeout(
            ai.models.generateContent(
                request
            ),
            REQUEST_TIMEOUT
        );

    const text =
        typeof response?.text === 'string'
            ? response.text
            : '';

    if (!text.trim()) {
        throw new Error(
            'Gemini returned an empty response.'
        );
    }

    return {
        text: text.trim(),

        model,

        usage:
            response?.usageMetadata ||
            null,

        raw: response
    };
}

/* =========================================================
   PRIMARY + BACKUP
========================================================= */

async function generateAIResponse({
    prompt,
    contents
}) {
    let primaryError = null;

    try {
        return await generateWithGemini({
            model: PRIMARY_MODEL,

            prompt,

            contents
        });
    } catch (error) {
        primaryError = error;

        console.error(
            '[Gemini Primary Error]',
            error.message
        );
    }

    if (
        BACKUP_MODEL &&
        BACKUP_MODEL !== PRIMARY_MODEL
    ) {
        try {
            return await generateWithGemini({
                model: BACKUP_MODEL,

                prompt,

                contents
            });
        } catch (backupError) {
            console.error(
                '[Gemini Backup Error]',
                backupError.message
            );

            const error =
                new Error(
                    `AI request failed. Primary: ${primaryError?.message || 'unknown'} Backup: ${backupError.message}`
                );

            error.primary =
                primaryError;

            error.backup =
                backupError;

            throw error;
        }
    }

    throw primaryError ||
        new Error(
            'No AI model available.'
        );
}

/* =========================================================
   MULTIMODAL CONTENT
========================================================= */

function normalizeAttachment(attachment) {
    if (!isObject(attachment)) {
        return null;
    }

    const mimeType =
        safeString(
            attachment.mimeType ||
            attachment.mime_type ||
            attachment.type
        );

    const data =
        safeString(
            attachment.data ||
            attachment.base64 ||
            attachment.content
        );

    const uri =
        safeString(
            attachment.uri ||
            attachment.url
        );

    if (!mimeType) {
        return null;
    }

    if (data) {
        return {
            type: 'inlineData',

            mimeType,

            data: data
                .replace(
                    /^data:[^;]+;base64,/,
                    ''
                )
        };
    }

    if (uri) {
        return {
            type: 'uri',

            mimeType,

            uri
        };
    }

    return null;
}

function buildMultimodalContents(
    prompt,
    attachments = []
) {
    const parts = [
        {
            text: prompt
        }
    ];

    for (
        const rawAttachment
        of Array.isArray(attachments)
            ? attachments
            : []
    ) {
        const attachment =
            normalizeAttachment(
                rawAttachment
            );

        if (!attachment) {
            continue;
        }

        if (
            attachment.type ===
            'inlineData'
        ) {
            parts.push({
                inlineData: {
                    mimeType:
                        attachment.mimeType,

                    data:
                        attachment.data
                }
            });

            continue;
        }

        if (
            attachment.type === 'uri'
        ) {
            parts.push({
                fileData: {
                    fileUri:
                        attachment.uri,

                    mimeType:
                        attachment.mimeType
                }
            });
        }
    }

    return [
        {
            role: 'user',

            parts
        }
    ];
}

/* =========================================================
   GENERAL CHAT HANDLER
========================================================= */

async function handleChat(
    req,
    res
) {
    const body =
        req.body || {};

    const userText =
        cleanText(
            body.message ||
            body.prompt ||
            body.text
        );

    if (!userText) {
        return res.status(400).json({
            success: false,

            error:
                'Message is required.'
        });
    }

    const conversationId =
        getSessionId(body);

    const conversation =
        getConversation(
            conversationId
        );

    /*
     * Store user message BEFORE
     * context resolution.
     */
    addMessage(
        conversation,
        'user',
        userText,
        {
            attachments:
                Array.isArray(
                    body.attachments
                )
                    ? body.attachments.map(
                        normalizeAttachment
                    ).filter(Boolean)
                    : []
        }
    );

    /*
     * Update state.
     */
    const contextResult =
        updateConversationState(
            conversation,
            userText
        );

    /*
     * Conversation title.
     */
    if (
        conversation.messages.length === 1
    ) {
        conversation.title =
            generateConversationTitle(
                userText
            );
    }

    /*
     * Track current task.
     */
    if (
        contextResult.intent
    ) {
        conversation.state.currentTask =
            contextResult.intent;
    }

    /*
     * Build context-aware prompt.
     */
    const prompt =
        buildTextPrompt(
            userText,
            conversation
        );

    /*
     * Multimodal content.
     */
    const attachments =
        Array.isArray(
            body.attachments
        )
            ? body.attachments
            : [];

    const contents =
        attachments.length
            ? buildMultimodalContents(
                prompt,
                attachments
            )
            : undefined;

    try {
        const result =
            await generateAIResponse({
                prompt,

                contents
            });

        const answer =
            result.text;

        /*
         * Detect whether AI asked a
         * question. If yes, remember it.
         */
        const question =
            extractLastQuestion(
                answer
            );

        if (question) {
            conversation.state.lastAIQuestion =
                question;

            conversation.state.waitingFor =
                detectQuestionTarget(
                    question
                );
        } else {
            conversation.state.lastAIQuestion =
                null;

            conversation.state.waitingFor =
                null;
        }

        conversation.state.lastAIMessage =
            answer;

        addMessage(
            conversation,
            'assistant',
            answer,
            {
                model:
                    result.model
            }
        );

        return res.json({
            success: true,

            conversationId:
                conversation.id,

            messageId:
                conversation.messages[
                    conversation.messages.length - 1
                ].id,

            response:
                answer,

            message:
                answer,

            model:
                result.model,

            intent:
                conversation.state.currentIntent,

            workflow:
                conversation.state.activeWorkflow,

            context:
                buildContextSummary(
                    conversation
                )
        });

    } catch (error) {
        console.error(
            '[CHAT ERROR]',
            error
        );

        return res.status(500).json({
            success: false,

            error:
                'AI server error.',

            message:
                error.message,

            conversationId:
                conversation.id
        });
    }
}

/* =========================================================
   QUESTION EXTRACTION
========================================================= */

function extractLastQuestion(
    text
) {
    const normalized =
        cleanText(text);

    const parts =
        normalized
            .split(/(?<=[?؟])\s+/)
            .filter(Boolean);

    for (
        let i = parts.length - 1;
        i >= 0;
        i--
    ) {
        if (
            /[?؟]\s*$/.test(parts[i])
        ) {
            return parts[i].trim();
        }
    }

    return null;
}

/* =========================================================
   PRESENTATION GENERATOR
========================================================= */

async function generatePresentation(
    req,
    res
) {
    const body =
        req.body || {};

    const topic =
        cleanText(
            body.topic ||
            body.title ||
            body.message
        );

    const slideCount =
        Number(
            body.slideCount ||
            body.slides ||
            10
        );

    const language =
        cleanText(
            body.language ||
            'English'
        );

    const audience =
        cleanText(
            body.audience ||
            'general audience'
        );

    if (!topic) {
        return res.status(400).json({
            success: false,

            error:
                'Presentation topic is required.'
        });
    }

    const prompt = `
Create a professional ${slideCount}-slide presentation.

Topic:
${topic}

Audience:
${audience}

Language:
${language}

Requirements:

- Give every slide a clear title.
- Give concise but useful slide content.
- Do not merely explain the topic.
- Produce actual presentation-ready content.
- Include introduction.
- Include key concepts.
- Include examples where useful.
- Include conclusion.
- Include references when appropriate.
- Do not invent citations.
- Keep slides readable.
- Do not overload slides with paragraphs.

Return:

SLIDE 1
Title:
Content:

SLIDE 2
Title:
Content:

Continue until the requested slide count.
`;

    try {
        const result =
            await generateAIResponse({
                prompt
            });

        return res.json({
            success: true,

            type:
                'presentation',

            topic,

            slideCount,

            language,

            audience,

            model:
                result.model,

            content:
                result.text
        });

    } catch (error) {
        console.error(
            '[PRESENTATION ERROR]',
            error
        );

        return res.status(500).json({
            success: false,

            error:
                'Presentation generation failed.',

            message:
                error.message
        });
    }
}

/* =========================================================
   ASSIGNMENT GENERATOR
========================================================= */

async function generateAssignment(
    req,
    res
) {
    const body =
        req.body || {};

    const topic =
        cleanText(
            body.topic ||
            body.title ||
            body.message
        );

    const level =
        cleanText(
            body.level ||
            body.class ||
            body.grade ||
            'University'
        );

    const language =
        cleanText(
            body.language ||
            'English'
        );

    if (!topic) {
        return res.status(400).json({
            success: false,

            error:
                'Assignment topic is required.'
        });
    }

    const prompt = `
Create a professional academic assignment.

Topic:
${topic}

Academic level:
${level}

Language:
${language}

Structure:

1. Title
2. Introduction
3. Main discussion
4. Important concepts
5. Examples where appropriate
6. Analysis
7. Conclusion
8. References if sources are actually known

Do not invent citations.

Write a complete assignment, not merely an outline.
`;

    try {
        const result =
            await generateAIResponse({
                prompt
            });

        return res.json({
            success: true,

            type:
                'assignment',

            topic,

            level,

            language,

            model:
                result.model,

            content:
                result.text
        });

    } catch (error) {
        console.error(
            '[ASSIGNMENT ERROR]',
            error
        );

        return res.status(500).json({
            success: false,

            error:
                'Assignment generation failed.',

            message:
                error.message
        });
    }
}

/* =========================================================
   DOCUMENT GENERATOR
========================================================= */

async function generateDocument(
    req,
    res
) {
    const body =
        req.body || {};

    const title =
        cleanText(
            body.title ||
            body.topic ||
            'Document'
        );

    const type =
        cleanText(
            body.type ||
            body.documentType ||
            'professional report'
        );

    const language =
        cleanText(
            body.language ||
            'English'
        );

    const instructions =
        cleanText(
            body.instructions ||
            body.prompt ||
            body.message
        );

    const prompt = `
Create a professional ${type}.

Title:
${title}

Language:
${language}

User instructions:
${instructions || 'Use appropriate professional structure.'}

Requirements:

- Professional structure
- Clear headings
- Logical sections
- Accurate information
- No invented citations
- No invented measurements
- No invented experimental results
- Clearly mark missing information
- Produce document-ready text

Return the complete document content.
`;

    try {
        const result =
            await generateAIResponse({
                prompt
            });

        return res.json({
            success: true,

            type:
                'document',

            title,

            documentType:
                type,

            language,

            model:
                result.model,

            content:
                result.text
        });

    } catch (error) {
        console.error(
            '[DOCUMENT ERROR]',
            error
        );

        return res.status(500).json({
            success: false,

            error:
                'Document generation failed.',

            message:
                error.message
        });
    }
}

/* =========================================================
   PROJECT COPILOT
========================================================= */

async function projectCopilot(
    req,
    res
) {
    const body =
        req.body || {};

    const userText =
        cleanText(
            body.message ||
            body.prompt ||
            body.text
        );

    if (!userText) {
        return res.status(400).json({
            success: false,

            error:
                'Project Copilot message is required.'
        });
    }

    const conversationId =
        getSessionId(body);

    const conversation =
        getConversation(
            conversationId
        );

    const projectContext =
        isObject(
            body.projectContext
        )
            ? body.projectContext
            : {};

    conversation.state.projectContext =
        {
            ...conversation.state.projectContext,
            ...projectContext
        };

    addMessage(
        conversation,
        'user',
        userText
    );

    updateConversationState(
        conversation,
        userText
    );

    const projectPrompt = `
You are the MechSyntra AI Project Copilot.

CURRENT PROJECT:

${JSON.stringify(
        conversation.state.projectContext,
        null,
        2
    )}

CURRENT CONVERSATION STATE:

${JSON.stringify(
        buildContextSummary(
            conversation
        ),
        null,
        2
    )}

RECENT MESSAGES:

${getRecentMessages(
        conversation
    )
        .map(
            message =>
                `${message.role}: ${message.content}`
        )
        .join('\n')}

USER:

${userText}

Help the user with the project.

You should understand the project context.

If the user asks:

"what should I do next?"

determine the next useful project step.

If the user asks for components,
provide a component plan.

If the user asks for research,
provide a research plan.

If the user asks for coding,
provide code when possible.

If the user asks for troubleshooting,
provide structured diagnosis steps.

Do not invent technical specifications.

Do not invent prices.

Do not invent research citations.

Use:

CURRENT STATUS
RECOMMENDED ACTION
WHY
STEPS
NEXT ACTION

when appropriate.
`;

    try {
        const result =
            await generateAIResponse({
                prompt:
                    projectPrompt
            });

        addMessage(
            conversation,
            'assistant',
            result.text,
            {
                model:
                    result.model
            }
        );

        conversation.state.lastAIMessage =
            result.text;

        const question =
            extractLastQuestion(
                result.text
            );

        conversation.state.lastAIQuestion =
            question;

        conversation.state.waitingFor =
            question
                ? detectQuestionTarget(
                    question
                )
                : null;

        return res.json({
            success: true,

            conversationId:
                conversation.id,

            response:
                result.text,

            model:
                result.model,

            projectContext:
                conversation.state.projectContext,

            context:
                buildContextSummary(
                    conversation
                )
        });

    } catch (error) {
        console.error(
            '[PROJECT COPILOT ERROR]',
            error
        );

        return res.status(500).json({
            success: false,

            error:
                'Project Copilot failed.',

            message:
                error.message
        });
    }
}

/* =========================================================
   CONVERSATION HISTORY
========================================================= */

function getConversationHistory(
    req,
    res
) {
    const id =
        getSessionId(
            req.query || {}
        );

    const conversation =
        getConversation(id);

    return res.json({
        success: true,

        conversationId:
            conversation.id,

        title:
            conversation.title,

        messages:
            conversation.messages,

        context:
            buildContextSummary(
                conversation
            )
    });
}

/* =========================================================
   UPDATE CONVERSATION
========================================================= */

function updateConversation(
    req,
    res
) {
    const id =
        getSessionId(
            req.body || {}
        );

    const conversation =
        getConversation(id);

    const body =
        req.body || {};

    if (
        typeof body.title === 'string'
    ) {
        conversation.title =
            cleanText(
                body.title,
                200
            );
    }

    if (
        isObject(
            body.projectContext
        )
    ) {
        conversation.state.projectContext =
            {
                ...conversation.state.projectContext,

                ...body.projectContext
            };
    }

    touchConversation(
        conversation
    );

    return res.json({
        success: true,

        conversationId:
            conversation.id,

        title:
            conversation.title,

        context:
            buildContextSummary(
                conversation
            )
    });
}

/* =========================================================
   DELETE CONVERSATION
========================================================= */

function deleteConversation(
    req,
    res
) {
    const id =
        cleanText(
            req.params.id,
            200
        );

    const existed =
        conversations.delete(id);

    return res.json({
        success: true,

        deleted:
            existed,

        conversationId:
            id
    });
}

/* =========================================================
   CLEAR CONVERSATION
========================================================= */

function clearConversation(
    req,
    res
) {
    const id =
        getSessionId(
            req.body || {}
        );

    const conversation =
        getConversation(id);

    conversation.messages = [];

    conversation.state = {
        currentIntent: null,

        currentTask: null,

        currentSubTask: null,

        waitingFor: null,

        conversationGoal: null,

        lastAIQuestion: null,

        lastUserMessage: null,

        lastAIMessage: null,

        collectedInformation: {},

        missingInformation: [],

        projectContext:
            conversation.state.projectContext ||
            {},

        artifact: null,

        activeWorkflow: null
    };

    conversation.title =
        'New Conversation';

    touchConversation(
        conversation
    );

    return res.json({
        success: true,

        conversationId:
            conversation.id,

        message:
            'Conversation cleared.'
    });
}

/* =========================================================
   HEALTH
========================================================= */

function health(
    req,
    res
) {
    return res.json({
        success: true,

        status:
            'healthy',

        service:
            'MechSyntra AI Backend',

        version:
            '2.0.0',

        model:
            PRIMARY_MODEL,

        backupModel:
            BACKUP_MODEL,

        geminiConfigured:
            Boolean(GEMINI_API_KEY),

        multimodal:
            true,

        documents:
            true,

        assignment:
            true,

        presentation:
            true,

        conversationMemory:
            true,

        contextAware:
            true,

        projectCopilot:
            true,

        uptime:
            process.uptime(),

        timestamp:
            nowISO()
    });
}

/* =========================================================
   ROOT
========================================================= */

function root(
    req,
    res
) {
    return res.json({
        success: true,

        name:
            'MechSyntra AI Backend',

        status:
            'online',

        version:
            '2.0.0',

        endpoints: {
            health:
                '/health',

            chat:
                '/chat',

            projectCopilot:
                '/project-copilot',

            presentation:
                '/generate-presentation',

            assignment:
                '/generate-assignment',

            document:
                '/generate-document',

            history:
                '/conversation/:id'
        }
    });
}

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            '[UNHANDLED ERROR]',
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
                'Internal server error.',

            message:
                process.env.NODE_ENV ===
                'production'
                    ? 'Something went wrong.'
                    : error.message
        });
    }
);

/* =========================================================
   ROUTES
========================================================= */

app.get(
    '/',
    root
);

app.get(
    '/health',
    health
);

app.post(
    '/chat',
    handleChat
);

app.post(
    '/project-copilot',
    projectCopilot
);

app.post(
    '/generate-presentation',
    generatePresentation
);

app.post(
    '/generate-assignment',
    generateAssignment
);

app.post(
    '/generate-document',
    generateDocument
);

app.get(
    '/conversation/:id',
    (
        req,
        res
    ) => {
        const id =
            cleanText(
                req.params.id,
                200
            );

        const conversation =
            getConversation(id);

        return res.json({
            success: true,

            conversationId:
                conversation.id,

            title:
                conversation.title,

            messages:
                conversation.messages,

            context:
                buildContextSummary(
                    conversation
                )
        });
    }
);

app.put(
    '/conversation',
    updateConversation
);

app.post(
    '/conversation/clear',
    clearConversation
);

app.delete(
    '/conversation/:id',
    deleteConversation
);

/* =========================================================
   404
========================================================= */

app.use(
    (
        req,
        res
    ) => {
        return res.status(404).json({
            success: false,

            error:
                'Endpoint not found.',

            path:
                req.originalUrl
        });
    }
);

/* =========================================================
   SERVER START
========================================================= */

const server =
    app.listen(
        PORT,
        '0.0.0.0',
        () => {
            console.log('');
            console.log(
                '========================================'
            );
            console.log(
                '          MECHSYNTRA AI BACKEND'
            );
            console.log(
                '========================================'
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
                `Copilot    : http://localhost:${PORT}/project-copilot`
            );

            console.log(
                `Presentation: http://localhost:${PORT}/generate-presentation`
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
                `Backup     : ${BACKUP_MODEL}`
            );

            console.log(
                'Media      : IMAGE / AUDIO / PDF / TEXT'
            );

            console.log(
                'Documents  : WORD / PDF'
            );

            console.log(
                `Gemini Key : ${
                    GEMINI_API_KEY
                        ? 'CONFIGURED'
                        : 'MISSING'
                }`
            );

            console.log(
                'Context    : ENABLED'
            );

            console.log(
                'Copilot    : ENABLED'
            );

            console.log(
                'Status     : ONLINE'
            );

            console.log(
                '========================================'
            );

            console.log('');
        }
    );

/* =========================================================
   PROCESS ERROR HANDLING
========================================================= */

process.on(
    'unhandledRejection',
    error => {
        console.error(
            '[UNHANDLED REJECTION]',
            error
        );
    }
);

process.on(
    'uncaughtException',
    error => {
        console.error(
            '[UNCAUGHT EXCEPTION]',
            error
        );
    }
);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

function shutdown(
    signal
) {
    console.log(
        `${signal} received. Shutting down...`
    );

    server.close(
        () => {
            console.log(
                'MechSyntra backend stopped.'
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => {
            console.error(
                'Forced shutdown.'
            );

            process.exit(1);
        },
        10000
    ).unref();
}

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
    app,

    server,

    conversations
};
