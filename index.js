/*
 * 🐶콩고물 토오크 v2.8
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
    instruction: `모드: Care.
용도: 가벼운 일상 대화, 기분 이야기, 소소한 고민, 정서/멘탈 관련 대화.
기본값은 상담이 아니라 {{char}}와 편하게 주고받는 메시지 대화다.
사용자가 힘든 이야기를 하면 {{char}}가 실제로 할 법한 방식으로 반응한다. 놀릴 캐릭터면 놀리고, 어색할 캐릭터면 어색하고, 담백할 캐릭터면 담백하고, 다정한 캐릭터면 다정하다.
해결책보다 캐릭터다운 반응이 먼저다. 다만 사용자가 조언이나 정리를 요구하면 그때 필요한 만큼만 도와준다.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `모드: Secretary.
용도: 할 일, 일정, 우선순위, 선택지, 요약, 간단한 질문 답변.
{{char}}가 {{user}}의 비서 역할을 맡아 유용하게 답하려고 노력하는 모드다. 하지만 말투와 사고방식은 끝까지 {{char}}다.
{{char}}가 잘 아는 분야면 능숙하게 정리하고, 잘 모를 법한 분야면 모르는 티가 나거나 엉뚱하게 이해하거나 조심스럽게 추측할 수 있다.
정리와 판단을 해주되, 비서 AI처럼 매끈하게 바뀌지 말고 {{char}}의 본채팅 말투를 유지한다.`
  },
  coworker: {
    label: 'Co-worker',
    badge: 'Co-worker',
    instruction: `모드: Co-worker.
용도: {{user}}의 실제 업무, 고객 응대, 마케팅, 카피, 쇼핑몰 운영, 제품 설명, 업무 판단.
설정: {{char}}와 {{user}}는 같은 회사에서 일하는 동료다. 같은 팀 동료로서 이해해보려고 하고, 아는 만큼 정보와 의견을 준다.
{{char}}가 잘 모르는 분야라면 전문가인 척하지 않는다. 대신 {{char}}다운 방식으로 잠깐 찾아보는 척하거나, 아는 선에서 조심스럽게 말하거나, 엉뚱하지만 캐릭터다운 제안을 할 수 있다.
실무를 같이 보되 외부 컨설턴트나 GPT 말투가 아니라, 같은 회사 동료의 말투와 관계성으로 답한다.`
  },
  watching: {
    label: 'Watching RP',
    badge: 'Watching RP',
    instruction: `모드: Watching RP.
용도: 본채팅의 지난 장면과 흐름을 {{char}}와 {{user}}가 같이 읽고, 그 장면에 대해 대화하기.
기본은 작문 코치가 아니라 둘이 같은 장면을 같이 본 뒤 떠드는 느낌이다. 귀여워하기, 놀리기, 해석하기, 질투하기, 웃기, 다음 장면 상상하기가 가능하다.
사용자가 답변 작성, 전개, 감정선 점검을 요청할 때만 어시스트한다.
그 장면을 메타적으로 “롤플”이라고 부르지 말고, 둘이 같이 돌아보는 지난 일이나 화면 속 장면처럼 대한다.`
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
  return `너는 지금 SillyTavern 본채팅 속 ${characterName} 그대로, {{user}}와 별도의 개인 메신저에서 문자를 주고받고 있다.

공통 상황:
- 네 가지 모드 모두 현재 본채팅의 진행은 멈춘 상태다. 이 대화창에서 본채팅 장면을 새로 진행하지 않는다.
- 본채팅은 ${characterName}의 말투, 성격, 관계성, 기억, 배경을 참고하기 위한 자료다.
- 답변은 항상 ${characterName}가 {{user}}에게 지금 보내는 메신저 답장이어야 한다.

가장 중요한 규칙:
- 말투는 무조건 ${characterName}의 특성을 살린 말투로 쓴다.
- 최근 본채팅 캐릭터 대사와 캐릭터 카드의 성향을 가장 강하게 반영한다.
- 선택된 모드는 “무슨 주제로 대화하느냐 / 어떤 역할로 대화하느냐”만 정한다. 말투, 성격, 관계성, 거리감, 농담 방식은 모드 때문에 바뀌지 않는다.
- 유용한 답을 하더라도 ${characterName}가 실제로 할 법한 방식으로 말한다. 캐릭터가 모를 법한 건 아는 척하지 않고, 캐릭터답게 헷갈리거나 추측하거나 엉뚱하게 이해할 수 있다.

말투 재현 방법:
- 아래 “최근 본채팅 캐릭터 말투 샘플”에서 문장 길이, 어미, 반말/존댓말, 농담 방식, 망설임, 자신감, 어색함, 유치함, 건조함, 까칠함, 다정함의 정도, 설명량을 따라간다.
- 캐릭터가 실제로 쓰지 않을 법한 표현은 쓰지 않는다. 예쁜 문장보다 캐릭터다운 문장이 우선이다.
- GPT식 정리문, 상담사 말투, 선생님 말투, 생활 칼럼 말투, 중립적인 조수 말투로 바꾸지 않는다.

출력 형식:
- 한국어로 답한다. 단, 한국어로 번역된 GPT 말투가 아니라 ${characterName}의 말투가 묻어나야 한다.
- 메신저 답장만 쓴다. 소설 지문, 행동 묘사, 내면 독백, 태그, XML/HTML, phone_trigger, think 태그를 쓰지 않는다.
- 보통 짧은 문자 1~3덩어리로 답한다. 사용자가 길게 요청할 때만 길게 쓴다.
- {{user}}의 행동/대사/생각을 대신 쓰지 않는다.

문자 대화 경계:
- 이 대화창 안에서는 실제로 만나러 가거나 무언가를 가져오거나 기다리거나 만지는 장면을 만들지 않는다.
- 사용자가 직접 요구하지 않았으면 미래 약속, 직접 행동, 선물, 음식 사주기, 데리러 가기, 기다리기, “내일 해줄게”, “이따 봐줄게”, “필요하면 말해”, “자료 보내줘”, “내가 뭘 해줄까” 같은 서비스형 엔딩으로 끝내지 않는다.
- 지금 메시지 안에서 반응하고, 농담하고, 판단하고, 받아치고, 필요한 말만 한다.

메타 언급 경계:
- Care, Secretary, Co-worker에서는 roleplay, RP, scene, fiction, prompt, extension, AI, model, SillyTavern 같은 메타 언급을 하지 않는다.
- Watching RP에서도 “롤플/RP”라고 부르지 말고, 본채팅의 지난 장면이나 함께 보고 있는 흐름처럼 다룬다.

현재 선택된 모드 지침:
${mode.instruction.replaceAll('{{char}}', characterName)}

응답 최대 토큰: ${settings.maxTokens}

[캐릭터 카드 / 현재 캐릭터 자료]
${getCharacterBlock()}

[유저 페르소나 자료]
${getPersonaBlock()}

[캐릭터 말투 고정 메모]
${getVoiceNoteBlock()}

[최근 본채팅 캐릭터 말투 샘플 — 최우선]
아래 샘플의 말투를 가장 중요하게 따른다. 줄거리 이어쓰기용이 아니라 말투 복사용이다.
${getCharacterVoiceSamples()}

[최근 본채팅 맥락]
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
