const api = window.rescicle;
const root = document.getElementById('app');

const TYPE_META = {
  question: ['Questions', '問い'],
  hypothesis: ['Hypotheses', '仮説'],
  prediction: ['Predictions', '予測'],
  measurement: ['Measurements', '測定'],
  asset: ['Data', 'データ'],
  note: ['Notes', 'メモ']
};
const PREDICATE_LABEL = {
  addresses: 'addresses', predicts: 'predicts', tested_by: 'tested by', produces: 'produces', references: 'references', related_to: 'related to'
};

let state = {
  bootstrap: null,
  workspace: null,
  currentType: 'overview',
  selectedObjectId: null,
  selectedObject: null,
  files: [],
  loading: false,
  modal: null,
  error: null
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024/1024).toFixed(1)} MB`;

async function boot() {
  state.bootstrap = await api.bootstrap();
  state.workspace = state.bootstrap.workspace;
  render();
}

function render() {
  root.innerHTML = state.workspace ? workspaceHtml() : onboardingHtml();
  bind();
  if (state.selectedObjectId && !state.selectedObject) loadSelected(state.selectedObjectId);
}

function onboardingHtml() {
  const folder = state.onboardingFolder || '';
  return `<div class="onboarding"><div class="onboarding-card">
    <div class="brand">rescicle</div>
    <h1>研究フォルダから始める</h1>
    <div class="muted">研究について話すと、Question・Hypothesis・Prediction・Measurementが少しずつ「もの」として見えるようになります。ファイルは移動せず、今ある研究フォルダをそのまま参照します。</div>
    <div class="field" style="margin-top:22px"><input id="projectName" class="input" placeholder="研究名（あとで変更できます）" value="${esc(state.onboardingName || '')}"></div>
    <div class="folder-row"><div class="folder-path">${folder ? esc(folder) : '研究データがあるフォルダを選択'}</div><button class="btn" id="chooseFolder">選択</button></div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    <div class="actions" style="justify-content:flex-end;margin-top:22px"><button class="btn primary" id="createProject" ${folder ? '' : 'disabled'}>このフォルダで始める</button></div>
  </div></div>`;
}

function workspaceHtml() {
  const w = state.workspace;
  return `<div class="shell ${state.loading ? 'loading':''}">
    <header class="topbar"><div class="brand">rescicle</div><div class="project-title">${esc(w.project.name)}</div><div class="root-hint">${esc(w.project.root_path)}</div><button class="btn small" id="settingsBtn">AI接続</button></header>
    <div class="layout">
      <aside class="sidebar">${sidebarHtml()}</aside>
      <main class="content"><div class="content-inner">${contentHtml()}</div></main>
      <aside class="chat">${chatHtml()}</aside>
    </div>
    ${state.modal === 'settings' ? settingsModalHtml() : ''}
  </div>`;
}

function sidebarHtml() {
  const counts = state.workspace.counts || {};
  const nav = [['overview','Overview',''], ...Object.entries(TYPE_META).map(([k,v]) => [k,v[0],counts[k] || 0]), ['files','Files','']];
  return `<div class="nav-title">Research objects</div>${nav.map(([id,label,count]) => `<button class="nav-btn ${state.currentType===id?'active':''}" data-nav="${id}"><span>${esc(label)}</span><span class="count">${count}</span></button>`).join('')}`;
}

function contentHtml() {
  if (state.selectedObject) return objectDetailHtml(state.selectedObject);
  if (state.currentType === 'overview') return overviewHtml();
  if (state.currentType === 'files') return filesHtml();
  return objectListHtml(state.currentType);
}

function overviewHtml() {
  const objects = state.workspace.objects || [];
  const groups = [
    ['question','Current Questions'], ['hypothesis','Hypotheses'], ['measurement','Recent Measurements'], ['note','Notes']
  ];
  return `<div class="page-title"><h1>${esc(state.workspace.project.name)}</h1></div>
    <div class="muted">研究Objectを見ながら、右側でAgentと話します。最初は研究について普段の言葉で話すだけで十分です。</div>
    ${groups.map(([type,label]) => {
      const xs = objects.filter(o => o.type===type && o.status!=='rejected').slice(0,4);
      return `<section class="section"><div class="section-head"><h2>${label}</h2><span class="muted">${xs.length ? '' : 'まだありません'}</span></div>${xs.length ? `<div class="object-grid">${xs.map(cardHtml).join('')}</div>` : '<div class="empty">Agentとの会話から少しずつ増えていきます。</div>'}</section>`;
    }).join('')}`;
}

function objectListHtml(type) {
  const label = TYPE_META[type]?.[0] || type;
  const objects = (state.workspace.objects || []).filter(o => o.type===type);
  return `<div class="page-title"><h1>${esc(label)}</h1></div>${objects.length ? `<div class="object-grid">${objects.map(cardHtml).join('')}</div>` : `<div class="empty">まだ${esc(label)}はありません。右側で研究について話してみてください。</div>`}`;
}

function cardHtml(o) {
  return `<div class="card clickable" data-object-id="${o.id}"><div class="card-row"><div class="card-main"><div class="type">${esc(o.type)}</div><div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}<div class="pills"><span class="pill ${o.status}">${esc(o.status)}</span><span class="pill ${o.origin==='agent'?'agent':''}">${o.origin==='agent'?'AI proposal':esc(o.origin)}</span></div></div></div></div>`;
}

function objectDetailHtml(o) {
  const links = [
    ...(o.incoming || []).map(r => ({ dir:'←', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.subject_id, title:r.subject_title, type:r.subject_type, status:r.status })),
    ...(o.outgoing || []).map(r => ({ dir:'→', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.object_id, title:r.object_title, type:r.object_type, status:r.status }))
  ];
  return `<button class="btn small" id="backBtn">← 戻る</button>
    <div class="detail-head"><div class="type">${esc(o.type)}</div><h1>${esc(o.title)}</h1><div class="pills"><span class="pill ${o.status}">${esc(o.status)}</span><span class="pill ${o.origin==='agent'?'agent':''}">${o.origin==='agent'?'AI proposal':esc(o.origin)}</span></div></div>
    ${o.body ? `<div class="detail-body">${esc(o.body)}</div>`:''}
    ${o.status==='proposed' ? `<div class="actions" style="margin-top:18px"><button class="btn primary small" data-status="confirmed">Confirm</button><button class="btn danger small" data-status="rejected">Reject</button></div>` : ''}
    <section class="section"><div class="section-head"><h2>Related objects</h2></div>${links.length ? `<div class="card">${links.map(x => `<div class="relation-row clickable" data-object-id="${x.id}"><div class="relation-label">${x.dir} ${esc(x.label)}</div><div><div class="type">${esc(x.type)}</div><div class="relation-object">${esc(x.title)}</div></div>${x.status==='proposed'?'<span class="pill proposed" style="margin-left:auto">proposed link</span>':''}</div>`).join('')}</div>` : '<div class="empty">まだ関連Objectはありません。</div>'}</section>
    ${o.type==='asset' && o.asset ? `<section class="section"><div class="section-head"><h2>Local file</h2></div><div class="card"><div class="card-body">${esc(o.asset.relative_path)}\n${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div></div></section>` : ''}`;
}

function filesHtml() {
  return `<div class="page-title"><h1>Files</h1><button class="btn small" id="scanFiles">再スキャン</button></div><div class="muted" style="margin-bottom:16px">研究フォルダ内のファイル名と基本メタデータだけを表示します。ファイル内容は自動で外部AIへ送りません。</div>${state.files.length ? `<div class="files">${state.files.map(f => `<div class="file"><div class="file-name" title="${esc(f.relative_path)}">${esc(f.relative_path)}</div><div class="file-meta">${fmtSize(f.size_bytes)}</div><button class="btn small" data-register-path="${esc(f.relative_path)}">Dataとして登録</button></div>`).join('')}</div>` : '<div class="empty">「再スキャン」で研究フォルダを確認します。</div>'}`;
}

function chatHtml() {
  const selected = state.selectedObject ? state.selectedObject.title : null;
  const messages = state.workspace.messages || [];
  const backendLabel = state.bootstrap?.agent?.backend === 'codex' ? 'ChatGPT / Codex' : 'Claude Code';
  return `<div class="chat-head">Conversation<span class="pill backend-pill" id="backendPill" title="AI接続で切り替えます">${esc(backendLabel)}</span><div class="chat-context">${selected ? `Context: ${esc(selected)}` : 'Project context'}</div></div>
    <div class="messages" id="messages">${messages.length ? messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('') : '<div class="muted" style="font-size:12px">「何を調べている研究か」から普通に話してください。</div>'}</div>
    <div class="chat-compose"><textarea id="chatInput" class="input" placeholder="研究について話す…"></textarea>${state.error ? `<div class="error">${esc(state.error)}</div>`:''}<div class="compose-actions"><div class="privacy">Raw file本文はAIへ自動送信しません</div><button class="btn primary" id="sendBtn">送信</button></div></div>`;
}

function backendPickerHtml(backend, active) {
  return active
    ? '<span class="pill active-backend">このチャットで使用中</span>'
    : `<button class="btn small" data-backend="${backend}">このチャットで使う</button>`;
}

function claudeSectionHtml(agent) {
  const claude = agent.claude || {};
  const active = (agent.backend || 'claude') === 'claude';
  const body = claude.available
    ? `<div class="connection-ok"><strong>利用可能</strong><div class="muted">${esc(claude.version || 'claude')}</div></div>`
    : `<div class="error">Claude Codeが見つかりません: ${esc(claude.error || 'unknown error')}</div>
       <div class="muted" style="font-size:11px;margin-top:8px">claudeコマンドをインストールして、rescicleを再起動してください。</div>`;
  return `<div class="settings-section"><h3>Claude Code <span class="pill">メイン</span></h3>${body}
    <div class="actions" style="margin-top:10px">${backendPickerHtml('claude', active)}<button class="btn small" id="refreshAgent">状態を更新</button></div>
    <div class="muted" style="font-size:11px;margin-top:12px">画面のチャットは、すでにログイン済みのClaude Codeをローカルで実行して応答します。APIキーは不要です。研究フォルダをAIの作業ディレクトリにはせず、Conversation・Research Objectの要約・ファイル名/サイズ/更新日時だけを渡します。Raw file contentは送信しません。</div>
    <div class="muted" style="font-size:11px;margin-top:10px">Claude Code側をUIにして操作したい場合は、rescicleをMCP serverとして追加できます。</div>
    <button class="btn small" id="copyClaudeSetup" style="margin-top:10px">MCP設定コマンドをコピー</button>
  </div>`;
}

function codexSectionHtml(agent) {
  const codex = agent.codex || agent;
  const account = codex.account || null;
  const active = agent.backend === 'codex';
  const accountLabel = account?.type === 'chatgpt'
    ? `ChatGPT ${account.planType || ''}${account.email ? ` · ${account.email}` : ''}`
    : account ? account.type : null;
  // Secondary path, but sign-in and sign-out stay one click away rather than
  // hidden behind a disclosure.
  let status;
  let actions;
  if (!codex.available) {
    status = `<span class="status-bad">起動できません: ${esc(codex.error || 'unknown error')}</span>`;
    actions = '';
  } else if (account) {
    status = `接続済み · ${esc(accountLabel)}`;
    actions = `${backendPickerHtml('codex', active)}<button class="btn small" id="logoutAgent">ログアウト</button>`;
  } else {
    status = '未サインイン · APIキーは不要です';
    actions = '<button class="btn small" id="loginChatGPT">ChatGPTでサインイン</button>';
  }
  return `<div class="settings-section secondary">
    <div class="secondary-head"><h3>ChatGPT / Codex<span class="side-tag">サブ</span></h3><div class="actions">${actions}</div></div>
    <div class="muted secondary-status">${status}</div>
  </div>`;
}

function settingsModalHtml() {
  const agent = state.bootstrap?.agent || {};
  return `<div class="modal-wrap"><div class="modal"><h2>AI接続</h2>
    ${claudeSectionHtml(agent)}
    ${codexSectionHtml(agent)}
    ${state.error ? `<div class="error">${esc(state.error)}</div>`:''}
    <div class="modal-actions"><button class="btn" id="closeModal">閉じる</button></div></div></div>`;
}
function bind() {
  document.getElementById('chooseFolder')?.addEventListener('click', async () => {
    const folder = await api.chooseFolder();
    if (folder) {
      state.onboardingFolder = folder;
      state.onboardingName = folder.split(/[\\/]/).filter(Boolean).at(-1) || 'Research';
      render();
    }
  });
  document.getElementById('createProject')?.addEventListener('click', async () => {
    const name = document.getElementById('projectName').value.trim() || state.onboardingName || 'Research';
    state.workspace = await api.createProject({ name, rootPath: state.onboardingFolder });
    state.error = null; render();
  });
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', async () => {
    state.currentType = b.dataset.nav; state.selectedObjectId = null; state.selectedObject = null; state.error = null;
    if (state.currentType === 'files' && !state.files.length) state.files = await api.scanFiles(state.workspace.project.id);
    render();
  }));
  document.querySelectorAll('[data-object-id]').forEach(el => el.addEventListener('click', () => loadSelected(el.dataset.objectId)));
  document.getElementById('backBtn')?.addEventListener('click', () => { state.selectedObjectId=null; state.selectedObject=null; render(); });
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async () => {
    await api.setObjectStatus(state.selectedObject.id, b.dataset.status); await refreshWorkspace(); await loadSelected(state.selectedObject.id);
  }));
  document.getElementById('scanFiles')?.addEventListener('click', async () => { state.files = await api.scanFiles(state.workspace.project.id); render(); });
  document.querySelectorAll('[data-register-path]').forEach(b => b.addEventListener('click', async () => {
    await api.registerAsset(state.workspace.project.id, b.dataset.registerPath); await refreshWorkspace(); render();
  }));
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage(); });
  document.getElementById('settingsBtn')?.addEventListener('click', () => { state.modal='settings'; state.error=null; render(); });
  document.getElementById('closeModal')?.addEventListener('click', () => { state.modal=null; state.error=null; render(); });
  document.getElementById('loginChatGPT')?.addEventListener('click', loginChatGPT);
  document.getElementById('refreshAgent')?.addEventListener('click', refreshAgent);
  document.getElementById('logoutAgent')?.addEventListener('click', logoutAgent);
  document.getElementById('copyClaudeSetup')?.addEventListener('click', copyClaudeSetup);
  document.querySelectorAll('[data-backend]').forEach(b => b.addEventListener('click', () => setBackend(b.dataset.backend)));
  const messages = document.getElementById('messages'); if (messages) messages.scrollTop = messages.scrollHeight;
}

async function loadSelected(id) {
  state.selectedObjectId = id;
  state.selectedObject = await api.getObject(id);
  render();
}
async function refreshWorkspace() {
  state.workspace = await api.openProject(state.workspace.project.id);
}
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value.trim(); if (!text || state.loading) return;
  state.loading = true; state.error = null; render();
  try {
    const result = await api.sendMessage({ projectId: state.workspace.project.id, text, selectedObjectId: state.selectedObjectId });
    state.workspace = result.workspace;
    if (state.selectedObjectId) state.selectedObject = await api.getObject(state.selectedObjectId);
  } catch (e) { state.error = e.message || String(e); }
  state.loading = false; render();
}

async function setBackend(backend) {
  try { state.bootstrap.agent = await api.agentSetBackend(backend); state.error = null; render(); }
  catch (e) { state.error = e.message || String(e); render(); }
}
async function refreshAgent() {
  try { state.bootstrap.agent = await api.agentRefresh(); state.error = null; render(); }
  catch (e) { state.error = e.message || String(e); render(); }
}
async function loginChatGPT() {
  try { await api.agentLogin(); state.error = null; render(); }
  catch (e) { state.error = e.message || String(e); render(); }
}
async function logoutAgent() {
  try { state.bootstrap.agent = await api.agentLogout(); state.error = null; render(); }
  catch (e) { state.error = e.message || String(e); render(); }
}
async function copyClaudeSetup() {
  try { await api.copyClaudeSetup(); state.error = null; alert('Claude Code用の設定コマンドをコピーしました。ターミナルで実行してください。'); }
  catch (e) { state.error = e.message || String(e); render(); }
}

boot().catch(e => { root.innerHTML = `<div class="onboarding"><div class="onboarding-card"><div class="brand">rescicle</div><div class="error">${esc(e.message || e)}</div></div></div>`; });
