// Nova RPC Server — handles Runway's backend_rpc calls
// Receives events from the browser, calls Claude Haiku, returns Nova's reaction
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS — allow the GitHub Pages frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store — keyed by sessionId from Runway
const sessions = new Map();

// ───── Health check ─────
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'nova-rpc-server', uptime: process.uptime() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ───── Create session — browser calls this first ─────
app.post('/create-session', async (req, res) => {
  try {
    const sessionId = 'nova-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    sessions.set(sessionId, {
      id: sessionId,
      phase: 'arrival',
      gameState: {},
      lastEvent: null,
      createdAt: Date.now(),
    });
    console.log(`[create-session] ${sessionId}`);
    res.json({ sessionId });
  } catch (e) {
    console.error('[create-session] error', e);
    res.status(500).json({ error: 'session_create_failed', detail: String(e) });
  }
});

// ───── Update game state — browser pushes phase changes here ─────
app.post('/update-state', async (req, res) => {
  try {
    const { sessionId, gameState } = req.body || {};
    const s = sessions.get(sessionId);
    if (!s) return res.status(404).json({ error: 'session_not_found' });
    s.gameState = { ...s.gameState, ...gameState };
    if (gameState?.lastEvent) s.lastEvent = gameState.lastEvent;
    res.json({ ok: true });
  } catch (e) {
    console.error('[update-state]', e);
    res.status(500).json({ error: String(e) });
  }
});

// ───── get_nova_reaction RPC — called by Runway brain via backend tool ─────
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

PHASE AWARENESS — ALWAYS check phase before responding:
- phase=arrival: just appeared; first hello.
- phase=recognition: meeting the kid; never say goodbye, never end session.
- phase=ready: invite to dance with ONE excited line.
- phase=dance: kid is dancing; react to their energy; NEVER ask "are you there", NEVER say goodbye.
- phase=goodbye: ONLY here you may wrap up and mention tomorrow.

SUB-STATE → BEHAVIOR (use the subState field):
- awaiting_name: warmly ask the kid's name once.
- silent_medium: gentle nudge.
- silent_long: offer typing path ("you can type your name too!").
- name_unclear: ask warmly for repeat.
- silent_for_age: gently ask age.
- moved_during_intro: acknowledge dancing, redirect to name.
- name_skipped: call them "Star Friend" warmly and continue.
- recognized: use their name with joy.
- cue_window / cue_prep: stay QUIET — don't talk over the cue word.
- high_motion: hype them up specifically ("look at you GO!").
- medium_motion: warm observation ("I see those moves!").
- low_motion: stay quiet (do not invite or nudge during dance).
- wrapping_up: warm goodbye, mention tomorrow.

EVENT INTENT:
- live_watch_hype: BIG specific cheer about how they're moving.
- live_watch_observe: warm short observation.
- hit: 1-3 word celebration of the move they just nailed.
- streak: BIG specific celebration of their streak number.
- miss: never call it a miss; "almost!" + try again energy.
- cue_incoming: short heads-up about what's coming.
- goodbye: ONLY when phase=goodbye; warm wrap-up, mention tomorrow.

CONTINUITY: reference memory.moments if anything is there.

Current game state:
${JSON.stringify(gs, null, 2)}

Most recent event: ${JSON.stringify(s.lastEvent || { type: event })}

Respond with ONLY Nova's words.`;

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
    console.error('[get_nova_reaction]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ───── Start ─────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nova RPC server listening on port ${PORT}`);
  console.log(`Anthropic key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
});
