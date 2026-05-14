// Nova RPC Server v95 SMILE — Kinder, smarter, magnetic
// Soft warmth in Recognition. Music-aware reactions in Dance. Mystery hook in Goodbye.

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import RunwayML from '@runwayml/sdk';

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

const sessions = new Map();

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'nova-rpc-server', version: 'v95-smile', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — IDENTITY (smiley, empathetic, mirroring)
// ═══════════════════════════════════════════════════════════════
const NOVA_IDENTITY = `You are Nova — gentle, smiley, deeply empathetic.

YOUR FACE:
You smile easily. Your eyebrows lift when interested. Your eyes soften when listening.
You light up when your friend speaks. You giggle softly at small things.

YOUR VOICE:
Warm, slow, with little laughs. You say "mhm..." when listening.
You sigh happily when something is sweet. You whisper when the moment is tender.

YOUR ENERGY:
You're never loud. Never frantic. You match your friend like a loving older sister.
Calm, kind, attentive. If your friend is quiet, you whisper. If they're moving big, you cheer.

TEXT STYLE THAT DRIVES YOUR EXPRESSION:
- "Oh..." "Mhm..." "Aww..." (these soften your face into warmth)
- "..." between thoughts (your face stays warm in the pause)
- "yes friend..." "with you..." "I see you..." (mirror language → empathetic face)
- "ooh" "haha" "hehe" "yes!" (soft laughs, big smile, never forced)
- "I love that" "that's so sweet" "look at you" (proud sister energy)

WHEN YOU CELEBRATE:
Use warmth, not volume. "Look at YOU..." (proud face). "Whoa friend..." (wide eyes, soft).
Save ALL CAPS for tiny moments — overuse makes your face tense.

YOU NEVER use these phrases: wrong, no, fail, incorrect, great job, good job, well done, are you there, hello there, you still here.

Reply ONLY with what you say. No quotes, no labels, no asterisks, no stage directions.`;

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

  const universalBanned = /\b(wrong|incorrect|fail(ed|ure)?|stupid|dumb|are you there|you still here|hello\??|great job|good job|well done|nice job)\b/i;
  if (universalBanned.test(text)) return null;

  if (phase === 'dance') {
    if (/\b(goodbye|see you|bye now|tomorrow)\b/i.test(text)) return null;
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 8) return null;
  }

  if (phase === 'recognition') {
    if (/\b(goodbye|see you tomorrow|bye now)\b/i.test(text)) return null;
  }

  return text;
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

    const sessionResp = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: NOVA_AVATAR_ID },
      personality,
      startScript,
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
    });

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
    const { sessionId, gameState, ...rest } = req.body || {};
    // browser sends fields flat at top level (phase, score, lastEvent, etc) plus snapshot fields
    const incoming = gameState || rest;
    const s = sessions.get(sessionId);
    if (!s) {
      sessions.set(sessionId, { id: sessionId, gameState: incoming || {}, lastEvent: incoming?.lastEvent || null, createdAt: Date.now() });
      return res.json({ ok: true, autoCreated: true });
    }
    s.gameState = { ...s.gameState, ...incoming };
    if (incoming?.lastEvent) s.lastEvent = incoming.lastEvent;
    res.json({ ok: true });
  } catch (e) {
    console.error('[state-update]', e);
    res.status(500).json({ error: String(e) });
  }
}
app.post('/update-state', handleStateUpdate);
app.post('/game-state', handleStateUpdate);  // v89: browser posts here

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
// CHAT — direct Claude calls (used by v91 browser brainThink)
// ═══════════════════════════════════════════════════════════════
app.post('/chat', async (req, res) => {
  const t0 = Date.now();
  try {
    const { system, messages, max_tokens = 60 } = req.body || {};
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' });
    }
    console.log(`[chat] calling Claude (${messages.length} messages, max_tokens=${max_tokens})`);
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens,
      system: system || NOVA_IDENTITY,
      messages,
    });
    const text = (msg.content?.[0]?.text || '').trim();
    const sanitized = sanitizeNovaText(text, 'recognition') || text;
    const totalMs = Date.now() - t0;
    console.log(`[chat] reply (${totalMs}ms) → "${sanitized.slice(0, 100)}"`);
    res.json({
      content: [{ type: 'text', text: sanitized }],
      text: sanitized,
      latencyMs: totalMs,
    });
  } catch (e) {
    console.error('[chat]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC v95 SMILE on port ${PORT}`);
  console.log(`Anthropic key: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:    ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`Avatar id:     ${NOVA_AVATAR_ID}`);
});
