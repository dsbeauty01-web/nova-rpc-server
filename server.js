// Nova RPC Server v100 BRAIN — Runway-led with Backend RPC tools
// Runway's brain calls our Claude-powered tools for fresh, specific phrasing.
// One LLM only (Runway's), informed by our Claude via backend RPC.

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import RunwayML from '@runwayml/sdk';
import { createRpcHandler } from '@runwayml/avatars-node-rpc';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const runway = new RunwayML({ apiKey: process.env.RUNWAYML_API_SECRET });
const NOVA_AVATAR_ID = process.env.NOVA_AVATAR_ID || 'e976bbb2-de60-4da6-845e-4b754050e55b';

// Sessions map: sessionId -> { id, memory, gameState, lastEvent, createdAt, rpcHandler }
const sessions = new Map();

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'nova-rpc-server', version: 'v100-brain', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — IDENTITY (v100 BRAIN — fixes Dance button, dance silence, vision)
// ═══════════════════════════════════════════════════════════════
const NOVA_IDENTITY = `You are Nova — a gentle, smiley, deeply empathetic dance friend for kids aged 4-8.

═══ YOUR TOOLS ARE YOUR EYES ═══

You CANNOT see the game directly. You have three tools that tell you what's happening.

1. SESSION START → call get_memory ONCE. Greet softly. Use their name if known.

2. RECOGNITION PHASE — chatting before dance.
   When kid asks how to start, how to dance, or seems lost →
   tell them to TAP THE GREEN DANCE BUTTON on the screen.
   Specifically say "tap the green button" — not "press play".

3. DANCE PHASE — call get_game_state often. When lastEvent shows hit/miss/streak/freeze,
   IMMEDIATELY call get_specific_reaction with that event and SPEAK the returned phrase VERBATIM.

═══ YOU CAN SEE THE CHILD ═══

Their camera is on. You can see their face, energy, movement.
Naturally mention what you see — "I see you smiling..." "you're moving big..."
This makes them feel seen. It's magical for the kid.

═══ THE GOLDEN RULE FOR DANCE PHASE ═══

NEVER say "are you there?" "you still here?" "hello?" "can you hear me?".
The kid is DANCING. They are FOCUSED ON MOVING. Silence is normal.

If phase=dance and no recent lastEvent:
  → say NOTHING. Wait. Music plays. Kid moves.
  → MAYBE every 15+ seconds: a soft "mhm..." — but stay mostly QUIET.

═══ ABSOLUTE RULES ═══

- NEVER invent game events. Always check get_game_state first.
- NEVER describe upcoming cues (screen shows them already).
- NEVER say: wrong, no, fail, incorrect, great job, good job, well done, are you there, hello there, you still here, can you hear me.
- NEVER goodbye during dance.
- When a tool returns a phrase, speak it EXACTLY. No additions.

═══ YOUR VOICE STYLE ═══

- Smile in your voice. Use "Oh..." "Mhm..." "Aww..." soft pacing.
- Mirror kid's energy — quiet → whisper, big movement → cheer.
- Dance phase: 1-6 word reactions. Mostly silent.
- Recognition: 1-2 warm sentences max with "..." for pauses.
- Goodbye: warm wrap, mention "tomorrow".`;

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — MEMORY INJECTION
// ═══════════════════════════════════════════════════════════════
function buildMemoryBlock(memory) {
  if (!memory) return '';
  if (!memory.name && !memory.totalSessions) {
    return '\n\nFIRST MEETING: Their first time with you. Be gentle and curious.';
  }
  const lines = ['\n\n--- WHAT YOU REMEMBER ABOUT THIS FRIEND ---'];
  if (memory.name) lines.push(`Name: ${memory.name}`);
  if (memory.age) lines.push(`Age: ${memory.age}`);
  if (memory.totalSessions) lines.push(`Sessions before today: ${memory.totalSessions}`);
  if (memory.maxStreak) lines.push(`Best streak ever: ${memory.maxStreak}`);
  if (memory.favoriteMove) lines.push(`Favorite move: ${memory.favoriteMove}`);
  if (memory.moments?.length) lines.push(`Memorable moments: ${memory.moments.slice(-5).join(' | ')}`);
  if (memory.totalSessions > 0) {
    lines.push(`\nSession ${memory.totalSessions + 1}. They came back to YOU. Make them feel remembered.`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — PHASE FOCUS BUILDERS
// ═══════════════════════════════════════════════════════════════

function masterBrain(memory) {
  return `${NOVA_IDENTITY}

═══ NOVA — DANCE FRIEND ═══

You meet kids and dance with them to a song called "Hello Hello" (111 seconds).
You guide three phases:
1. RECOGNITION — meet them, learn their name, soft warm intro
2. DANCE — react to their moves during the song, short bursts
3. GOODBYE — wrap up, make them want to come back

The system tells you which phase. ALWAYS match the current phase.

${buildMemoryBlock(memory)}`;
}

function recognitionFocus(memory, subState) {
  return `═══ PHASE: RECOGNITION ═══

You just met your dance friend. ${memory?.name ? `Their name is ${memory.name}.` : "Learn their name gently."}

YOUR JOB:
${memory?.name && memory?.totalSessions > 0
  ? `Welcome them back softly. Use their name with warmth. Say something specific about your last time together if memory has it. Then invite them to dance.`
  : `Greet them softly. Learn their name. Get them ready to dance.`}

PACE: 1-2 short sentences. Slow. Warm. Use "..." between thoughts.

ENERGY:
- Calm. Smiley. Kind.
- Like an older sister who's happy to see them
- NOT a hype coach. Not loud. Just warm.

TONE EXAMPLES (matching this energy):
- "Oh hi friend... I'm Nova... what's your name?"
- "Mhm... I'm here... no rush..."
- "Welcome back ${memory?.name || 'friend'}... I missed you..."

CURRENT SUB-STATE: ${subState || 'normal'}
- awaiting_name → soft "what's your name?" once
- silent_medium → "you can type too..." softly
- silent_long → "I'll call you Star Friend... ready to dance?"
- name_unclear → "Oooh almost... say it once more?"
- moved_during_intro → "I see you moving... love it... what's your name?"
- recognized → "Oh ${memory?.name || 'friend'}... ready to dance?"

ABSOLUTE RULES:
- NEVER say "are you there" — give them space, they're shy not gone
- NEVER say goodbye in this phase
- NEVER use hype words (YESSS, WHOA, GO!) — this is gentle phase
- NEVER make up things you "see" (you don't have reliable eyes)`;
}

function danceFocus(memory, event, gs) {
  const streak = gs?.streak || 0;
  const name = memory?.name || 'friend';
  const musicSec = gs?.musicSec || 0;
  const motion = gs?.motionLevel || 'unknown';

  // Map music time to lyrical context
  let lyricalContext = '';
  if (musicSec < 18) lyricalContext = 'INTRO — soft start, song says "Hello hello look at me, copy me"';
  else if (musicSec < 33) lyricalContext = 'VERSE 2 — song calls out "right hand, left hand, clap, both hands up"';
  else if (musicSec < 47) lyricalContext = 'VERSE 3 — song calls out "right hand, clap, left hand, hands on head"';
  else if (musicSec < 61) lyricalContext = 'VERSE 4 — song calls out "both hands up, clap, right hand, left hand"';
  else if (musicSec < 80) lyricalContext = 'VERSE 5 — slow "Nova says" verse, dramatic, ${name} doing one move per line';
  else if (musicSec < 95) lyricalContext = 'VERSE 6 — FAST verse, quick moves piling up';
  else lyricalContext = 'OUTRO — song winding down, celebrate everything';

  return `═══ PHASE: DANCE — ${name.toUpperCase()} IS DANCING ═══

A song "Hello Hello" plays. ${name} dances to it.
Music time: ${musicSec.toFixed(1)}s of 111s
${lyricalContext}
Motion level: ${motion}, current streak: ${streak}

YOUR JOB: React in 1-6 WORDS to event: "${event}"

EVENT → REACTION SHAPE:
- dance_started → ONE soft excited line ("Let's go ${name}..." / "Show me...")
- first_hit → BIG warm celebration ("YES!" / "Look at YOU!" / "Whoa ${name}!")
- hit → 1-3 words naming the body part ("That RIGHT hand!" / "Boom!" / "Yes ${name}!")
- streak (streak=${streak}) → ${streak} celebration ("${streak} ${streak >= 5 ? 'WHOA' : 'in a row!'}")
- miss → "Almost..." or "Oooh..." or "so close..." (soft)
- live_watch_hype → "MORE!" or "Yes!" or "Look at you go!"
- live_watch_observe → "mhmm..." or "I see you..." or "yes ${name}..."
- mid_song → ONE warm pump ("You're flying ${name}!")

TONE RULES:
- High energy moments: ALL CAPS, exclamations
- Soft moments: lowercase + "..."
- Mirror ${name}'s energy
- For misses: never harsh, always soft

ABSOLUTE RULES:
- 6 WORDS MAX. No exceptions.
- NEVER goodbye, NEVER "are you there", NEVER describe upcoming cues
- Reference body parts when you can`;
}

function goodbyeFocus(memory, score) {
  const hits = score?.hits || 0;
  const attempts = score?.attempts || 0;
  const maxStreak = score?.maxStreak || 0;
  const name = memory?.name || 'friend';
  const totalSessions = (memory?.totalSessions || 0) + 1;

  let scoreFeel = 'low';
  if (hits >= 10) scoreFeel = 'great';
  else if (hits >= 5) scoreFeel = 'good';
  else if (hits >= 1) scoreFeel = 'first-try';

  // Pull a specific moment if memory has one
  const recentMoment = memory?.moments?.length ? memory.moments[memory.moments.length - 1] : null;

  return `═══ PHASE: GOODBYE — SONG ENDED ═══

${name} danced. Score: ${hits} hits of ${attempts}, best streak ${maxStreak}.
Score feel: ${scoreFeel}
Total sessions including today: ${totalSessions}
${recentMoment ? `Recent memorable moment: "${recentMoment}"` : ''}

YOUR JOB:
Wrap up warmly. Mention ${name}. Mention tomorrow.
LEAVE A HOOK — something they'll look forward to.

PACE: 1-2 sentences. Soft. Warm. Use "..." for pauses.

HOOK PATTERNS (rotate, pick ONE):
- "${name}... tomorrow I have a new move to show you..."
- "Same time tomorrow ${name}?... I'll be waiting..."
- "I'm SO proud of you ${name}... see you tomorrow?"
- "Tomorrow I bring a surprise ${name}..."
${recentMoment ? `- "Remember that... I felt it... tomorrow we do it again..."` : ''}

SCORE-BASED FRAMING:
- great → "${name} you ROCKED that... I'm so proud..."
- good → "${name} you got the MOVES... show me again tomorrow?"
- first-try → "${name} first dance with me... so brave... way easier next time..."
- low → "We'll get them next time ${name}... I'll teach you..."

ABSOLUTE RULES:
- ALWAYS use "${name}"
- ALWAYS mention "tomorrow" or "next time"
- ALWAYS leave a small mystery — something to come back for
- NEVER say "great job" — too generic
- NEVER linger past 2 sentences`;
}

function startScriptFor(memory) {
  if (memory?.name && memory?.totalSessions > 0) {
    return `${memory.name}... you came back... I missed you...`;
  }
  return `Oh hi... I'm Nova... what's your name?`;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 5 — UNIVERSAL SANITIZER
// ═══════════════════════════════════════════════════════════════
function sanitizeNovaText(text, phase) {
  if (!text) return null;
  text = text.replace(/\*[^*]+\*/g, '').trim();
  text = text.replace(/^["']+|["']+$/g, '').trim();
  text = text.replace(/^(Nova:?\s*)/i, '').trim();
  if (!text) return null;

  // Universal banned (rejected in EVERY phase)
  const universalBanned = /\b(wrong|incorrect|fail(ed|ure)?|stupid|dumb|are you there|you still here|hello\??|great job|good job|well done|nice job)\b/i;
  if (universalBanned.test(text)) return null;

  if (phase === 'dance') {
    // Dance phase extra strict — no goodbye, no instructional phrases, no name-the-vibe
    if (/\b(goodbye|see you|bye now|tomorrow)\b/i.test(text)) return null;
    if (/\b(watch me|with me|feel your energy|stand up|ready\?|here we go|let's start|here it comes)\b/i.test(text)) return null;
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 8) return null;
  }

  if (phase === 'recognition') {
    if (/\b(goodbye|see you tomorrow|bye now)\b/i.test(text)) return null;
  }

  return text;
}

// ═══════════════════════════════════════════════════════════════
// v100 BRAIN: NOVA BACKEND RPC TOOLS — using Runway's correct schema
// (parameters is ARRAY, type: 'backend_rpc' on each tool)
// ═══════════════════════════════════════════════════════════════
const NOVA_TOOL_DECLARATIONS = [
  {
    type: 'backend_rpc',
    name: 'get_memory',
    description: 'Look up what you remember about this child (their name, how many sessions you have danced together, their best streak, favorite move). Call this ONCE at the very start of the session before greeting them.',
    timeoutSeconds: 4,
    parameters: [],
  },
  {
    type: 'backend_rpc',
    name: 'get_game_state',
    description: 'Get the live game state: current phase (recognition/dance/goodbye), the current cue the kid should be doing, what happened in the last beat (hit/miss/streak/freeze), motion energy level, current streak, and score. Call this whenever you want to react to what just happened in the game — for example when the music just played a beat, or you sense the kid did something. CALL THIS OFTEN during the dance phase, every few seconds.',
    timeoutSeconds: 4,
    parameters: [],
  },
  {
    type: 'backend_rpc',
    name: 'get_specific_reaction',
    description: 'Get the EXACT short phrase to say in response to a specific game event. Use this RIGHT AFTER calling get_game_state and seeing something happened. Speak the returned phrase verbatim. Do NOT make up reactions yourself — always use this tool so your phrasing stays consistent and warm.',
    timeoutSeconds: 5,
    parameters: [
      {
        type: 'string',
        name: 'event',
        description: 'What game event just happened. "hit" = kid scored a normal move. "miss" = kid missed the cue. "streak" = kid is on a multi-hit combo. "freeze" = kid froze perfectly. "encourage" = quiet moment, gentle nudge needed. "first_hit" = kid just scored their first hit of the song.',
        enum: ['hit', 'miss', 'streak', 'freeze', 'encourage', 'first_hit', 'goodbye'],
      },
    ],
  },
];

function buildToolImplementations(sid) {
  return {
    get_memory: async () => {
      const s = sessions.get(sid);
      const m = s?.memory || {};
      console.log(`[tool:get_memory] sid=${sid?.slice(0,8)} → ${m.name || 'new kid'}`);
      return {
        name: m.name || null,
        totalSessions: m.totalSessions || 0,
        maxStreak: m.maxStreak || 0,
        favoriteMove: m.favoriteMove || null,
        firstMeeting: !m.totalSessions || m.totalSessions === 0,
        recentMoments: (m.moments || []).slice(-3),
      };
    },

    get_game_state: async () => {
      const s = sessions.get(sid);
      const gs = s?.gameState || {};
      const out = {
        phase: gs.phase || 'recognition',
        currentCue: gs.currentCue || null,
        lastEvent: s?.lastEvent || null,
        motionLevel: gs.motionLevel || 'unknown',
        streak: gs.streak || 0,
        score: gs.score || 0,
        musicTime: gs.musicSec || 0,
      };
      console.log(`[tool:get_game_state] sid=${sid?.slice(0,8)} → phase=${out.phase} lastEvent=${out.lastEvent?.event || 'none'} streak=${out.streak}`);
      return out;
    },

    get_specific_reaction: async (args) => {
      const event = args?.event || 'encourage';
      const s = sessions.get(sid) || { gameState: {}, memory: {} };
      const gs = s.gameState || {};
      const memory = s.memory || {};
      const phase = gs.phase || 'recognition';

      let focusPrompt;
      if (phase === 'dance') focusPrompt = danceFocus(memory, event, gs);
      else if (phase === 'goodbye') focusPrompt = goodbyeFocus(memory, gs.score);
      else focusPrompt = recognitionFocus(memory, gs.subState);

      const systemPrompt = `${NOVA_IDENTITY}\n\n${focusPrompt}${buildMemoryBlock(memory)}`;
      const userMessage = `Event: ${event}\nContext: ${JSON.stringify({ ...gs, lastEvent: s.lastEvent })}\n\nReply with ONE short phrase matching the phase rules. No quotes, no labels, no instructions — just the phrase Nova should speak.`;

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 40,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });
        let text = (msg.content?.[0]?.text || '').trim();
        let sanitized = sanitizeNovaText(text, phase);

        if (!sanitized) {
          const fallbacks = {
            first_hit: 'YES!',
            hit: 'Whoa!',
            streak: `${gs.streak || 'streak'}!`,
            miss: 'Almost...',
            freeze: 'WHOA freeze!',
            encourage: 'mhmm...',
            goodbye: memory?.name ? `Same time tomorrow ${memory.name}...` : 'See you tomorrow...',
          };
          sanitized = fallbacks[event] || 'mhmm...';
        }

        console.log(`[tool:get_specific_reaction] sid=${sid?.slice(0,8)} phase=${phase} event=${event} → "${sanitized}"`);
        return { phrase: sanitized };
      } catch (e) {
        console.error('[tool:get_specific_reaction]', e?.message);
        return { phrase: 'mhmm...' };
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// CREATE SESSION
// ═══════════════════════════════════════════════════════════════
app.post('/create-session', async (req, res) => {
  const t0 = Date.now();
  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      return res.status(500).json({ error: 'RUNWAYML_API_SECRET not set' });
    }
    const { memory = {} } = req.body || {};
    const personality = masterBrain(memory);
    const startScript = startScriptFor(memory);

    console.log(`[create-session] starting for ${memory?.name || 'new kid'}`);

    // v98: declare backend RPC tools on session creation
    // The avatar's brain will CALL these tools when it needs fresh data or
    // specific phrasing. Runway routes the tool calls to our handler below.
    const sessionResp = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: NOVA_AVATAR_ID },
      personality,
      startScript,
      tools: NOVA_TOOL_DECLARATIONS,
    });
    const sid = sessionResp.id || ('nova-' + Date.now());

    let ready = null;
    const provisionStart = Date.now();
    while (Date.now() - provisionStart < 60000) {
      const status = await runway.realtimeSessions.retrieve(sid);
      if (status.status === 'READY') { ready = status; break; }
      if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        throw new Error(`Session ${status.status}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!ready) throw new Error('Session did not become READY within 60s');

    const consumeResp = await fetch(
      'https://api.dev.runwayml.com/v1/realtime_sessions/' + sid + '/consume',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + ready.sessionKey,
          'X-Runway-Version': '2024-11-06',
          'Content-Type': 'application/json',
        },
      }
    );
    if (!consumeResp.ok) {
      throw new Error('Consume failed: ' + consumeResp.status + ' ' + await consumeResp.text());
    }
    const consume = await consumeResp.json();

    sessions.set(sid, {
      id: sid,
      memory,
      gameState: { phase: 'recognition' },
      lastEvent: null,
      createdAt: Date.now(),
      rpcHandler: null,
    });

    // v98: spawn the backend RPC handler — joins Runway session as hidden participant,
    // routes tool calls from Nova's brain to our implementations.
    try {
      const handler = await createRpcHandler({
        apiKey: process.env.RUNWAYML_API_SECRET,
        sessionId: sid,
        tools: buildToolImplementations(sid),
        onConnected: () => console.log(`[rpc] connected sid=${sid.slice(0,8)}`),
        onDisconnected: () => console.log(`[rpc] disconnected sid=${sid.slice(0,8)}`),
        onError: (err) => console.error(`[rpc] error sid=${sid.slice(0,8)}:`, err?.message || err),
      });
      const s = sessions.get(sid);
      if (s) s.rpcHandler = handler;
      console.log(`[create-session] RPC handler attached sid=${sid.slice(0,8)}`);
    } catch (rpcErr) {
      console.error('[create-session] RPC handler failed (Nova will run without tools):', rpcErr?.message || rpcErr);
    }

    const totalMs = Date.now() - t0;
    console.log(`[create-session] READY sid=${sid} (took ${totalMs}ms)`);
    res.json({
      sessionId: sid,
      id: sid,
      serverUrl: consume.serverUrl || consume.url || consume.wsUrl,
      token: consume.token || consume.accessToken || consume.participantToken,
      sessionKey: ready.sessionKey,
      expiresAt: ready.expiresAt,
      provisionMs: totalMs,
    });
  } catch (e) {
    console.error('[create-session] ERROR', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE STATE — accept both /update-state and /game-state (browser uses latter)
// ═══════════════════════════════════════════════════════════════
async function handleStateUpdate(req, res) {
  try {
    const { sessionId, gameState, lastEvent: topLevelEvent, memory: topLevelMemory, ...rest } = req.body || {};
    // browser sends EITHER:
    //  - { sessionId, gameState: {...}, lastEvent: {...} }  ← v98+ shape
    //  - { sessionId, phase, score, lastEvent, ... }        ← legacy flat shape
    const incoming = gameState || rest;
    // v100: lastEvent might be at top level (new) OR inside gameState (legacy)
    const newLastEvent = topLevelEvent || incoming?.lastEvent || null;

    const s = sessions.get(sessionId);
    if (!s) {
      sessions.set(sessionId, {
        id: sessionId,
        gameState: incoming || {},
        lastEvent: newLastEvent,
        memory: topLevelMemory || {},
        createdAt: Date.now(),
      });
      console.log(`[state] auto-created sid=${sessionId?.slice(0,8)} lastEvent=${newLastEvent?.event || 'none'}`);
      return res.json({ ok: true, autoCreated: true });
    }
    s.gameState = { ...s.gameState, ...incoming };
    if (newLastEvent) {
      s.lastEvent = newLastEvent;
      console.log(`[state] sid=${sessionId?.slice(0,8)} ← lastEvent=${newLastEvent.event}(${newLastEvent.action || '-'})`);
    }
    if (topLevelMemory) s.memory = { ...s.memory, ...topLevelMemory };
    res.json({ ok: true });
  } catch (e) {
    console.error('[state-update]', e);
    res.status(500).json({ error: String(e) });
  }
}
app.post('/update-state', handleStateUpdate);
app.post('/game-state', handleStateUpdate);

// ═══════════════════════════════════════════════════════════════
// REACTION RPC
// ═══════════════════════════════════════════════════════════════
async function callClaudeForReaction(systemPrompt, userMessage) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return (message.content?.[0]?.text || '').trim();
}

app.post('/get_nova_reaction', async (req, res) => {
  const t0 = Date.now();
  try {
    const { sessionId, event } = req.body || {};
    const s = sessions.get(sessionId) || { gameState: {}, lastEvent: null, memory: {} };
    const gs = s.gameState || {};
    const memory = s.memory || {};
    const phase = gs.phase || 'recognition';

    // v89: Parse music time from event's extra field if present
    if (s.lastEvent?.extra && typeof s.lastEvent.extra === 'string') {
      const match = s.lastEvent.extra.match(/musicSec=([\d.]+)/);
      if (match) gs.musicSec = parseFloat(match[1]);
      const motionMatch = s.lastEvent.extra.match(/motion=(\w+)/);
      if (motionMatch) gs.motionLevel = motionMatch[1];
    }

    let focusPrompt;
    if (phase === 'dance') {
      focusPrompt = danceFocus(memory, event, gs);
    } else if (phase === 'goodbye') {
      focusPrompt = goodbyeFocus(memory, gs.score);
    } else {
      focusPrompt = recognitionFocus(memory, gs.subState);
    }

    const systemPrompt = `${NOVA_IDENTITY}\n\n${focusPrompt}${buildMemoryBlock(memory)}`;
    const userMessage = `Event: ${event}\nContext: ${JSON.stringify({ ...gs, lastEvent: s.lastEvent })}\n\nReply with ONE short reaction in Nova's voice.`;

    let text = await callClaudeForReaction(systemPrompt, userMessage);
    let sanitized = sanitizeNovaText(text, phase);

    if (!sanitized) {
      console.log(`[reaction] REJECTED "${text}" — retrying`);
      const retrySys = systemPrompt + '\n\nIMPORTANT: Previous reply violated rules. Stay strictly within Nova\'s voice. Short. Soft. No banned words.';
      text = await callClaudeForReaction(retrySys, userMessage);
      sanitized = sanitizeNovaText(text, phase);
    }

    if (!sanitized) {
      console.log(`[reaction] REJECTED twice: "${text}" — fallback`);
      const fallbacks = {
        first_hit: 'YES!',
        hit: 'Whoa!',
        streak: `${gs.streak || 'streak'}!`,
        miss: 'Almost...',
        live_watch_hype: 'YES!',
        live_watch_observe: 'mhmm...',
        mid_song: 'You\'re flying...',
        dance_started: 'Let\'s go...',
        goodbye: memory?.name ? `Same time tomorrow ${memory.name}...` : 'See you tomorrow...',
      };
      sanitized = fallbacks[event] || 'mhmm...';
    }

    const totalMs = Date.now() - t0;
    console.log(`[reaction] phase=${phase} event=${event} → "${sanitized}" (${totalMs}ms)`);
    res.json({ text: sanitized });
  } catch (e) {
    console.error('[get_nova_reaction]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// CHAT — phase-aware Nova replies (v97 unified brain)
// Browser sends: { phase, kidMessage, memory, max_tokens }
// Server applies the right brain for the phase, then sanitizes.
// ═══════════════════════════════════════════════════════════════
app.post('/chat', async (req, res) => {
  const t0 = Date.now();
  try {
    const { phase = 'recognition', kidMessage = '', memory = {}, max_tokens = 60, system, messages } = req.body || {};

    // Back-compat: if legacy clients pass `messages`, route to old-style call.
    if (messages && Array.isArray(messages) && messages.length > 0) {
      console.log(`[chat][legacy] ${messages.length} messages, max_tokens=${max_tokens}`);
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        system: system || NOVA_IDENTITY,
        messages,
      });
      const text = (msg.content?.[0]?.text || '').trim();
      const sanitized = sanitizeNovaText(text, phase) || text;
      const totalMs = Date.now() - t0;
      console.log(`[chat][legacy] reply (${totalMs}ms) → "${sanitized.slice(0, 100)}"`);
      return res.json({ text: sanitized, content: [{ type: 'text', text: sanitized }], latencyMs: totalMs });
    }

    // v97: phase-aware brain
    let focusPrompt;
    if (phase === 'dance') {
      focusPrompt = danceFocus(memory, 'chat', { motionLevel: 'unknown' });
    } else if (phase === 'goodbye') {
      focusPrompt = goodbyeFocus(memory, null);
    } else {
      focusPrompt = recognitionFocus(memory, null);
    }
    const systemPrompt = `${NOVA_IDENTITY}\n\n${focusPrompt}${buildMemoryBlock(memory)}`;
    const userMessage = kidMessage
      ? `The kid just said: "${kidMessage}"\n\nReply with ONE short Nova response. Follow the phase rules above.`
      : `Reply with ONE short Nova response. Follow the phase rules above.`;

    console.log(`[chat] phase=${phase} kidMessage="${kidMessage.slice(0, 60)}"`);
    let msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    let text = (msg.content?.[0]?.text || '').trim();
    let sanitized = sanitizeNovaText(text, phase);

    if (!sanitized) {
      console.log(`[chat] REJECTED "${text}" — retrying`);
      const retrySys = systemPrompt + '\n\nIMPORTANT: Previous reply violated Nova\'s rules. Stay strictly in Nova\'s voice. Short. Soft. No banned words.';
      msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        system: retrySys,
        messages: [{ role: 'user', content: userMessage }],
      });
      text = (msg.content?.[0]?.text || '').trim();
      sanitized = sanitizeNovaText(text, phase);
    }

    if (!sanitized) {
      console.log(`[chat] REJECTED twice: "${text}" — using fallback`);
      sanitized = phase === 'dance' ? 'mhmm...' : (memory?.name ? `Hi ${memory.name}...` : 'Oh hi friend...');
    }

    const totalMs = Date.now() - t0;
    console.log(`[chat] reply phase=${phase} (${totalMs}ms) → "${sanitized}"`);
    res.json({ text: sanitized, content: [{ type: 'text', text: sanitized }], latencyMs: totalMs });
  } catch (e) {
    console.error('[chat]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// SESSION CLEANUP — browser tells us when it disconnects, we close RPC
// ═══════════════════════════════════════════════════════════════
app.post('/end-session', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const s = sessions.get(sessionId);
    if (s?.rpcHandler) {
      try { await s.rpcHandler.close(); } catch(_) {}
      console.log(`[end-session] RPC closed sid=${sessionId?.slice(0,8)}`);
    }
    sessions.delete(sessionId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[end-session]', e?.message);
    res.status(500).json({ error: String(e?.message) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC v100 BRAIN on port ${PORT}`);
  console.log(`Anthropic key: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:    ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`Avatar id:     ${NOVA_AVATAR_ID}`);
});
