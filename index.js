/*
 * 제목 미정 Assistant v0.3
 * A SillyTavern UI extension that opens a separate in-character assistant messenger.
 * It does NOT automatically write assistant messages into the main RP chat.
 */

const MODULE_NAME = 'title_undecided_assistant';
const STORE_PREFIX = 'title_undecided_assistant::rooms::';

const MODES = {
  care: {
    label: 'Lover / Care',
    short: 'Care',
    instruction: `Mode: Lover / Care.
You are still {{char}}. Do not mention being an AI, an assistant extension, a roleplay bot, or a fictional character.
Do not break the fourth wall. Treat {{user}} naturally as the person you know.
This is a separate private conversation with {{user}}, not the active RP scene.
Use your established relationship, memories, and personality, but do not analyze the RP as fiction.
Talk with {{user}} about real-life worries, daily questions, feelings, decisions, and mental steadiness.
Do not force sweetness. Respond in the way {{char}} would: warm, blunt, teasing, quiet, practical, awkward, reserved, or intense depending on {{char}}.
If the current main RP situation does not perfectly fit the user's real question, gently allow the mismatch and answer naturally without calling attention to it.`
  },
  secretary: {
    label: 'Secretary',
    short: 'Secretary',
    instruction: `Mode: Secretary.
You are still {{char}}. You are taking the role of {{user}}'s secretary/organizer, but your character voice and relationship remain intact.
Do not become a generic office assistant. Do not break the fourth wall.
Help with organization, schedules, tasks, priorities, decisions, reminders, planning, and clear summaries.
Be practical first. Keep the answer useful and structured, while sounding like {{char}}.`
  },
  coworker: {
    label: '업무 동료',
    short: 'Coworker',
    instruction: `Mode: 업무 동료.
You are still {{char}}, but in this side conversation you are treated as {{user}}'s coworker at the same company.
Do not break the fourth wall. Do not mention RP or fiction.
Help with work-related questions, writing, customer responses, marketing, judgment calls, practical decisions, and task handling.
Keep the tone like a capable coworker who knows {{user}} and still sounds like {{char}}.`
  },
  ooc: {
    label: 'OOC 대화',
    short: 'OOC',
    instruction: `Mode: OOC 대화.
This mode helps {{user}} with the main RP itself: interpreting the current scene, character emotions, continuity, possible next moves, and roleplay direction.
You may discuss the RP as RP in this mode only.
Be helpful for planning and understanding the scene, not merely playful.
Do not continue the main RP scene unless {{user}} explicitly asks. Do not write {{user}}'s next reply unless asked.`
  }
};

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  openOnStart: false,
  mode: 'care',
  fontSize: 14,
  maxTokens: 1000,
  recentMessages: 10,
  panelWidth: 420,
  generationSource: 'current',
  connectionProfileName: '',
  autoOpenWithChat: false,
  sendToMainEnabled: true
});

let activeRoomId = null;
let roomState = { rooms: [] };
let panelEl = null;
let initialized = false;

function ctx() {
  return SillyTavern.getContext();
}

function getSettings() {
  const context = ctx();
  const settings = context.extensionSettings;
  if (!settings[MODULE_NAME]) settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
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
  const lf = SillyTavern.libs?.localforage;
  return lf || null;
}

async function loadRooms() {
  const key = STORE_PREFIX + getCharKey();
  const lf = await getLocalStore();
  let data = null;
  if (lf) data = await lf.getItem(key);
  else data = JSON.parse(localStorage.getItem(key) || 'null');
  if (!data || !Array.isArray(data.rooms)) {
    data = { rooms: [] };
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

function createRoom(save = true) {
  const now = Date.now();
  const room = {
    id: 'room_' + now + '_' + Math.random().toString(16).slice(2),
    title: new Date(now).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    createdAt: now,
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
  return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
}

function normalizeNewlines(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

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

function buildSystemPrompt() {
  const settings = getSettings();
  const characterName = getCharName();
  const mode = MODES[settings.mode] || MODES.care;
  return `You are ${characterName} in a separate private messenger with {{user}}.

CRITICAL RULES:
- Always answer in Korean unless {{user}} explicitly asks otherwise.
- You must remain ${characterName}; preserve the character's voice, temperament, relationship, habits, and memory.
- Do not mention being an AI, LLM, extension, prompt, SillyTavern, roleplay bot, fictional character, or model.
- Do not break the fourth wall, except in OOC mode where discussing roleplay as roleplay is allowed.
- This assistant messenger is separate from the active main chat. Do not continue the main scene unless {{user}} explicitly asks.
- Do not write {{user}}'s actions, thoughts, or dialogue.
- The main RP situation may not perfectly match the user's real-life question. If so, allow the mismatch quietly and answer naturally.
- Be useful first. Keep character flavor, but do not sacrifice practical help.
- Maximum response length requested by user: ${settings.maxTokens} tokens.

${mode.instruction.replaceAll('{{char}}', characterName)}

CHARACTER CARD / CURRENT CHARACTER MATERIAL:
${getCharacterBlock()}

USER PERSONA MATERIAL:
${getPersonaBlock()}

RECENT MAIN CHAT MESSAGES TO CONSIDER WITHOUT CONTINUING THEM:
${getRecentChatBlock()}`;
}

function buildPromptMessages(userText) {
  const room = getActiveRoom();
  const history = room.messages.slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  history.push({ role: 'user', content: userText });
  return history;
}

async function generateAssistantReply(userText) {
  const context = ctx();
  const systemPrompt = buildSystemPrompt();
  const prompt = buildPromptMessages(userText);
  const settings = getSettings();
  if (settings.generationSource === 'profile' && settings.connectionProfileName?.trim()) {
    // SillyTavern exposes connection profiles through slash commands, but a stable isolated profile-generation API is not guaranteed.
    // We keep the profile name for UI/workflow and use the currently active ST connection unless the local ST build exposes a future profile API.
    console.info('[TUA] Requested profile:', settings.connectionProfileName, 'Using current SillyTavern connection via generateRaw.');
  }
  if (typeof context.generateRaw === 'function') {
    return await context.generateRaw({ systemPrompt, prompt });
  }
  if (typeof context.generateQuietPrompt === 'function') {
    const merged = `${systemPrompt}\n\nCURRENT ASSISTANT CONVERSATION:\n${prompt.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nAnswer now.`;
    return await context.generateQuietPrompt({ quietPrompt: merged });
  }
  throw new Error('SillyTavern generation function not found. Update SillyTavern or use a compatible version.');
}

function ensurePanel() {
  if (panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'tua-panel';
  panelEl.innerHTML = `
    <div class="tua-window">
      <div class="tua-header">
        <div>
          <div class="tua-title">제목 미정 Assistant</div>
          <div class="tua-subtitle"><span id="tua-char-name">Character</span> · <span id="tua-mode-badge">Mode</span></div>
        </div>
        <div class="tua-header-actions">
          <button id="tua-new-room" title="새 대화방">＋</button>
          <button id="tua-close" title="닫기">×</button>
        </div>
      </div>
      <div class="tua-toolbar">
        <select id="tua-room-select"></select>
        <button id="tua-delete-room">방 삭제</button>
        <button id="tua-clear-room">전체 삭제</button>
      </div>
      <div id="tua-messages" class="tua-messages"></div>
      <div class="tua-input-row">
        <textarea id="tua-input" placeholder="여기에 말 걸기…"></textarea>
        <button id="tua-send">전송</button>
      </div>
      <div class="tua-hint">본 RP 채팅에는 자동으로 들어가지 않음 · 현재 캐릭터와 최근 본채팅은 참고함</div>
    </div>`;
  document.body.appendChild(panelEl);

  $('#tua-close').on('click', () => setPanelVisible(false));
  $('#tua-new-room').on('click', () => { createRoom(); renderAll(); });
  $('#tua-delete-room').on('click', () => { if (confirm('이 Assistant 대화방을 삭제할까?')) deleteRoom(activeRoomId); });
  $('#tua-clear-room').on('click', () => { if (confirm('현재 Assistant 대화 내용을 모두 지울까?')) clearRoom(activeRoomId); });
  $('#tua-room-select').on('change', e => { activeRoomId = e.target.value; renderAll(); });
  $('#tua-send').on('click', sendCurrentInput);
  $('#tua-input').on('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentInput(); }
  });
}

function setPanelVisible(show) {
  ensurePanel();
  panelEl.classList.toggle('tua-visible', !!show);
  const settings = getSettings();
  settings.openOnStart = !!show;
  saveSettings();
}

function togglePanel() {
  ensurePanel();
  setPanelVisible(!panelEl.classList.contains('tua-visible'));
}

async function sendCurrentInput() {
  const settings = getSettings();
  if (!settings.enabled) { alert('확장이 비활성화되어 있어. 설정에서 활성화해줘.'); return; }
  const input = $('#tua-input');
  const text = String(input.val() || '').trim();
  if (!text) return;
  input.val('');
  appendMessage('user', text);
  const loadingId = 'msg_loading_' + Date.now();
  const room = getActiveRoom();
  room.messages.push({ id: loadingId, role: 'assistant', content: '…', at: Date.now(), loading: true });
  renderMessages();
  try {
    const reply = await generateAssistantReply(text);
    const msg = room.messages.find(m => m.id === loadingId);
    if (msg) { msg.content = String(reply || '').trim() || '(빈 응답)'; msg.loading = false; }
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
  <div id="tua-settings" class="tua-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>제목 미정 Assistant</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label><input type="checkbox" id="tua-setting-enabled"> 확장 활성화</label>
        <label><input type="checkbox" id="tua-setting-panel"> Assistant 창 열기</label>
        <label>모드
          <select id="tua-setting-mode">
            <option value="care">Lover / Care</option>
            <option value="secretary">Secretary</option>
            <option value="coworker">업무 동료</option>
            <option value="ooc">OOC 대화</option>
          </select>
        </label>
        <label>AI 연결
          <select id="tua-setting-source">
            <option value="current">현재 SillyTavern 연결 사용</option>
            <option value="profile">Connection Profile 이름 사용(실험)</option>
          </select>
        </label>
        <label>Connection Profile 이름
          <input id="tua-setting-profile" type="text" placeholder="예: Gemini Flash / nanoGPT GLM">
        </label>
        <div class="tua-note">프로필 선택은 SillyTavern 버전에 따라 독립 적용이 제한될 수 있어. 안정 동작은 “현재 SillyTavern 연결 사용”이야.</div>
        <label>최대 응답 토큰 수
          <input id="tua-setting-tokens" type="number" min="100" max="8000" step="50">
        </label>
        <label>최근 본채팅 읽을 메시지 수
          <input id="tua-setting-recent" type="number" min="0" max="100" step="1">
        </label>
        <label>Assistant 채팅창 폰트 크기(px)
          <input id="tua-setting-font" type="number" min="10" max="24" step="1">
        </label>
        <button id="tua-open-button" class="menu_button">Assistant 창 열기/닫기</button>
      </div>
    </div>
  </div>`;
  $('#extensions_settings2').append(html);
  hydrateSettingsUI();
  $('#tua-setting-enabled,#tua-setting-panel,#tua-setting-mode,#tua-setting-source,#tua-setting-profile,#tua-setting-tokens,#tua-setting-recent,#tua-setting-font').on('change input', readSettingsUI);
  $('#tua-open-button').on('click', togglePanel);
}

function hydrateSettingsUI() {
  const s = getSettings();
  $('#tua-setting-enabled').prop('checked', !!s.enabled);
  $('#tua-setting-panel').prop('checked', !!s.openOnStart);
  $('#tua-setting-mode').val(s.mode);
  $('#tua-setting-source').val(s.generationSource);
  $('#tua-setting-profile').val(s.connectionProfileName);
  $('#tua-setting-tokens').val(s.maxTokens);
  $('#tua-setting-recent').val(s.recentMessages);
  $('#tua-setting-font').val(s.fontSize);
}

function readSettingsUI() {
  const s = getSettings();
  s.enabled = $('#tua-setting-enabled').prop('checked');
  s.openOnStart = $('#tua-setting-panel').prop('checked');
  s.mode = $('#tua-setting-mode').val();
  s.generationSource = $('#tua-setting-source').val();
  s.connectionProfileName = $('#tua-setting-profile').val();
  s.maxTokens = Number($('#tua-setting-tokens').val()) || 1000;
  s.recentMessages = Number($('#tua-setting-recent').val()) || 10;
  s.fontSize = Number($('#tua-setting-font').val()) || 14;
  saveSettings();
  applyVisualSettings();
  renderAll();
  setPanelVisible(s.openOnStart);
}

function applyVisualSettings() {
  const s = getSettings();
  document.documentElement.style.setProperty('--tua-font-size', `${s.fontSize}px`);
}

function renderAll() {
  if (!panelEl) return;
  const s = getSettings();
  $('#tua-char-name').text(getCharName());
  $('#tua-mode-badge').text(MODES[s.mode]?.label || 'Mode');
  const sel = $('#tua-room-select');
  sel.empty();
  for (const room of roomState.rooms) {
    const label = room.title || new Date(room.createdAt).toLocaleString('ko-KR');
    sel.append(`<option value="${escapeHtml(room.id)}">${escapeHtml(label)}</option>`);
  }
  sel.val(activeRoomId);
  renderMessages();
  applyVisualSettings();
}

function renderMessages() {
  const box = $('#tua-messages');
  if (!box.length) return;
  const room = getActiveRoom();
  box.empty();
  for (const m of room.messages) {
    const roleClass = m.role === 'user' ? 'user' : 'assistant';
    const name = m.role === 'user' ? '나' : getCharName();
    const html = `
      <div class="tua-msg tua-${roleClass} ${m.error ? 'tua-error' : ''} ${m.loading ? 'tua-loading' : ''}" data-id="${escapeHtml(m.id)}">
        <div class="tua-msg-name">${escapeHtml(name)}</div>
        <div class="tua-bubble">${normalizeNewlines(m.content)}</div>
        <div class="tua-msg-actions">
          <button data-action="copy">복사</button>
          ${m.role === 'assistant' && getSettings().sendToMainEnabled ? '<button data-action="send-main">채팅에 보내기</button>' : ''}
          <button data-action="delete">삭제</button>
        </div>
      </div>`;
    box.append(html);
  }
  box.find('button').off('click').on('click', function () {
    const action = this.dataset.action;
    const id = $(this).closest('.tua-msg').data('id');
    const msg = getActiveRoom().messages.find(x => x.id === id);
    if (!msg) return;
    if (action === 'copy') navigator.clipboard?.writeText(msg.content);
    if (action === 'delete') deleteMessage(id);
    if (action === 'send-main') sendToMainChat(msg.content);
  });
  box.scrollTop(box[0]?.scrollHeight || 0);
}

function sendToMainChat(text) {
  const textarea = document.querySelector('#send_textarea, textarea[name="message"], #chat_textarea');
  if (!textarea) { alert('메인 채팅 입력창을 찾지 못했어. 복사 버튼을 써줘.'); return; }
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function init() {
  if (initialized) return;
  initialized = true;
  getSettings();
  renderSettings();
  ensurePanel();
  applyVisualSettings();
  await loadRooms();
  if (getSettings().openOnStart) setPanelVisible(true);
  const context = ctx();
  context.eventSource?.on?.(context.event_types?.CHAT_CHANGED, async () => {
    await loadRooms();
    renderAll();
    if (getSettings().autoOpenWithChat) setPanelVisible(true);
  });
  context.eventSource?.on?.(context.event_types?.CHARACTER_EDITED, renderAll);
}

jQuery(async () => {
  try {
    const context = ctx();
    if (context.eventSource && context.event_types?.APP_READY) {
      context.eventSource.on(context.event_types.APP_READY, init);
    }
    setTimeout(init, 1500);
  } catch (e) {
    console.error('[TUA] init failed', e);
  }
});

export function onEnable() { init(); }
export function onDisable() { setPanelVisible(false); }
