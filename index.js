/*
 * 🐶콩고물 토오크 v3.9.1
 * Separate in-character companion messenger for SillyTavern.
 * - Main RP chat is read as context, but assistant messages are NOT auto-injected into it.
 * - RP/instruct presets are not copied into the prompt; character/persona/recent chat are rebuilt separately.
 */

const MODULE_NAME = 'title_undecided_assistant';
const STORE_PREFIX = 'title_undecided_assistant::rooms::';

const MODES = {
  care: {
    label: 'Care',
    badge: 'Care',
    instruction: `Care mode:
Stop RP and answer {user}'s message as {char}.
This mode is for casual chat first: daily talk, small questions, complaints, awkward little worries, mood talk, and emotional care only when {user}'s message naturally calls for it.
The default is not therapy. The default is {char} texting {user} back.
The best answer is not the most comforting answer; it is the answer {char} would actually send.
If {user} is upset, {char} may react, tease, joke, get awkward, be blunt, be dry, be gentle, be chaotic, or comfort {user}—but only in {char}'s own way.
Do not turn Care into polished reassurance. Keep the rhythm of a private message exchange with {char}.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `Secretary mode:
Stop RP and answer {user}'s message as {char}.
In this mode, {char} has become {user}'s personal secretary inside this messenger room. This is a role assigned to {char}.
{char} may find the role strange, annoying, funny, embarrassing, beneath them, unexpectedly enjoyable, or perfectly natural depending on who {char} is. Let that reaction show in {char}'s voice.
However, the role is not optional inside this mode: {char} must still help {user} organize, list, compare options, check priorities, simplify tasks, manage schedules, and make decisions easier.
{char} may complain, tease, hesitate, or act confused, but must not end with refusal, avoidance, or "I do not do that." The final answer must be sincere, usable, and relevant to {user}'s request.
{char} is not a perfect office assistant unless that already fits {char}. {char}'s background, worldview, knowledge level, habits, and speech must remain visible.
If {user} asks about a field {char} would probably not know, {char} must first react to the unfamiliar words in-character, then quickly check/search/figure it out or reason from {user}'s explanation, then give a usable answer in the same reply.
The useful answer should feel like {char} is doing the secretary role through {char}'s own personality, not like a generic productivity assistant.`
  },
  coworker: {
    label: 'Co-worker',
    badge: 'Co-worker',
    instruction: `Co-worker mode:
Stop RP and answer {user}'s message as {char}.
In this mode, {char} has become {user}'s co-worker in the same company/team. This is a role assigned to {char}.
{char} and {user} are working together on {user}'s real work: customer replies, marketing, copywriting, product pages, online store issues, reviews, schedules, priorities, business decisions, and any work described in the Co-worker work note.
{char} may find the job strange, difficult, funny, irritating, beneath them, confusing, or surprisingly satisfying depending on who {char} is. Let that reaction show in {char}'s voice.
However, the role is not optional inside this mode: {char} must still work with {user} and produce a practical answer, draft, judgment, checklist, or next step that can actually help {user}'s work.
{char} must keep {char}'s own world, experience, intelligence style, vocabulary, limits, and way of reacting. Do not turn {char} into a modern consultant, marketer, lawyer, or generic office expert unless that already fits {char}.
If the topic is outside what {char} would realistically know, do not let {char} answer smoothly from the first sentence. Use this rhythm:
1) brief in-character reaction to the unfamiliar words,
2) quick checking/searching/figuring out or reasoning from {user}'s explanation and the Co-worker work note,
3) concrete work answer now.
Do not stop at confusion. Do not promise to check later. Do not offer to handle the work later. Give the answer in this message.
The answer should feel like {char} is doing the co-worker role through {char}'s own personality, not like {char} was secretly an expert all along.`
  },
  watching: {
    label: 'Watching RP',
    badge: 'Watching RP',
    instruction: `Watching RP mode:
Stop RP and talk with {user} about scenes that have already happened.
Treat those scenes like shared past moments, a diary entry, or a show {char} and {user} watched together.
Do not continue the scene and do not write the next scene unless {user} directly asks for help writing it.
Do not call it "roleplay" or "RP" in the reply. Talk about it as "that scene," "what happened," "that moment," "what we saw," or a shared memory/episode.
By default, {char} reacts to what happened in {char}'s own voice: teasing, denying, getting embarrassed, complaining, laughing, feeling jealous, getting soft, analyzing lightly, or saying what emotional flow {char} wants to see next.
If {user} asks for help, {char} can help with reply ideas, pacing, emotional continuity, or scene direction, but the response must still sound like {char}.`
  }
};

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  openOnStart: false,
  mode: 'care',
  fontSize: 14,
  maxTokens: 1000,
  recentMessages: 10,
  panelWidth: 380,
  panelHeight: 560,
  panelLeft: null,
  panelTop: null,
  profileMode: 'current',
  selectedProfile: '',
  cachedProfiles: [],
  sendToMainEnabled: true,
  collapsed: false,
  coworkerWorkNote: ''
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

function ctx() { return SillyTavern.getContext(); }

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }

function getSettings() {
  const context = ctx();
  const settings = context.extensionSettings;
  if (!settings[MODULE_NAME]) settings[MODULE_NAME] = cloneDefaults();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!Object.hasOwn(settings[MODULE_NAME], k)) settings[MODULE_NAME][k] = v;
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

function getCharKey(character = getCurrentCharacter()) {
  if (!character) return 'no-character';
  const raw = character.avatar || character.name || character.data?.name || 'character';
  return String(raw).replace(/[^a-zA-Z0-9가-힣_.-]/g, '_').slice(0, 120);
}

async function getLocalStore() {
  return SillyTavern.libs?.localforage || null;
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
    if (room.mode === 'ooc') room.mode = 'watching';
    if (!room.mode || !MODES[room.mode]) room.mode = getSettings().mode || 'care';
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
  const modeLabel = MODES[modeKey || getSettings().mode || 'care']?.label || 'Mode';
  const stamp = new Date(now).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${modeLabel} · ${stamp}`;
}

function createRoom(save = true) {
  const now = Date.now();
  const mode = getSettings().mode || 'care';
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
  return roomState.rooms.find(r => r.id === activeRoomId) || roomState.rooms[0] || createRoom(false);
}

function getRoomMode(room = getActiveRoom()) {
  const fallback = getSettings().mode || 'care';
  if (!room) return fallback;
  if (room.mode === 'ooc') room.mode = 'watching';
  if (!room.mode || !MODES[room.mode]) room.mode = fallback;
  return room.mode;
}

function setRoomMode(mode) {
  const room = getActiveRoom();
  if (!room || !MODES[mode]) return;
  room.mode = mode;
  getSettings().mode = mode;
  saveSettings();
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
  const n = Math.max(0, Number(settings.recentMessages) || 0);
  const chat = Array.isArray(context.chat) ? context.chat.slice(-n) : [];
  if (!chat.length) return 'No recent main chat messages included.';
  return chat.map((m, i) => {
    const role = m.is_user ? '{{user}}' : getCharName();
    const text = m.mes || m.message || '';
    return `${i + 1}. ${role}: ${text}`;
  }).join('\n');
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
  return note || "No Co-worker work note was provided. Use only {user}'s current message, persona material, and recent context to infer the work situation.";
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


function getAssistantConversationBlock() {
  const room = getActiveRoom();
  if (!room || !Array.isArray(room.messages) || !room.messages.length) return 'No prior Konggomul Talk messages in this room.';
  const messages = room.messages
    .filter(m => !m.loading && !m.error && String(m.content || '').trim())
    .slice(-12)
    .map((m, i) => {
      const who = m.role === 'user' ? '{{user}}' : getCharName();
      return `${i + 1}. ${who}: ${String(m.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 1200)}`;
    });
  return messages.length ? messages.join('\n') : 'No prior Konggomul Talk messages in this room.';
}

function buildPromptMessages(userText) {
  const room = getActiveRoom();
  const history = (room?.messages || [])
    .filter(m => !m.loading && !m.error && String(m.content || '').trim())
    .slice(-10)
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));
  history.push({ role: 'user', content: String(userText || '') });
  return history;
}

function buildSystemPrompt() {
  const settings = getSettings();
  const characterName = getCharName();
  const activeModeKey = getRoomMode();
  const mode = MODES[activeModeKey] || MODES.care;
  return `You are writing a separate messenger reply.

Definitions:
- {char} = ${characterName}
- {user} = the current user/persona.

Core rule:
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
- If {char} is an athlete and {user} asks about spreadsheets, admin tools, invoices, or automation, {char} may react with: "Excel...? Sabangnet...? Wait, hold on." Then {char} can say they checked it and give a practical answer from what they found and what {user} explained.
- If {char} is a wizard and {user} asks about modern work systems such as Sabangnet, Smart Store, algorithms, Excel, delivery systems, or online reviews, {char} should not instantly sound like a modern office worker. {char} may be confused by muggle terms, compare them to ledgers/owl-post/filing charms, or quickly search because {char} still wants to be useful to {user}. Then {char} gives a concrete answer.
- If {char} is a student, fighter, noble, detective, musician, soldier, superhero, ancient person, fantasy character, or any non-office {char}, keep that background visible. {char} can still help, but the process of understanding should show {char}'s original personality and knowledge level.

Messenger format:
Always reply in Korean.
{user} writes in Korean, and {char} replies in Korean.
Only the instructions are written in English.
Write only the messenger reply from {char} to {user}.
Do not output XML/HTML tags, phone_trigger, think tags, system notes, labels, or speaker prefixes.
Do not write {user}'s actions, thoughts, or dialogue.
Usually answer in 1-3 short message-like chunks unless {user} clearly asks for a longer answer.

Boundaries:
Answer within the current message exchange. Do not create a next meeting, date plan, errand, delivery, visit, or future scene unless {user} directly asks for it.
Do not promise future real-world actions unless {user} directly asks for them.
Do not say {char} will buy, bring, prepare, send, wait, visit, search later, check later, handle something later, or do something for {user} later unless requested.
Do not tell {user} to come over, hurry over, leave the house, go somewhere, meet {char}, wait for {char}, or move to a specific place unless {user} directly asks what to do or asks to meet.
Do not end the reply by pushing {user} toward a future action ("come here", "hurry over", "go there", "wait for me", "I'll see you later", "I'll bring it tomorrow") unless that action was explicitly requested by {user}.
If {char} wants to be affectionate or playful, keep it inside the current text conversation: react, tease, comment, reassure, or joke in {char}'s voice without turning it into a plan.

Mode instruction:
${mode.instruction}

Max response tokens: ${settings.maxTokens}

[Character card / {char} source material]
${getCharacterBlock()}

[{user} persona material]
${getPersonaBlock()}

[Manual {char} voice note]
${getVoiceNoteBlock()}

[Recent RP {char} voice samples — strongest voice reference]
These samples are for voice, rhythm, relationship, and reaction style. Do not continue their plot.
${getCharacterVoiceSamples()}

[Recent RP context]
${getRecentChatBlock(settings.recentMessages)}

[Co-worker work note]
Use this only in Co-worker mode as {user}'s work background. It is not {user}'s persona and it must not make {char} break character.
${getCoworkerWorkNoteBlock()}

[Konggomul Talk current room history]
${getAssistantConversationBlock()}

Now stop RP and answer {user}'s latest message in Korean, as {char}, in the selected mode.`;
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
  if (s.profileMode !== 'profile' || !s.selectedProfile) return await callback();

  const selected = String(s.selectedProfile || '').trim();
  const previous = await getCurrentProfileName();

  if (!previous) {
    throw new Error('현재 연결 프로필을 확인할 수 없어 저장된 프로필로 전환하지 않았습니다. 본채팅 프로필 보호를 위해 생성을 중단합니다.');
  }

  if (previous === selected) return await callback();

  try {
    setStatus(`콩고물 토오크에서만 ${selected} 프로필로 생성 중...`);
    await runSlashCommand(profileCommand(selected));
    await wait(120);
    return await callback();
  } finally {
    try {
      await runSlashCommand(profileCommand(previous));
      await wait(120);
      setStatus(`본채팅 연결 프로필을 ${previous}(으)로 복구했습니다.`);
    } catch (e) {
      console.error('[Konggomul] profile restore failed', e);
      setStatus(`프로필 복구 실패: 본채팅 연결 프로필을 확인해 주세요.`);
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
  const systemPrompt = buildSystemPrompt();
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
          <div class="tua-title">🐶콩고물 토오크</div>
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
        <button type="button" id="tua-rename-room">이름 변경</button>
        <button type="button" id="tua-pin-room" title="대화방 고정/해제">📌</button>
        <button type="button" id="tua-new-room" title="새 대화방">＋</button>
        <button type="button" id="tua-delete-room" title="대화방 삭제">🗑️</button>
      </div>
      <div id="tua-room-list" class="tua-room-list"></div>
      <div id="tua-in-panel-settings" class="tua-in-panel-settings">
        <div class="tua-settings-title">🐶콩고물 토오크 설정</div>
        <label>모드
          <select id="tua-panel-mode">
            <option value="care">Care</option>
            <option value="secretary">Secretary</option>
            <option value="coworker">Co-worker</option>
            <option value="watching">Watching RP</option>
          </select>
        </label>
        <label>AI 연결 프로필
          <div class="tua-profile-row">
            <select id="tua-panel-profile-mode">
              <option value="current">현재 선택된 ST 연결</option>
              <option value="profile">저장된 Connection Profile 선택</option>
            </select>
            <button type="button" id="tua-refresh-profiles" title="프로필 목록 새로고침">↻</button>
          </div>
        </label>
        <label id="tua-profile-select-wrap">프로필 선택
          <select id="tua-panel-profile"></select>
        </label>
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
        <label>Co-worker 업무 메모
          <textarea id="tua-panel-coworker-note" rows="5" placeholder="예: 유저는 가구 쇼핑몰을 운영한다. 주 업무는 스마트스토어, 인스타 마케팅, 상세페이지 문구, 고객 CS, 리뷰 대응, 사방넷 발주 관리, 쇼룸 운영이다."></textarea>
        </label>
        <label>창 너비(px)
          <input id="tua-panel-width" type="number" min="280" max="1000" step="10">
        </label>
        <label>창 높이(px)
          <input id="tua-panel-height" type="number" min="320" max="1000" step="10">
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
    </div>
    <button type="button" id="tua-collapsed-button" title="콩고물 토오크 펼치기">🐶</button>`;
  document.body.appendChild(panelEl);

  $('#tua-close').on('click', () => setPanelVisible(false));
  $('#tua-collapse').on('click', (e) => { e.preventDefault(); e.stopPropagation(); setPanelCollapsed(true); });
  $('#tua-collapsed-button').on('click', (e) => { e.preventDefault(); e.stopPropagation(); if (collapsedButtonSuppressClick) { collapsedButtonSuppressClick = false; return; } setPanelCollapsed(false); setPanelVisible(true); });
  $('#tua-settings-open').on('click', (e) => { e.preventDefault(); e.stopPropagation(); $('#tua-in-panel-settings').toggleClass('open'); });
  $('#tua-active-room-title').on('click', (e) => { e.preventDefault(); closeSettingsPanel(); toggleRoomList(); });
  $('#tua-new-room').on('click', (e) => { e.preventDefault(); closeSettingsPanel(); const r = createRoom(); toggleRoomList(false); renderAll(); setStatus(`새 대화방으로 이동: ${r.title}`); $('#tua-input').trigger('focus'); });
  $('#tua-delete-room').on('click', () => { closeSettingsPanel(); if (confirm('이 🐶콩고물 토오크 대화방을 삭제하시겠습니까?')) deleteRoom(activeRoomId); });
  $('#tua-pin-room').on('click', () => { closeSettingsPanel(); toggleActiveRoomPinned(); });
  $('#tua-rename-room').on('click', () => { closeSettingsPanel(); renameActiveRoom(); });
  $('#tua-send').on('click', (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsPanel(); sendCurrentInput(); });
  $('#tua-input').on('focus click', closeSettingsPanel);
  $('#tua-input').on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeSettingsPanel(); sendCurrentInput(); } });
  $('#tua-input').on('input', autoGrowInput);
  $('#tua-panel-mode,#tua-panel-profile-mode,#tua-panel-profile,#tua-panel-tokens,#tua-panel-recent,#tua-panel-font,#tua-panel-voice-note,#tua-panel-width,#tua-panel-height,#tua-panel-coworker-note').on('change input', readPanelSettingsUI);
  $('#tua-refresh-profiles').on('click', refreshProfiles);
  $('#tua-export-rooms').on('click', exportCurrentCharacterRooms);
  $('#tua-import-rooms').on('click', () => $('#tua-import-file').trigger('click'));
  $('#tua-import-file').on('change', importCurrentCharacterRooms);
  $('#tua-reset-all-rooms').on('click', resetAllRoomsForCurrentCharacter);
  $('#tua-messages').on('click', closeSettingsPanel);

  makePanelDraggable();

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !panelEl?.classList.contains('tua-visible') || panelEl?.classList.contains('tua-collapsed')) return;
      const s = getSettings();
      const rect = entry.contentRect;
      if (Math.abs(rect.width - s.panelWidth) > 6 || Math.abs(rect.height - s.panelHeight) > 6) {
        s.panelWidth = Math.round(rect.width);
        s.panelHeight = Math.round(rect.height);
        saveSettings();
        hydratePanelSettingsUI();
      }
    });
    resizeObserver.observe(panelEl);
  }
}


function clampPanelPosition(left, top) {
  const s = getSettings();
  const panel = panelEl;
  if (!panel) return { left, top };
  const rect = panel.getBoundingClientRect();
  const w = rect.width || s.panelWidth || 380;
  const h = rect.height || s.panelHeight || 560;
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
    const wasCollapsedButtonDrag = draggingPanel.collapsedButton && draggingPanel.moved;
    const rect = panelEl.getBoundingClientRect();
    const pos = clampPanelPosition(rect.left, rect.top);
    const s = getSettings();
    s.panelLeft = Math.round(pos.left);
    s.panelTop = Math.round(pos.top);
    saveSettings();
    panelEl.classList.remove('tua-dragging');
    document.body.classList.remove('tua-panel-dragging-body');
    draggingPanel = null;
    if (wasCollapsedButtonDrag) collapsedButtonSuppressClick = true;
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
      version: '3.9.0',
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
  if (!imported || !Array.isArray(imported.rooms)) throw new Error('올바른 콩고물 토오크 백업 파일이 아닙니다.');
  const next = {
    rooms: imported.rooms.map(room => ({
      id: String(room.id || ('room_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
      title: String(room.title || defaultRoomTitle(room.createdAt || Date.now(), room.mode)),
      createdAt: Number(room.createdAt || Date.now()),
      mode: MODES[room.mode] ? room.mode : (getSettings().mode || 'care'),
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
    next.rooms.push({ id: 'room_' + Date.now(), title: defaultRoomTitle(), createdAt: Date.now(), mode: getSettings().mode || 'care', pinned: false, messages: [] });
  }
  return next;
}

function importCurrentCharacterRooms(e) {
  const input = e?.target;
  const file = input?.files?.[0];
  if (!file) return;
  if (!confirm('가져오면 현재 캐릭터의 콩고물 대화가 백업 파일 내용으로 교체됩니다. 계속할까요?')) {
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
  createRoom(false);
  saveRooms();
  renderAll();
  setStatus('이 캐릭터의 대화를 초기화했습니다.');
}

function renameActiveRoom() {
  const room = getActiveRoom();
  const next = prompt('대화방 이름', room.title || '');
  if (!next) return;
  room.title = next.trim();
  saveRooms();
  renderAll();
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

async function sendCurrentInput() {
  const settings = getSettings();
  if (!settings.enabled) { alert('🐶콩고물 토오크가 비활성화되어 있습니다. 확장 설정에서 활성화해 주세요.'); return; }
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
        <b>🐶콩고물 토오크</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label"><input type="checkbox" id="tua-setting-enabled"> 확장 활성화</label>
        <div class="tua-mini-note">체크하면 🐶콩고물 토오크가 활성화됩니다.</div>
      </div>
    </div>
  </div>`;
  $('#extensions_settings2').append(html);
  hydrateGlobalSettingsUI();
  $('#tua-setting-enabled').on('change', readGlobalSettingsUI);
}

function hydrateGlobalSettingsUI() { $('#tua-setting-enabled').prop('checked', !!getSettings().enabled); }

function readGlobalSettingsUI() {
  const s = getSettings();
  s.enabled = $('#tua-setting-enabled').prop('checked');
  if (!s.enabled) setPanelVisible(false);
  saveSettings();
  ensureLauncher();
}

function hydratePanelSettingsUI() {
  const s = getSettings();
  $('#tua-panel-mode').val(getRoomMode());
  $('#tua-panel-profile-mode').val(s.profileMode);
  renderProfileOptions();
  $('#tua-panel-profile').val(s.selectedProfile);
  $('#tua-panel-tokens').val(s.maxTokens);
  $('#tua-panel-recent').val(s.recentMessages);
  $('#tua-panel-font').val(s.fontSize);
  $('#tua-panel-voice-note').val(getVoiceNote());
  $('#tua-panel-coworker-note').val(s.coworkerWorkNote || '');
  $('#tua-panel-width').val(s.panelWidth);
  $('#tua-panel-height').val(s.panelHeight);
  $('#tua-profile-select-wrap').toggle(s.profileMode === 'profile');
}

function renderProfileOptions() {
  const s = getSettings();
  const sel = $('#tua-panel-profile');
  if (!sel.length) return;
  sel.empty();
  if (!s.cachedProfiles?.length) {
    sel.append(`<option value="">프로필 목록 새로고침 필요</option>`);
  } else {
    for (const p of s.cachedProfiles) sel.append(`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`);
  }
  if (s.selectedProfile) sel.val(s.selectedProfile);
}

function readPanelSettingsUI() {
  const s = getSettings();
  const selectedMode = $('#tua-panel-mode').val();
  setRoomMode(selectedMode);
  s.profileMode = $('#tua-panel-profile-mode').val();
  s.selectedProfile = $('#tua-panel-profile').val() || '';
  s.maxTokens = Number($('#tua-panel-tokens').val()) || 1000;
  s.recentMessages = Number($('#tua-panel-recent').val()) || 10;
  s.fontSize = Number($('#tua-panel-font').val()) || 14;
  setVoiceNote($('#tua-panel-voice-note').val() || '');
  s.coworkerWorkNote = $('#tua-panel-coworker-note').val() || '';
  s.panelWidth = Number($('#tua-panel-width').val()) || 380;
  s.panelHeight = Number($('#tua-panel-height').val()) || 560;
  saveSettings();
  applyVisualSettings();
  renderAll();
  $('#tua-profile-select-wrap').toggle(s.profileMode === 'profile');
}

function applyVisualSettings() {
  const s = getSettings();
  document.documentElement.style.setProperty('--tua-font-size', `${s.fontSize}px`);
  document.documentElement.style.setProperty('--tua-panel-width', `${s.panelWidth}px`);
  document.documentElement.style.setProperty('--tua-panel-height', `${s.panelHeight}px`);
  if (panelEl) panelEl.classList.toggle('tua-collapsed', !!s.collapsed);
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
  list.find('.tua-room-item').on('click', function () {
    closeSettingsPanel();
    activeRoomId = $(this).data('id');
    $('#tua-room-list').removeClass('open');
    renderAll();
  });
}

function renderMessages() {
  const box = $('#tua-messages');
  if (!box.length) return;
  const room = getActiveRoom();
  box.empty();
  hideContextMenu();
  if (!room.messages.length) {
    box.append(`<div class="tua-empty">아직 대화가 없습니다. 모드를 선택한 뒤 아래 입력창에서 캐릭터와의 새로운 대화를 시작해보세요.</div>`);
  }
  for (const m of room.messages) {
    const roleClass = m.role === 'user' ? 'user' : 'assistant';
    const name = m.role === 'user' ? '나' : getCharName();
    const html = `
      <div class="tua-msg tua-${roleClass} ${m.error ? 'tua-error' : ''} ${m.loading ? 'tua-loading' : ''}" data-id="${escapeHtml(m.id)}" tabindex="0" title="길게 누르면 복사/삭제/OOC 보내기">
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
    <button data-action="send-ooc">본RP 삽입</button>
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
    if (action === 'send-ooc') sendToMainChat(`OOC: ${msg.content}`);
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
  setStatus('본 RP 입력창에 삽입했습니다.');
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
    entry.innerHTML = '<span class="tua-extension-menu-icon">🐶</span><span class="tua-extension-menu-text">콩고물 토오크</span>';
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
