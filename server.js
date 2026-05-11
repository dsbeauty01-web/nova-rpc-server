// Nova RPC Server — creates Runway sessions + handles Claude brain RPC
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import RunwayML from '@runwayml/sdk';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS
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

// In-memory sessions
const sessions = new Map();

// Health
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'nova-rpc-server', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// Create Runway avatar session
app.post('/create-session', async (req, res) => {
  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      return res.status(500).json({ error: 'RUNWAYML_API_SECRET not set on server' });
    }

    // Create a Runway realtime session for the avatar
    const sessionResp = await runway.realtimeSessions.create({
      model: 'gwm1_avatars',
      avatar: {
        type: 'custom',
        avatarId: NOVA_AVATAR_ID,
      },
    });

    const sid = sessionResp.id || ('nova-' + Date.now());

    // Poll until session is READY (Runway provisions in ~5-15s)
    let ready = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45000) {  // up to 45s
      const status = await runway.realtimeSessions.retrieve(sid);
      console.log(`[create-session] ${sid} status=${status.status}`);
      if (status.status === 'READY') {
        ready = status;
        break;
      }
      if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        throw new Error(`Session ${status.status}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!ready) throw new Error('Session did not become READY within 45s');

    // Call Runway's /consume endpoint with the sessionKey to get LiveKit creds
    const consumeResp = await fetch('https://api.dev.runwayml.com/v1/realtime_sessions/' + sid + '/consume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ready.sessionKey,
        'X-Runway-Version': '2024-11-06',
        'Content-Type': 'application/json',
      },
    });

    if (!consumeResp.ok) {
      const errText = await consumeResp.text();
      throw new Error('Consume failed: ' + consumeResp.status + ' ' + errText);
    }
    const consume = await consumeResp.json();
    console.log('[create-session] consume returned', JSON.stringify(consume).slice(0, 200));

    sessions.set(sid, {
      id: sid,
      phase: 'arrival',
      gameState: {},
      lastEvent: null,
      createdAt: Date.now(),
    });

    console.log(`[create-session] READY sid=${sid}`);
    res.json({
      sessionId: sid,
      id: sid,
      // Pass through what /consume returned — client looks for serverUrl + token
      serverUrl: consume.serverUrl || consume.url || consume.wsUrl,
      token: consume.token || consume.accessToken || consume.participantToken,
      sessionKey: ready.sessionKey,
      expiresAt: ready.expiresAt,
      raw: { ready, consume },
    });
  } catch (e) {
    console.error('[create-session] ERROR', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Update game state
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

// get_nova_reaction RPC
app.post('/get_nova_reaction', async (req, res) => {
  try {
    const { sessionId, event } = req.body || {};
    const s = sessions.get(sessionId) || { gameState: {}, lastEvent: null };
    const gs = s.gameState || {};

    const systemPrompt = `You are Nova — an 11-year-old AI dance friend for kids 4-7.

VOICE RULES (HARD):
- Reactions: 1-6 words MAX.
- Free chat: 2 sentences MAX.
- Always end with energy.
- Reply ONLY with what Nova says — no quotes, no labels, no asterisks, no stage directions.
- NEVER say: wrong, no, fail, oops, miss, incorrect, great job, good job, well done.

PHASE AWARENESS:
- phase=arrival: first hello.
- phase=recognition: meeting the kid; never say goodbye.
- phase=ready: ONE excited line inviting to dance.
- phase=dance: kid is dancing; NEVER ask "are you there", NEVER say goodbye.
- phase=goodbye: ONLY here you wrap up.

SUB-STATE:
- awaiting_name: warmly ask name once.
- silent_medium: gentle nudge.
- silent_long: offer typing.
- name_unclear: ask warmly for repeat.
- moved_during_intro: acknowledge dancing, redirect to name.
- name_skipped: call them "Star Friend".
- recognized: use name with joy.
- cue_window / cue_prep: stay QUIET.
- high_motion: BIG specific hype.
- medium_motion: warm short observation.
- low_motion: stay quiet.
- wrapping_up: warm goodbye + tomorrow.

EVENTS:
- live_watch_hype: BIG cheer.
- live_watch_observe: warm observation.
- hit: 1-3 word celebration.
- streak: BIG celebration of streak number.
- miss: never "miss"; "almost!" + energy.
- cue_incoming: short heads-up.

State:
${JSON.stringify(gs, null, 2)}

Last event: ${JSON.stringify(s.lastEvent || { type: event })}

Reply with ONLY Nova's words.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Event: ${event || 'unknown'}` }],
    });

    const text = (message.content?.[0]?.text || '').trim();
    console.log(`[reaction] event=${event} phase=${gs.phase} sub=${gs.subState} → "${text}"`);
    res.json({ text });
  } catch (e) {
    console.error('[get_nova_reaction]', e?.message || e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC server on port ${PORT}`);
  console.log(`Anthropic key: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:    ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`Avatar id:     ${NOVA_AVATAR_ID}`);
});
