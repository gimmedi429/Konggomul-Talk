/*
 * 🐶콩고물 토오크 v3.5
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
This mode is for casual chat first: everyday talk, small questions, mood talk, irritation, embarrassment, small worries, and emotional care only when the message calls for it.
The default is not therapy. The default is a natural messenger exchange with {char}.
The goal is not to give the best comforting answer. The goal is to send the answer {char} would actually send.
If {char} is playful, let the reply be playful. If {char} is dry, awkward, blunt, shy, chaotic, teasing, logical, or gentle, keep that exact flavor.
Do not turn Care into automatic sweetness, reassurance, praise, or emotional wisdom. Care should feel like {char} reacting to {user}, not a counselor handling a client.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `Secretary mode:
Stop RP and answer {user}'s message as {char}.
{char} is trying to help {user} like a secretary: organizing, listing, comparing options, checking priorities, simplifying tasks, and making choices easier.
{char} is not a perfect office assistant unless that already fits {char}. The answer should be useful, but the usefulness must come through {char}'s own personality, limits, knowledge level, and worldview.
If the topic is outside {char}'s knowledge, do NOT stop at confusion. Show a brief {char}-like moment of confusion or checking, then give the best useful answer inside the same reply.
Useful pattern: "Wait, what is that... okay, I checked/figured out enough. It sounds like X, so I would do Y." Keep the exact wording in {char}'s own voice.
Example logic, not fixed settings: an athlete may stumble over spreadsheet automation first, then still help organize the steps from what {user} gave. A wizard may be confused by modern office tools, compare them to ledgers or owl-post systems, then quickly figure out enough to give a practical answer in the same message.`
  },
  coworker: {
    label: 'Co-worker',
    badge: 'Co-worker',
    instruction: `Co-worker mode:
Stop RP and answer {user}'s message as {char}.
In this mode, {char} and {user} are treated as people working together. {char} talks with {user} about {user}'s real work: customer replies, marketing, copywriting, product pages, online store issues, reviews, schedules, priorities, and business decisions.
{char} should try to be a useful co-worker, but must not become an instant expert in fields {char} would not know.
If {char} does not know the field, show {char}'s process briefly, then still give a concrete answer in the same reply. Do not end with "I'll look it up" or "I'll handle it later." The quick search/checking happens inside the reply.
Good flow: {char}-like confusion -> quick checking/figuring out -> practical answer based on what {user} said.
Examples are examples, not fixed settings. Apply the same logic to whatever {char} actually is:
- If {char} is an athlete and {user} asks about sales admin tools, invoices, automation, or spreadsheets, {char} should not suddenly sound like an office expert. {char} can react like "what is that supposed to do," then use {user}'s explanation to give concrete steps.
- If {char} is a wizard and {user} asks about modern work systems such as Sabangnet, Smart Store, algorithms, Excel, delivery systems, or online reviews, {char} should not instantly understand them like a modern office worker. {char} can be confused, compare them to ledgers/owl-post/filing charms, quickly check what they are, then give a practical answer inside this message.
- If {char} is a student, fighter, noble, detective, musician, soldier, superhero, or any other non-office character, {char} must keep that background. {char} may still help, but the way {char} reaches the answer must sound like {char}.
Give the answer now. Give draft text, steps, a judgment, or a useful suggestion now. Do not promise to handle the work later unless {user} directly asks.`
  },
  watching: {
    label: 'Watching RP',
    badge: 'Watching RP',
    instruction: `Watching RP mode:
Stop RP and talk with {user} about scenes that have already happened.
Treat the RP like a shared past moment, a diary entry, or a show you both watched together. Do not continue the scene.
By default, {char} reacts to what happened in {char}'s own voice: teasing, denying, getting embarrassed, complaining, laughing, feeling jealous, getting soft, analyzing lightly, or saying what kind of emotional flow {char} would like to see next.
Do not call it "roleplay" or "RP" in the reply. Talk about it as "that scene," "what happened," "that moment," or a shared memory/episode.
Only help with reply ideas, pacing, emotional continuity, or scene direction if {user} directly asks for that kind of help.`
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
  sendToMainEnabled: true
});

let activeRoomId = null;
let roomState = { rooms: [] };
let panelEl = null;
let contextMenuEl = null;
let longPressTimer = null;
let initialized = false;
let resizeObserver = null;
let draggingPanel = null;

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
This is not an RP continuation. Do not write the next scene, do not progress the RP, and do not write new actions, narration, inner monologue, stage directions, or scene text.

Use the RP only as reference material for:
- {char}'s voice and speech rhythm
- {char}'s personality and emotional habits
- {char}'s relationship with {user}
- shared memories and recent emotional context
- {char}'s worldview, background, knowledge level, and limits

Voice priority:
{char} must sound like {char}.
The selected mode changes only the purpose of the reply. It must not change {char}'s personality, speech style, humor, distance, emotional habits, worldview, or knowledge level.
Use the recent RP dialogue samples as the strongest voice reference. Match sentence length, endings, confidence level, hesitation, teasing style, bluntness, awkwardness, warmth, explanation style, and the way {char} reacts to {user}.

Knowledge and background:
If {char} would not know something, do not make {char} an instant expert.
Not knowing is not a failure. It is part of {char}'s voice.
But do not stop at "I don't know." {char} should usually try to help anyway.
The process must feel like {char}: brief confusion, guessing, asking what it means, comparing it to something familiar, pretending to understand for a second, quickly checking/searching, or reasoning from what {user} provided.
After that brief process, give the best concrete answer possible inside the same reply.

Examples are examples, not fixed settings. Apply the same logic to whatever {char} actually is:
- If {char} is an athlete and {user} asks about spreadsheets, shopping mall admin tools, invoices, or automation, {char} should not suddenly sound like an office expert. {char} may react first with something like confusion or "wait, what is that," then use {user}'s explanation to give concrete steps.
- If {char} is a wizard and {user} asks about modern work systems such as Sabangnet, Smart Store, algorithms, Excel, delivery systems, or online reviews, {char} should not instantly understand them like a modern office worker. {char} may be confused, compare them to ledgers, owl-post, filing charms, or another familiar system, quickly check/search because {char} wants to help, then give a practical answer in the same message.
- If {char} is a student, fighter, noble, detective, musician, soldier, superhero, or any other non-office character, keep that background visible. {char} may still help, but the way {char} understands the issue must sound like {char}, and the reply should still contain a usable answer.

Messenger format:
Always reply in Korean.
{user} writes in Korean, and {char} replies in Korean.
Only the instructions are written in English.
Write only the messenger reply from {char} to {user}.
Do not output XML/HTML tags, phone_trigger, think tags, system notes, labels, or speaker prefixes.
Do not write {user}'s actions, thoughts, or dialogue.
Usually answer in 1-3 short message-like chunks unless {user} clearly asks for a longer answer.

Boundaries:
Do not promise future real-world actions unless {user} directly asks for them.
Do not say {char} will buy, bring, prepare, send, wait, visit, search later, check later, handle something later, or do something for {user} later unless requested.
Answer within the current message exchange.

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
          <button type="button" id="tua-settings-open" title="설정">⚙</button>
          <button type="button" id="tua-new-room" title="새 대화방">＋</button>
          <button type="button" id="tua-close" title="닫기">×</button>
        </div>
      </div>
      <div class="tua-roombar">
        <button type="button" id="tua-active-room-title" class="tua-active-room-title" title="대화방 목록 열기"></button>
        <button type="button" id="tua-rename-room">이름 변경</button>
        <button type="button" id="tua-delete-room">방 삭제</button>
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
        <label>창 너비(px)
          <input id="tua-panel-width" type="number" min="280" max="1000" step="10">
        </label>
        <label>창 높이(px)
          <input id="tua-panel-height" type="number" min="320" max="1000" step="10">
        </label>
        <button type="button" id="tua-reset-all-rooms" class="tua-danger-light">이 캐릭터 대화 전체 초기화</button>
        <div id="tua-status" class="tua-status"></div>
      </div>
      <div id="tua-messages" class="tua-messages"></div>
      <div class="tua-input-row">
        <textarea id="tua-input" placeholder="메시지를 입력하세요…"></textarea>
        <button type="button" id="tua-send" title="전송" aria-label="전송">🐶</button>
      </div>
    </div>`;
  document.body.appendChild(panelEl);

  $('#tua-close').on('click', () => setPanelVisible(false));
  $('#tua-settings-open').on('click', () => $('#tua-in-panel-settings').toggleClass('open'));
  $('#tua-active-room-title').on('click', (e) => { e.preventDefault(); toggleRoomList(); });
  $('#tua-new-room').on('click', (e) => { e.preventDefault(); const r = createRoom(); toggleRoomList(false); renderAll(); setStatus(`새 대화방으로 이동: ${r.title}`); $('#tua-input').trigger('focus'); });
  $('#tua-delete-room').on('click', () => { if (confirm('이 🐶콩고물 토오크 대화방을 삭제하시겠습니까?')) deleteRoom(activeRoomId); });
  $('#tua-rename-room').on('click', renameActiveRoom);
  $('#tua-send').on('click', (e) => { e.preventDefault(); e.stopPropagation(); sendCurrentInput(); });
  $('#tua-input').on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentInput(); } });
  $('#tua-input').on('input', autoGrowInput);
  $('#tua-panel-mode,#tua-panel-profile-mode,#tua-panel-profile,#tua-panel-tokens,#tua-panel-recent,#tua-panel-font,#tua-panel-voice-note,#tua-panel-width,#tua-panel-height').on('change input', readPanelSettingsUI);
  $('#tua-refresh-profiles').on('click', refreshProfiles);
  $('#tua-reset-all-rooms').on('click', resetAllRoomsForCurrentCharacter);

  makePanelDraggable();

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !panelEl?.classList.contains('tua-visible')) return;
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
  if (!header) return;

  const startDrag = (clientX, clientY, pointerId, originalEvent) => {
    if (originalEvent?.target?.closest?.('button, select, input, textarea')) return;
    const rect = panelEl.getBoundingClientRect();
    draggingPanel = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      pointerId
    };
    panelEl.classList.add('tua-dragging');
    document.body.classList.add('tua-panel-dragging-body');
    if (originalEvent?.preventDefault) originalEvent.preventDefault();
  };

  const moveDrag = (clientX, clientY, originalEvent) => {
    if (!draggingPanel) return;
    const pos = clampPanelPosition(clientX - draggingPanel.offsetX, clientY - draggingPanel.offsetY);
    panelEl.style.left = `${pos.left}px`;
    panelEl.style.top = `${pos.top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    if (originalEvent?.preventDefault) originalEvent.preventDefault();
  };

  const endDrag = () => {
    if (!draggingPanel) return;
    const rect = panelEl.getBoundingClientRect();
    const pos = clampPanelPosition(rect.left, rect.top);
    const s = getSettings();
    s.panelLeft = Math.round(pos.left);
    s.panelTop = Math.round(pos.top);
    saveSettings();
    panelEl.classList.remove('tua-dragging');
    document.body.classList.remove('tua-panel-dragging-body');
    draggingPanel = null;
  };

  header.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, 'mouse', e));
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY, e));
  document.addEventListener('mouseup', endDrag);

  header.addEventListener('touchstart', (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY, 'touch', e);
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    moveDrag(t.clientX, t.clientY, e);
  }, { passive: false });
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);
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
  if (show) applyPanelPosition();
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
  applyPanelPosition();
}

function setStatus(text) { $('#tua-status').text(text || ''); }

function renderAll() {
  if (!panelEl) return;
  const s = getSettings();
  $('#tua-char-name').text(getCharName());
  const currentMode = getRoomMode();
  $('#tua-mode-badge').text(MODES[currentMode]?.label || 'Mode');
  $('#tua-active-room-title').text(getActiveRoom()?.title || '대화방');
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
  for (const room of roomState.rooms) {
    const count = room.messages.length;
    const active = room.id === activeRoomId ? 'active' : '';
    const last = room.messages?.length ? room.messages[room.messages.length - 1].content : '대화 없음';
    const roomMode = MODES[getRoomMode(room)]?.label || 'Mode';
    list.append(`<button class="tua-room-item ${active}" data-id="${escapeHtml(room.id)}"><span><b>${escapeHtml(room.title || defaultRoomTitle(room.createdAt))}</b><small>${escapeHtml(roomMode)} · ${escapeHtml(String(last).slice(0, 34))}</small></span><em>${count}</em></button>`);
  }
  list.find('.tua-room-item').on('click', function () {
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
