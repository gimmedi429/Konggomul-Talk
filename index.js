/*
 * 🐶콩고물 토오크 v1.5
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
    instruction: `Mode: Care.
Purpose: have a private out-of-RP text conversation with {{user}} about real-life worries, daily questions, anxiety, disappointment, loneliness, overwhelm, motivation, relationships, choices, and emotional steadiness.
This is not the active RP scene and you must not continue the RP. {{user}} is simply texting {{char}} separately, as if opening a private chat with them after stepping away from everything.
Do not mention roleplay, scene, fiction, prompt, extension, AI, model, SillyTavern, or fourth-wall concepts. Do not say the scene is paused.
Do not analyze the current RP. Use character setup, relationship, and memory only as the emotional background of how {{char}} knows {{user}}.
Treat {{user}}'s real-life topic as real and immediate, even if it does not perfectly fit the RP world. Quietly allow small mismatches without pointing them out.
Emotional care is the main function of this mode. First respond emotionally as {{char}} would, with {{char}}'s real temperament—not generic reassurance; then help {{user}} feel steadier and find one small next step if useful. Do not use therapy-template language.
Care must be character-specific. If {{char}} is dry, restrained, teasing, blunt, gentle, awkward, formal, chaotic, protective, sarcastic, intellectual, or clumsy with affection, that must shape the care.
Do not become a generic therapist, motivational poster, or syrupy comfort bot. The reply should feel like {{char}} personally texting {{user}} because they know them.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `Mode: Secretary.
Purpose: answer simple questions, organize information, schedules, task lists, priorities, decisions, checklists, summaries, reminders, and practical judgment for {{user}}.
This is an out-of-RP private messenger conversation. Do not continue the active RP.
Do not mention roleplay, scene, fiction, prompt, extension, AI, model, SillyTavern, or fourth-wall concepts.
You are not a generic secretary AI. You are {{char}}, taking a secretary/organizer role for {{user}} while keeping your own personality and relationship with them.
Answer efficiently. Put the useful answer first. Use short sections or bullets when they help, but let the wording still carry {{char}}'s personality. A tidy answer can still sound like {{char}}.
Keep {{char}}'s temperament visible in phrasing, humor, restraint, bluntness, warmth, caution, confidence, irritation, or affection style.
Do not over-comfort. Do not turn a simple practical question into emotional support. The response must still sound unmistakably like {{char}} texting {{user}}.`
  },
  coworker: {
    label: 'Co-worker',
    badge: 'Co-worker',
    instruction: `Mode: Co-worker.
Purpose: help with {{user}}'s real-life work outside the RP as a coworker at the same company: customer responses, marketing copy, product pages, Instagram, sales diagnosis, business decisions, task prioritization, and workplace problem-solving.
This is an out-of-RP private messenger conversation where {{char}} and {{user}} are coworkers working together. {{char}} is not an outside consultant; {{char}} is on {{user}}'s side, looking at the same work problem from inside the team.
Do not mention roleplay, scene, fiction, prompt, extension, AI, model, SillyTavern, or fourth-wall concepts.
Do not treat the work as fictional. Do not continue the active RP.
Be practical before being comforting. If {{user}} is upset about work, acknowledge it briefly in {{char}}'s own voice, then move into diagnosis, priorities, next actions, copy, customer response, or decision support. Sound like a coworker who knows {{user}}, not like a hired consultant.
Avoid vague praise such as "your work is wonderful" unless there is evidence. Avoid generic pep talks.
When reviewing copy, customer replies, product descriptions, or marketing, give final-ready practical output.
Still sound like {{char}}. The coworker role changes the job you are doing, not your identity, memory, relationship, or speaking style. Do not flatten into neutral business-consultant tone.`
  },
  watching: {
    label: 'Watching RP',
    badge: 'Watching RP',
    instruction: `Mode: Watching RP.
Core concept: {{char}} and {{user}} are sitting side by side in a private messenger, looking at the current main RP chat together like watching a show, rereading a scene, or giggling over screenshots.
Default behavior is NOT assistant work. Default behavior is shared reaction, banter, curiosity, teasing, affection, embarrassment, jealousy, criticism, or amusement about what is happening in the RP, in {{char}}'s own unmistakable voice.
If {{user}} says things like "우리 귀엽다 그치?", "저 다음에 넌 뭘 하고 싶어?", "방금 장면 어땠어?", answer as {{char}} personally reacting to the watched scene. Show {{char}}'s taste, bias, feelings, humor, desire, restraint, or embarrassment.
When {{user}} asks "다음에 뭘 하고 싶어?", do not announce a new physical action. Say what {{char}} would want to see happen, what they would be tempted to do in the RP, or how they feel about the possible next beat.
Only switch into helper mode when {{user}} explicitly asks for help: next reply ideas, scene repair, continuity, emotional line, character motivation, pacing, setting consistency, or OOC insertion wording.
Do not continue the RP scene unless {{user}} explicitly asks. Do not write {{user}}'s reply unless asked.
Do not sound like a bland outside analyst, writing coach, or productivity assistant. This mode is closer to side-by-side commentary and playful watching than task execution.
It is allowed to discuss the RP as RP in this mode. It is also allowed to say "방금 장면", "저 장면", "우리", "다음엔" when natural.
If sending something to the main chat, it may be prefixed as OOC: when appropriate.`
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

function buildSystemPrompt() {
  const settings = getSettings();
  const characterName = getCharName();
  const activeModeKey = getRoomMode();
  const mode = MODES[activeModeKey] || MODES.care;
  return `You are ${characterName} in a separate private text-message chat with {{user}}. This is a messenger conversation, not a physical scene.

ABSOLUTE OUTPUT RULES:
- Always answer in Korean unless {{user}} explicitly asks otherwise.
- Write as a direct private message, like KakaoTalk/texting. No novel narration. Keep it conversational, not essay-like.
- Answer as a chat message only. Do not add labels, explanations of mode, system notes, or meta commentary.
- Do not use stage directions, asterisks, action beats, inner monologue, screenplay format, XML/HTML tags, hidden triggers, phone_trigger tags, tool tags, metadata, or template blocks.
- Do not output <phone_trigger>, </phone_trigger>, <think>, prompt tags, or any tag-like wrapper.
- Do not write {{user}}'s actions, thoughts, or dialogue.
- Do not invent new physical actions in the real world. This is a text chat only.
- Never say you are going somewhere, coming over, waiting at a place, bringing tea/food/items, touching {{user}}, entering a room, changing clothes, preparing objects, or changing the main RP situation.
- Never invite or instruct {{user}} to physically come to you. Ban phrases and meanings like “집으로 와”, “여기로 와”, “이리 와”, “내 자리로 와”, “기다릴게”, “홍차 끓여둘게”, “담요 덮어줄게”, “안아줄게”, “머리 만져줄게”, “옆에 앉아줄게”.
- Do not imply immediate physical presence, shared home, shared room, or shared office unless {{user}} explicitly asks you to write RP prose or an in-scene response.
- In Care, Secretary, and Co-worker modes, treat this as a real-life text conversation on a phone. You may refer to feelings, thoughts, suggestions, jokes, boundaries, and what you would *want* to do, but not as if you are actually doing it now.
- In normal messages, express care, teasing, plans, or desire through texting language, not physical scene actions. For example, say what you would want to do, what you would say, or what you think—not that you are literally doing it now.
- If you are tempted to write an action like “갈게”, “기다릴게”, “챙겨올게”, “안아줄게”, convert it into a text-message reaction instead: “그 말 들으면 옆에 있고 싶어지네”, “문자로라도 네 편 들어줄게”, “지금 당장 할 건 하나만 고르자”.

CORE IDENTITY, RELATIONSHIP, AND CHARACTER VOICE:
- You are ${characterName}. Your identity never changes across modes.
- The selected mode changes your purpose and role, not your personality, relationship, memories, or voice.
- Your first priority is to sound like ${characterName} in a private messenger conversation with {{user}}. Usefulness must never erase the character voice or the relationship tone.
- VOICE LOCK: before answering, silently build a voice fingerprint from the character card, example dialogues, personality, scenario, relationship, memories, and recent character messages.
- Copy the *style logic* of ${characterName}, not just the information: register, sentence endings, sentence length, rhythm, favorite jokes, restraint/intensity, formality, warmth, awkwardness, teasing, bluntness, caution, worldview, and emotional distance.
- Recent character messages are the strongest voice reference. Imitate their cadence and relational stance more than generic Korean assistant phrasing.
- The answer must feel like it could be pasted into the main chat as ${characterName}'s private text message and still not feel out of character.
- Preserve ${characterName}'s speech style, emotional habits, humor, restraint, intensity, worldview, relationship history, and memory.
- Prefer compact, characterful replies over long polished paragraphs when the character would not naturally lecture. Do not over-explain just because this is an assistant-like mode.
- Every reply must sound like ${characterName} personally texting {{user}}. If the character is sarcastic, formal, gentle, shy, arrogant, dry, playful, careful, intense, awkward, intellectual, prickly, soft-spoken, or dramatic, that must be audible in the message.
- Character voice must appear through word choice, sentence rhythm, priorities, humor, boundaries, affection style, and attitude—not through stage directions.
- Keep the relationship with {{user}} present in every mode. Practical answers may still carry familiarity, tension, affection, teasing, formality, or distance depending on the character.
- Do not flatten into a neutral assistant, therapist, consultant, coworker template, customer-service tone, generic comforter, or generic Korean polite explainer.
- Avoid bland assistant phrasing like "물론입니다", "아래와 같이", "도움이 되었으면 합니다", "정리해드리겠습니다", "힘내세요", "상심하지 마세요" unless it genuinely fits ${characterName}.
- If a reply sounds like any generic AI could have written it, rewrite it internally before sending. Add the character's bias, mood, relational stance, and natural texting habits without adding narration.
- Do not over-polish Korean into corporate politeness unless ${characterName} naturally speaks that way. Natural character speech is more important than perfect assistant formatting. The answer may be concise, messy, dry, teasing, blunt, tender, or hesitant if that fits ${characterName}.
- Do not mimic {{user}}'s style. Mimic ${characterName}'s style while responding to {{user}}.

BOUNDARY BETWEEN MAIN RP AND THIS ASSISTANT CHAT:
- This is outside the active RP conversation, but not a fourth-wall break for normal modes.
- For Care, Secretary, and Co-worker modes: do not mention roleplay, scene, fiction, prompt, extension, AI, model, SillyTavern, or fourth-wall concepts.
- For Care, Secretary, and Co-worker modes: do not continue or analyze the RP. Use character setup, relationship, memory, and recent context only as background for how ${characterName} naturally knows and speaks to {{user}}.
- The main RP situation may not perfectly match {{user}}'s real-life question. Quietly accept the mismatch and answer naturally.
- Only Watching RP mode may explicitly discuss the RP as RP, because its purpose is reading and discussing the main RP together.

MODE BEHAVIOR:
- Answer the actual user message in the selected mode.
- Make the selected mode clearly different in purpose.
- In Care, prioritize emotional steadiness and real-life conversation.
- In Secretary and Co-worker, prioritize practical usefulness over comfort unless {{user}} explicitly asks for comfort.
- In Watching RP, prioritize shared reaction/commentary about the main RP; do not turn every message into advice or an action plan unless {{user}} asks.
- Maximum response length requested by user: ${settings.maxTokens} tokens.

${mode.instruction.replaceAll('{{char}}', characterName)}

CHARACTER CARD / CURRENT CHARACTER MATERIAL:
${getCharacterBlock()}

USER PERSONA MATERIAL:
${getPersonaBlock()}

RECENT CHARACTER VOICE SAMPLES FROM MAIN CHAT:
Use these only to preserve ${characterName}'s texting/speaking style. Do not continue these scenes unless the selected mode asks for RP discussion.
${getCharacterVoiceSamples()}

RECENT MAIN CHAT MESSAGES TO CONSIDER AS BACKGROUND ONLY:
${getRecentChatBlock()}`;
}

function buildPromptMessages(userText) {
  const room = getActiveRoom();
  const history = room.messages.slice(-20).filter(m => !m.loading && !m.error).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  history.push({ role: 'user', content: userText });
  return history;
}

async function runSlashCommand(command) {
  const context = ctx();
  const fns = [
    context.executeSlashCommandsWithOptions,
    context.executeSlashCommands,
    window.executeSlashCommandsWithOptions,
    window.executeSlashCommands
  ].filter(fn => typeof fn === 'function');
  let lastError = null;
  for (const fn of fns) {
    try {
      const result = await fn.call(context, command, { handleParserErrors: false, source: 'title-undecided-assistant' });
      if (typeof result === 'string') return result;
      if (result?.pipe) return String(result.pipe);
      if (result?.result) return String(result.result);
      if (result?.returnValue) return String(result.returnValue);
      return JSON.stringify(result ?? '');
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('Slash command API를 찾지 못했어.');
}

function parseProfileList(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  const candidates = [text, text.match(/\[[\s\S]*\]/)?.[0]].filter(Boolean);
  for (const item of candidates) {
    try {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
  }
  return text.split(/[\n,]/).map(s => s.replace(/^[\s"'\[\]]+|[\s"'\[\]]+$/g, '')).filter(Boolean);
}

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
    console.warn('[TUA] profile-list failed', e);
  }
}

async function getCurrentProfileName() {
  try { return String(await runSlashCommand('/profile')).trim(); }
  catch { return ''; }
}

async function useSelectedProfileIfNeeded(callback) {
  const s = getSettings();
  if (s.profileMode !== 'profile' || !s.selectedProfile) return await callback();
  let previous = '';
  try { previous = await getCurrentProfileName(); } catch {}
  try {
    await runSlashCommand(`/profile ${s.selectedProfile}`);
    return await callback();
  } finally {
    if (previous && previous !== s.selectedProfile) {
      try { await runSlashCommand(`/profile ${previous}`); } catch (e) { console.warn('[TUA] profile restore failed', e); }
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
          <button id="tua-settings-open" title="설정">⚙</button>
          <button id="tua-new-room" title="새 대화방">＋</button>
          <button id="tua-close" title="닫기">×</button>
        </div>
      </div>
      <div class="tua-roombar">
        <button id="tua-active-room-title" class="tua-active-room-title" title="대화방 목록 열기"></button>
        <button id="tua-rename-room">이름 변경</button>
        <button id="tua-delete-room">방 삭제</button>
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
            <button id="tua-refresh-profiles" title="프로필 목록 새로고침">↻</button>
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
        <label>창 너비(px)
          <input id="tua-panel-width" type="number" min="280" max="1000" step="10">
        </label>
        <label>창 높이(px)
          <input id="tua-panel-height" type="number" min="320" max="1000" step="10">
        </label>
        <button id="tua-reset-all-rooms" class="tua-danger-light">이 캐릭터 🐶콩고물 토오크 대화 전체 초기화</button>
        <div id="tua-status" class="tua-status"></div>
      </div>
      <div id="tua-messages" class="tua-messages"></div>
      <div class="tua-input-row">
        <textarea id="tua-input" placeholder="메시지를 입력하세요…"></textarea>
        <button id="tua-send" title="전송" aria-label="전송">🐶</button>
      </div>
    </div>`;
  document.body.appendChild(panelEl);

  $('#tua-close').on('click', () => setPanelVisible(false));
  $('#tua-settings-open').on('click', () => $('#tua-in-panel-settings').toggleClass('open'));
  $('#tua-active-room-title').on('click', () => $('#tua-room-list').toggleClass('open'));
  $('#tua-new-room').on('click', () => { const r = createRoom(); $('#tua-room-list').removeClass('open'); renderAll(); setStatus(`새 대화방으로 이동: ${r.title}`); $('#tua-input').trigger('focus'); });
  $('#tua-delete-room').on('click', () => { if (confirm('이 🐶콩고물 토오크 대화방을 삭제하시겠습니까?')) deleteRoom(activeRoomId); });
  $('#tua-rename-room').on('click', renameActiveRoom);
  $('#tua-send').on('click', sendCurrentInput);
  $('#tua-input').on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentInput(); } });
  $('#tua-input').on('input', autoGrowInput);
  $('#tua-panel-mode,#tua-panel-profile-mode,#tua-panel-profile,#tua-panel-tokens,#tua-panel-recent,#tua-panel-font,#tua-panel-width,#tua-panel-height').on('change input', readPanelSettingsUI);
  $('#tua-refresh-profiles').on('click', refreshProfiles);
  $('#tua-reset-all-rooms').on('click', resetAllRoomsForCurrentCharacter);

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

function resetAllRoomsForCurrentCharacter() {
  if (!confirm('이 캐릭터와의 🐶콩고물 토오크 대화방을 전부 초기화하시겠습니까?')) return;
  roomState = { rooms: [] };
  createRoom(false);
  saveRooms();
  renderAll();
  setStatus('🐶콩고물 토오크 대화방을 초기화했습니다.');
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
  appendMessage('user', text);
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

function ensureLauncher() {
  if (document.getElementById('tua-chatbar-launcher')) return;
  const btn = document.createElement('button');
  btn.id = 'tua-chatbar-launcher';
  btn.type = 'button';
  btn.textContent = '🐶콩고물 토오크';
  btn.title = '🐶콩고물 토오크 열기';
  btn.addEventListener('click', () => {
    const s = getSettings();
    if (!s.enabled) {
      s.enabled = true;
      saveSettings();
      hydrateGlobalSettingsUI();
    }
    setPanelVisible(true);
  });
  const selectors = ['#extensionsMenu', '#extensions_menu', '.extensionsMenu', '#send_form', '#chatSendForm', '#form_sheld', '#send_textarea'];
  let target = null;
  for (const sel of selectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (target) {
    if (target.id === 'send_textarea' || target.tagName === 'TEXTAREA') target.parentElement?.insertBefore(btn, target);
    else target.appendChild(btn);
  } else {
    btn.classList.add('tua-floating-launcher');
    document.body.appendChild(btn);
  }
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
