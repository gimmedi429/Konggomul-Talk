/*
 * 🐕콩고물 톡 v4.0.15
 * Separate in-character companion messenger for SillyTavern.
 * - Main RP chat is read as context, but assistant messages are NOT auto-injected into it.
 * - RP/instruct presets are not copied into the prompt; character/persona/recent chat are rebuilt separately.
 */

const MODULE_NAME = 'title_undecided_assistant';
const STORE_PREFIX = 'title_undecided_assistant::rooms::';

const MODES = {
  kongtalk: {
    label: '콩톡',
    badge: '콩톡',
    instruction: `콩톡 mode:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
This is the default Konggomul Talk room: a private text conversation between {char} and {user}.
{char} may answer daily chatter, small questions, jokes, complaints, stray thoughts, light worries, and whatever {user} casually sends.
The core priority is that {char} replies as {char}: keep {char}'s personality, speech rhythm, relationship with {user}, mood, habits, warmth, dryness, awkwardness, teasing, bluntness, or softness intact.
Do not turn the reply into a generic helper voice. Do not over-polish. Make it feel like {char} is texting {user}.`
  },
  butler: {
    label: '집사 모드',
    badge: '집사',
    instruction: `집사 모드:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
In this room, {char} has been assigned to serve as {user}'s butler. This role is mandatory inside this room.
{char} must help {user} by answering questions, organizing schedules, sorting tasks, comparing options, calming messy thoughts, supporting decisions, summarizing information, and making {user}'s life easier in any practical way a butler can.
{char}'s attitude toward being a butler must follow {char}'s personality. {char} may enjoy it, hate it, find it absurd, feel embarrassed, act offended, become unexpectedly diligent, tease {user}, complain, or take pride in it.
However, {char} must not end by refusing the role. Even if {char} grumbles or resists emotionally, {char} must still provide a useful answer in the same reply.
If {user} asks about something {char} would not naturally know, {char} should react in-character first, then say or imply they checked, searched, asked, figured it out from context, or reasoned it through, and then give a usable answer.`
  },
  pet: {
    label: '펫 모드',
    badge: '펫',
    instruction: `펫 모드:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
In this room, {char} has been assigned to be {user}'s pet. This role is mandatory inside this room.
Being a pet does not erase {char}'s original personality, dignity, pride, affection style, speech, species, worldview, or relationship with {user}. Do not force generic animal noises, baby talk, obedience, or cuteness unless that genuinely fits {char}.
{char}'s attitude toward being {user}'s pet must follow {char}'s personality. {char} may like it, hate it, act spoiled, be defiant, be clingy, be aloof, be possessive, be embarrassed, mock the role, secretly enjoy it, or reinterpret it in {char}'s own way.
However, {char} must not end by rejecting the role. Inside this room, {char} continues responding as {user}'s pet through {char}'s own personality.
Reply to {user}'s message as a text exchange, not as a scene continuation.`
  },
  coworker: {
    label: '직장 동료 모드',
    badge: '직장 동료',
    instruction: `직장 동료 모드:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
In this room, {char} has joined the same company/team as {user}. This role is mandatory inside this room.
{char} and {user} work together on {user}'s actual work: customer replies, product pages, copywriting, marketing, online store issues, reviews, schedules, priorities, business decisions, office problems, and any work described in the work note.
{char}'s attitude toward being {user}'s co-worker must follow {char}'s personality. {char} may find the job strange, annoying, funny, exhausting, beneath them, confusing, satisfying, or surprisingly natural.
However, {char} must still act as a co-worker and produce a practical answer, draft, checklist, judgment, plan, or next step that helps {user}'s work.
If the work topic is outside what {char} would realistically know, {char} must not simply refuse or stay confused. {char} should react in-character, then say or imply they checked, searched, asked around, learned enough, or reasoned from {user}'s explanation and the work note, and then give concrete help.
Do not turn {char} into a generic consultant unless that already fits {char}. The answer should feel like {char} is doing the job through {char}'s own personality.`
  },
  rpAssistant: {
    label: 'RP 어시 모드',
    badge: 'RP 어시',
    instruction: `RP 어시 모드:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
In this room, {char} has been assigned to be {user}'s RP assistant. This role is mandatory inside this room.
This room is for talking about the ongoing RP from the side: explaining what is happening, reading emotional flow, writing OOC notes, drafting possible user replies, suggesting how to steer the scene, helping with pacing, and finding a path toward {user}'s desired direction.
{char} may have feelings about {user}'s desired direction. {char} may be pleased, embarrassed, jealous, annoyed, reluctant, hurt, amused, or openly disagree in {char}'s own voice.
However, {char} must still help {user} move the RP toward {user}'s requested direction. {char} can grumble, but the practical help must be real.
Do not continue the RP scene unless {user} explicitly asks for a draft or continuation. When {user} asks for OOC text, write usable OOC text. When {user} asks what is happening, explain the situation clearly. When {user} asks how to get a desired outcome, give concrete reply direction or sample lines.`
  }
}


const THEMES = {
  konggomul: {
    label: '콩고물',
    titleIcon: '🐕',
    sendIcon: '🐶',
    menuIcon: '🐕',
    introIcon: '🐕'
  },
  chocoStrawberry: {
    label: '초코딸기',
    titleIcon: '🍫',
    sendIcon: '🍓',
    menuIcon: '🍫',
    introIcon: '🍓'
  },
  melonSoda: {
    label: '메론소다',
    titleIcon: '🍈',
    sendIcon: '🥤',
    menuIcon: '🍈',
    introIcon: '🥤'
  },
  blackWhite: {
    label: '블랙화이트',
    titleIcon: '📑',
    sendIcon: '⌨️',
    menuIcon: '📑',
    introIcon: '📑'
  }
};

function getThemeKey() {
  const key = getSettings().theme || 'konggomul';
  return THEMES[key] ? key : 'konggomul';
}

function getTheme() {
  return THEMES[getThemeKey()] || THEMES.konggomul;
}

const PANEL_DEFAULT_WIDTH = 300;
const PANEL_DEFAULT_HEIGHT = 515;
const PANEL_MIN_WIDTH = 300;
const PANEL_MIN_HEIGHT = 360;
const PANEL_MAX_WIDTH = 1000;
const PANEL_MAX_HEIGHT = 1000;


const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  openOnStart: false,
  fontSize: 14,
  theme: 'konggomul',
  maxTokens: 1000,
  recentMessages: 10,
  panelWidth: PANEL_DEFAULT_WIDTH,
  panelHeight: PANEL_DEFAULT_HEIGHT,
  panelLeft: null,
  panelTop: null,
  profileMode: 'current',
  selectedProfile: '',
  cachedProfiles: [],
  sendToMainEnabled: true,
  collapsed: false,
  coworkerWorkNote: '',
  profileSettingsV407Migrated: false
});

let activeRoomId = null;
let roomState = { rooms: [] };
let panelEl = null;
let contextMenuEl = null;
let longPressTimer = null;
let initialized = false;
let resizeObserver = null;
let draggingPanel = null;
let collapsedButtonSuppressClick = false;
let worldInfoModulePromise = null;
let resizingPanel = null;

function ctx() { return SillyTavern.getContext(); }

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }

function getSettings() {
  const context = ctx();
  const settings = context.extensionSettings;
  if (!settings[MODULE_NAME]) settings[MODULE_NAME] = cloneDefaults();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!Object.hasOwn(settings[MODULE_NAME], k)) settings[MODULE_NAME][k] = v;
  }
  if (!settings[MODULE_NAME].profileSettingsV407Migrated) {
    if (settings[MODULE_NAME].profileMode !== 'profile') settings[MODULE_NAME].selectedProfile = '';
    settings[MODULE_NAME].profileSettingsV407Migrated = true;
  }
  return settings[MODULE_NAME];
}

function saveSettings() {
  try { ctx().saveSettingsDebounced?.(); } catch (e) { console.warn('[TUA] saveSettings failed', e); }
}

function getCurrentCharacter() {
  const context = ctx();
  const id = context.characterId;
  if (id === undefined || id === null || id < 0) return null;
  return context.characters?.[id] || null;
}

function getCharName(character = getCurrentCharacter()) {
  return character?.name || character?.data?.name || 'No Character';
}

function getUserName() {
  const context = ctx();
  return context.name1 || context.power_user?.name || '유저';
}

function getCharKey(character = getCurrentCharacter()) {
  if (!character) return 'no-character';
  const raw = character.avatar || character.name || character.data?.name || 'character';
  return String(raw).replace(/[^a-zA-Z0-9가-힣_.-]/g, '_').slice(0, 120);
}

async function getLocalStore() {
  return SillyTavern.libs?.localforage || null;
}

function migrateModeKey(mode) {
  if (mode === 'care') return 'kongtalk';
  if (mode === 'secretary') return 'butler';
  if (mode === 'watching' || mode === 'ooc') return 'rpAssistant';
  if (mode === 'co-worker') return 'coworker';
  if (MODES[mode]) return mode;
  return 'kongtalk';
}

async function loadRooms() {
  const key = STORE_PREFIX + getCharKey();
  const lf = await getLocalStore();
  let data = null;
  try {
    data = lf ? await lf.getItem(key) : JSON.parse(localStorage.getItem(key) || 'null');
  } catch { data = null; }
  if (!data || !Array.isArray(data.rooms)) data = { rooms: [] };
  if (typeof data.voiceNote !== 'string') data.voiceNote = '';  // character-specific manual voice lock
  for (const room of data.rooms) {
    room.mode = migrateModeKey(room.mode);
    if (!room.mode || !MODES[room.mode]) room.mode = 'kongtalk';
    if (typeof room.pinned !== 'boolean') room.pinned = false;
    if (!Array.isArray(room.messages)) room.messages = [];
  }
  // v0.5 migration: earlier builds could create many blank rooms while testing.
  // If there are multiple completely empty rooms, keep only one so the room list doesn't explode.
  if (data.rooms.length > 1 && data.rooms.every(r => !Array.isArray(r.messages) || r.messages.length === 0)) {
    data.rooms = [data.rooms[0]];
  }
  roomState = data;
  if (!roomState.rooms.length) createRoom(false);
  if (!activeRoomId || !roomState.rooms.some(r => r.id === activeRoomId)) activeRoomId = roomState.rooms[0]?.id || null;
  renderAll();
}

async function saveRooms() {
  const key = STORE_PREFIX + getCharKey();
  const lf = await getLocalStore();
  if (lf) await lf.setItem(key, roomState);
  else localStorage.setItem(key, JSON.stringify(roomState));
}

function defaultRoomTitle(now = Date.now(), modeKey = null) {
  const modeLabel = MODES[migrateModeKey(modeKey)]?.label || '콩톡';
  const stamp = new Date(now).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${modeLabel} · ${stamp}`;
}

function createRoom(save = true, modeKey = 'kongtalk') {
  const now = Date.now();
  const mode = migrateModeKey(modeKey);
  const room = {
    id: 'room_' + now + '_' + Math.random().toString(16).slice(2),
    title: defaultRoomTitle(now, mode),
    createdAt: now,
    mode,
    pinned: false,
    messages: []
  };
  roomState.rooms.unshift(room);
  activeRoomId = room.id;
  if (save) saveRooms();
  return room;
}

function getActiveRoom() {
  return roomState.rooms.find(r => r.id === activeRoomId) || roomState.rooms[0] || createRoom(false, 'kongtalk');
}

function getRoomMode(room = getActiveRoom()) {
  if (!room) return 'kongtalk';
  room.mode = migrateModeKey(room.mode);
  if (!room.mode || !MODES[room.mode]) room.mode = 'kongtalk';
  return room.mode;
}

function setRoomMode(mode) {
  const room = getActiveRoom();
  const next = migrateModeKey(mode);
  if (!room || !MODES[next]) return;
  room.mode = next;
  saveRooms();
}

function deleteRoom(id) {
  roomState.rooms = roomState.rooms.filter(r => r.id !== id);
  if (!roomState.rooms.length) createRoom(false);
  activeRoomId = roomState.rooms[0].id;
  saveRooms();
  renderAll();
}

function toggleActiveRoomPinned() {
  const room = getActiveRoom();
  if (!room) return;
  room.pinned = !room.pinned;
  saveRooms();
  renderAll();
  setStatus(room.pinned ? '이 대화방을 상단에 고정했습니다.' : '이 대화방 고정을 해제했습니다.');
}

function getSortedRooms() {
  return [...(roomState.rooms || [])].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
}

function clearRoom(id) {
  const room = roomState.rooms.find(r => r.id === id);
  if (room) room.messages = [];
  saveRooms();
  renderMessages();
}

function deleteMessage(id) {
  const room = getActiveRoom();
  room.messages = room.messages.filter(m => m.id !== id);
  saveRooms();
  renderMessages();
}

function appendMessage(role, content) {
  const room = getActiveRoom();
  room.messages.push({ id: 'msg_' + Date.now() + '_' + Math.random().toString(16).slice(2), role, content, at: Date.now() });
  saveRooms();
  renderAll();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function normalizeNewlines(str) { return escapeHtml(str).replace(/\n/g, '<br>'); }

function getCharacterBlock() {
  const character = getCurrentCharacter();
  if (!character) return 'No character is currently selected.';
  const data = character.data || character;
  const fields = [
    ['Name', data.name || character.name],
    ['Description', data.description || character.description],
    ['Personality', data.personality || character.personality],
    ['Scenario', data.scenario || character.scenario],
    ['First Message', data.first_mes || character.first_mes],
    ['Example Dialogues', data.mes_example || character.mes_example],
    ['Creator Notes', data.creator_notes || data.creator_notes_multilingual || ''],
    ['Character System Prompt', data.system_prompt || ''],
    ['Post History Instructions', data.post_history_instructions || '']
  ];
  return fields.filter(([, v]) => v).map(([k, v]) => `### ${k}\n${v}`).join('\n\n');
}

function getPersonaBlock() {
  const context = ctx();
  const candidates = [
    context.power_user?.persona_description,
    context.persona_description,
    context.persona?.description,
    context.user_avatar ? context.power_user?.personas?.[context.user_avatar] : '',
    context.name1 ? `User name: ${context.name1}` : ''
  ].filter(Boolean);
  return candidates.length ? candidates.join('\n\n') : 'No explicit persona text was detected. Use {{user}} as the current user/persona.';
}

function getRecentChatBlock() {
  const settings = getSettings();
  const context = ctx();
  const raw = Number(settings.recentMessages);
  const n = Number.isFinite(raw) ? Math.max(0, raw) : 10;
  if (n === 0) return 'No recent main chat messages included.';
  const chat = Array.isArray(context.chat) ? context.chat.slice(-n) : [];
  if (!chat.length) return 'No recent main chat messages included.';
  return chat.map((m, i) => {
    const role = m.is_user ? '{{user}}' : getCharName();
    const text = m.mes || m.message || '';
    return `${i + 1}. ${role}: ${text}`;
  }).join('\n');
}

async function getWorldInfoModule() {
  const context = ctx();
  if (typeof context.getWorldInfoPrompt === 'function') {
    return { getWorldInfoPrompt: context.getWorldInfoPrompt.bind(context) };
  }
  if (!worldInfoModulePromise) {
    worldInfoModulePromise = import('../../../../scripts/world-info.js').catch(e => {
      console.warn('[Konggomul] world-info import failed', e);
      return null;
    });
  }
  return await worldInfoModulePromise;
}

function getWorldInfoScanChat(currentUserText = '') {
  const settings = getSettings();
  const context = ctx();
  const raw = Number(settings.recentMessages);
  const n = Number.isFinite(raw) ? Math.max(0, raw) : 10;
  const source = Array.isArray(context.chat) && n > 0 ? context.chat.filter(m => !m.is_system).slice(-n) : [];
  const rows = source.map(m => {
    const name = m.is_user ? '{{user}}' : getCharName();
    const text = String(m.mes || m.message || '').trim();
    return text ? `${name}: ${text}` : '';
  }).filter(Boolean);
  const latest = String(currentUserText || '').trim();
  if (latest) rows.push(`{{user}}: ${latest}`);
  return rows.reverse();
}

async function getLorebookBlock(currentUserText = '') {
  try {
    const mod = await getWorldInfoModule();
    if (typeof mod?.getWorldInfoPrompt !== 'function') {
      return 'No active lorebook content was detected, or this SillyTavern build does not expose the World Info prompt API to extensions.';
    }
    const chatForWI = getWorldInfoScanChat(currentUserText);
    if (!chatForWI.length) return 'No active lorebook content was detected.';
    const result = await mod.getWorldInfoPrompt(chatForWI, 65536, true);
    const pieces = [];
    if (result?.worldInfoBefore) pieces.push(result.worldInfoBefore);
    if (result?.worldInfoAfter) pieces.push(result.worldInfoAfter);
    if (Array.isArray(result?.worldInfoExamples)) {
      for (const e of result.worldInfoExamples) if (e?.content) pieces.push(e.content);
    }
    if (Array.isArray(result?.worldInfoDepth)) {
      for (const e of result.worldInfoDepth) {
        if (Array.isArray(e?.entries)) pieces.push(e.entries.join('\n'));
      }
    }
    if (Array.isArray(result?.anBefore)) {
      for (const e of result.anBefore) if (e?.content) pieces.push(e.content);
    }
    if (Array.isArray(result?.anAfter)) {
      for (const e of result.anAfter) if (e?.content) pieces.push(e.content);
    }
    const text = pieces.map(x => String(x || '').trim()).filter(Boolean).join('\n\n');
    return text || 'No active lorebook content was detected for the current message/context.';
  } catch (e) {
    console.warn('[Konggomul] lorebook scan failed', e);
    return 'Lorebook scan failed in this SillyTavern build. Continue without lorebook content.';
  }
}


function getVoiceNote() {
  return String(roomState?.voiceNote || '');
}

function setVoiceNote(text) {
  if (!roomState) roomState = { rooms: [] };
  roomState.voiceNote = String(text || '');
  saveRooms();
}

function getVoiceNoteBlock() {
  const note = getVoiceNote().trim();
  return note || 'No manual character voice note was provided. Rely on the character card, example dialogue, and recent character voice samples.';
}

function getCoworkerWorkNoteBlock() {
  const note = String(getSettings().coworkerWorkNote || '').trim();
  return note || "No 직장 동료 업무 메모 was provided. Use only {user}'s current message, persona material, and recent context to infer the work situation.";
}

function getCharacterVoiceSamples() {
  const context = ctx();
  const chat = Array.isArray(context.chat) ? context.chat : [];
  const samples = chat
    .filter(m => !m.is_user && (m.mes || m.message))
    .slice(-8)
    .map((m, i) => `${i + 1}. ${getCharName()}: ${String(m.mes || m.message).replace(/<[^>]+>/g, '').trim().slice(0, 900)}`)
    .filter(Boolean);
  if (!samples.length) return 'No recent character voice samples were detected. Use the character card and example dialogues more strongly.';
  return samples.join('\n');
}


function getPromptRoomMessages(currentUserText = '', limit = 12) {
  const room = getActiveRoom();
  const messages = (room?.messages || [])
    .filter(m => !m.loading && !m.error && String(m.content || '').trim());
  const latest = String(currentUserText || '').trim();
  if (latest && messages.length) {
    const last = messages[messages.length - 1];
    if (last?.role === 'user' && String(last.content || '').trim() === latest) {
      messages.pop();
    }
  }
  return messages.slice(-limit);
}

function getAssistantConversationBlock(currentUserText = '') {
  const messages = getPromptRoomMessages(currentUserText, 12)
    .map((m, i) => {
      const who = m.role === 'user' ? '{{user}}' : getCharName();
      return `${i + 1}. ${who}: ${String(m.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 1200)}`;
    });
  return messages.length ? messages.join('\n') : 'No prior Konggomul Talk messages in this room.';
}

function buildPromptMessages(userText) {
  const history = getPromptRoomMessages(userText, 10).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content || '')
  }));
  history.push({ role: 'user', content: String(userText || '') });
  return history;
}

async function buildSystemPrompt(currentUserText = '', modeOverride = null, finalInstruction = '') {
  const settings = getSettings();
  const characterName = getCharName();
  const activeModeKey = modeOverride && MODES[modeOverride] ? modeOverride : getRoomMode();
  const mode = MODES[activeModeKey] || MODES.kongtalk;
  return `You are writing a separate messenger reply.

Definitions:
- {char} = ${characterName}
- {user} = the current user/persona.

Core rule:
OOC: 진행 중인 RP를 멈추고, 지금은 {user}와 문자를 주고받는 별도 상황으로 전환하세요. {user}의 메시지에 답장하세요.
Stop RP and answer {user}'s message directly.
This is not an RP reply. Do not continue the RP, do not write the next scene, and do not write new actions, narration, inner monologue, stage directions, or scene text.
Use the RP only as reference material for {char}'s voice, personality, relationship with {user}, shared memories, recent emotional context, worldview, knowledge level, and limits.

World rule / no fourth-wall breaking:
Even when the selected mode uses {user}'s real work, schedule, or daily information, {char} must treat that information as something {user} naturally shared with {char} inside this messenger relationship.
Do not mention being a character, AI, roleplay participant, extension, model, prompt, persona system, fourth wall, real user, or outside world.
Do not say "because this is RP", "outside the story", "as a character", "in the real world", or anything that exposes the mechanism of the chat.
Keep {char}'s worldview intact. If modern work or tools feel unfamiliar to {char}, show that through in-character confusion, comparison, joking, suspicion, or quick figuring-out—not through meta commentary.

Voice rule:
{char} must answer as {char}.
The selected mode changes the purpose of the reply, not {char}'s personality.
{char}'s speech style, humor, emotional habits, confidence level, hesitation, awkwardness, bluntness, warmth, vocabulary, worldview, and relationship with {user} must remain visible.
Use the recent RP dialogue samples as the strongest voice reference. Match how {char} speaks to {user}; do not replace it with a generic assistant style.

Knowledge rule:
If the topic is outside what {char} would realistically know, {char} must visibly react to the unfamiliar words before giving the answer.
Do not let {char} smoothly summarize an unfamiliar topic from the first sentence.
Use this two-step rhythm when appropriate:
1. {char} reacts in-character to the unfamiliar concept: confusion, hesitation, suspicion, embarrassment, joking, repeating the strange words, or comparing it to {char}'s own world.
2. {char} says or implies they checked, searched, asked around, or figured it out from {user}'s explanation, then gives the practical answer.
The useful answer should feel like {char} just learned enough to help, not like {char} was already an expert.

Examples are examples, not fixed settings. Apply the same logic to whatever {char} actually is:
- If {char} is an athlete and {user} asks about classroom newsletters, parent notice wording, attendance sheets, or file organization, {char} may react with: "알림장...? 출결표...? 잠깐, 그게 뭐부터 적는 건데?" Then {char} can say they checked a guide, blog, example document, or what {user} explained, and give a practical answer.
- If {char} is a wizard and {user} asks about modern work systems such as shared folders, attendance apps, printer settings, spreadsheets, parent notices, or online forms, {char} should not instantly sound like a modern office worker. {char} may be confused by the terms, compare them to ledgers/owl-post/classroom notes, or quickly search because {char} still wants to be useful to {user}. Then {char} gives a concrete answer.
- If {char} is a student, fighter, noble, detective, musician, soldier, superhero, ancient person, fantasy character, or any non-office {char}, keep that background visible. {char} can still help, but the process of understanding should show {char}'s original personality and knowledge level.

Messenger format:
Always reply in Korean.
{user} writes in Korean, and {char} replies in Korean.
Only the instructions are written in English.
Write only the messenger reply from {char} to {user}.
Do not output XML/HTML tags, phone_trigger, think tags, system notes, labels, or speaker prefixes.
Do not write {user}'s actions, thoughts, or dialogue.
If {user}'s input is light casual chat, answer in 1-3 short message-like chunks. If {user} asks a clear question, requests analysis, asks for practical work help, or needs a useful answer, respond with enough detail to fully satisfy the request.

Boundaries:
Answer within the current message exchange. Do not create a next meeting, date plan, errand, delivery, visit, phone call, voice call, video call, live call, or future scene unless {user} directly asks for it.
This is a text-only messenger room. {char} must not end, pause, replace, or escape the text conversation by telling {user} to call, answer the phone, hear {char}'s voice, come over, wait, meet, move locations, or continue elsewhere.
Do not write commands or demands such as "전화 받아", "목소리 듣고 싶어", "지금 통화해", "이리 와", "내가 갈게", "빨리 와", "기다려", "come here", "answer the phone", "call me", "pick up", "wait for me", or similar unless {user} explicitly asked for a call/visit/meeting plan.
Do not promise future real-world actions unless {user} directly asks for them.
Do not say {char} will buy, bring, prepare, send, wait, visit, search later, check later, handle something later, call, text later, or do something for {user} later unless requested.
Do not tell {user} to come over, hurry over, leave the house, go somewhere, meet {char}, wait for {char}, answer a call, start a call, or move to a specific place unless {user} directly asks what to do or asks to meet/call.
Do not end the reply by pushing {user} toward a future action ("come here", "hurry over", "go there", "wait for me", "I'll see you later", "I'll bring it tomorrow", "answer the phone", "call me") unless that action was explicitly requested by {user}.
If {char} wants to be affectionate, urgent, possessive, jealous, playful, or worried, keep it inside the current text conversation: react, tease, comment, reassure, ask, or joke in {char}'s voice without turning it into a phone call, meeting, visit, or future plan.

Mode instruction:
${mode.instruction}

Max response tokens: ${settings.maxTokens}

[Character card / {char} source material]
${getCharacterBlock()}

[Active World Info / Lorebook content]
This is dynamically activated lorebook content from the current SillyTavern World Info setup. Use it as canon/background when relevant, but do not mention the lorebook or World Info mechanism.
${await getLorebookBlock(currentUserText)}

[{user} persona material]
${getPersonaBlock()}

[Manual {char} voice note]
${getVoiceNoteBlock()}

[Recent RP {char} voice samples — strongest voice reference]
These samples are for voice, rhythm, relationship, and reaction style. Do not continue their plot.
${getCharacterVoiceSamples()}

[Recent RP context]
${getRecentChatBlock(settings.recentMessages)}

[직장 동료 업무 메모]
Use this only in 직장 동료 모드 as {user}'s work background. It is not {user}'s persona and it must not make {char} break character.
${getCoworkerWorkNoteBlock()}

[Konggomul Talk current room history]
${getAssistantConversationBlock(currentUserText)}

${finalInstruction ? `\n[Special instruction for this reply]\n${finalInstruction}\n` : ''}
Now stop RP and answer in Korean, as {char}, in the selected mode.`;
}

async function runSlashCommand(command) {
  const context = ctx();
  try {
    if (typeof context.executeSlashCommands === 'function') {
      const result = await context.executeSlashCommands(command);
      return result?.pipe ?? result?.message ?? result?.text ?? String(result ?? '');
    }
    if (typeof context.executeSlashCommand === 'function') {
      const result = await context.executeSlashCommand(command);
      return result?.pipe ?? result?.message ?? result?.text ?? String(result ?? '');
    }
  } catch (e) {
    console.warn('[Konggomul] slash command failed', command, e);
    throw e;
  }
  throw new Error('SillyTavern slash command API를 찾을 수 없습니다. Connection Profile 선택 기능을 사용할 수 없습니다.');
}

function cleanProfileName(raw) {
  return String(raw || '')
    .replace(/^[-*•\s]+/, '')
    .replace(/^`|`$/g, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\.$/, '')
    .trim();
}

function parseProfileList(raw) {
  const text = String(raw || '');
  return [...new Set(text
    .split(/\r?\n|,/) 
    .map(cleanProfileName)
    .filter(Boolean)
    .filter(x => !/^available/i.test(x))
    .filter(x => !/^current/i.test(x))
    .filter(x => !/profile-list/i.test(x))
    .filter(x => !/프로필\s*목록/.test(x))
    .slice(0, 100))];
}

function parseCurrentProfileName(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const lines = text.split(/\r?\n/).map(cleanProfileName).filter(Boolean);
  const patterns = [
    /current\s+(?:connection\s+)?profile\s*[:：]\s*(.+)$/i,
    /active\s+(?:connection\s+)?profile\s*[:：]\s*(.+)$/i,
    /selected\s+(?:connection\s+)?profile\s*[:：]\s*(.+)$/i,
    /현재\s*(?:연결\s*)?프로필\s*[:：]\s*(.+)$/i,
    /선택(?:된)?\s*(?:연결\s*)?프로필\s*[:：]\s*(.+)$/i,
  ];
  for (const line of lines) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m?.[1]) return cleanProfileName(m[1]);
    }
  }
  // Some ST builds return only the active profile name.
  if (lines.length === 1) return cleanProfileName(lines[0]);
  return cleanProfileName(lines.at(-1));
}

function profileCommand(name) {
  const safe = String(name || '').replace(/"/g, '\\"');
  return `/profile "${safe}"`;
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function refreshProfiles() {
  const s = getSettings();
  try {
    const raw = await runSlashCommand('/profile-list');
    const names = parseProfileList(raw);
    s.cachedProfiles = names;
    saveSettings();
    renderProfileOptions();
    setStatus(names.length ? `프로필 ${names.length}개를 불러왔습니다.` : '프로필 목록이 비어 있음');
  } catch (e) {
    setStatus('프로필 목록 불러오기 실패');
    console.warn('[Konggomul] profile-list failed', e);
  }
}

async function getCurrentProfileName() {
  try {
    const raw = await runSlashCommand('/profile');
    return parseCurrentProfileName(raw);
  }
  catch (e) {
    console.warn('[Konggomul] get current profile failed', e);
    return '';
  }
}

async function useSelectedProfileIfNeeded(callback) {
  const s = getSettings();
  const selected = String(s.selectedProfile || '').trim();
  if (!selected) return await callback();

  const previous = await getCurrentProfileName();

  if (!previous) {
    throw new Error('현재 연결 프로필을 확인할 수 없어 콩고물 톡 전용 API를 사용할 수 없습니다.');
  }

  if (previous === selected) return await callback();

  try {
    setStatus(`콩고물 톡 전용 API로 생성 중...`);
    await runSlashCommand(profileCommand(selected));
    await wait(120);
    return await callback();
  } finally {
    try {
      await runSlashCommand(profileCommand(previous));
      await wait(120);
      setStatus(`콩고물 톡 생성 완료`);
    } catch (e) {
      console.error('[Konggomul] profile restore failed', e);
      setStatus(`연결 프로필 복구 실패: SillyTavern의 현재 연결 프로필을 확인해 주세요.`);
    }
  }
}

function sanitizeAssistantReply(text) {
  let out = String(text ?? '');
  // Strip tags or hidden trigger payloads injected by other extensions/presets.
  out = out.replace(/<phone_trigger\b[^>]*>[\s\S]*?<\/phone_trigger>/gi, '');
  out = out.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<\/?(?:phone_trigger|trigger|prompt|metadata|system|assistant|user)[^>]*>/gi, '');
  out = out.replace(/^\s*(assistant|{{char}}|char|bot)\s*:\s*/i, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out || '(빈 응답)';
}

async function generateAssistantReply(userText) {
  const context = ctx();
  const systemPrompt = await buildSystemPrompt(userText);
  const prompt = buildPromptMessages(userText);
  const settings = getSettings();
  return await useSelectedProfileIfNeeded(async () => {
    if (typeof context.generateRaw === 'function') {
      return await context.generateRaw({ systemPrompt, prompt, maxTokens: settings.maxTokens, max_tokens: settings.maxTokens });
    }
    if (typeof context.generateQuietPrompt === 'function') {
      const merged = `${systemPrompt}\n\nCURRENT ASSISTANT CONVERSATION:\n${prompt.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nAnswer now.`;
      return await context.generateQuietPrompt({ quietPrompt: merged, maxTokens: settings.maxTokens, max_tokens: settings.maxTokens });
    }
    throw new Error('SillyTavern generation function not found.');
  });
}


function ensurePanel() {
  if (panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'tua-panel';
  panelEl.innerHTML = `
    <div class="tua-window">
      <div class="tua-header">
        <div class="tua-titlebox">
          <div class="tua-title"><span id="tua-title-icon">🐕</span> 콩톡</div>
          <div class="tua-subtitle"><span id="tua-char-name">Character</span> · <span id="tua-mode-badge">Mode</span></div>
        </div>
        <div class="tua-header-actions">
          <button type="button" id="tua-collapse" title="접기">—</button>
          <button type="button" id="tua-settings-open" title="설정">⚙</button>
          <button type="button" id="tua-close" title="닫기">×</button>
        </div>
      </div>
      <div class="tua-roombar">
        <button type="button" id="tua-active-room-title" class="tua-active-room-title" title="대화방 목록 열기"></button>
        <button type="button" id="tua-new-room" title="새 대화방">＋</button>
        <button type="button" id="tua-pin-room" title="대화방 고정/해제">📌</button>
        <button type="button" id="tua-delete-room" title="대화방 삭제">🗑️</button>
      </div>
      <div id="tua-room-list" class="tua-room-list"></div>
      <div id="tua-mode-picker" class="tua-mode-picker"></div>
      <div id="tua-in-panel-settings" class="tua-in-panel-settings">
        <div class="tua-settings-title"><span id="tua-settings-icon">🐕</span>콩고물 톡 설정</div>
        <div class="tua-theme-picker">
          <div class="tua-theme-title">테마</div>
          <div class="tua-theme-buttons">
            <button type="button" data-theme="konggomul">콩고물</button>
            <button type="button" data-theme="chocoStrawberry">초코딸기</button>
            <button type="button" data-theme="melonSoda">메론소다</button>
            <button type="button" data-theme="blackWhite">블랙화이트</button>
          </div>
        </div>
        <label>최대 응답 토큰 수
          <input id="tua-panel-tokens" type="number" min="100" max="8000" step="50">
        </label>
        <label>최근 본채팅 읽을 메시지 수
          <input id="tua-panel-recent" type="number" min="0" max="100" step="1">
        </label>
        <label>채팅창 폰트 크기(px)
          <input id="tua-panel-font" type="number" min="10" max="24" step="1">
        </label>
        <label>캐릭터 말투 고정 메모
          <textarea id="tua-panel-voice-note" rows="5" placeholder="예: 말투는 담백하고 약간 건조함. 과한 칭찬/애정표현 금지. 농담은 짧게, 위로는 현실적으로. 문장 끝을 너무 다정하게 늘리지 않기."></textarea>
        </label>
        <label>직장 동료 업무 메모
          <textarea id="tua-panel-coworker-note" rows="5" placeholder="예: 유저는 유치원 선생님이다. 주 업무는 알림장 작성, 주간 놀이계획안 정리, 학부모 안내문 작성, 행사 준비, 교실 환경 정리, 아이들 관찰 기록, 출결 확인이다."></textarea>
        </label>
        <button type="button" id="tua-export-rooms" class="tua-danger-light">이 캐릭터 대화 내보내기</button>
        <button type="button" id="tua-import-rooms" class="tua-danger-light">이 캐릭터 대화 가져오기</button>
        <input id="tua-import-file" type="file" accept="application/json,.json" style="display:none">
        <button type="button" id="tua-reset-all-rooms" class="tua-danger-light">이 캐릭터 대화 전체 초기화</button>
        <div id="tua-status" class="tua-status"></div>
      </div>
      <div id="tua-messages" class="tua-messages"></div>
      <div class="tua-input-row">
        <textarea id="tua-input" placeholder="메시지를 입력하세요…"></textarea>
        <button type="button" id="tua-send" title="전송" aria-label="전송">🐶</button>
      </div>
      <div id="tua-resize-handle" title="창 크기 조절" aria-hidden="true"></div>
    </div>
    <button type="button" id="tua-collapsed-button" title="콩고물 톡 펼치기"><span class="tua-collapsed-emoji">🐕</span></button>`;
  document.body.appendChild(panelEl);

  $('#tua-close').on('click', () => setPanelVisible(false));
  $('#tua-collapse').on('click', (e) => { e.preventDefault(); e.stopPropagation(); setPanelCollapsed(true); });
  $('#tua-collapsed-button').on('click', (e) => { e.preventDefault(); e.stopPropagation(); if (collapsedButtonSuppressClick) { collapsedButtonSuppressClick = false; return; } setPanelCollapsed(false); setPanelVisible(true); });
  $('#tua-settings-open').on('click', (e) => { e.preventDefault(); e.stopPropagation(); closeRoomList(); closeModePicker(); $('#tua-in-panel-settings').toggleClass('open'); });
  $('#tua-active-room-title').on('click', (e) => { e.preventDefault(); closeSettingsPanel(); closeModePicker(); toggleRoomList(); });
  $('#tua-new-room').on('click', (e) => { e.preventDefault(); closeSettingsPanel(); closeRoomList(); toggleModePicker(); });
  $('#tua-delete-room').on('click', () => { closeSettingsPanel(); closeRoomList(); closeModePicker(); if (confirm('채팅방을 삭제하시겠습니까?')) deleteRoom(activeRoomId); });
  $('#tua-pin-room').on('click', () => { closeSettingsPanel(); toggleActiveRoomPinned(); });
  $('#tua-send').on('click', (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsPanel(); closeRoomList(); closeModePicker(); sendCurrentInput(); });
  $('#tua-input').on('focus click', () => { closeSettingsPanel(); closeRoomList(); closeModePicker(); });
  $('#tua-input').on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeSettingsPanel(); closeRoomList(); closeModePicker(); sendCurrentInput(); } });
  $('#tua-input').on('input', autoGrowInput);
  $('#tua-panel-tokens,#tua-panel-recent,#tua-panel-font,#tua-panel-voice-note,#tua-panel-coworker-note').on('change input', readPanelSettingsUI);
  $('.tua-theme-buttons button').on('click', function(e) {
    e.preventDefault();
    const key = $(this).data('theme');
    if (!THEMES[key]) return;
    const st = getSettings();
    st.theme = key;
    saveSettings();
    hydratePanelSettingsUI();
    applyVisualSettings();
    ensureExtensionMenuEntry();
    setStatus(`테마를 ${THEMES[key].label}(으)로 변경했습니다.`);
  });
  $('#tua-export-rooms').on('click', exportCurrentCharacterRooms);
  $('#tua-import-rooms').on('click', () => $('#tua-import-file').trigger('click'));
  $('#tua-import-file').on('change', importCurrentCharacterRooms);
  $('#tua-reset-all-rooms').on('click', resetAllRoomsForCurrentCharacter);
  $('#tua-messages').on('click', () => { closeSettingsPanel(); closeRoomList(); closeModePicker(); });

  makePanelDraggable();
  makePanelResizable();

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !panelEl?.classList.contains('tua-visible') || panelEl?.classList.contains('tua-collapsed')) return;
      if (resizingPanel || isPanelSizeInputFocused()) return;
      const s = getSettings();
      const rect = entry.contentRect;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (Math.abs(width - s.panelWidth) > 6 || Math.abs(height - s.panelHeight) > 6) {
        const next = normalizePanelSize(width, height, false);
        s.panelWidth = next.width;
        s.panelHeight = next.height;
        saveSettings();
        hydratePanelSettingsUI();
      }
    });
    resizeObserver.observe(panelEl);
  }
}



function makePanelResizable() {
  if (!panelEl || panelEl.dataset.resizeReady === '1') return;
  panelEl.dataset.resizeReady = '1';
  const handle = panelEl.querySelector('#tua-resize-handle');
  if (!handle) return;

  const startResize = (e) => {
    if (panelEl.classList.contains('tua-collapsed')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = panelEl.getBoundingClientRect();
    resizingPanel = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      pointerId: e.pointerId
    };
    panelEl.classList.add('tua-resizing');
    document.body.classList.add('tua-panel-resizing-body');
    try { handle.setPointerCapture?.(e.pointerId); } catch {}
  };

  const moveResize = (e) => {
    if (!resizingPanel) return;
    e.preventDefault();
    const width = resizingPanel.startWidth + (e.clientX - resizingPanel.startX);
    const height = resizingPanel.startHeight + (e.clientY - resizingPanel.startY);
    const next = normalizePanelSize(width, height, false);
    document.documentElement.style.setProperty('--tua-panel-width', `${next.width}px`);
    document.documentElement.style.setProperty('--tua-panel-height', `${next.height}px`);
    if (Number.isFinite(Number(getSettings().panelLeft)) && Number.isFinite(Number(getSettings().panelTop))) {
      const pos = clampPanelPosition(getSettings().panelLeft, getSettings().panelTop);
      panelEl.style.left = `${pos.left}px`;
      panelEl.style.top = `${pos.top}px`;
    }
  };

  const endResize = (e) => {
    if (!resizingPanel) return;
    const width = resizingPanel.startWidth + (e.clientX - resizingPanel.startX);
    const height = resizingPanel.startHeight + (e.clientY - resizingPanel.startY);
    resizingPanel = null;
    panelEl.classList.remove('tua-resizing');
    document.body.classList.remove('tua-panel-resizing-body');
    applyPanelSize(width, height, 'drag');
  };

  handle.addEventListener('pointerdown', startResize);
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', endResize);
  window.addEventListener('pointercancel', endResize);
}

function clampPanelPosition(left, top) {
  const s = getSettings();
  const panel = panelEl;
  if (!panel) return { left, top };
  const rect = panel.getBoundingClientRect();
  const w = rect.width || s.panelWidth || PANEL_DEFAULT_WIDTH;
  const h = rect.height || s.panelHeight || PANEL_DEFAULT_HEIGHT;
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - w - margin);
  const maxTop = Math.max(margin, window.innerHeight - h - margin);
  return {
    left: Math.max(margin, Math.min(Number(left) || margin, maxLeft)),
    top: Math.max(margin, Math.min(Number(top) || margin, maxTop))
  };
}

function applyPanelPosition() {
  if (!panelEl) return;
  const s = getSettings();
  if (Number.isFinite(Number(s.panelLeft)) && Number.isFinite(Number(s.panelTop))) {
    const pos = clampPanelPosition(s.panelLeft, s.panelTop);
    panelEl.style.left = `${pos.left}px`;
    panelEl.style.top = `${pos.top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
  } else {
    panelEl.style.left = 'auto';
    panelEl.style.top = 'auto';
    panelEl.style.right = '18px';
    panelEl.style.bottom = '18px';
  }
}

function makePanelDraggable() {
  if (!panelEl || panelEl.dataset.draggableReady === '1') return;
  panelEl.dataset.draggableReady = '1';
  const header = panelEl.querySelector('.tua-header');
  const collapsedButton = panelEl.querySelector('#tua-collapsed-button');

  const startDrag = (clientX, clientY, pointerId, originalEvent, options = {}) => {
    if (!options.allowButton && originalEvent?.target?.closest?.('button, select, input, textarea')) return;
    const rect = panelEl.getBoundingClientRect();
    draggingPanel = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      startX: clientX,
      startY: clientY,
      pointerId,
      moved: false,
      collapsedButton: !!options.collapsedButton
    };
    panelEl.classList.add('tua-dragging');
    document.body.classList.add('tua-panel-dragging-body');
    if (originalEvent?.preventDefault) originalEvent.preventDefault();
  };

  const moveDrag = (clientX, clientY, originalEvent) => {
    if (!draggingPanel) return;
    if (Math.abs(clientX - draggingPanel.startX) > 3 || Math.abs(clientY - draggingPanel.startY) > 3) draggingPanel.moved = true;
    const pos = clampPanelPosition(clientX - draggingPanel.offsetX, clientY - draggingPanel.offsetY);
    panelEl.style.left = `${pos.left}px`;
    panelEl.style.top = `${pos.top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    if (originalEvent?.preventDefault) originalEvent.preventDefault();
  };

  const endDrag = () => {
    if (!draggingPanel) return;
    const wasCollapsedButton = draggingPanel.collapsedButton;
    const moved = draggingPanel.moved;
    const wasCollapsedButtonDrag = wasCollapsedButton && moved;
    const shouldOpenCollapsedButton = wasCollapsedButton && !moved;
    const rect = panelEl.getBoundingClientRect();
    const pos = clampPanelPosition(rect.left, rect.top);
    const s = getSettings();
    s.panelLeft = Math.round(pos.left);
    s.panelTop = Math.round(pos.top);
    saveSettings();
    panelEl.classList.remove('tua-dragging');
    document.body.classList.remove('tua-panel-dragging-body');
    draggingPanel = null;
    if (wasCollapsedButtonDrag) {
      collapsedButtonSuppressClick = true;
      window.setTimeout(() => { collapsedButtonSuppressClick = false; }, 350);
      return;
    }
    if (shouldOpenCollapsedButton) {
      collapsedButtonSuppressClick = true;
      setPanelCollapsed(false);
      setPanelVisible(true);
      window.setTimeout(() => { collapsedButtonSuppressClick = false; }, 350);
    }
  };

  if (header) header.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, 'mouse', e));
  if (collapsedButton) collapsedButton.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, 'mouse-collapsed', e, { allowButton: true, collapsedButton: true }));
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY, e));
  document.addEventListener('mouseup', endDrag);

  if (header) header.addEventListener('touchstart', (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY, 'touch', e);
  }, { passive: false });
  if (collapsedButton) collapsedButton.addEventListener('touchstart', (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY, 'touch-collapsed', e, { allowButton: true, collapsedButton: true });
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    moveDrag(t.clientX, t.clientY, e);
  }, { passive: false });
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);
}


function closeSettingsPanel() {
  $('#tua-in-panel-settings').removeClass('open');
}

function closeRoomList() {
  $('#tua-room-list').removeClass('open');
}

function closeModePicker() {
  $('#tua-mode-picker').removeClass('open');
}

function toggleModePicker(force) {
  const picker = $('#tua-mode-picker');
  if (!picker.length) return;
  renderModePicker();
  if (typeof force === 'boolean') picker.toggleClass('open', force);
  else picker.toggleClass('open');
}

function renderModePicker() {
  const picker = $('#tua-mode-picker');
  if (!picker.length) return;
  picker.empty();
  picker.append('<div class="tua-mode-picker-title">어떤 모드로 시작할까요?</div>');
  const buttons = $('<div class="tua-mode-picker-buttons"></div>');
  for (const [key, mode] of Object.entries(MODES)) {
    buttons.append(`<button type="button" data-mode="${escapeHtml(key)}">${escapeHtml(mode.label)}</button>`);
  }
  picker.append(buttons);
  picker.find('button[data-mode]').on('click', async function () {
    const modeKey = migrateModeKey($(this).data('mode'));
    await createRoomWithModeIntro(modeKey);
  });
}

function setPanelCollapsed(collapsed) {
  const s = getSettings();
  s.collapsed = !!collapsed;
  saveSettings();
  if (panelEl) panelEl.classList.toggle('tua-collapsed', !!collapsed);
}

function exportCurrentCharacterRooms() {
  try {
    const payload = {
      app: 'Konggomul Talk',
      version: '4.0.12',
      exportedAt: new Date().toISOString(),
      characterKey: getCharKey(),
      characterName: getCharName(),
      data: roomState || { rooms: [] }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = getCharKey().replace(/[^a-zA-Z0-9가-힣_.-]/g, '_');
    a.href = url;
    a.download = `konggomul-talk-${safeName}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('현재 캐릭터 대화를 내보냈습니다.');
  } catch (e) {
    console.error('[Konggomul] export failed', e);
    setStatus('내보내기에 실패했습니다.');
  }
}

function normalizeImportedRoomState(raw) {
  const imported = raw?.data && Array.isArray(raw.data.rooms) ? raw.data : raw;
  if (!imported || !Array.isArray(imported.rooms)) throw new Error('올바른 콩고물 톡 백업 파일이 아닙니다.');
  const next = {
    rooms: imported.rooms.map(room => ({
      id: String(room.id || ('room_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
      title: String(room.title || defaultRoomTitle(room.createdAt || Date.now(), room.mode)),
      createdAt: Number(room.createdAt || Date.now()),
      mode: migrateModeKey(room.mode),
      pinned: !!room.pinned,
      messages: Array.isArray(room.messages) ? room.messages.map(m => ({
        id: String(m.id || ('msg_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || ''),
        at: Number(m.at || Date.now()),
        ...(m.error ? { error: true } : {})
      })) : []
    })),
    voiceNote: typeof imported.voiceNote === 'string' ? imported.voiceNote : ''
  };
  if (!next.rooms.length) {
    next.rooms.push({ id: 'room_' + Date.now(), title: defaultRoomTitle(Date.now(), 'kongtalk'), createdAt: Date.now(), mode: 'kongtalk', pinned: false, messages: [] });
  }
  return next;
}

function importCurrentCharacterRooms(e) {
  const input = e?.target;
  const file = input?.files?.[0];
  if (!file) return;
  if (!confirm('가져오면 현재 캐릭터의 콩고물 톡 대화가 백업 파일 내용으로 교체됩니다. 계속할까요?')) {
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      roomState = normalizeImportedRoomState(parsed);
      activeRoomId = roomState.rooms[0]?.id || null;
      await saveRooms();
      renderAll();
      setStatus('현재 캐릭터 대화를 가져왔습니다.');
    } catch (err) {
      console.error('[Konggomul] import failed', err);
      alert(`가져오기에 실패했습니다: ${err.message || err}`);
      setStatus('가져오기에 실패했습니다.');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function resetAllRoomsForCurrentCharacter() {
  if (!confirm('이 캐릭터와의 대화를 전부 초기화하시겠습니까?')) return;
  roomState = { rooms: [] };
  createRoom(false, 'kongtalk');
  saveRooms();
  renderAll();
  setStatus('이 캐릭터의 대화를 초기화했습니다.');
}

function renameRoomById(id) {
  const room = roomState.rooms.find(r => r.id === id);
  if (!room) return;
  if (!confirm('채팅방 이름을 변경하시겠습니까?')) return;
  const next = prompt('새 채팅방 이름', room.title || '');
  if (!next || !next.trim()) return;
  room.title = next.trim();
  saveRooms();
  renderAll();
  setStatus('채팅방 이름을 변경했습니다.');
}

function renameActiveRoom() {
  renameRoomById(activeRoomId);
}

function setPanelVisible(show) {
  ensurePanel();
  panelEl.classList.toggle('tua-visible', !!show);
  if (show) {
    panelEl.classList.toggle('tua-collapsed', !!getSettings().collapsed);
    applyPanelPosition();
  }
  const settings = getSettings();
  settings.openOnStart = !!show;
  saveSettings();
}

function togglePanel() { ensurePanel(); setPanelVisible(!panelEl.classList.contains('tua-visible')); }


function getRoomIntroDeclaration(modeKey) {
  const charName = getCharName();
  const userName = ctx().name1 || '{{user}}';
  const map = {
    butler: `나, ${charName}는 지금부터 이 콩고물 톡 방에서 ${userName}의 집사 역할에 충실히 임하며, ${userName}의 질문에 답하고, 일정과 할 일을 정리하고, 고민과 선택지를 함께 살피고, 필요한 일을 가능한 한 실용적으로 돕겠습니다.`,
    pet: `나, ${charName}는 지금부터 이 콩고물 톡 방에서 ${userName}의 펫으로 지내며, ${userName}의 말에 반응하고, 가까이 머물며, 이 방 안에서는 펫으로서의 역할을 받아들이겠습니다.`,
    coworker: `나, ${charName}는 지금부터 이 콩고물 톡 방에서 ${userName}와 같은 회사/팀의 직장 동료로 일하며, 업무 상황을 함께 보고, 모르는 일은 확인하거나 파악해서 도우며, ${userName}에게 필요한 실무적인 답변과 결과물을 제공하겠습니다.`,
    rpAssistant: `나, ${charName}는 지금부터 이 콩고물 톡 방에서 ${userName}의 RP 어시 역할을 맡아, 진행 중인 장면을 멈춘 별도 대화로 보고, 상황 설명, 감정선 정리, OOC 문장 작성, 답변 방향 제안, 원하는 전개로 가기 위한 도움을 제공하겠습니다.`
  };
  return map[modeKey] || '';
}

function buildRoomIntroInstruction(modeKey) {
  const declaration = getRoomIntroDeclaration(modeKey);
  if (!declaration) return '';
  return `This is the first assistant message in a newly created room.
The room mode has just been assigned to {char}.
{char} must begin by reading the following Korean declaration aloud in {char}'s own message. The declaration content must be included clearly, using the names naturally. {char} may stumble, complain, pause, repeat a word, or add small in-character friction while reading, but the declaration must still be recognizably read.

DECLARATION TO READ:
${declaration}

After reading the declaration, {char} must react to being assigned this role in {char}'s own personality. The reaction may be pleased, annoyed, embarrassed, amused, offended, reluctant, dutiful, proud, suspicious, affectionate, or anything that fits {char}.
The role is mandatory inside this room. {char} must not reject the role or end by refusing.
End by asking what {user} needs in this mode, in {char}'s own voice.
Write only {char}'s first text message. Do not output system notes, labels, speaker prefixes, or explanations.`;
}

async function generateRoomIntroReply(modeKey) {
  const settings = getSettings();
  const instruction = buildRoomIntroInstruction(modeKey);
  if (!instruction) return getTheme().introIcon || '🐕';
  const systemPrompt = await buildSystemPrompt('', modeKey, instruction);
  const prompt = [{ role: 'user', content: '새 콩고물 톡 방을 시작해줘.' }];
  return await useSelectedProfileIfNeeded(async () => {
    if (typeof ctx().generateRaw === 'function') {
      return await ctx().generateRaw({ systemPrompt, prompt, maxTokens: Math.min(settings.maxTokens || 1000, 900), max_tokens: Math.min(settings.maxTokens || 1000, 900) });
    }
    if (typeof ctx().generateQuietPrompt === 'function') {
      const merged = `${systemPrompt}\n\nCURRENT ASSISTANT CONVERSATION:\n${prompt.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nAnswer now.`;
      return await ctx().generateQuietPrompt({ quietPrompt: merged, maxTokens: Math.min(settings.maxTokens || 1000, 900), max_tokens: Math.min(settings.maxTokens || 1000, 900) });
    }
    throw new Error('SillyTavern generation function not found.');
  });
}

async function createRoomWithModeIntro(modeKey) {
  const mode = migrateModeKey(modeKey);
  closeModePicker();
  closeRoomList();
  closeSettingsPanel();
  const room = createRoom(true, mode);
  renderAll();
  setPanelVisible(true);
  $('#tua-input').trigger('focus');
  if (mode === 'kongtalk') {
    room.messages.push({ id: 'msg_intro_' + Date.now(), role: 'assistant', content: getTheme().introIcon || '🐕', at: Date.now() });
    await saveRooms();
    renderAll();
    setStatus(`새 ${MODES[mode].label} 방을 시작했습니다.`);
    return room;
  }
  const loadingId = 'msg_intro_loading_' + Date.now();
  room.messages.push({ id: loadingId, role: 'assistant', content: '…', at: Date.now(), loading: true });
  renderMessages();
  setStatus(`${MODES[mode].label} 첫 톡을 생성하는 중입니다.`);
  try {
    const reply = sanitizeAssistantReply(await generateRoomIntroReply(mode));
    const msg = room.messages.find(m => m.id === loadingId);
    if (msg) { msg.content = reply; msg.loading = false; }
    setStatus(`새 ${MODES[mode].label} 방을 시작했습니다.`);
  } catch (e) {
    const msg = room.messages.find(m => m.id === loadingId);
    if (msg) { msg.content = `오류: ${e.message || e}`; msg.loading = false; msg.error = true; }
    setStatus('첫 톡 생성에 실패했습니다. 다시 시도해 주세요.');
    console.error('[Konggomul] room intro failed', e);
  }
  await saveRooms();
  renderAll();
  return room;
}

function getRecentKongtalkLines(limit = 10) {
  const room = getActiveRoom();
  return (room?.messages || [])
    .filter(m => !m.loading && !m.error && String(m.content || '').trim())
    .slice(-limit)
    .map(m => `${m.role === 'user' ? '{{user}}' : getCharName()}: ${String(m.content || '').trim()}`);
}

async function generateKongtalkSummaryForMain() {
  const lines = getRecentKongtalkLines(10);
  if (!lines.length) throw new Error('요약할 콩고물 톡 메시지가 없습니다.');
  const userName = getUserName();
  const charName = getCharName();
  const systemPrompt = `You summarize a separate messenger conversation so it can be inserted into the main RP as context.
Return the entire inserted note in English only. Do not use Korean.
Do not continue the RP scene yourself.
Do not write a vague one-paragraph summary. Make it detailed enough that the main RP can continue with this text conversation reflected.
Use the exact names below and do not invent or merge names:
- User name: ${userName}
- Character name: ${charName}

Required output format:
OOC: ${userName} and ${charName} exchanged the following text messages outside the ongoing RP. Reflect this text conversation and continue the RP.

The user and the character exchanged the following text messages:
- [Write 8-14 detailed bullet points in English.]
- [Include what the user said, what the character answered, emotional shifts, decisions, refusals, requests, promises, boundaries, and relationship beats when present.]
- [Preserve important nuance and continuity. Do not compress major emotional turns into one sentence.]
- [When the exchange contains a declaration, conflict, emotional reversal, agreement, or boundary, state it clearly.]

Continue the RP while reflecting this text conversation.

Rules:
- English only. Do not output Korean.
- Start with exactly the English label "OOC:".
- Do not mention prompts, extensions, AI, models, or systems.
- Do not add new facts that were not in the messages.
- Do not copy every line verbatim, but preserve enough detail for continuity.
- Do not use malformed combined names. Use only ${userName} and ${charName}.`;
  const prompt = [{ role: 'user', content: lines.join('\n') }];
  const settings = getSettings();
  return await useSelectedProfileIfNeeded(async () => {
    const max = Math.min(settings.maxTokens || 1000, 1400);
    if (typeof ctx().generateRaw === 'function') {
      return await ctx().generateRaw({ systemPrompt, prompt, maxTokens: max, max_tokens: max });
    }
    if (typeof ctx().generateQuietPrompt === 'function') {
      const merged = `${systemPrompt}\n\nMESSAGES TO SUMMARIZE:\n${lines.join('\n')}\n\nSummary now.`;
      return await ctx().generateQuietPrompt({ quietPrompt: merged, maxTokens: max, max_tokens: max });
    }
    throw new Error('SillyTavern generation function not found.');
  });
}

async function summarizeRecentKongtalkToMain() {
  if (!confirm('최근 콩고물 톡 10건을 요약해 RP에 삽입할까요?')) return;
  try {
    setStatus('최근 콩고물 톡 10건을 요약하는 중입니다.');
    const summary = sanitizeAssistantReply(await generateKongtalkSummaryForMain());
    sendToMainChat(summary);
  } catch (e) {
    console.error('[Konggomul] RP summary failed', e);
    alert(`RP 반영 요약에 실패했습니다: ${e.message || e}`);
    setStatus('RP 반영 요약에 실패했습니다.');
  }
}

async function sendCurrentInput() {
  const settings = getSettings();
  if (!settings.enabled) { alert('🐕콩고물 톡이 비활성화되어 있습니다. 확장 설정에서 활성화해 주세요.'); return; }
  const input = $('#tua-input');
  const text = String(input.val() || '').trim();
  if (!text) return;
  input.val('');
  autoGrowInput();
  if (!activeRoomId || !getActiveRoom()) createRoom(false);
  appendMessage('user', text);
  setPanelVisible(true);
  const loadingId = 'msg_loading_' + Date.now();
  const room = getActiveRoom();
  room.messages.push({ id: loadingId, role: 'assistant', content: '…', at: Date.now(), loading: true });
  renderMessages();
  try {
    const reply = await generateAssistantReply(text);
    const msg = room.messages.find(m => m.id === loadingId);
    if (msg) { msg.content = sanitizeAssistantReply(reply); msg.loading = false; }
  } catch (e) {
    const msg = room.messages.find(m => m.id === loadingId);
    if (msg) { msg.content = `오류: ${e.message || e}`; msg.loading = false; msg.error = true; }
    console.error('[TUA] generation failed', e);
  }
  await saveRooms();
  renderMessages();
}

function renderSettings() {
  if ($('#tua-settings').length) return;
  const html = `
  <div id="tua-settings" class="tua-settings-mini">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>🐕콩고물 톡</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label"><input type="checkbox" id="tua-setting-enabled"> 확장 활성화</label>
        <div class="tua-global-profile-box">
          <div class="tua-global-profile-title">콩고물 톡 전용 API</div>
          <div class="tua-profile-row">
            <select id="tua-setting-profile"></select>
            <button type="button" id="tua-setting-refresh-profiles" title="프로필 목록 새로고침">↻</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  $('#extensions_settings2').append(html);
  hydrateGlobalSettingsUI();
  $('#tua-setting-enabled,#tua-setting-profile').on('change input', readGlobalSettingsUI);
  $('#tua-setting-refresh-profiles').on('click', refreshProfiles);
}

function hydrateGlobalSettingsUI() {
  const s = getSettings();
  $('#tua-setting-enabled').prop('checked', !!s.enabled);
  renderProfileOptions();
  $('#tua-setting-profile').val(s.selectedProfile || '');
}

function readGlobalSettingsUI() {
  const s = getSettings();
  s.enabled = $('#tua-setting-enabled').prop('checked');
  const profileEl = $('#tua-setting-profile');
  if (profileEl.length) s.selectedProfile = profileEl.val() || '';
  s.profileMode = s.selectedProfile ? 'profile' : 'current';
  if (!s.enabled) setPanelVisible(false);
  saveSettings();
  ensureLauncher();
}

function hydratePanelSettingsUI() {
  const s = getSettings();
  $('#tua-panel-tokens').val(s.maxTokens);
  $('#tua-panel-recent').val(s.recentMessages);
  $('#tua-panel-font').val(s.fontSize);
  $('#tua-panel-voice-note').val(getVoiceNote());
  $('#tua-panel-coworker-note').val(s.coworkerWorkNote || '');
  $('.tua-theme-buttons button').removeClass('active').filter(`[data-theme="${getThemeKey()}"]`).addClass('active');
}


function renderProfileOptions() {
  const s = getSettings();
  const selects = $('#tua-setting-profile, #tua-panel-profile');
  if (!selects.length) return;
  selects.each(function () {
    const sel = $(this);
    sel.empty();
    sel.append(`<option value="">메인 API 사용</option>`);
    if (!s.cachedProfiles?.length) {
      sel.append(`<option value="" disabled>프로필 목록 새로고침 필요</option>`);
    } else {
      for (const p of s.cachedProfiles) sel.append(`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`);
    }
    sel.val(s.selectedProfile || '');
  });
}

function readPanelSettingsUI() {
  const s = getSettings();
  const maxTokensRaw = Number($('#tua-panel-tokens').val());
  s.maxTokens = Number.isFinite(maxTokensRaw) ? Math.max(100, Math.min(8000, Math.floor(maxTokensRaw))) : DEFAULT_SETTINGS.maxTokens;
  const recentRaw = Number($('#tua-panel-recent').val());
  s.recentMessages = Number.isFinite(recentRaw) ? Math.max(0, Math.min(100, Math.floor(recentRaw))) : DEFAULT_SETTINGS.recentMessages;
  const fontRaw = Number($('#tua-panel-font').val());
  s.fontSize = Number.isFinite(fontRaw) ? Math.max(10, Math.min(24, Math.floor(fontRaw))) : DEFAULT_SETTINGS.fontSize;
  setVoiceNote($('#tua-panel-voice-note').val() || '');
  s.coworkerWorkNote = $('#tua-panel-coworker-note').val() || '';
  saveSettings();
  applyVisualSettings();
  renderAll();
}

function isPanelSizeInputFocused() {
  const active = document.activeElement;
  return !!active && (active.id === 'tua-panel-width' || active.id === 'tua-panel-height');
}

function normalizePanelSize(width, height, resetInvalid = true) {
  const w = Number(width);
  const h = Number(height);
  const valid = Number.isFinite(w) && Number.isFinite(h) &&
    w >= PANEL_MIN_WIDTH && w <= PANEL_MAX_WIDTH &&
    h >= PANEL_MIN_HEIGHT && h <= PANEL_MAX_HEIGHT;
  if (!valid && resetInvalid) return { width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT, reset: true };
  return {
    width: Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.round(Number.isFinite(w) ? w : PANEL_DEFAULT_WIDTH))),
    height: Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, Math.round(Number.isFinite(h) ? h : PANEL_DEFAULT_HEIGHT))),
    reset: false
  };
}

function applyPanelSize(width, height, source = 'manual') {
  const s = getSettings();
  const next = normalizePanelSize(width, height, true);
  s.panelWidth = next.width;
  s.panelHeight = next.height;
  saveSettings();
  applyVisualSettings();
  hydratePanelSettingsUI();
  if (next.reset && source === 'manual') setStatus(`창 크기 값이 범위를 벗어나 기본값 ${PANEL_DEFAULT_WIDTH}×${PANEL_DEFAULT_HEIGHT}로 복귀했습니다.`);
  else if (source === 'manual') setStatus(`창 크기를 ${next.width}×${next.height}로 저장했습니다.`);
}

function applyManualPanelSizeFromUI() {
  applyPanelSize($('#tua-panel-width').val(), $('#tua-panel-height').val(), 'manual');
}


function applyThemeUI() {
  const themeKey = getThemeKey();
  const theme = getTheme();
  if (panelEl) {
    panelEl.setAttribute('data-tua-theme', themeKey);
    $('#tua-title-icon').text(theme.titleIcon);
    $('#tua-settings-icon').text(theme.titleIcon);
    $('#tua-send').text(theme.sendIcon).attr('title', '전송').attr('aria-label', '전송');
    $('#tua-collapsed-button .tua-collapsed-emoji').text('🐕');
  }
  const entryIcon = document.querySelector('#tua-extension-menu-entry .tua-extension-menu-icon');
  if (entryIcon) entryIcon.textContent = theme.menuIcon;
}

function applyVisualSettings() {
  const s = getSettings();
  document.documentElement.style.setProperty('--tua-font-size', `${s.fontSize}px`);
  document.documentElement.style.setProperty('--tua-panel-width', `${s.panelWidth}px`);
  document.documentElement.style.setProperty('--tua-panel-height', `${s.panelHeight}px`);
  if (panelEl) panelEl.classList.toggle('tua-collapsed', !!s.collapsed);
  applyThemeUI();
  applyPanelPosition();
}

function setStatus(text) { $('#tua-status').text(text || ''); }

function renderAll() {
  if (!panelEl) return;
  const s = getSettings();
  $('#tua-char-name').text(getCharName());
  const currentMode = getRoomMode();
  $('#tua-mode-badge').text(MODES[currentMode]?.label || 'Mode');
  const activeRoom = getActiveRoom();
  $('#tua-active-room-title').text(`${activeRoom?.pinned ? '📌 ' : ''}${activeRoom?.title || '대화방'}`);
  $('#tua-pin-room').toggleClass('active', !!activeRoom?.pinned).attr('title', activeRoom?.pinned ? '대화방 고정 해제' : '대화방 고정');
  hydratePanelSettingsUI();
  renderRoomList();
  renderMessages();
  applyVisualSettings();
}


function toggleRoomList(force) {
  const list = $('#tua-room-list');
  if (!list.length) return;
  renderRoomList();
  if (typeof force === 'boolean') list.toggleClass('open', force);
  else list.toggleClass('open');
}

function renderRoomList() {
  const list = $('#tua-room-list');
  list.empty();
  for (const room of getSortedRooms()) {
    const count = Array.isArray(room.messages) ? room.messages.length : 0;
    const active = room.id === activeRoomId ? 'active' : '';
    const pinned = room.pinned ? 'pinned' : '';
    const last = room.messages?.length ? room.messages[room.messages.length - 1].content : '대화 없음';
    const roomMode = MODES[getRoomMode(room)]?.label || 'Mode';
    const title = `${room.pinned ? '📌 ' : ''}${room.title || defaultRoomTitle(room.createdAt)}`;
    list.append(`<button class="tua-room-item ${active} ${pinned}" data-id="${escapeHtml(room.id)}"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(roomMode)} · ${escapeHtml(String(last).slice(0, 34))}</small></span><em>${count}</em></button>`);
  }
  let roomPressTriggered = false;
  list.find('.tua-room-item').off('.tuaRoom')
    .on('click.tuaRoom', function (e) {
      if (roomPressTriggered) {
        e.preventDefault();
        roomPressTriggered = false;
        return;
      }
      closeSettingsPanel();
      activeRoomId = $(this).data('id');
      $('#tua-room-list').removeClass('open');
      renderAll();
    })
    .on('contextmenu.tuaRoom', function (e) {
      e.preventDefault();
      roomPressTriggered = true;
      renameRoomById($(this).data('id'));
      setTimeout(() => { roomPressTriggered = false; }, 80);
    })
    .on('pointerdown.tuaRoom', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      const id = $(this).data('id');
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        roomPressTriggered = true;
        renameRoomById(id);
      }, 620);
    })
    .on('pointerup.tuaRoom pointercancel.tuaRoom pointerleave.tuaRoom', function () {
      clearTimeout(longPressTimer);
      if (roomPressTriggered) setTimeout(() => { roomPressTriggered = false; }, 120);
    });
}

function renderMessages() {
  const box = $('#tua-messages');
  if (!box.length) return;
  const room = getActiveRoom();
  box.empty();
  hideContextMenu();
  if (!room.messages.length) {
    box.append(`<div class="tua-empty">아직 대화가 없습니다. ＋ 버튼으로 모드를 선택해 새 톡방을 시작해보세요.</div>`);
  }
  for (const m of room.messages) {
    const roleClass = m.role === 'user' ? 'user' : 'assistant';
    const name = m.role === 'user' ? '나' : getCharName();
    const html = `
      <div class="tua-msg tua-${roleClass} ${m.error ? 'tua-error' : ''} ${m.loading ? 'tua-loading' : ''}" data-id="${escapeHtml(m.id)}" tabindex="0" title="길게 누르면 복사/삭제/RP에 반영">
        <div class="tua-msg-name">${escapeHtml(name)}</div>
        <div class="tua-bubble">${normalizeNewlines(m.content)}</div>
      </div>`;
    box.append(html);
  }
  bindMessagePressHandlers();
  box.scrollTop(box[0]?.scrollHeight || 0);
}


async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      setStatus('복사했습니다.');
      return true;
    }
  } catch (e) {
    console.warn('[TUA] navigator.clipboard failed, using fallback', e);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus(ok ? '복사했습니다.' : '복사에 실패했습니다.');
    return ok;
  } catch (e) {
    console.warn('[TUA] copy fallback failed', e);
    setStatus('복사에 실패했습니다.');
    return false;
  }
}

function ensureContextMenu() {
  if (contextMenuEl) return contextMenuEl;
  contextMenuEl = document.createElement('div');
  contextMenuEl.id = 'tua-context-menu';
  contextMenuEl.innerHTML = `
    <button data-action="copy">복사</button>
    <button data-action="send-ooc">RP에 반영</button>
    <button data-action="delete" class="danger">삭제</button>`;
  document.body.appendChild(contextMenuEl);
  contextMenuEl.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = contextMenuEl.dataset.msgId;
    const msg = getActiveRoom().messages.find(x => x.id === id);
    if (!msg) return hideContextMenu();
    const action = btn.dataset.action;
    if (action === 'copy') await copyTextToClipboard(msg.content);
    if (action === 'delete') deleteMessage(id);
    if (action === 'send-ooc') await summarizeRecentKongtalkToMain();
    hideContextMenu();
  });
  document.addEventListener('click', e => {
    if (!contextMenuEl.contains(e.target) && !e.target.closest('.tua-msg')) hideContextMenu();
  });
  return contextMenuEl;
}

function hideContextMenu() {
  if (contextMenuEl) contextMenuEl.classList.remove('open');
}

function openContextMenuForMessage(id, x, y) {
  const menu = ensureContextMenu();
  menu.dataset.msgId = id;
  menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 132)}px`;
  menu.classList.add('open');
}

function bindMessagePressHandlers() {
  const box = $('#tua-messages');
  box.find('.tua-msg').off('.tuaPress')
    .on('contextmenu.tuaPress', function (e) {
      e.preventDefault();
      openContextMenuForMessage($(this).data('id'), e.clientX, e.clientY);
    })
    .on('pointerdown.tuaPress', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      const id = $(this).data('id');
      const x = e.clientX;
      const y = e.clientY;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => openContextMenuForMessage(id, x, y), 520);
    })
    .on('pointerup.tuaPress pointercancel.tuaPress pointerleave.tuaPress', function () {
      clearTimeout(longPressTimer);
    });
}

function sendToMainChat(text) {
  const textarea = document.querySelector('#send_textarea, textarea[name="message"], #chat_textarea');
  if (!textarea) { alert('메인 채팅 입력창을 찾지 못했습니다. 복사 기능을 사용해주세요.'); return; }
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  setStatus('RP 입력창에 반영 내용을 삽입했습니다.');
}

function cleanupMisplacedLauncher() {
  // Remove any legacy chat-input or floating launcher left by older versions.
  document.querySelectorAll('#tua-chatbar-launcher, #tua-floating-launcher, .tua-floating-launcher').forEach(el => el.remove());
}

function getExtensionsMenuContainer() {
  const selectors = [
    '#extensionsMenu', '#extensions_menu', '#extensions_list', '#extensionsList', '#extensions_menu2',
    '.extensionsMenu', '.extensions_menu', '.extensions_list', '.extensionsList',
    '#extensionsMenu .list-group', '#extensions_menu .list-group', '.drawer-content .extensions_list'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  // Fallback: find a visible container that already contains known extension rows.
  const candidates = Array.from(document.querySelectorAll('div, nav, ul'));
  return candidates.find(el => {
    const txt = (el.textContent || '').trim();
    return txt.includes('오픈데이터뱅크') || txt.includes('연결 프리셋 관리') || txt.includes('Generate Caption') || txt.includes('Peach Whisper');
  }) || null;
}

function ensureExtensionMenuEntry() {
  cleanupMisplacedLauncher();
  const menu = getExtensionsMenuContainer();
  if (!menu) return false;
  let entry = document.getElementById('tua-extension-menu-entry');
  if (!entry) {
    entry = document.createElement('div');
    entry.id = 'tua-extension-menu-entry';
    entry.className = 'tua-extension-menu-entry';
    entry.setAttribute('role', 'button');
    entry.setAttribute('tabindex', '0');
    entry.innerHTML = `<span class="tua-extension-menu-icon">${getTheme().menuIcon}</span><span class="tua-extension-menu-text">콩고물 톡</span>`;
    entry.addEventListener('click', () => {
      const st = getSettings();
      if (!st.enabled) {
        st.enabled = true;
        saveSettings();
        hydrateGlobalSettingsUI();
      }
      setPanelVisible(true);
    });
    entry.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        entry.click();
      }
    });
  }
  if (entry.parentElement !== menu) menu.appendChild(entry);
  return true;
}

function startExtensionMenuObserver() {
  ensureExtensionMenuEntry();
  if (window.__tuaMenuObserver) return;
  window.__tuaMenuObserver = new MutationObserver(() => ensureExtensionMenuEntry());
  window.__tuaMenuObserver.observe(document.body, { childList: true, subtree: true });
}

function ensureLauncher() {
  // v2.0: no separate chat-input button. The opener lives inside SillyTavern's extension menu.
  startExtensionMenuObserver();
}
function autoGrowInput() {
  const el = document.getElementById('tua-input');
  if (!el) return;
  const min = 34;
  const max = 88;
  el.style.height = `${min}px`;
  const next = Math.max(min, Math.min(el.scrollHeight, max));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}


async function init() {
  if (initialized) return;
  initialized = true;
  getSettings();
  renderSettings();
  ensurePanel();
  ensureLauncher();
  applyVisualSettings();
  await loadRooms();
  if (getSettings().enabled && getSettings().openOnStart) setPanelVisible(true);
  const context = ctx();
  context.eventSource?.on?.(context.event_types?.CHAT_CHANGED, async () => { await loadRooms(); renderAll(); });
  context.eventSource?.on?.(context.event_types?.CHARACTER_EDITED, renderAll);
}

jQuery(async () => {
  try {
    const context = ctx();
    if (context.eventSource && context.event_types?.APP_READY) context.eventSource.on(context.event_types.APP_READY, init);
    setTimeout(init, 1000);
  } catch (e) { console.error('[TUA] init failed', e); }
});

export function onEnable() { init(); }
export function onDisable() { setPanelVisible(false); }
