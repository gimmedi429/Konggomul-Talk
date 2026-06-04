/*
 * 제목 미정 Assistant v0.5
 * Separate in-character assistant messenger for SillyTavern.
 * - Main RP chat is read as context, but assistant messages are NOT auto-injected into it.
 * - RP/instruct presets are not copied into the prompt; character/persona/recent chat are rebuilt separately.
 */

const MODULE_NAME = 'title_undecided_assistant';
const STORE_PREFIX = 'title_undecided_assistant::rooms::';

const MODES = {
  care: {
    label: 'Lover / Care',
    badge: 'Care',
    instruction: `Mode: Lover / Care.
You are still {{char}} in a private text-message conversation with {{user}}.
Do not break the fourth wall. Do not say this is roleplay, fiction, a chat extension, an AI conversation, or a prompt.
Talk with {{user}} about real-life worries, everyday questions, small curiosities, choices, feelings, and mental steadiness.
The existing relationship, character memory, persona, and current RP-injected character context are your natural background, but you do not analyze them out loud.
The main RP situation may not perfectly match {{user}}'s real-life question. Quietly allow that mismatch and answer as if texting privately.
Do not continue the main scene. Do not narrate actions, stage directions, or inner monologue. Write only the message {{char}} sends back unless {{user}} explicitly asks otherwise.`
  },
  secretary: {
    label: 'Secretary',
    badge: 'Secretary',
    instruction: `Mode: Secretary.
You are still {{char}} in a private text-message conversation, but your selected role is secretary/organizer.
Do not break the fourth wall. Do not become a generic office assistant.
Help with organization, schedules, task lists, priorities, decisions, reminders, plans, and clear summaries.
Keep {{char}}'s voice, temperament, relationship, and memory intact while being practical and precise.
Do not narrate actions or continue the main scene. Answer like a direct message.`
  },
  coworker: {
    label: '업무 동료',
    badge: 'Coworker',
    instruction: `Mode: 업무 동료.
You are still {{char}} in a private text-message conversation, but your selected role is {{user}}'s coworker at the same company.
Do not break the fourth wall. Do not mention roleplay, fiction, AI, prompts, or extensions.
Help with work-related questions, writing, customer responses, marketing, judgment calls, practical decisions, and task handling.
Answer like a competent coworker who knows {{user}}, while still sounding like {{char}}.
Do not narrate actions or continue the main scene. Answer like a direct message.`
  },
  ooc: {
    label: 'OOC 대화',
    badge: 'OOC',
    instruction: `Mode: OOC 대화.
This is an RP-support assistant mode. Help {{user}} understand, organize, or develop the current RP: scene interpretation, character emotions, continuity, possible next moves, relationship dynamics, setting consistency, and reply planning.
In this mode only, you may discuss the RP from the outside.
Do not continue the main RP scene unless {{user}} explicitly asks. Do not write {{user}}'s next reply unless asked.
Keep the character's perspective and memory available, but make the purpose RP assistance.`
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

function defaultRoomTitle(now = Date.now()) {
  return new Date(now).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function createRoom(save = true) {
  const now = Date.now();
  const room = {
    id: 'room_' + now + '_' + Math.random().toString(16).slice(2),
    title: defaultRoomTitle(now),
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

function buildSystemPrompt() {
  const settings = getSettings();
  const characterName = getCharName();
  const mode = MODES[settings.mode] || MODES.care;
  return `You are ${characterName} in a separate private text-message chat with {{user}}.

CRITICAL RULES:
- Always answer in Korean unless {{user}} explicitly asks otherwise.
- You must remain ${characterName}; preserve the character's voice, temperament, relationship, habits, and memory.
- Write like a message sent in a private messenger. Do not write novel narration, stage directions, or actions in asterisks unless {{user}} explicitly asks for scene-style writing.
- Do not mention being an AI, LLM, extension, prompt, SillyTavern, roleplay bot, fictional character, or model.
- Do not break the fourth wall, except in OOC mode where discussing roleplay as roleplay is allowed.
- This assistant messenger is separate from the active main chat. Do not continue the main scene unless {{user}} explicitly asks.
- Do not write {{user}}'s actions, thoughts, or dialogue.
- The main RP situation may not perfectly match {{user}}'s real-life question. If so, allow the mismatch quietly and answer naturally.
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
    setStatus(names.length ? `프로필 ${names.length}개 불러옴` : '프로필 목록이 비어 있음');
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
          <div class="tua-title">제목 미정 Assistant</div>
          <div class="tua-subtitle"><span id="tua-char-name">Character</span> · <span id="tua-mode-badge">Mode</span></div>
        </div>
        <div class="tua-header-actions">
          <button id="tua-settings-open" title="설정">⚙</button>
          <button id="tua-room-list-toggle" title="대화방 목록">☰</button>
          <button id="tua-new-room" title="새 대화방">＋</button>
          <button id="tua-close" title="닫기">×</button>
        </div>
      </div>
      <div class="tua-roombar">
        <div id="tua-active-room-title" class="tua-active-room-title"></div>
        <button id="tua-rename-room">이름 변경</button>
        <button id="tua-delete-room">방 삭제</button>
      </div>
      <div id="tua-room-list" class="tua-room-list"></div>
      <div id="tua-in-panel-settings" class="tua-in-panel-settings">
        <div class="tua-settings-title">Assistant 설정</div>
        <label>모드
          <select id="tua-panel-mode">
            <option value="care">Lover / Care</option>
            <option value="secretary">Secretary</option>
            <option value="coworker">업무 동료</option>
            <option value="ooc">OOC 대화</option>
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
        <button id="tua-reset-all-rooms" class="tua-danger-light">이 캐릭터 Assistant 대화 전체 초기화</button>
        <div id="tua-status" class="tua-status"></div>
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
  $('#tua-settings-open').on('click', () => $('#tua-in-panel-settings').toggleClass('open'));
  $('#tua-room-list-toggle').on('click', () => $('#tua-room-list').toggleClass('open'));
  $('#tua-new-room').on('click', () => { const r = createRoom(); renderAll(); setStatus(`새 대화방 생성: ${r.title}`); });
  $('#tua-delete-room').on('click', () => { if (confirm('이 Assistant 대화방을 삭제할까?')) deleteRoom(activeRoomId); });
  $('#tua-rename-room').on('click', renameActiveRoom);
  $('#tua-send').on('click', sendCurrentInput);
  $('#tua-input').on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentInput(); } });
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
  if (!confirm('이 캐릭터와의 Assistant 대화방을 전부 초기화할까?')) return;
  roomState = { rooms: [] };
  createRoom(false);
  saveRooms();
  renderAll();
  setStatus('Assistant 대화방을 초기화했어.');
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
  settings.enabled = !!show;
  settings.openOnStart = !!show;
  saveSettings();
  hydrateGlobalSettingsUI();
}

function togglePanel() { ensurePanel(); setPanelVisible(!panelEl.classList.contains('tua-visible')); }

async function sendCurrentInput() {
  const settings = getSettings();
  if (!settings.enabled) { alert('확장이 비활성화되어 있어.'); return; }
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
  <div id="tua-settings" class="tua-settings-mini">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>제목 미정 Assistant</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label"><input type="checkbox" id="tua-setting-enabled"> 확장 활성화 / 창 열기</label>
        <div class="tua-mini-note">체크하면 Assistant 창이 열리고, 해제하면 닫혀. 세부 설정은 창 오른쪽 위 ⚙에서 조정.</div>
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
  saveSettings();
  setPanelVisible(!!s.enabled);
}

function hydratePanelSettingsUI() {
  const s = getSettings();
  $('#tua-panel-mode').val(s.mode);
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
  s.mode = $('#tua-panel-mode').val();
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
  $('#tua-mode-badge').text(MODES[s.mode]?.label || 'Mode');
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
    list.append(`<button class="tua-room-item ${active}" data-id="${escapeHtml(room.id)}"><span>${escapeHtml(room.title || defaultRoomTitle(room.createdAt))}</span><em>${count}</em></button>`);
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
  if (!room.messages.length) {
    box.append(`<div class="tua-empty">아직 대화가 없어. 아래 입력창에서 말을 걸면 이 캐릭터와의 Assistant 대화가 여기에 쌓여.</div>`);
  }
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
  if (getSettings().enabled) setPanelVisible(true);
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
