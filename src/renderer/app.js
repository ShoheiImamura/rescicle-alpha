const api = window.rescicle;
const root = document.getElementById('app');

// Every user-facing label is Japanese; the English keys stay as the domain
// vocabulary in the database and in domain.cjs.
const TYPE_LABEL = {
  question: '問い',
  hypothesis: '仮説',
  prediction: '予測',
  measurement: '測定',
  asset: 'データ',
  note: 'メモ'
};
const STATUS_LABEL = { proposed: '提案中', confirmed: '確定', rejected: '却下' };
const ORIGIN_LABEL = { researcher: '研究者', agent: 'AI提案', system: 'システム', instrument: '測定機器', imported: 'インポート' };
// allowedRelation() in domain.cjs fixes the chain question -> hypothesis ->
// prediction -> measurement -> asset, so the map is a layered DAG: one column per
// type, left to right, and no layout search is needed.
const CHAIN = ['question', 'hypothesis', 'prediction', 'measurement', 'asset'];
const MAP = { W: 168, H: 62, COL_GAP: 38, ROW_GAP: 14, HEAD: 26, PAD: 11, LINE: 15 };

const PREDICATE_LABEL = {
  addresses: '問いに答える', predicts: '予測する', tested_by: '検証される', produces: '生み出す', references: '参照する', related_to: '関連する'
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
    <div class="muted">研究について話すと、問い・仮説・予測・測定が少しずつ「もの」として見えるようになります。ファイルは移動せず、今ある研究フォルダをそのまま参照します。</div>
    <div class="field"><input id="projectName" class="input" placeholder="研究名（あとで変更できます）" value="${esc(state.onboardingName || '')}"></div>
    <div class="folder-row"><div class="folder-path">${folder ? esc(folder) : '研究データがあるフォルダを選択'}</div><button class="btn" id="chooseFolder">選択</button></div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    <div class="actions"><button class="btn primary" id="createProject" ${folder ? '' : 'disabled'}>このフォルダで始める</button></div>
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
  const nav = [['overview','マップ',''], ...Object.entries(TYPE_LABEL).map(([k,label]) => [k,label,counts[k] || 0]), ['files','ファイル','']];
  return `<div class="nav-title">研究オブジェクト</div>${nav.map(([id,label,count]) => `<button class="nav-btn ${state.currentType===id?'active':''}" data-nav="${id}"><span>${esc(label)}</span><span class="count">${count}</span></button>`).join('')}`;
}

function contentHtml() {
  if (state.selectedObject) return objectDetailHtml(state.selectedObject);
  if (state.currentType === 'overview') return overviewHtml();
  if (state.currentType === 'files') return filesHtml();
  return objectListHtml(state.currentType);
}

function overviewHtml() {
  const objects = state.workspace.objects || [];
  // Notes sit outside the chain that allowedRelation() permits, so they are never
  // drawn on the map. List them under it rather than letting them disappear.
  const offMap = objects.filter(o => o.status !== 'rejected' && !CHAIN.includes(o.type));
  return `<div class="page-title"><h1>${esc(state.workspace.project.name)}</h1></div>
    <div class="muted page-note">問い → 仮説 → 予測 → 測定 → データ のつながりです。右側のAIと話すと、ここが育っていきます。</div>
    ${mapHtml()}
    ${offMap.length ? `<section class="section"><div class="section-head"><h2>マップに載らないもの</h2></div><div class="object-grid">${offMap.map(cardHtml).join('')}</div></section>` : ''}`;
}

// Titles are drawn as SVG <text>, which does not wrap. Break on a character count
// rather than words: most titles here are Japanese and have no spaces to break on.
function wrapTitle(title, perLine = 13, maxLines = 2) {
  const out = [];
  let rest = String(title ?? '');
  while (rest && out.length < maxLines) {
    if (out.length === maxLines - 1 && rest.length > perLine) {
      out.push(rest.slice(0, perLine - 1) + '…');
      rest = '';
    } else {
      out.push(rest.slice(0, perLine));
      rest = rest.slice(perLine);
    }
  }
  return out;
}

function buildMap(objects, relations) {
  const alive = objects.filter(o => o.status !== 'rejected' && CHAIN.includes(o.type));
  const byId = new Map(alive.map(o => [o.id, o]));
  const edges = (relations || []).filter(r => byId.has(r.subject_id) && byId.has(r.object_id));
  const parents = new Map();
  for (const r of edges) {
    if (!parents.has(r.object_id)) parents.set(r.object_id, []);
    parents.get(r.object_id).push(r.subject_id);
  }
  const cols = CHAIN.map(type => alive.filter(o => o.type === type)).filter(col => col.length);
  const pos = new Map();
  // Left to right, so a node's parents already have a y when it is placed: aim for
  // the average of them, then push down far enough not to overlap the row above.
  cols.forEach((col, c) => {
    const x = c * (MAP.W + MAP.COL_GAP);
    const wanted = col.map(o => {
      const ys = (parents.get(o.id) || []).map(id => pos.get(id)).filter(Boolean).map(q => q.y);
      return { o, desired: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity };
    }).sort((a, b) => a.desired - b.desired);
    let next = MAP.HEAD;
    for (const { o, desired } of wanted) {
      const y = Math.max(next, Number.isFinite(desired) ? desired : next);
      pos.set(o.id, { x, y, o });
      next = y + MAP.H + MAP.ROW_GAP;
    }
  });
  const ys = [...pos.values()].map(q => q.y + MAP.H);
  return {
    pos, edges, cols,
    width: Math.max(cols.length * (MAP.W + MAP.COL_GAP) - MAP.COL_GAP, MAP.W),
    height: (ys.length ? Math.max(...ys) : MAP.HEAD) + 6,
    count: alive.length
  };
}

function mapHtml() {
  const g = buildMap(state.workspace.objects || [], state.workspace.relations || []);
  if (!g.count) return '<div class="empty">AIとの会話から少しずつ増えていきます。</div>';
  const edges = g.edges.map(r => {
    const a = g.pos.get(r.subject_id), b = g.pos.get(r.object_id);
    const x1 = a.x + MAP.W, y1 = a.y + MAP.H / 2, x2 = b.x, y2 = b.y + MAP.H / 2;
    const mid = (x1 + x2) / 2;
    return `<path class="map-edge ${r.status === 'proposed' ? 'proposed' : ''}" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"></path>`;
  }).join('');
  const heads = g.cols.map((col, c) => {
    const label = TYPE_LABEL[col[0].type] || col[0].type;
    return `<text class="map-col-head" x="${c * (MAP.W + MAP.COL_GAP)}" y="12">${esc(label)}</text>`;
  }).join('');
  const nodes = [...g.pos.values()].map(({ x, y, o }) => `<g class="map-node ${esc(o.status)}" data-object-id="${o.id}">
      <rect x="${x}" y="${y}" width="${MAP.W}" height="${MAP.H}" rx="10"></rect>
      <text class="map-type" x="${x + MAP.PAD}" y="${y + 17}">${esc(TYPE_LABEL[o.type] || o.type)}</text>
      ${wrapTitle(o.title).map((line, i) => `<text class="map-title" x="${x + MAP.PAD}" y="${y + 36 + i * MAP.LINE}">${esc(line)}</text>`).join('')}
    </g>`).join('');
  return `<div class="map-scroll"><svg class="map" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${edges}${heads}${nodes}</svg></div>
    <div class="map-legend"><span>実線 = 確定</span><span>破線 = 提案中（AI提案）</span><span>ノードをクリックすると詳細が開きます</span></div>`;
}

function objectListHtml(type) {
  const label = TYPE_LABEL[type] || type;
  const objects = (state.workspace.objects || []).filter(o => o.type===type);
  return `<div class="page-title"><h1>${esc(label)}</h1></div>${objects.length ? `<div class="object-grid">${objects.map(cardHtml).join('')}</div>` : `<div class="empty">まだ${esc(label)}はありません。右側で研究について話してみてください。</div>`}`;
}

function statusButtonsHtml(id) {
  return `<button class="btn primary small" data-status="confirmed" data-target-id="${id}">確定</button><button class="btn danger small" data-status="rejected" data-target-id="${id}">却下</button>`;
}

function cardHtml(o) {
  return `<div class="card clickable" data-object-id="${o.id}"><div class="card-row"><div class="card-main"><div class="type">${esc(TYPE_LABEL[o.type] || o.type)}</div><div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}<div class="pills"><span class="pill ${o.status}">${esc(STATUS_LABEL[o.status] || o.status)}</span><span class="pill ${o.origin==='agent'?'agent':''}">${esc(ORIGIN_LABEL[o.origin] || o.origin)}</span></div></div>${o.status==='proposed' ? `<div class="card-actions">${statusButtonsHtml(o.id)}</div>` : ''}</div></div>`;
}

function objectDetailHtml(o) {
  const links = [
    ...(o.incoming || []).map(r => ({ dir:'←', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.subject_id, title:r.subject_title, type:r.subject_type, status:r.status })),
    ...(o.outgoing || []).map(r => ({ dir:'→', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.object_id, title:r.object_title, type:r.object_type, status:r.status }))
  ];
  return `<button class="btn small" id="backBtn">← 戻る</button>
    <div class="detail-head"><div class="type">${esc(TYPE_LABEL[o.type] || o.type)}</div><h1>${esc(o.title)}</h1><div class="pills"><span class="pill ${o.status}">${esc(STATUS_LABEL[o.status] || o.status)}</span><span class="pill ${o.origin==='agent'?'agent':''}">${esc(ORIGIN_LABEL[o.origin] || o.origin)}</span></div></div>
    ${o.body ? `<div class="detail-body">${esc(o.body)}</div>`:''}
    ${o.status==='proposed' ? `<div class="actions object-actions">${statusButtonsHtml(o.id)}</div>` : ''}
    <section class="section"><div class="section-head"><h2>関連するもの</h2></div>${links.length ? `<div class="card">${links.map(x => `<div class="relation-row clickable" data-object-id="${x.id}"><div class="relation-label">${x.dir} ${esc(x.label)}</div><div><div class="type">${esc(TYPE_LABEL[x.type] || x.type)}</div><div class="relation-object">${esc(x.title)}</div></div>${x.status==='proposed'?'<span class="pill proposed">提案中のつながり</span>':''}</div>`).join('')}</div>` : '<div class="empty">まだつながりはありません。</div>'}</section>
    ${o.type==='asset' && o.asset ? `<section class="section"><div class="section-head"><h2>ローカルファイル</h2></div><div class="card"><div class="card-body">${esc(o.asset.relative_path)}\n${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div></div></section>` : ''}`;
}

function filesHtml() {
  return `<div class="page-title"><h1>ファイル</h1><button class="btn small" id="scanFiles">再スキャン</button></div><div class="muted page-note">研究フォルダ内のファイル名と基本メタデータだけを表示します。ファイル内容は自動で外部AIへ送りません。</div>${state.files.length ? `<div class="files">${state.files.map(f => `<div class="file"><div class="file-name" title="${esc(f.relative_path)}">${esc(f.relative_path)}</div><div class="file-meta">${fmtSize(f.size_bytes)}</div><button class="btn small" data-register-path="${esc(f.relative_path)}">データとして登録</button></div>`).join('')}</div>` : '<div class="empty">「再スキャン」で研究フォルダを確認します。</div>'}`;
}

function chatHtml() {
  const selected = state.selectedObject ? state.selectedObject.title : null;
  const messages = state.workspace.messages || [];
  return `<div class="chat-head">会話<span class="pill backend-pill" id="backendPill">Claude Code</span><div class="chat-context">${selected ? `対象: ${esc(selected)}` : '研究全体'}</div></div>
    <div class="messages" id="messages">${messages.length ? messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('') : '<div class="muted chat-hint">「何を調べている研究か」から普通に話してください。</div>'}</div>
    <div class="chat-compose"><textarea id="chatInput" class="input" placeholder="研究について話す…"></textarea>${state.error ? `<div class="error">${esc(state.error)}</div>`:''}<div class="compose-actions"><div class="privacy">ファイル本文はAIへ自動送信しません</div><button class="btn primary" id="sendBtn">送信</button></div></div>`;
}

function claudeSectionHtml(agent) {
  const claude = agent.claude || {};
  const body = claude.available
    ? `<div class="connection-ok"><strong>利用可能</strong><div class="muted">${esc(claude.version || 'claude')}</div></div>`
    : `<div class="error">Claude Codeが見つかりません: ${esc(claude.error || 'unknown error')}</div>
       <div class="muted settings-note">claudeコマンドをインストールして、rescicleを再起動してください。</div>`;
  return `<div class="settings-section"><h3>Claude Code</h3>${body}
    <div class="actions"><button class="btn small" id="refreshAgent">状態を更新</button></div>
    <div class="muted settings-note">画面のチャットは、すでにログイン済みのClaude Codeをローカルで実行して応答します。APIキーは不要です。研究フォルダをAIの作業ディレクトリにはせず、会話・研究オブジェクトの要約・ファイル名/サイズ/更新日時だけを渡します。ファイル本文は送信しません。</div>
    <div class="muted settings-note">Claude Code側をUIにして操作したい場合は、rescicleをMCP serverとして追加できます。</div>
    <button class="btn small settings-action" id="copyClaudeSetup">MCP設定コマンドをコピー</button>
  </div>`;
}

function settingsModalHtml() {
  const agent = state.bootstrap?.agent || {};
  return `<div class="modal-wrap"><div class="modal"><h2>AI接続</h2>
    ${claudeSectionHtml(agent)}
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
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = b.dataset.targetId || state.selectedObject?.id;
    if (!id) return;
    await api.setObjectStatus(id, b.dataset.status);
    await refreshWorkspace();
    if (state.selectedObject && state.selectedObject.id === id) await loadSelected(id);
    else render();
  }));
  document.getElementById('scanFiles')?.addEventListener('click', async () => { state.files = await api.scanFiles(state.workspace.project.id); render(); });
  document.querySelectorAll('[data-register-path]').forEach(b => b.addEventListener('click', async () => {
    await api.registerAsset(state.workspace.project.id, b.dataset.registerPath); await refreshWorkspace(); render();
  }));
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage(); });
  document.getElementById('settingsBtn')?.addEventListener('click', () => { state.modal='settings'; state.error=null; render(); });
  document.getElementById('closeModal')?.addEventListener('click', () => { state.modal=null; state.error=null; render(); });
  document.getElementById('refreshAgent')?.addEventListener('click', refreshAgent);
  document.getElementById('copyClaudeSetup')?.addEventListener('click', copyClaudeSetup);
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

async function refreshAgent() {
  try { state.bootstrap.agent = await api.agentRefresh(); state.error = null; render(); }
  catch (e) { state.error = e.message || String(e); render(); }
}
async function copyClaudeSetup() {
  try { await api.copyClaudeSetup(); state.error = null; alert('Claude Code用の設定コマンドをコピーしました。ターミナルで実行してください。'); }
  catch (e) { state.error = e.message || String(e); render(); }
}

boot().catch(e => { root.innerHTML = `<div class="onboarding"><div class="onboarding-card"><div class="brand">rescicle</div><div class="error">${esc(e.message || e)}</div></div></div>`; });
