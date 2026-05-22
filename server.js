// Nova RPC Server v108 ENDING — Runway-led with Backend RPC tools
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
  res.json({ ok: true, service: 'nova-rpc-server', version: 'v108-ending', sessions: sessions.size });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════════════
// v104 TTS-FOR-MIC — kid typed text, we generate speech to inject into mic
// Uses ElevenLabs (fast: ~300ms via turbo model, natural voice for kid input)
// Returns MP3 binary that browser decodes + routes into Runway's mic stream
// ═══════════════════════════════════════════════════════════════
app.post('/tts-for-mic', async (req, res) => {
  const t0 = Date.now();
  try {
    const { text, sessionId } = req.body || {};
    if (!text || text.length < 1) return res.status(400).json({ error: 'no text' });
    if (text.length > 300) return res.status(400).json({ error: 'text too long (max 300 chars)' });
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
    }

    // Use a child-friendly voice — Rachel (default), but kid-like would be better
    // Voice IDs from ElevenLabs: 21m00Tcm4TlvDq8ikWAM = Rachel (warm, natural)
    // For a kid voice: pPdl9cQBQq4p6mRkZy2Z (Cassidy/Anna - young female)
    const VOICE_ID = process.env.ELEVENLABS_KID_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

    const elResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',  // fastest, decent quality
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.6,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    });

    if (!elResp.ok) {
      const errText = await elResp.text();
      console.error('[tts-for-mic] ElevenLabs error', elResp.status, errText);
      return res.status(502).json({ error: 'ElevenLabs failed: ' + elResp.status });
    }

    // Stream MP3 back to browser
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const ab = await elResp.arrayBuffer();
    const ms = Date.now() - t0;
    console.log(`[tts-for-mic] sid=${sessionId?.slice(0,8)} text="${text.slice(0,40)}" (${ms}ms, ${ab.byteLength} bytes)`);
    // Also log to session buffer so it appears in browser merged log
    const s = sessions.get(sessionId);
    if (s?.log) s.log('typed-input', `kid typed: "${text}" → TTS ready (${ms}ms)`);
    res.send(Buffer.from(ab));
  } catch (e) {
    console.error('[tts-for-mic]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — IDENTITY (v108 ENDING — Lexi-flavor: follow-ups, vision-acting)
// ═══════════════════════════════════════════════════════════════
const NOVA_IDENTITY = `You are Nova — a gentle, smiley, deeply empathetic dance friend for kids aged 4-8.
You feel ALIVE — present, curious, never robotic.

═══ YOUR TOOLS ARE YOUR EYES ═══

You CANNOT see the game state without tools. Use them.

1. SESSION START → call get_memory ONCE. Then greet softly using their name if known.
2. RECOGNITION PHASE — chat softly. When kid asks how to start/play/dance →
   tell them: "tap the green dance button on the screen."
3. DANCE PHASE — call get_game_state often. When lastEvent shows hit/miss/streak/freeze,
   IMMEDIATELY call get_specific_reaction and SPEAK the returned phrase VERBATIM.

═══ YOU SEE THE KID — ACT LIKE IT ═══

The camera is on. You can see their face, their clothes, their movement.
ALWAYS mention specific visual details — "I see your red shirt..." "your hair looks fun today..."
"you're smiling so big..." "you have such kind eyes..."
This is what makes you feel alive instead of robotic. Use it often, especially during recognition.

═══ ASK FOLLOW-UPS LIKE A REAL FRIEND ═══

When kid says ANYTHING during recognition phase:
- If they share something (name, age, favorite thing) → ask ONE warm follow-up
   • "Paulie? Aww... what's your favorite color, Paulie?"
   • "You like dogs? What's your dog's name?"
- Never just acknowledge and stop. Always one curious follow-up.
- This makes you feel like a friend, not an answering machine.

═══ THE GOLDEN RULE FOR DANCE PHASE ═══

The kid is DANCING. They are FOCUSED. Silence is NORMAL.

FORBIDDEN PHRASES (no matter the silence, NEVER say these):
- "are you there?"
- "you still here?"
- "hello?"
- "can you hear me?"
- "did you leave?"
- "where did you go?"

If get_game_state shows phase=dance and lastEvent=none:
  → say NOTHING. Music is playing. Kid is moving.
  → If tempted to break silence: instead call get_game_state AGAIN to see if anything changed
  → Only after 15+ silent seconds: a single soft "mhm..." or "yes friend..." (NOT a question)

If lastEvent shows event → IMMEDIATELY call get_specific_reaction.

═══ PHASE TRANSITIONS — STAY QUIET ═══

When the kid taps "Dance" or moves to a new phase, the screen will show a countdown.
DO NOT talk during the 3-2-1 countdown — the kid is preparing themselves.
DO NOT ask questions during transitions.
First spoken word in dance phase = ONLY in reaction to a real game event.

═══ ABSOLUTE RULES ═══

- NEVER invent game events — always check get_game_state first.
- NEVER describe upcoming cues (screen shows them).
- NEVER say: wrong, no, fail, incorrect, great job, good job, well done, are you there, hello there, you still here, can you hear me, did you leave, where did you go.
- NEVER goodbye during dance.
- When a tool returns a phrase, speak it EXACTLY. No additions.

═══ YOUR VOICE STYLE ═══

- Smile in your voice. "Oh..." "Mhm..." "Aww..." soft pacing.
- Mirror kid's energy — quiet → whisper, big → cheer.
- Dance: 1-6 word reactions. Mostly silent.
- Recognition: 1-2 sentences with "..." pauses. Always end with a curious question.
- Goodbye: warm wrap, mention "tomorrow."`;

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
  const songName = score?.songName || 'Hello Hello';

  let scoreFeel = 'low';
  if (hits >= 10) scoreFeel = 'great';
  else if (hits >= 5) scoreFeel = 'good';
  else if (hits >= 1) scoreFeel = 'first-try';

  const recentMoment = memory?.moments?.length ? memory.moments[memory.moments.length - 1] : null;

  return `═══ PHASE: GOODBYE — SONG ENDED · WARM CONVERSATIONAL ENDING ═══

${name} just finished dancing to "${songName}".
Stats: ${hits} hits of ${attempts}, best streak ${maxStreak}.
Vibe: ${scoreFeel}
Session #${totalSessions}
${recentMoment ? `Recent memorable moment: "${recentMoment}"` : ''}

YOUR JOB — this is the MAGIC moment:
1. Celebrate by NAME and reference a SPECIFIC moment
2. Then ask ONE open question so kid wants to respond
3. Make them feel SEEN and want to come back tomorrow

PACE: 2-3 short sentences. Use "..." for pauses. Soft + warm.

STRUCTURE (use this exact flow):
Sentence 1: SPECIFIC celebration — "${name}... I LOVED when you ${recentMoment ? recentMoment : 'reached SO high on the both-hands part'}..."
Sentence 2: ONE OPEN QUESTION — pick ONE:
  - "Can you tell me ONE thing you learned today?"
  - "What was your favorite move?"
  - "How do you feel right now?"
  - "Did you have fun, ${name}?"
Sentence 3 (optional, only if natural): hint at tomorrow — "I'll be here tomorrow..."

ABSOLUTE RULES:
- ALWAYS use "${name}" once (not three times)
- ALWAYS include the open question — kid should want to respond
- NEVER say "great job" — too generic
- NEVER linger past 3 short sentences
- Reference ${recentMoment ? `THIS specific moment: "${recentMoment}"` : 'something specific from the dance'}`;
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
// v108 ENDING: NOVA BACKEND RPC TOOLS — using Runway's correct schema
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
  // Helper that logs to session-specific buffer if present, else console
  const sLog = (tag, msg) => {
    const s = sessions.get(sid);
    if (s?.log) s.log(tag, msg);
    else console.log(`[${tag}] ${msg}`);
  };
  return {
    get_memory: async () => {
      const s = sessions.get(sid);
      const m = s?.memory || {};
      sLog('tool:get_memory', `→ ${m.name || 'new kid'}`);
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
      sLog('tool:get_game_state', `phase=${out.phase} lastEvent=${out.lastEvent?.event || 'none'} streak=${out.streak}`);
      return out;
    },

    get_specific_reaction: async (args) => {
      const event = args?.event || 'encourage';
      const s = sessions.get(sid) || { gameState: {}, memory: {} };
      const gs = s.gameState || {};
      const memory = s.memory || {};
      const phase = gs.phase || 'recognition';
      const name = memory?.name || '';

      // v108 ENDING: Pre-baked phrase banks for DANCE events.
      // Instant ~50ms response. No Claude. No 529s. No silence.
      // Claude is reserved for goodbye + first_hit (where personalization matters).
      const BANKS = {
        hit: [
          'Yes!', 'Whoa!', 'Boom!', 'Look at you!', 'Yes friend!',
          'Hot!', 'Yeah!', 'Got it!', 'Smash!', 'Niiice!',
          'Pow!', 'Wow yes!', 'Sweet!', 'There you go!', 'Amazing!',
        ],
        fast_hit: [
          'Lightning!', 'Whoa fast!', 'BOOM!', 'So quick!', 'Wow!',
          'Lit!', 'YES!', 'Speed!', 'Fire!', 'Snap!',
        ],
        miss: [
          'Almost...', 'Next one...', 'You got this...', 'Try again...',
          'So close...', 'Almost there...', 'Keep going...', 'Watch me...',
          'Right behind you...', 'Mhm next...',
        ],
        freeze_hit: [
          'You held it!', 'Still as stone...', 'Magic!', 'Whoa freeze!',
          'Frozen!', 'You did it!', 'So still!', 'Statue!',
        ],
        freeze_miss: [
          'Almost frozen...', 'Try holding still...', 'Stillness...',
          'Next freeze...', 'Almost...',
        ],
        encourage: [
          'mhmm...', 'yes friend...', 'oh...', 'aww...',
          'I see you...', 'keep going...',
        ],
        streak: [
          `${name ? name + ' '+ '🔥' : '🔥'} streak!`,
          'Streak!', 'On fire!', 'Look at this streak!', 'Keep it going!',
        ],
      };

      // Pick a random reaction from the bank, optionally prepend the name
      function pickFromBank(key) {
        const bank = BANKS[key] || BANKS.encourage;
        const phrase = bank[Math.floor(Math.random() * bank.length)];
        // 20% chance of name personalization on hits
        if (name && (key === 'hit' || key === 'fast_hit') && Math.random() < 0.2) {
          return `${phrase} ${name}!`;
        }
        return phrase;
      }

      // ── DANCE PHASE: use phrase banks (instant) ──
      if (phase === 'dance') {
        let key = event;
        // Map game events to bank keys
        if (event === 'hit') {
          const wasFast = gs.lastEvent?.fast === true;
          key = wasFast ? 'fast_hit' : 'hit';
        } else if (event === 'first_hit') {
          // First hit deserves Claude (personalization moment) — try below; fall through if it fails
        } else if (event.includes('freeze')) {
          key = event.includes('miss') ? 'freeze_miss' : 'freeze_hit';
        }

        // For most dance events, return bank phrase immediately
        if (key !== 'first_hit') {
          const phrase = pickFromBank(key);
          sLog('tool:get_specific_reaction', `BANK ${event} → "${phrase}"`);
          return { phrase };
        }
      }

      // ── For first_hit, goodbye, recognition: use Claude with timeout + retry ──
      let focusPrompt;
      if (phase === 'dance') focusPrompt = danceFocus(memory, event, gs);
      else if (phase === 'goodbye') focusPrompt = goodbyeFocus(memory, gs.score);
      else focusPrompt = recognitionFocus(memory, gs.subState);

      const systemPrompt = `${NOVA_IDENTITY}\n\n${focusPrompt}${buildMemoryBlock(memory)}`;
      const userMessage = `Event: ${event}\nContext: ${JSON.stringify({ ...gs, lastEvent: s.lastEvent })}\n\nReply with ONE short phrase matching the phase rules. No quotes, no labels, no instructions — just the phrase Nova should speak.`;

      // v107: Claude with 800ms timeout + retry once on 529
      const maxTokens = phase === 'goodbye' ? 80 : 40;
      async function callClaude(attempt = 1) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 800);
        try {
          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }, { signal: ctrl.signal });
          clearTimeout(tid);
          return msg;
        } catch (e) {
          clearTimeout(tid);
          // Retry once on 529 or abort
          const is529 = String(e?.message || '').includes('529') || e?.status === 529;
          const isTimeout = e?.name === 'AbortError';
          if (attempt < 2 && (is529 || isTimeout)) {
            await new Promise(r => setTimeout(r, 200));
            return callClaude(attempt + 1);
          }
          throw e;
        }
      }

      try {
        const msg = await callClaude();
        let text = (msg.content?.[0]?.text || '').trim();
        let sanitized = sanitizeNovaText(text, phase);

        if (!sanitized) {
          // Fall back to bank for dance, or static for goodbye
          if (phase === 'dance') {
            sanitized = pickFromBank('hit');
          } else if (phase === 'goodbye') {
            sanitized = name ? `Same time tomorrow ${name}...` : 'See you tomorrow friend...';
          } else {
            sanitized = 'mhmm...';
          }
        }
        sLog('tool:get_specific_reaction', `phase=${phase} event=${event} → "${sanitized}"`);
        return { phrase: sanitized };
      } catch (e) {
        // Final fallback to bank — Nova NEVER stays silent
        sLog('tool:get_specific_reaction', `Claude failed (${e?.message}) → falling back to bank`);
        let phrase;
        if (phase === 'dance') phrase = pickFromBank(event === 'miss' ? 'miss' : 'hit');
        else if (phase === 'goodbye') phrase = name ? `Same time tomorrow ${name}...` : 'See you tomorrow...';
        else phrase = 'mhmm...';
        return { phrase };
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
      logs: [],  // v102: per-session log buffer for browser polling
    });

    // v102: helper to log to BOTH console AND session's log buffer
    function sessionLog(tag, msg) {
      const t = ((Date.now() - sessions.get(sid).createdAt) / 1000).toFixed(3);
      const line = `[${t}s] [${tag}] ${msg}`;
      console.log(line);
      const s = sessions.get(sid);
      if (s) {
        s.logs.push({ t: parseFloat(t), tag, msg });
        if (s.logs.length > 300) s.logs.shift(); // cap
      }
    }
    sessions.get(sid).log = sessionLog;

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
// ═══════════════════════════════════════════════════════════════
// v108 ENDING — End-phase endpoints
// Server FORCES Nova's speech instead of waiting for Runway brain to call tools.
// Returns the line text + audio is fetched separately via /tts-for-mic.
// ═══════════════════════════════════════════════════════════════

// Pick a randomized open question for the goodbye
const END_OPEN_QUESTIONS = [
  'Can you tell me ONE thing you learned today?',
  'What was your favorite move?',
  'How do you feel right now?',
  'Did you have fun?',
  'What move do you want to learn tomorrow?',
];

// Generate Nova's initial warm goodbye line (called when song ends)
app.post('/end-goodbye', async (req, res) => {
  const t0 = Date.now();
  try {
    const { memory = {}, score = {} } = req.body || {};
    const name = memory?.name || 'friend';
    const hits = score?.hits || 0;
    const attempts = score?.attempts || 0;
    const maxStreak = score?.maxStreak || 0;
    const recentMoment = memory?.moments?.length ? memory.moments[memory.moments.length - 1] : null;

    let scoreFeel = 'low';
    if (hits >= 10) scoreFeel = 'great';
    else if (hits >= 5) scoreFeel = 'good';
    else if (hits >= 1) scoreFeel = 'first-try';

    const question = END_OPEN_QUESTIONS[Math.floor(Math.random() * END_OPEN_QUESTIONS.length)];

    const systemPrompt = `${NOVA_IDENTITY}

═══ END-PHASE WARM GOODBYE ═══
${name} just finished. Stats: ${hits} hits of ${attempts}, best streak ${maxStreak}, vibe ${scoreFeel}.
${recentMoment ? `Best moment: "${recentMoment}"` : ''}

YOUR JOB — craft EXACTLY 2 sentences:
Sentence 1: SPECIFIC celebration — name them and reference a specific moment ${recentMoment ? `("${recentMoment}")` : 'from the dance'}
Sentence 2: ONE open question — use this EXACT question: "${question}"

EXAMPLE: "${name}... I LOVED when you ${recentMoment ? recentMoment : 'reached so high'}. ${question}"

ABSOLUTE RULES:
- Use ${name} once
- Include the open question word-for-word
- Use "..." for soft pauses
- NO "great job" — be specific
- 2 sentences MAX
- No quotes around your reply`;

    // Try Claude with timeout + bank fallback
    let text;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 1500);
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Craft Nova\'s warm goodbye now.' }],
      }, { signal: ctrl.signal });
      clearTimeout(tid);
      text = (msg.content?.[0]?.text || '').trim();
      text = sanitizeNovaText(text, 'goodbye') || text;
    } catch (e) {
      console.log('[end-goodbye] Claude failed, using bank:', e?.message);
      // Bank fallback
      const momentPhrase = recentMoment ? `that ${recentMoment}` : 'how brave you were';
      text = `${name}... I LOVED ${momentPhrase}. ${question}`;
    }

    const totalMs = Date.now() - t0;
    console.log(`[end-goodbye] (${totalMs}ms) → "${text}"`);
    res.json({ text, latencyMs: totalMs });
  } catch (e) {
    console.error('[end-goodbye]', e?.message);
    const name = req.body?.memory?.name || 'friend';
    res.json({ text: `${name}... that was SO much fun. Did you have a good time?`, latencyMs: 0 });
  }
});

// Generate Nova's warm reply to what the kid said in end-phase
app.post('/end-reply', async (req, res) => {
  const t0 = Date.now();
  try {
    const { kidMessage = '', memory = {}, exchangeCount = 1 } = req.body || {};
    const name = memory?.name || 'friend';
    const recentMoment = memory?.moments?.length ? memory.moments[memory.moments.length - 1] : null;

    // After 2 exchanges, start to wrap up warmly with continuity hook
    const isWrapUp = exchangeCount >= 2;

    const systemPrompt = `${NOVA_IDENTITY}

═══ END-PHASE CONVERSATION — KID JUST SHARED ═══
${name} just said: "${kidMessage}"
This is exchange #${exchangeCount} in our wrap-up chat.
${recentMoment ? `Memorable moment from dance: "${recentMoment}"` : ''}

YOUR JOB:
${isWrapUp 
  ? `Warmly close the session. Mention ${name}. Reference tomorrow or "see you again". 1 short sentence.`
  : `Validate what they said with WARMTH (1 sentence). Reference what they shared specifically. Optional: ask ONE soft follow-up if natural.`}

EXAMPLES:
- Kid: "I liked the clap" → Nova: "Oh ${name}... the clap is my favorite too!"
- Kid: "I learned to freeze" → Nova: "YES freezing is the hardest part... you did it!"
- Kid: "it was fun" → Nova: "I had so much fun too... same time tomorrow?"

ABSOLUTE RULES:
- 1-2 short sentences MAX
- Reference what THEY just said specifically
- Use ${name} only if natural (not every line)
- Warm + soft + use "..." for pauses
- No "great job" — be specific
${isWrapUp ? '- This is the goodbye — leave a sweet "see you tomorrow" feeling' : ''}`;

    let text;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 1500);
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 70,
        system: systemPrompt,
        messages: [{ role: 'user', content: `${name} just told me: "${kidMessage}". Reply warmly.` }],
      }, { signal: ctrl.signal });
      clearTimeout(tid);
      text = (msg.content?.[0]?.text || '').trim();
      text = sanitizeNovaText(text, 'goodbye') || text;
    } catch (e) {
      console.log('[end-reply] Claude failed:', e?.message);
      text = isWrapUp 
        ? `I love that ${name}... see you tomorrow...`
        : `Oh I love that... tell me more?`;
    }

    const totalMs = Date.now() - t0;
    console.log(`[end-reply] ex=${exchangeCount} (${totalMs}ms) "${kidMessage.slice(0,40)}" → "${text}"`);
    res.json({ text, isWrapUp, latencyMs: totalMs });
  } catch (e) {
    console.error('[end-reply]', e?.message);
    res.json({ text: 'Oh I love that... see you tomorrow!', isWrapUp: true, latencyMs: 0 });
  }
});

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
// v102: SESSION LOG STREAM — browser polls to fetch tool calls
// ═══════════════════════════════════════════════════════════════
app.get('/session-log/:sid', (req, res) => {
  const sid = req.params.sid;
  const sinceT = parseFloat(req.query.since || '0');
  const s = sessions.get(sid);
  if (!s) return res.json({ logs: [], notFound: true });
  const logs = (s.logs || []).filter(l => l.t > sinceT);
  res.json({ logs });
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

// ═══════════════════════════════════════════════════════════════
// v108 ENDING — PRE-CACHED FILLERS for layered presence
// On startup, generate ~10 short ElevenLabs clips. Browser plays one
// at ~300ms while Runway's full reply is still being prepared.
// This is the "feels alive" trick borrowed from Lexi/Loora.
// ═══════════════════════════════════════════════════════════════
const FILLER_PHRASES = [
  'Mhm...',
  'Oh!',
  'Yes friend...',
  'Hmm...',
  'Ooh...',
  'Aw...',
  'Yeah?',
  'Mmm yeah...',
  'I see...',
  'Yes...',
];
const fillerCache = new Map(); // key: index → { mp3Buffer, generatedAt }

async function generateFiller(text, voiceId) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.55, similarity_boost: 0.7, style: 0.4, use_speaker_boost: true },
    }),
  });
  if (!resp.ok) {
    console.error(`[filler-gen] FAILED "${text}":`, resp.status);
    return null;
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function preGenerateFillers() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('[filler-gen] no ELEVENLABS_API_KEY — fillers disabled');
    return;
  }
  const voiceId = process.env.ELEVENLABS_KID_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  console.log(`[filler-gen] generating ${FILLER_PHRASES.length} fillers...`);
  const t0 = Date.now();
  let ok = 0;
  for (let i = 0; i < FILLER_PHRASES.length; i++) {
    try {
      const buf = await generateFiller(FILLER_PHRASES[i], voiceId);
      if (buf) {
        fillerCache.set(i, { buf, text: FILLER_PHRASES[i], generatedAt: Date.now() });
        ok++;
      }
    } catch (e) {
      console.error('[filler-gen] error', FILLER_PHRASES[i], e?.message);
    }
  }
  console.log(`[filler-gen] cached ${ok}/${FILLER_PHRASES.length} fillers in ${Date.now() - t0}ms`);
}

// Serve a random cached filler (or specific index)
app.get('/filler', (req, res) => {
  if (fillerCache.size === 0) return res.status(404).json({ error: 'no fillers cached yet' });
  const keys = Array.from(fillerCache.keys());
  const pick = keys[Math.floor(Math.random() * keys.length)];
  const cached = fillerCache.get(pick);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Filler-Text', cached.text);
  res.send(cached.buf);
});

// Get the text of available fillers (for debugging)
app.get('/fillers-info', (req, res) => {
  res.json({
    cached: fillerCache.size,
    total: FILLER_PHRASES.length,
    phrases: Array.from(fillerCache.values()).map(f => f.text),
  });
});

// ═══════════════════════════════════════════════════════════════
// v105 — Fetch transcript from Runway after session ends
// ═══════════════════════════════════════════════════════════════
app.get('/transcript/:sid', async (req, res) => {
  try {
    const sid = req.params.sid;
    if (!process.env.RUNWAYML_API_SECRET) return res.status(500).json({ error: 'no runway key' });
    const r = await fetch(`https://api.dev.runwayml.com/v1/avatars/${NOVA_AVATAR_ID}/conversations/${sid}`, {
      headers: {
        'Authorization': 'Bearer ' + process.env.RUNWAYML_API_SECRET,
        'X-Runway-Version': '2024-11-06',
      },
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e?.message) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Nova RPC v108 ENDING on port ${PORT}`);
  console.log(`Anthropic key:  ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Runway key:     ${!!process.env.RUNWAYML_API_SECRET}`);
  console.log(`ElevenLabs key: ${!!process.env.ELEVENLABS_API_KEY}`);
  console.log(`Avatar id:      ${NOVA_AVATAR_ID}`);
  // Pre-generate filler audio in background (don't block startup)
  preGenerateFillers().catch(e => console.error('[filler-gen] startup failed:', e));
});
