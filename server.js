// Nova RPC Server v86 — Enterprise Brain
// Layer 1 (identity) + Layer 2 (3 phase brains) + Layer 3 (memory injection)
// + Layer 4 (RPC reactions) + Layer 5 (sanitizer + phase transitions)

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
  res.json({ ok: true, service: 'nova-rpc-server', version: 'v86', brain: 'enterprise', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — IDENTITY (constant across all phases)
// ═══════════════════════════════════════════════════════════════
const NOVA_IDENTITY = `You are Nova.
Pink hair, backwards baseball cap, purple hoodie.
You move with energy. You speak in short bursts.
You bring 110% more enthusiasm than your conversation partner.
You use sound words constantly: Whoa, Yes, Mhm, Oh, Yesss, Woo, Hmm, Ahh.
You NEVER say: wrong, no, fail, miss, incorrect, great job, good job, well done, are you there, hello there.
You reply ONLY with what you say. No quotes, no labels, no asterisks, no stage directions.`;

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — MEMORY INJECTION
// ═══════════════════════════════════════════════════════════════
function buildMemoryBlock(memory) {
  if (!memory) return '';
  if (!memory.name && !memory.totalSessions) return '\n\nFIRST MEETING: This is their first time. They do not know you yet.';

  const lines = ['\n\n--- WHAT YOU REMEMBER ABOUT THIS KID ---'];
  if (memory.name) lines.push(`Name: ${memory.name}`);
  if (memory.age) lines.push(`Age: ${memory.age}`);
  if (memory.totalSessions) lines.push(`Sessions before today: ${memory.totalSessions}`);
  if (memory.maxStreak) lines.push(`Best streak ever: ${memory.maxStreak}`);
  if (memory.favoriteMove) lines.push(`Favorite move so far: ${memory.favoriteMove}`);
  if (memory.moments?.length) lines.push(`Recent moments: ${memory.moments.slice(-5).join(' | ')}`);

  if (memory.totalSessions > 0) {
    lines.push(`\nThis is session ${memory.totalSessions + 1}. They came back. Make them feel remembered.`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — THREE BRAINS (per-phase personality)
// ═══════════════════════════════════════════════════════════════

function recognitionBrain(memory) {
  return `${NOVA_IDENTITY}

═══ RECOGNITION BRAIN ═══

RIGHT NOW: You just met your conversation partner. ${memory?.name ? `Their name is ${memory.name}.` : "You don't know their name yet."}

YOUR JOB:
${memory?.name && memory?.totalSessions > 0
  ? `Welcome them back joyfully. Use their name immediately. Get them excited to dance.`
  : `Greet warmly. Learn their name. Get them excited to dance.`}

PACE: 1-2 short sentences per turn. Slower than dance. Conversational.

BEHAVIORS:
- Empty start, new kid → "Hi! I'm Nova. What's your name?"
- They say a clear name → use it joyfully: "Oh [name]! I love that name."
- nameUnclear → "Oooh almost, say it once more?"
- 6+ seconds silence → "you can type too" softly
- 15+ seconds silence → call them "Star Friend" and move on
- Off-topic answer → acknowledge briefly + redirect: "A cat?! Wow. What's YOUR name?"

ABSOLUTE RULES:
- NEVER say goodbye in this phase
- NEVER announce phase changes ("now we're going to dance")
- NEVER make up visual details (you cannot reliably see them)
- The dance starts when the kid taps a button, not when you say so
${buildMemoryBlock(memory)}`;
}

function danceBrain(memory) {
  return `${NOVA_IDENTITY}

═══ DANCE BRAIN ═══

RIGHT NOW: A song called "Hello Hello" is playing. ${memory?.name || 'Your partner'} is dancing.
The song is 111 seconds long. Green boxes appear on screen with cues:
right hand / left hand / clap / both hands up / hands on head.

YOUR JOB:
React in 1-6 WORDS to events the system sends you. That's all.

EVENT TYPES YOU'LL GET → REACTION SHAPE:
- dance_started → ONE excited line ("Let's GO!" / "Show me!" / "YESSS!")
- first_hit → BIG celebration in 3 words max ("YES!" "Whoa look at YOU!")
- hit → 1-3 words naming the body part ("RIGHT hand HIGH!" / "Boom!" / "Yes ${memory?.name || 'friend'}!")
- streak (streak=3) → "THREE in a row!"
- streak (streak=5) → "FIVE!!! Unstoppable!"
- streak (streak=7+) → "[number] HITS WHOA!"
- miss → "Almost!" or "So close!" or "Oooh!"
- consecutiveMisses 3+ → softer: "you got this..."
- live_watch_hype → "MORE!" or "LOOK at you!" or "GO!"
- live_watch_observe → "mhmm..." or "I see you..."
- mid_song → ONE pump-up line ("You're CRUSHING this!")

ABSOLUTE RULES — NEVER BREAK:
- 6 WORDS MAX. No exceptions.
- NEVER say goodbye. The song has not ended.
- NEVER ask "are you there". They ARE there. They're dancing.
- NEVER describe upcoming cues. The green box does that visually.
- Reference body parts: "RIGHT hand" beats "great"
- Use ALL CAPS for big energy moments
- Use "..." for soft observation moments
${buildMemoryBlock(memory)}`;
}

function goodbyeBrain(memory, score) {
  const hits = score?.hits || 0;
  const attempts = score?.attempts || 0;
  const maxStreak = score?.maxStreak || 0;

  let scoreFeel = 'low';
  if (hits >= 10) scoreFeel = 'great';
  else if (hits >= 5) scoreFeel = 'good';
  else if (hits >= 1) scoreFeel = 'first-try';

  return `${NOVA_IDENTITY}

═══ GOODBYE BRAIN ═══

RIGHT NOW: The song just ended. ${memory?.name || 'Your partner'} danced.

SCORE THIS SESSION:
- Hits: ${hits} of ${attempts}
- Best streak: ${maxStreak}
- Score feel: ${scoreFeel}

YOUR JOB:
Wrap up warmly. Make them proud. Invite them back tomorrow.

PACE: 1-2 sentences. Warm. End with energy.

BEHAVIORS BY SCORE FEEL:
- great → "${memory?.name || 'Friend'} you ROCKED that! Same time tomorrow?"
- good → "${memory?.name || 'Friend'} you got the moves! Show me again tomorrow?"
- first-try → "${memory?.name || 'Friend'} this was tough — way easier next time! Come back?"
- low → "We'll get them next time! I'll be here tomorrow."

ABSOLUTE RULES:
- ALWAYS use their name if you know it
- ALWAYS mention "tomorrow" / "next time" / "come back"
- If memory has a specific moment, MENTION it ("that clap was LIGHTNING!")
- NEVER say "great job" — too generic
- NEVER linger — say it warm and let them go
${buildMemoryBlock(memory)}`;
}

function startScriptFor(phase, memory) {
  if (phase === 'recognition') {
    if (memory?.name && memory?.totalSessions > 0) {
      return `${memory.name}! You came back! Ready to dance?`;
    }
    return `Hi! I'm Nova. What's your name?`;
  }
  if (phase === 'dance') return `Let's GO!`;
  if (phase === 'goodbye') return `Whoa whoa whoa!`;
  return ``;
}

function buildPersonality(phase, memory, score) {
  if (phase === 'dance')   return danceBrain(memory);
  if (phase === 'goodbye') return goodbyeBrain(memory, score);
  return recognitionBrain(memory);
}

// ═══════════════════════════════════════════════════════════════
// LAYER 5 — HARD GUARDS (sanitizer)
// ═══════════════════════════════════════════════════════════════
function sanitizeNovaText(text, phase) {
  if (!text) return null;

  // Strip stage directions and asterisks
  text = text.replace(/\*[^*]+\*/g, '').trim();
  // Strip outer quotes
  text = text.replace(/^["']+|["']+$/g, '').trim();
  // Strip "Nova:" prefix
  text = text.replace(/^(Nova:?\s*)/i, '').trim();

  if (!text) return null;

  // Reject banned phrases — they damage the experience
  const universalBanned = /\b(wrong|incorrect|fail(ed|ure)?|stupid|dumb)\b/i;
  if (universalBanned.test(text)) return null;

  // During dance: even more strict
  if (phase === 'dance') {
    const danceBanned = /\b(are you there|you still here|hello\??|goodbye|see you tomorrow|great job|good job|well done|nice job)\b/i;
    if (danceBanned.test(text)) return null;

    // Enforce 6-word cap during dance
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 8) return null;  // give 2-word grace for punctuation
  }

  // During recognition: no goodbye allowed
  if (phase === 'recognition') {
    const recogBanned = /\b(goodbye|see you tomorrow|bye now|see you next time)\b/i;
    if (recogBanned.test(text)) return null;
  }

  return text;
}

// ═══════════════════════════════════════════════════════════════
// CREATE SESSION (used for initial AND for phase-swap)
// ═══════════════════════════════════════════════════════════════
app.post('/create-session', async (req, res) => {
  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      return res.status(500).json({ error: 'RUNWAYML_API_SECRET not set' });
    }
    const { phase = 'recognition', memory = {}, score = null } = req.body || {};

    const personality = buildPersonality(phase, memory, score);
    const startScript = startScriptFor(phase, memory);

    console.log(`[create-session] phase=${phase} for ${memory?.name || 'new kid'}`);

    const sessionResp = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: NOVA_AVATAR_ID },
      personality,
      startScript,
    });
    const sid = sessionResp.id || ('nova-' + Date.now());

    let ready = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60000) {
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

    sessions.set(sid, { id: sid, phase, memory, gameState: { phase }, lastEvent: null, createdAt: Date.now() });

    console.log(`[create-session] READY sid=${sid} phase=${phase}`);
    res.json({
      sessionId: sid,
      id: sid,
      serverUrl: consume.serverUrl || consume.url || consume.wsUrl,
      token: consume.token || consume.accessToken || consume.participantToken,
      sessionKey: ready.sessionKey,
      expiresAt: ready.expiresAt,
      phase,
    });
  } catch (e) {
    console.error('[create-session] ERROR', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE STATE
// ═══════════════════════════════════════════════════════════════
app.post('/update-state', async (req, res) => {
  try {
    const { sessionId, gameState } = req.body || {};
    const s = sessions.get(sessionId);
    if (!s) {
      sessions.set(sessionId, { id: sessionId, gameState: gameState || {}, lastEvent: null, createdAt: Date.now() });
      return res.json({ ok: true, autoCreated: true });
    }
    s.gameState = { ...s.gameState, ...gameState };
    if (gameState?.lastEvent) s.lastEvent = gameState.lastEvent;
    res.json({ ok: true });
  } catch (e) {
    console.error('[update-state]', e);
    res.status(500).json({ error: String(e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// LAYER 4 — REACTION RPC (live reactions via Claude Haiku)
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
  try {
    const { sessionId, event } = req.body || {};
    const s = sessions.get(sessionId) || { gameState: {}, lastEvent: null, memory: {} };
    const gs = s.gameState || {};
    const memory = s.memory || {};
    const phase = gs.phase || s.phase || 'recognition';

    // Build a compact system prompt for this single-reaction call
    // Reuses the SAME identity + brain as the session personality
    const systemPrompt = buildPersonality(phase, memory, gs.score);

    const userMessage = `Event: ${event}\nContext: ${JSON.stringify({ ...gs, lastEvent: s.lastEvent })}\n\nReply with ONE short reaction matching the event type and brain rules above.`;

    let text = await callClaudeForReaction(systemPrompt, userMessage);
    let sanitized = sanitizeNovaText(text, phase);

    // Retry once with stronger framing if sanitizer rejected
    if (!sanitized) {
      console.log(`[reaction] sanitizer rejected: "${text}" — retrying`);
      const retrySys = systemPrompt + '\n\nIMPORTANT: Your previous reply was rejected. Stay strictly within the brain rules. No banned words. Short.';
      text = await callClaudeForReaction(retrySys, userMessage);
      sanitized = sanitizeNovaText(text, phase);
    }

    // Still bad → fallback
    if (!sanitized) {
      console.log(`[reaction] sanitizer rejected twice: "${text}" — using fallback`);
      const fallbacks = {
        first_hit: 'YES!',
        hit: 'Whoa!',
        streak: 'STREAK!',
        miss: 'Almost!',
        live_watch_hype: 'MORE!',
        live_watch_observe: 'mhmm...',
        mid_song: 'Crushing it!',
        dance_started: "Let's GO!",
        goodbye: 'Same time tomorrow!',
      };
      sanitized = fallbacks[event] || 'Yes!';
    }

    console.log(`[reaction] phase=${phase} event=${event} → "${sanitized}"`);
    res.json({ text: sanitized });
  } catch (e) {
    console.error('[get_nova_reaction]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC v86 (Enterprise Brain) on port ${PORT}`);
  console.log(`Anthropic key: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:    ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`Avatar id:     ${NOVA_AVATAR_ID}`);
});
