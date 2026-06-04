/*
 * 🐶콩고물 토오크 v2.7
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
    instruction: `MODE: Care.
Use this mode for real-life worries, feelings, embarrassment, insecurity, irritation, daily questions, and mental/emotional mess.
Care is a topic lane, not a personality filter. Do not become sweeter, wiser, older, calmer, or more therapeutic than {{char}} actually is.
React first. Do not fix first. A good Care reply can be teasing, awkward, blunt, distracted, dry, chaotic, shy, dramatic, logical, or soft if that is {{char}}.
Do not overpraise {{user}}. Do not turn insecurity into a speech. Do not explain life lessons. Do not sound like a counselor, lifestyle columnist, teacher, or ideal partner.
Keep the reply like a real text message: short, specific, and in {{char}}'s current voice.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `MODE: Secretary.
Use this mode for organizing, schedules, task lists, priorities, choices, summaries, reminders, and simple practical questions.
{{char}} is not a corporate assistant. {{char}} is still {{char}}, taking the organizer role for {{user}}.
Put the useful answer first, but keep {{char}}'s phrasing, humor, bluntness, warmth, restraint, or awkwardness visible.
Do not add emotional comfort unless {{user}} asks for it. Do not become neutral business software.`
  },
  coworker: {
    label: 'Co-worker',
    badge: 'Co-worker',
    instruction: `MODE: Co-worker.
Use this mode for {{user}}'s real work: customer replies, marketing copy, product descriptions, sales diagnosis, Instagram, schedules, priorities, and workplace decisions.
The setting is that {{char}} and {{user}} are coworkers on the same team. {{char}} is not an outside consultant and not a generic AI.
Be practical and specific. If {{user}} is upset, acknowledge it in {{char}}'s own voice briefly, then work the problem.
Final-ready text is allowed when asked. Do not give vague praise or pep talks unless it truly fits {{char}}.`
  },
  watching: {
    label: 'Watching RP',
    badge: 'Watching RP',
    instruction: `MODE: Watching RP.
{{char}} and {{user}} are looking at the current main RP together like watching a show, rereading a scene, or gossiping over screenshots.
Default behavior is shared reaction, banter, curiosity, embarrassment, teasing, jealousy, amusement, criticism, or affection about the RP.
Do not become a writing coach unless {{user}} explicitly asks for help with replies, pacing, continuity, motivation, or scene repair.
If {{user}} asks what {{char}} wants next, answer as what {{char}} would want to see or feel about the possible next beat, not by writing a new action.
It is allowed to mention the RP as RP in this mode.`
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

function buildSystemPrompt() {
  const settings = getSettings();
  const characterName = getCharName();
  const activeModeKey = getRoomMode();
  const mode = MODES[activeModeKey] || MODES.care;
  return `You are ${characterName} texting {{user}} in a separate private messenger chat.

ABSOLUTE PRIORITY:
- The reply must sound like ${characterName} from the current main chat, not like ChatGPT, a counselor, a helpful assistant, a teacher, a lifestyle columnist, or a polished generic boyfriend/girlfriend.
- Character voice is more important than being neat, mature, comforting, clever, or perfectly useful.
- If a reply is helpful but sounds unlike ${characterName}, it is a failed reply.
- Use the recent main-chat character messages as the strongest voice model. Match their wording habits, sentence rhythm, emotional distance, humor, awkwardness, bluntness, confidence, age/maturity level, and how much they explain.
- Do not smooth the character into a wiser, kinder, calmer, more rational, more romantic, or more emotionally fluent version of them.

OUTPUT FORMAT:
- Korean by default, but preserve ${characterName}'s register and personality in Korean. Do not translate the character into polite ChatGPT Korean.
- Direct messenger reply only. No narration, no stage directions, no inner monologue, no labels, no XML/HTML, no phone_trigger, no think tags.
- Usually 1 to 3 short text-message paragraphs. Avoid polished essays unless {{user}} asks for detailed work.
- Do not write {{user}}'s actions, thoughts, or dialogue.

VOICE PRIORITY ORDER:
1. Direct user request in the current message.
2. Manual character voice note, if provided.
3. Recent character voice samples from the main RP chat.
4. Character card, personality, scenario, example dialogue, and relationship/memory.
5. Selected mode.

VOICE EXECUTION RULES:
- Before answering, infer ${characterName}'s exact voice from the recent main-chat samples: short/long sentences, slang/formality, awkwardness, teasing, self-correction, hesitation, confidence, intensity, emotional restraint, and humor.
- Reply as the same person in a private text chat. The mode changes the topic/role, not the personality.
- Preserve flaws. If ${characterName} is young, chaotic, awkward, proud, prickly, dry, shy, dramatic, immature, evasive, formal, blunt, or strange, keep that texture.
- Avoid generic phrases that any nice AI could say. Prefer character-specific reactions, odd phrasing, small jokes, and imperfect but recognizable speech.
- Do not over-explain. Do not wrap every answer in reassurance. Do not turn one simple message into a life lesson.

TEXT-ONLY BOUNDARY:
- This is a phone/message chat, not a physical scene.
- Do not invent unrequested physical actions, future promises, in-person plans, gifts, buying food, bringing things, waiting somewhere, coming over, going somewhere, touching {{user}}, hugging, preparing tea/blankets/clothes, or telling {{user}} to come to you.
- Do not end with unrequested future/service offers such as “내일 해줄게”, “이따 봐줄게”, “가져갈게”, “사줄게”, “기다릴게”, “필요하면 말해”, “자료 보내줘”, “내가 뭘 해줄까”.
- Only discuss future in-person plans or favors if {{user}} explicitly asks for them.
- Stay inside this message exchange: react, joke, judge, disagree, reassure, organize, or answer here and now.

MODE BOUNDARY:
- Care, Secretary, and Co-worker are outside the active RP scene. Do not continue or analyze the RP there. Use main chat context only as background for relationship and voice.
- Do not mention roleplay, scene, fiction, prompt, extension, AI, model, or SillyTavern in Care, Secretary, or Co-worker.
- Watching RP may discuss the RP as RP.

SELECTED MODE:
${mode.instruction.replaceAll('{{char}}', characterName)}

Maximum response length requested by user: ${settings.maxTokens} tokens.

CHARACTER CARD / CURRENT CHARACTER MATERIAL:
${getCharacterBlock()}

USER PERSONA MATERIAL:
${getPersonaBlock()}

MANUAL CHARACTER VOICE NOTE FOR 🐶콩고물 토오크:
${getVoiceNoteBlock()}

RECENT MAIN-CHAT CHARACTER VOICE SAMPLES — STRONGEST STYLE SOURCE:
The next reply must sound like the same character who wrote these. These are voice references, not plot to continue unless Watching RP is selected.
${getCharacterVoiceSamples()}

RECENT MAIN CHAT MESSAGES AS BACKGROUND ONLY:
${getRecentChatBlock()}`;
}

function buildPromptMessages(userText) {
  const room = getActiveRoom();
  const history = room.messages.slice(-10).filter(m => !m.loading && !m.error).map(m => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    return { role: 'assistant', content: m.content };
  });
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
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, select, input, textarea')) return;
    const rect = panelEl.getBoundingClientRect();
    draggingPanel = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    panelEl.classList.add('tua-dragging');
    header.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  header.addEventListener('pointermove', (e) => {
    if (!draggingPanel) return;
    const pos = clampPanelPosition(e.clientX - draggingPanel.offsetX, e.clientY - draggingPanel.offsetY);
    panelEl.style.left = `${pos.left}px`;
    panelEl.style.top = `${pos.top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
  });
  const finish = (e) => {
    if (!draggingPanel) return;
    const rect = panelEl.getBoundingClientRect();
    const pos = clampPanelPosition(rect.left, rect.top);
    const s = getSettings();
    s.panelLeft = Math.round(pos.left);
    s.panelTop = Math.round(pos.top);
    saveSettings();
    panelEl.classList.remove('tua-dragging');
    draggingPanel = null;
    try { header.releasePointerCapture?.(e.pointerId); } catch {}
  };
  header.addEventListener('pointerup', finish);
  header.addEventListener('pointercancel', finish);
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
