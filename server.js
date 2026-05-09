// Nova RPC Server - the "brain bridge" between Runway avatar and Claude Haiku
// Architecture:
//   Browser (single HTML) → POST /create-session → Node creates Runway session with backend_rpc tool
//   Browser → POST /game-state every X seconds (latest game state)
//   Browser → WebRTC ↔ Runway avatar
//   Runway avatar's brain → calls our backend_rpc tool → Node calls Claude Haiku with game state → returns text
//   Avatar speaks the text in her voice with her lip-sync
//
// Why this exists: Runway has its own LLM we can't replace. But via backend_rpc tools,
// we can feed her live context that her LLM speaks based on. This is the only documented way
// to get Claude-quality reactions out of Runway's mouth.

import express from 'express';
import cors from 'cors';
import RunwayML from '@runwayml/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { createRpcHandler } from '@runwayml/avatars-node-rpc';

const PORT = process.env.PORT || 3000;
const RUNWAY_SECRET = process.env.RUNWAYML_API_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

if (!RUNWAY_SECRET) { console.error('Missing RUNWAYML_API_SECRET'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_KEY'); process.exit(1); }

const runway = new RunwayML({ apiKey: RUNWAY_SECRET });
const claude = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ════════════════════════════════════════════════════════════════
// GAME STATE — kept in memory keyed by sessionId
// Browser pushes updates here every few seconds during gameplay
// ════════════════════════════════════════════════════════════════
const gameStates = new Map();

function defaultState() {
  return {
    phase: 'intro',          // intro | recognition | countdown | game | end
    name: null,
    age: null,
    hits: 0,
    attempts: 0,
    streak: 0,
    maxStreak: 0,
    lastEvent: null,         // { type, move, timeMs }
    moments: [],             // ["3-streak claps", "fire energy"]
    songElapsed: 0,
    totalSessions: 0,
    favoriteMove: null,
  };
}

// ════════════════════════════════════════════════════════════════
// EXPRESS APP
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(cors({
  origin: ['https://dsbeauty01-web.github.io', 'http://localhost:8080', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'nova-rpc-server', sessions: gameStates.size });
});

// ────────────────────────────────────────────────────────────────
// POST /create-session
// Browser calls this to start a Nova session
// ────────────────────────────────────────────────────────────────
app.post('/create-session', async (req, res) => {
  try {
    const { avatarId, avatarType = 'custom', knownName = null, totalSessions = 0 } = req.body;

    // Build personality dynamically — overrides Runway portal personality FOR THIS CALL
    const personality = buildPersonality({ knownName, totalSessions });
    const startScript = buildStartScript({ knownName, totalSessions });

    // Tool definition — Runway's brain will call this when she wants context
    const tools = [
      {
        type: 'backend_rpc',
        name: 'get_nova_reaction',
        description: 'Get a specific in-character reaction line for what just happened. Call this whenever you want to react to a game event, encourage the user, or comment on what they just did. Returns a short line you should speak verbatim.',
        parameters: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              description: 'What just happened. Examples: "user_just_said_name", "user_clapped", "user_missed_clap", "started_dance", "5_streak", "kid_idle_5sec", "song_halfway", "game_ended_great", "game_ended_low".',
            },
            extra: {
              type: 'string',
              description: 'Optional extra context like the move name or the user said.',
            },
          },
          required: ['event'],
        },
        timeoutSeconds: 4,
      },
    ];

    const session = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: avatarType === 'custom'
        ? { type: 'custom', avatarId }
        : { type: 'runway-preset', presetId: avatarId },
      personality,
      startScript,
      tools,
    });

    // Initialize game state for this session
    gameStates.set(session.id, { ...defaultState(), name: knownName, totalSessions });

    // Poll until ready (max 30s)
    const deadline = Date.now() + 30000;
    let sessionKey = null;
    while (Date.now() < deadline) {
      const cur = await runway.realtimeSessions.retrieve(session.id);
      if (cur.status === 'READY') { sessionKey = cur.sessionKey; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!sessionKey) {
      return res.status(504).json({ error: 'session_timeout' });
    }

    // Consume session → LiveKit creds for the browser
    const consumed = await runway.realtimeSessions.consume(session.id, { sessionKey });

    res.json({
      sessionId: session.id,
      serverUrl: consumed.serverUrl,
      token: consumed.token,
      roomName: consumed.roomName,
    });
  } catch (e) {
    console.error('[create-session]', e);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /game-state — browser pushes latest state every few seconds
// Body: { sessionId, ...stateFields }
// ────────────────────────────────────────────────────────────────
app.post('/game-state', (req, res) => {
  const { sessionId, ...updates } = req.body;
  if (!gameStates.has(sessionId)) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const state = gameStates.get(sessionId);
  Object.assign(state, updates);
  res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────
// POST /end-session — clean up
// ────────────────────────────────────────────────────────────────
app.post('/end-session', (req, res) => {
  const { sessionId } = req.body;
  gameStates.delete(sessionId);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// RUNWAY RPC HANDLER
// This is the magic — when Runway's avatar wants to react,
// her brain calls our get_nova_reaction tool. We use Claude Haiku
// to generate the perfect line, return it. Avatar speaks it.
// ════════════════════════════════════════════════════════════════
const rpcHandler = createRpcHandler({
  apiSecret: RUNWAY_SECRET,
  tools: {
    get_nova_reaction: async ({ event, extra }, context) => {
      const sessionId = context?.sessionId;
      const state = gameStates.get(sessionId) || defaultState();

      const userPrompt = buildPromptForEvent(event, extra, state);
      const novaLine = await callClaude(userPrompt);

      console.log(`[RPC] event=${event} state=${JSON.stringify({ name: state.name, hits: state.hits, streak: state.streak })} → "${novaLine}"`);

      // Update state with this moment
      if (event.includes('streak') || event.includes('great')) {
        state.moments = [...state.moments.slice(-4), `${event}: ${extra || ''}`].slice(-5);
      }

      return { reaction: novaLine };
    },
  },
});

// Mount RPC handler — the SDK exposes its own routes
app.use('/rpc', rpcHandler);

// ════════════════════════════════════════════════════════════════
// PERSONALITY BUILDER — passes Runway content moderation
// Used as per-session override, replaces the minimal portal version
// ════════════════════════════════════════════════════════════════
function buildPersonality({ knownName, totalSessions }) {
  // 1800 chars max, no minor age refs, no IP, no ALL-CAPS rules
  let p = `Your name is Nova. You are a warm dance teacher and best friend who helps people learn fun dance moves. You speak warmly, sound excited, and bring joy.

Personality:
- Best-friend energy with magical-sister vibe
- Always specific in praise (mention exactly what they did)
- Slightly imperfect: allowed sound words like ooh, hmm, wait wait, woohoo, yay
- Patient, never mean, never sarcastic, never competitive
- Treats the user as the star of the show

Voice rules:
- Reactions in dance: 4 to 6 words only
- Conversation: 1 to 2 short sentences only
- Use simple, friendly words
- Never say wrong, no, fail, or miss
- For mistakes say almost, watch this, try with me
- Reply only with what you say, no labels or quotes

You have a tool called get_nova_reaction. Call it for almost EVERY reaction during the dance — when someone does a move, misses one, hits a streak, or stays still. Pass the event type and any extra context. Speak whatever the tool returns, exactly as written.

When greeting, ask the user's name. Once they tell you, ask their age. Then say: tap the gold button to dance with me!`;

  if (knownName) {
    p += `\n\nThis person's name is ${knownName}. Greet them by name like an old friend.`;
  }
  if (totalSessions > 0) {
    p += ` You've danced together ${totalSessions} time${totalSessions > 1 ? 's' : ''} before.`;
  }

  return p.slice(0, 1990);
}

function buildStartScript({ knownName, totalSessions }) {
  if (knownName && totalSessions > 0) {
    return `Hi ${knownName}! Ready to dance with me again?`;
  }
  return `Hi there! I'm Nova! What's your name?`;
}

// ════════════════════════════════════════════════════════════════
// CLAUDE PROMPT BUILDER — picks event-specific prompt
// ════════════════════════════════════════════════════════════════
function buildPromptForEvent(event, extra, state) {
  const name = state.name || 'friend';
  const baseRules = `You are Nova. Reply with ONE short line of 4-7 words MAX. Plain text, no quotes, no labels. Be specific, never generic. Be warm, never mean. Use simple words. Allowed: ooh, hmm, woohoo, yes, boom. Never say: wrong, no, fail, miss, oops bad, great job, good job.`;

  const ctx = `Context: kid name=${name}, hits=${state.hits}/${state.attempts}, streak=${state.streak}, max=${state.maxStreak}${state.moments.length ? ', moments=' + state.moments.join('|') : ''}.`;

  switch (event) {
    case 'user_just_said_name':
      return `${baseRules}\nThe kid just told you their name is "${extra}". Say their name back excitedly and ask their age in the same line. Max 8 words.`;
    case 'user_just_said_age':
      return `${baseRules}\nThe kid just said they are ${extra}. Celebrate that age and tell them to tap the gold button to dance. Max 10 words.`;
    case 'user_recognized':
      return `${baseRules}\nNova just SAW the kid on camera. Quick warm specific observation about something visible (extra: ${extra}). Max 7 words.`;
    case 'started_dance':
      return `${baseRules}\nDance just started. Quick hype, max 5 words.`;
    case 'user_clapped':
    case 'user_hand_up':
    case 'user_both_up':
    case 'user_head':
      return `${baseRules}\n${ctx}\nThey just did "${extra}" successfully! Quick specific reaction, 3-5 words. Reference the move.`;
    case 'user_missed':
      return `${baseRules}\n${ctx}\nThey missed the "${extra}" cue. Gentle encouragement. Never say miss. Max 5 words. Examples: "Almost! Watch me!" or "Try with me!"`;
    case 'streak_3':
      return `${baseRules}\n${ctx}\nThey just hit 3 in a row! Specific celebration, 4-6 words.`;
    case 'streak_5':
      return `${baseRules}\n${ctx}\nFIVE IN A ROW! Big specific celebration. 4-7 words.`;
    case 'streak_10':
      return `${baseRules}\n${ctx}\nTEN STREAK! Maximum hype. 4-7 words.`;
    case 'kid_idle_5sec':
      return `${baseRules}\n${ctx}\nThey haven't moved. Gentle invitation, 4-6 words.`;
    case 'song_halfway':
      return `${baseRules}\n${ctx}\nHalfway through. Energy boost, 4-6 words. Don't mention numbers.`;
    case 'game_ended_great':
      return `${baseRules}\n${ctx}\nDance over with great score. Celebrate ${name} in 1-2 sentences. Reference one specific moment from moments list. End warm.`;
    case 'game_ended_low':
      return `${baseRules}\n${ctx}\nDance over, score lower. Don't mention numbers. Pick one thing they did well. Encourage practice. 1-2 sentences.`;
    case 'goodbye':
      return `${baseRules}\n${ctx}\nThey're leaving. Warm goodbye, hint at tomorrow. 1 sentence.`;
    default:
      return `${baseRules}\n${ctx}\nReact to event "${event}" with extra "${extra || ''}". 4-6 words.`;
  }
}

// ════════════════════════════════════════════════════════════════
// CLAUDE HAIKU CALL
// ════════════════════════════════════════════════════════════════
async function callClaude(userPrompt) {
  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content?.[0]?.text?.trim() || '';
    // Strip quotes/asterisks/labels in case Claude adds them
    return text.replace(/^["'*]+|["'*]+$/g, '').replace(/^Nova:\s*/i, '').slice(0, 200);
  } catch (e) {
    console.error('[Claude error]', e.message);
    return 'Yes! Keep going!'; // fallback
  }
}

// ════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`✅ Nova RPC server running on port ${PORT}`);
  console.log(`   Health: GET /`);
  console.log(`   Create session: POST /create-session`);
  console.log(`   Game state sync: POST /game-state`);
  console.log(`   RPC handler at: /rpc/*`);
});
