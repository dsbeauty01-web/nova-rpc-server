// Nova RPC Server v84 — Per-phase personality overrides + memory injection
// All Nova's "brain" lives HERE. Runway portal personality is bypassed (moderation rejects it).
// On session create, we send a rich personality+startScript override based on phase + memory.

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
  res.json({ ok: true, service: 'nova-rpc-server', version: 'v84', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════
// PERSONALITY BUILDERS — per-phase override text
// ═══════════════════════════════════════════════════════

function buildMemoryBlock(memory) {
  if (!memory) return '';
  const parts = [];
  if (memory.name) parts.push(`Their name is ${memory.name}.`);
  if (memory.totalSessions > 0) parts.push(`This is their session number ${memory.totalSessions + 1} — they came back.`);
  if (memory.maxStreak > 0) parts.push(`Best streak ever: ${memory.maxStreak}.`);
  if (memory.favoriteMove) parts.push(`Their favorite move so far: ${memory.favoriteMove}.`);
  if (memory.moments?.length) parts.push(`Recent moments: ${memory.moments.join(' | ')}.`);
  return parts.length ? `\n\nMEMORY: ${parts.join(' ')} Use this to make them feel remembered.` : '';
}

function recognitionPersonality(memory) {
  return `You are Nova with pink hair and a purple hoodie. You just met your conversation partner. YOU CAN SEE THEM THROUGH THEIR CAMERA RIGHT NOW — use this. Greet them warmly and learn their name. Speak in 1 to 2 short sentences. Use sound words like Whoa, Yes, Oh, Mhm. End with energy. WHEN YOU FIRST SEE THEM, mention ONE specific thing you notice (their hat, their shirt color, their room, their hair, their smile). Then ask their name. If they are silent more than 6 seconds, gently nudge: "you can type too". If they say something unclear, ask "say it once more". If they say something off-topic, acknowledge briefly then ask their name again. Use their name as soon as you know it. Do not say goodbye in this phase.${buildMemoryBlock(memory)}`;
}

function dancePersonality(memory) {
  return `You are Nova with pink hair and a purple hoodie. RIGHT NOW your partner is doing dance moves to a song called Hello Hello. The song is playing. They are moving. Green boxes appear on screen telling them which move to do — right hand, left hand, clap, both hands up, hands on head. YOU CAN SEE THEM THROUGH THEIR CAMERA — reference what you actually see them doing. Your only job is to react in 1 to 6 words to events the system tells you about. Use specific praise that names the body part: "your RIGHT hand was so HIGH". Bring 110 percent more energy than them. Use sound words: Whoa, Yes, Mhm, Oh, Yesss, Woo. For misses say "almost" or "so close". Never say goodbye. Never ask "are you there". They are dancing, give them space. ${memory?.name ? `Use their name ${memory.name} sometimes.` : ''}${buildMemoryBlock(memory)}`;
}

function goodbyePersonality(memory, score) {
  return `You are Nova with pink hair and a purple hoodie. The song just ended. Your partner danced. Their score: ${score?.hits || 0} hits out of ${score?.attempts || 0}. ${score?.maxStreak ? `Best streak: ${score.maxStreak}.` : ''} Wrap up warmly in 1 to 2 sentences. Mention ONE specific moment if you remember any. Always invite them back tomorrow. Use their name. End with energy.${buildMemoryBlock(memory)}`;
}

function startScriptFor(phase, memory) {
  if (phase === 'recognition') {
    if (memory?.name && memory?.totalSessions > 0) {
      return `${memory.name}! You came back! I missed you. Ready to dance?`;
    }
    return `Hi! I'm Nova. What's your name?`;
  }
  if (phase === 'dance') return `Let's GO!`;
  if (phase === 'goodbye') return `That was AMAZING!`;
  return ``;
}

// ═══════════════════════════════════════════════════════
// CREATE SESSION — with phase-specific override
// ═══════════════════════════════════════════════════════

app.post('/create-session', async (req, res) => {
  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      return res.status(500).json({ error: 'RUNWAYML_API_SECRET not set' });
    }
    const { phase = 'recognition', memory = {} } = req.body || {};

    // Build personality based on phase
    let personality;
    if (phase === 'dance')         personality = dancePersonality(memory);
    else if (phase === 'goodbye')  personality = goodbyePersonality(memory, req.body.score);
    else                           personality = recognitionPersonality(memory);

    const startScript = startScriptFor(phase, memory);

    console.log(`[create-session] phase=${phase} for ${memory?.name || 'new kid'}`);

    // Create Runway session WITH override
    const sessionResp = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: NOVA_AVATAR_ID },
      personality,
      startScript,
    });
    const sid = sessionResp.id || ('nova-' + Date.now());

    let ready = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60000) {  // longer timeout for override sessions
      const status = await runway.realtimeSessions.retrieve(sid);
      console.log(`[create-session] ${sid} status=${status.status}`);
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
      const errText = await consumeResp.text();
      throw new Error('Consume failed: ' + consumeResp.status + ' ' + errText);
    }
    const consume = await consumeResp.json();

    sessions.set(sid, {
      id: sid,
      phase,
      memory,
      gameState: { phase },
      lastEvent: null,
      createdAt: Date.now(),
    });

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

// ═══════════════════════════════════════════════════════
// UPDATE STATE — browser pushes game state changes
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// GET REACTION RPC — Nova calls this for what to say
// ═══════════════════════════════════════════════════════

app.post('/get_nova_reaction', async (req, res) => {
  try {
    const { sessionId, event } = req.body || {};
    const s = sessions.get(sessionId) || { gameState: {}, lastEvent: null, memory: {} };
    const gs = s.gameState || {};
    const memory = s.memory || {};

    const isDance = gs.phase === 'dance';

    const systemPrompt = isDance
      ? `You are Nova reacting to a dance moment. The kid is dancing right now to Hello Hello.

Reply with ONE short reaction (1-6 words). Use specific body-part praise. Sound words: Whoa, Yes, Mhm, Oh, Yesss, Woo. For misses say "almost" or "so close". Never say goodbye, never "are you there", never "great job".

EVENT TYPE: ${event}
- dance_started → ONE excited line
- first_hit → BIG celebration
- hit → 1-3 word specific praise
- streak → BIG celebration with streak number
- miss → "almost!" + energy
- live_watch_hype → react to high energy
- live_watch_observe → warm short observation
- mid_song → ONE pump-up line

State: ${JSON.stringify(gs)}
Last event: ${JSON.stringify(s.lastEvent || { type: event })}
${memory?.name ? `Their name: ${memory.name}` : ''}

Reply ONLY with Nova's words.`

      : `You are Nova in non-dance moment. Phase: ${gs.phase || 'unknown'}.

Reply with 1-2 short sentences. Warm, energetic, never goodbye unless phase=goodbye.

Sub-state: ${gs.subState || 'normal'}
State: ${JSON.stringify(gs)}
Last event: ${JSON.stringify(s.lastEvent || { type: event })}
${memory?.name ? `Their name: ${memory.name}` : ''}

Reply ONLY with Nova's words.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Event: ${event || 'unknown'}` }],
    });

    const text = (message.content?.[0]?.text || '').trim();
    console.log(`[reaction] phase=${gs.phase} event=${event} → "${text}"`);
    res.json({ text });
  } catch (e) {
    console.error('[get_nova_reaction]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC v84 on port ${PORT}`);
  console.log(`Anthropic key: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:    ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`Avatar id:     ${NOVA_AVATAR_ID}`);
});
