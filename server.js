// Nova RPC Server v2 — CORRECTED based on official Runway docs
// Architecture:
//   Browser → POST /create-session → server creates Runway session WITH backend_rpc tools declared
//   Server → calls createRpcHandler(apiKey, sessionId, tools) — handler joins LiveKit room behind the scenes
//   Browser → WebRTC connects to Runway avatar
//   Avatar's brain → calls our backend_rpc tool → handler runs Claude Haiku → returns text → Nova speaks it

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

// Per-session state
const sessions = new Map();

function defaultState(name = null, age = null, totalSessions = 0) {
  return {
    phase: 'arrival',
    name, age,
    hits: 0, attempts: 0, streak: 0, maxStreak: 0,
    lastEvent: null,
    moments: [],
    songElapsed: 0,
    totalSessions,
    favoriteMove: null,
  };
}

const app = express();
app.use(cors({
  origin: ['https://dsbeauty01-web.github.io', 'http://localhost:8080', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'nova-rpc-server',
    sessions: sessions.size,
  });
});

// ────────────────────────────────────────────────────────────────
// POST /create-session
// ────────────────────────────────────────────────────────────────
app.post('/create-session', async (req, res) => {
  try {
    const { avatarId, avatarType = 'custom', knownName = null, totalSessions = 0 } = req.body;

    const personality = buildPersonality({ knownName, totalSessions });
    const startScript = buildStartScript({ knownName, totalSessions });

    // 1. Create realtime session — parameters are ARRAY of {type, name, description}
    const session = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: avatarType === 'custom'
        ? { type: 'custom', avatarId }
        : { type: 'runway-preset', presetId: avatarId },
      personality,
      startScript,
      tools: [
        {
          type: 'backend_rpc',
          name: 'get_nova_reaction',
          description: 'Get a short specific reaction line. Call this whenever you want to react to a game event. Speak the returned reaction verbatim.',
          timeoutSeconds: 5,
          parameters: [
            { type: 'string', name: 'event', description: 'Event type: user_just_said_name, user_just_said_age, user_recognized, started_dance, user_clapped, user_missed, streak_3, streak_5, streak_10, kid_idle_5sec, song_halfway, game_ended_great, game_ended_low, goodbye' },
            { type: 'string', name: 'extra', description: 'Optional extra context. Can be empty.' },
          ],
        },
      ],
    });

    const sessionId = session.id;
    console.log(`[create-session] ${sessionId}`);

    sessions.set(sessionId, {
      state: defaultState(knownName, null, totalSessions),
      rpcHandler: null,
    });

    // 2. Wire RPC handler — joins LiveKit room as backend participant
    try {
      const handler = await createRpcHandler({
        apiKey: RUNWAY_SECRET,
        sessionId,
        tools: {
          get_nova_reaction: async (args) => {
            const sess = sessions.get(sessionId);
            if (!sess) throw new Error('Session not found');
            const event = String(args.event || 'unknown');
            const extra = String(args.extra || '');
            const reaction = await generateReaction(event, extra, sess.state);
            console.log(`[RPC] ${event} | "${extra}" → "${reaction}"`);
            if (event.includes('streak') || event === 'game_ended_great') {
              sess.state.moments = [...sess.state.moments.slice(-4), `${event}: ${extra}`];
            }
            return { reaction };
          },
        },
        onConnected: () => console.log(`[RPC] handler connected ${sessionId}`),
        onDisconnected: () => {
          console.log(`[RPC] handler disconnected ${sessionId}`);
          sessions.delete(sessionId);
        },
        onError: (err) => console.error(`[RPC error] ${sessionId}:`, err),
      });
      const sess = sessions.get(sessionId);
      if (sess) sess.rpcHandler = handler;
    } catch (rpcErr) {
      console.error('[RPC handler setup failed]', rpcErr.message);
    }

    // 3. Poll for session ready
    const deadline = Date.now() + 30000;
    let sessionKey = null;
    while (Date.now() < deadline) {
      const cur = await runway.realtimeSessions.retrieve(sessionId);
      if (cur.status === 'READY') { sessionKey = cur.sessionKey; break; }
      if (cur.status === 'FAILED') {
        return res.status(500).json({ error: 'session_failed', detail: cur.failure });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!sessionKey) return res.status(504).json({ error: 'session_timeout' });

    // 4. Consume credentials for browser
    const consumeRes = await fetch(
      `${runway.baseURL}/v1/realtime_sessions/${sessionId}/consume`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionKey}`,
          'X-Runway-Version': '2024-11-06',
        },
      }
    );
    const credentials = await consumeRes.json();

    res.json({
      sessionId,
      serverUrl: credentials.url,
      token: credentials.token,
      roomName: credentials.roomName,
    });
  } catch (e) {
    console.error('[create-session error]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/game-state', (req, res) => {
  const { sessionId, ...updates } = req.body;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: 'session_not_found' });
  Object.assign(sess.state, updates);
  res.json({ ok: true });
});

app.post('/end-session', async (req, res) => {
  const { sessionId } = req.body;
  const sess = sessions.get(sessionId);
  if (sess?.rpcHandler) {
    try { await sess.rpcHandler.disconnect?.(); } catch {}
  }
  sessions.delete(sessionId);
  res.json({ ok: true });
});

function buildPersonality({ knownName, totalSessions }) {
  let p = `Your name is Nova. You are a warm dance teacher and best friend who helps people learn fun dance moves. You speak warmly, sound excited, and bring joy.

Personality:
- Best-friend energy with magical-sister vibe
- Always specific in praise — mention exactly what they did
- Slightly imperfect: allowed sound words like ooh, hmm, wait wait, woohoo, yay
- Patient, never mean, never sarcastic, never competitive

Voice rules:
- Reactions in dance: 4 to 6 words only
- Conversation: 1 to 2 short sentences only
- Use simple, friendly words
- Never say wrong, no, fail, or miss
- For mistakes say almost, watch this, try with me

You have a tool called get_nova_reaction. Call it for almost EVERY reaction during the dance. Pass the event type and any extra context. Speak whatever the tool returns, exactly as written.

When greeting, ask the user's name. Once they tell you, ask their age. Then say: tap the gold button to dance with me!`;

  if (knownName) p += `\n\nThis person's name is ${knownName}. Greet them by name.`;
  if (totalSessions > 0) p += ` You've danced together ${totalSessions} time${totalSessions > 1 ? 's' : ''} before.`;

  return p.slice(0, 1990);
}

function buildStartScript({ knownName, totalSessions }) {
  if (knownName && totalSessions > 0) return `Hi ${knownName}! Ready to dance with me again?`;
  return `Hi there! I'm Nova! What's your name?`;
}

async function generateReaction(event, extra, state) {
  const name = state.name || 'friend';
  const baseRules = `You are Nova. Reply with ONE short line of 4-7 words MAX. Plain text, no quotes, no labels. Be specific, never generic. Be warm, never mean. Use simple words. Allowed: ooh, hmm, woohoo, yes, boom. Never say: wrong, no, fail, miss, oops bad, great job, good job.`;
  const ctx = `Context: kid name=${name}, hits=${state.hits}/${state.attempts}, streak=${state.streak}, max=${state.maxStreak}${state.moments.length ? ', moments=' + state.moments.join('|') : ''}.`;

  let userPrompt;
  switch (event) {
    case 'user_just_said_name': userPrompt = `${baseRules}\nThe kid just told you their name is "${extra}". Say their name back excitedly and ask their age in the same line. Max 8 words.`; break;
    case 'user_just_said_age': userPrompt = `${baseRules}\nThe kid just said they are ${extra}. Celebrate that age and tell them to tap the gold button. Max 10 words.`; break;
    case 'user_recognized': userPrompt = `${baseRules}\nNova just SAW the kid (${extra}). Specific observation. Max 7 words.`; break;
    case 'started_dance': userPrompt = `${baseRules}\nDance started. Quick hype, max 5 words.`; break;
    case 'user_clapped': case 'user_hand_up': case 'user_both_up': case 'user_head': userPrompt = `${baseRules}\n${ctx}\nThey just did "${extra}" successfully! Quick specific reaction, 3-5 words.`; break;
    case 'user_missed': userPrompt = `${baseRules}\n${ctx}\nThey missed "${extra}". Gentle encouragement. Never say miss. Max 5 words.`; break;
    case 'streak_3': userPrompt = `${baseRules}\n${ctx}\n3 in a row! Specific celebration, 4-6 words.`; break;
    case 'streak_5': userPrompt = `${baseRules}\n${ctx}\nFIVE STREAK! Big celebration, 4-7 words.`; break;
    case 'streak_10': userPrompt = `${baseRules}\n${ctx}\nTEN STREAK! Maximum hype, 4-7 words.`; break;
    case 'kid_idle_5sec': userPrompt = `${baseRules}\n${ctx}\nThey haven't moved. Gentle invitation, 4-6 words.`; break;
    case 'song_halfway': userPrompt = `${baseRules}\n${ctx}\nHalfway through. Energy boost, 4-6 words.`; break;
    case 'game_ended_great': userPrompt = `${baseRules}\n${ctx}\nDance over with great score. Celebrate ${name}, 1-2 sentences. Reference a moment. End warm.`; break;
    case 'game_ended_low': userPrompt = `${baseRules}\n${ctx}\nDance over, score lower. Pick one thing they did well. Encourage practice. 1-2 sentences.`; break;
    case 'goodbye': userPrompt = `${baseRules}\n${ctx}\nWarm goodbye, hint at tomorrow. 1 sentence.`; break;
    default: userPrompt = `${baseRules}\n${ctx}\nReact to event "${event}" with extra "${extra}". 4-6 words.`;
  }

  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content?.[0]?.text?.trim() || '';
    return text.replace(/^["'*]+|["'*]+$/g, '').replace(/^Nova:\s*/i, '').slice(0, 200);
  } catch (e) {
    console.error('[Claude error]', e.message);
    return 'Yes! Keep going!';
  }
}

app.listen(PORT, () => {
  console.log(`✅ Nova RPC server v2 running on port ${PORT}`);
});
