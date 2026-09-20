const api = window.rescicle;
const root = document.getElementById('app');

// Every user-facing label is Japanese; the English keys stay as the domain
// vocabulary in the database and in src-tauri/src/domain.rs.
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
// allowed_relation() in src-tauri/src/domain.rs fixes the chain question ->
// hypothesis -> prediction -> measurement -> asset, so the map is a layered DAG:
// one column per type, left to right, and no layout search is needed.
const CHAIN = ['question', 'hypothesis', 'prediction', 'measurement', 'asset'];
const MAP = { W: 168, H: 62, COL_GAP: 28, ROW_GAP: 14, HEAD: 26, PAD: 11, LINE: 15 };

const PREDICATE_LABEL = {
  addresses: '問いに答える', predicts: '予測する', tested_by: '検証される', produces: '生み出す', references: '参照する', related_to: '関連する'
};

let state = {
  bootstrap: null,
  workspace: null,
  currentType: 'overview',
  // Non-empty replaces the centre column with results across every type.
  query: '',
  selectedObjectId: null,
  selectedObject: null,
  files: [],
  // The message a turn is running for. It is held here rather than left to the
  // workspace, because the workspace only comes back when the whole turn is
  // done and that is seconds to minutes away.
  pending: null,
  // The reply as far as it has arrived. The Rust side reads it out of the JSON
  // the agent is still writing and sends the whole thing each time, so this is
  // an assignment rather than something to append to.
  stream: '',
  // render() rebuilds the whole tree, so what the researcher has typed has to
  // live in state or it is lost every time anything else redraws.
  draft: '',
  modal: null,
  renaming: false,
  renameDraft: null,
  rootNotice: null,
  renameError: null,
  error: null
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// bridge.js wraps every rejection in an Error, so the message is already what
// the Rust side said rather than anything the transport added to it.
const errText = (e) => String(e?.message ?? e);
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024/1024).toFixed(1)} MB`;
const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
};

// render() replaces the input element, and an IME composition is bound to the
// element it started on: redrawing on every keystroke of "neko" tore down the
// field mid-conversion, so 猫 could never be reached. Nothing is redrawn until
// the composition is committed.
let composing = false;

function closeModal() {
  state.modal = null;
  state.error = null;
  render();
}

async function boot() {
  // Bound once on the document rather than in bind(), which runs on every
  // render and would stack a new listener each time.
  document.addEventListener('keydown', event => {
    // Ctrl+F is where anyone looks for search first. The webview's own find bar
    // is not reachable, so this is the only thing the shortcut could mean.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
      const box = document.getElementById('searchInput');
      if (!box) return;
      event.preventDefault();
      box.focus();
      box.select();
      return;
    }
    if (event.key !== 'Escape') return;
    // Escape cancels an IME conversion. Taking it here would clear the search
    // instead of the half-typed word, which is not what was asked for.
    if (composing || event.isComposing) return;
    // The rename field binds its own Escape; let that one win.
    if (state.renaming) return;
    if (state.modal) { closeModal(); return; }
    if (state.query) { state.query = ''; render(); return; }
    if (state.selectedObjectId) {
      state.selectedObjectId = null;
      state.selectedObject = null;
      render();
    }
  });

  // Patch the streaming reply into the bubble directly. render() would rebuild
  // the tree on every chunk, throwing away the next message being typed and
  // fighting the scroll position several times a second.
  api.onReply(text => {
    if (!state.pending) return;
    state.stream = text;
    const node = document.getElementById('streamText');
    if (!node) { render(); return; }
    node.textContent = text;
    const label = document.getElementById('thinkingLabel');
    if (label) label.textContent = '';
    const messages = document.getElementById('messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
  state.bootstrap = await api.bootstrap();
  state.workspace = state.bootstrap.workspace;
  render();
}

function render() {
  const scrollTop = document.querySelector('.content')?.scrollTop ?? 0;
  // The whole tree is rebuilt, so a field being typed into loses focus and the
  // caret jumps to the start on the next keystroke. Put both back.
  const focused = document.activeElement;
  const focusedId = focused?.id;
  const caret = focused?.selectionStart ?? null;

  root.innerHTML = state.workspace ? workspaceHtml() : onboardingHtml();
  bind();

  const content = document.querySelector('.content');
  if (content) content.scrollTop = scrollTop;
  if (focusedId) {
    const again = document.getElementById(focusedId);
    if (again) {
      again.focus();
      if (caret !== null && again.setSelectionRange) {
        try { again.setSelectionRange(caret, caret); } catch { /* not a text field */ }
      }
    }
  }
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
  return `<div class="shell">
    <header class="topbar"><div class="brand">rescicle</div>${projectTitleHtml()}<button class="root-hint" id="changeRoot" title="クリックして研究フォルダを変更">${esc(w.project.root_path)}</button><button class="btn small" id="settingsBtn">AI接続</button></header>
    <div class="layout">
      <aside class="sidebar">${sidebarHtml()}</aside>
      <main class="content"><div class="content-inner">${noticeHtml()}${contentHtml()}</div></main>
      <aside class="chat">${chatHtml()}</aside>
    </div>
    ${state.modal === 'settings' ? settingsModalHtml() : ''}
  </div>`;
}

function sidebarHtml() {
  // Counted the way the map draws it: rejected objects are off the map, so
  // counting them here made the sidebar and the map disagree with no
  // explanation. They are still listed, at the bottom of their own page.
  const counts = {};
  for (const o of state.workspace.objects || []) {
    if (o.status === 'rejected') continue;
    counts[o.type] = (counts[o.type] || 0) + 1;
  }
  const nav = [['overview','マップ',''], ...Object.entries(TYPE_LABEL).map(([k,label]) => [k,label,counts[k] || 0]), ['files','ファイル','']];
  return `<div class="search-box"><input id="searchInput" class="input" type="search" placeholder="検索（Ctrl+F）" value="${esc(state.query)}"></div>
    <div class="nav-title">研究オブジェクト</div>${nav.map(([id,label,count]) => `<button class="nav-btn ${state.currentType===id?'active':''}" data-nav="${id}"><span>${esc(label)}</span><span class="count">${count}</span></button>`).join('')}`;
}

function contentHtml() {
  if (state.query.trim()) return searchHtml();
  if (state.currentType === 'overview') return overviewHtml();
  if (state.currentType === 'files') return filesHtml();
  return objectListHtml(state.currentType);
}

function noticeHtml() {
  if (!state.rootNotice) return '';
  return `<div class="notice"><span>${esc(state.rootNotice)}</span><button class="btn small" id="dismissNotice">閉じる</button></div>`;
}

function projectTitleHtml() {
  const name = state.workspace.project.name;
  if (!state.renaming) {
    return `<button class="project-title" id="renameProject" title="クリックして研究名を変更">${esc(name)}</button>`;
  }
  return `<div class="project-title renaming">
    <input id="projectNameInput" class="input project-name-input" value="${esc(state.renameDraft ?? name)}">
    <button class="btn primary small" id="saveProjectName">保存</button>
    <button class="btn small" id="cancelProjectName">キャンセル</button>
    ${state.renameError ? `<span class="error rename-error">${esc(state.renameError)}</span>` : ''}
  </div>`;
}

function overviewHtml() {
  const objects = state.workspace.objects || [];
  // Notes sit outside the chain that allowed_relation() permits, so they are never
  // drawn on the map. List them under it rather than letting them disappear.
  const offMap = objects.filter(o => o.status !== 'rejected' && !CHAIN.includes(o.type));
  return `<div class="page-title"><h1>${esc(state.workspace.project.name)}</h1></div>
    <div class="muted page-note">問い → 仮説 → 予測 → 測定 → データ のつながりです。右側のAIと話すと、ここが育っていきます。</div>
    ${mapHtml()}
    ${state.selectedObject && CHAIN.includes(state.selectedObject.type)
      // Sticks to the bottom of the column while the map is taller than the
      // viewport. Sitting in the flow under the map meant that with twenty
      // hypotheses the detail opened a thousand pixels below the fold, so
      // clicking a node looked like it had done nothing at all.
      ? `<div class="map-detail">${cardHtml(state.selectedObject, { pinned: true })}</div>`
      : ''}
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
  const rank = new Map(CHAIN.map((type, i) => [type, i]));

  // `addresses` runs hypothesis -> question, the opposite way round to every
  // other predicate, so an edge cannot be read as "subject is on the left".
  // Orient each one by the column its ends land in instead. Both the alignment
  // below and the curves in mapHtml() need the left-hand end to really be on
  // the left; without this a hypothesis had no anchor at all and its edge was
  // drawn backwards across the question column.
  const edges = (relations || [])
    .filter(r => byId.has(r.subject_id) && byId.has(r.object_id))
    .map(r => {
      const behind = rank.get(byId.get(r.object_id).type) < rank.get(byId.get(r.subject_id).type);
      return {
        ...r,
        from: behind ? r.object_id : r.subject_id,
        to: behind ? r.subject_id : r.object_id
      };
    });

  const anchors = new Map();
  for (const r of edges) {
    // Same column: neither end can position the other.
    if (rank.get(byId.get(r.from).type) === rank.get(byId.get(r.to).type)) continue;
    if (!anchors.has(r.to)) anchors.set(r.to, []);
    anchors.get(r.to).push(r.from);
  }
  const cols = CHAIN.map(type => alive.filter(o => o.type === type)).filter(col => col.length);
  const pos = new Map();
  // Left to right, so a node's anchors already have a y when it is placed: aim
  // for the average of them, then push down far enough not to overlap the row
  // above.
  cols.forEach((col, c) => {
    const x = c * (MAP.W + MAP.COL_GAP);
    const wanted = col.map(o => {
      const ys = (anchors.get(o.id) || []).map(id => pos.get(id)).filter(Boolean).map(q => q.y);
      return { o, desired: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity };
    }).sort((a, b) => a.desired - b.desired);
    let next = MAP.HEAD;
    for (const { o, desired } of wanted) {
      const y = Math.max(next, Number.isFinite(desired) ? desired : next);
      pos.set(o.id, { x, y, o });
      next = y + MAP.H + MAP.ROW_GAP;
    }
  });

  // The forward pass can only push a node down to meet things already placed, so
  // the first column stays packed at the top while the blocks it feeds run far
  // below it: a question with twelve hypotheses left the next question 800px
  // above its own. Walk back leftwards and let each node drop to the block it
  // feeds, keeping the column's order and spacing.
  const feeds = new Map();
  for (const [to, froms] of anchors) {
    for (const from of froms) {
      if (!feeds.has(from)) feeds.set(from, []);
      feeds.get(from).push(to);
    }
  }
  for (let c = cols.length - 2; c >= 0; c--) {
    const placed = cols[c]
      .map(o => pos.get(o.id))
      .sort((a, b) => a.y - b.y);
    let next = MAP.HEAD;
    for (const node of placed) {
      const ys = (feeds.get(node.o.id) || []).map(id => pos.get(id)).filter(Boolean).map(q => q.y);
      const desired = ys.length ? Math.min(...ys) : node.y;
      node.y = Math.max(next, desired);
      next = node.y + MAP.H + MAP.ROW_GAP;
    }
  }
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
    // from/to are the edge oriented by column, not subject and object: see
    // buildMap. Drawing it by subject would send an `addresses` curve back
    // across the question column from the right.
    const a = g.pos.get(r.from), b = g.pos.get(r.to);
    const x1 = a.x + MAP.W, y1 = a.y + MAP.H / 2, x2 = b.x, y2 = b.y + MAP.H / 2;
    const mid = (x1 + x2) / 2;
    return `<path class="map-edge ${r.status === 'proposed' ? 'proposed' : ''}" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"></path>`;
  }).join('');
  const heads = g.cols.map((col, c) => {
    const label = TYPE_LABEL[col[0].type] || col[0].type;
    return `<text class="map-col-head" x="${c * (MAP.W + MAP.COL_GAP)}" y="12">${esc(label)}</text>`;
  }).join('');
  const nodes = [...g.pos.values()].map(({ x, y, o }) => `<g class="map-node ${esc(o.status)} ${state.selectedObjectId === o.id ? 'selected' : ''}" data-object-id="${o.id}">
      <rect x="${x}" y="${y}" width="${MAP.W}" height="${MAP.H}" rx="10"></rect>
      <text class="map-type" x="${x + MAP.PAD}" y="${y + 17}">${esc(TYPE_LABEL[o.type] || o.type)}</text>
      ${wrapTitle(o.title).map((line, i) => `<text class="map-title" x="${x + MAP.PAD}" y="${y + 36 + i * MAP.LINE}">${esc(line)}</text>`).join('')}
    </g>`).join('');
  return `<div class="map-scroll"><svg class="map" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${edges}${heads}${nodes}</svg></div>
    <div class="map-legend"><span>実線 = 確定</span><span>破線 = 提案中（AI提案）</span><span>ノードをクリックすると詳細が開きます</span></div>`;
}

// Searches across every type at once, including rejected objects: the reason to
// go looking for something is often that it is no longer where you expect it.
// Results keep the chain's order, so a question comes before the hypotheses
// under it rather than whatever order they were last touched in.
function searchHtml() {
  const needle = state.query.trim().toLowerCase();
  const order = new Map([...CHAIN, 'note'].map((type, i) => [type, i]));
  const hits = (state.workspace.objects || [])
    .filter(o => `${o.title} ${o.body || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99));
  return `<div class="page-title"><h1>検索</h1><span class="muted">「${esc(state.query.trim())}」に ${hits.length}件</span></div>${
    hits.length
      ? `<div class="object-grid">${hits.map(o => cardHtml(o)).join('')}</div>`
      : '<div class="empty">一致する研究オブジェクトはありません。</div>'}`;
}

function objectListHtml(type) {
  const label = TYPE_LABEL[type] || type;
  const all = (state.workspace.objects || []).filter(o => o.type === type);
  // Objects are listed newest-touched first, and rejecting something touches it,
  // so what the researcher just discarded took the top of the list. Rejected
  // work goes to the bottom, still reachable, under its own heading.
  const live = all.filter(o => o.status !== 'rejected');
  const dropped = all.filter(o => o.status === 'rejected');
  const body = live.length
    ? `<div class="object-grid">${live.map(o => cardHtml(o)).join('')}</div>`
    : `<div class="empty">まだ${esc(label)}はありません。右側で研究について話してみてください。</div>`;
  const rejected = dropped.length
    ? `<section class="section"><div class="section-head"><h2>却下したもの</h2><span class="muted">${dropped.length}件</span></div><div class="object-grid">${dropped.map(o => cardHtml(o)).join('')}</div></section>`
    : '';
  return `<div class="page-title"><h1>${esc(label)}</h1></div>${body}${rejected}`;
}

// A decision has to be reversible. Rejecting something used to remove the only
// buttons it had, so a researcher who changed their mind had no way back except
// asking the agent to undo it. Deciding again goes through `proposed` rather
// than flipping straight over: re-deciding is a decision too.
function statusButtonsHtml(o) {
  if (o.status === 'proposed') {
    return `<button class="btn primary small" data-status="confirmed" data-target-id="${o.id}">確定</button><button class="btn danger small" data-status="rejected" data-target-id="${o.id}">却下</button>`;
  }
  return `<button class="btn small" data-status="proposed" data-target-id="${o.id}">提案中に戻す</button>`;
}

function cardHtml(o, { pinned = false } = {}) {
  const open = state.selectedObjectId === o.id;
  // getObject() carries the relations, and it lands one render later than the click.
  const full = open && state.selectedObject?.id === o.id ? state.selectedObject : null;
  // Only the summary row toggles. Clicking inside an open card -- or anywhere on the
  // panel the map drives, which `pinned` marks -- must not dismiss what you opened.
  const row = pinned
    ? '<div class="card-row">'
    : `<div class="card-row clickable" data-object-id="${o.id}" data-object-type="${esc(o.type)}">`;
  return `<div class="card ${open ? 'open' : ''} ${o.status}">${row}<div class="card-main"><div class="type">${esc(TYPE_LABEL[o.type] || o.type)}</div><div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}<div class="pills"><span class="pill ${o.status}">${esc(STATUS_LABEL[o.status] || o.status)}</span><span class="pill ${o.origin==='agent'?'agent':''}">${esc(ORIGIN_LABEL[o.origin] || o.origin)}</span></div></div><div class="card-actions">${statusButtonsHtml(o)}</div></div>${full ? expansionHtml(full) : ''}</div>`;
}

// The open half of a card: everything the old detail page added on top of what
// the collapsed card already shows.
function expansionHtml(o) {
  const links = [
    ...(o.incoming || []).map(r => ({ dir:'←', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.subject_id, title:r.subject_title, type:r.subject_type, status:r.status })),
    ...(o.outgoing || []).map(r => ({ dir:'→', label:PREDICATE_LABEL[r.predicate] || r.predicate, id:r.object_id, title:r.object_title, type:r.object_type, status:r.status }))
  ];
  const rows = links.map(x => `<div class="relation-row clickable" data-object-id="${x.id}" data-object-type="${esc(x.type)}"><div class="relation-label">${x.dir} ${esc(x.label)}</div><div><div class="type">${esc(TYPE_LABEL[x.type] || x.type)}</div><div class="relation-object">${esc(x.title)}</div></div>${x.status==='proposed'?'<span class="pill proposed">提案中のつながり</span>':''}</div>`).join('');
  return `<div class="card-expand">
    <div class="expand-head">関連するもの</div>
    ${rows || '<div class="expand-empty">まだつながりはありません。</div>'}
    ${o.type==='asset' && o.asset ? `<div class="expand-head">ローカルファイル</div><div class="card-body">${esc(o.asset.relative_path)}
${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div>` : ''}
  </div>`;
}

function filesHtml() {
  return `<div class="page-title"><h1>ファイル</h1><button class="btn small" id="scanFiles">再スキャン</button></div><div class="muted page-note">研究フォルダ内のファイル名と基本メタデータだけを表示します。ファイル内容は自動で外部AIへ送りません。</div>${state.files.length ? `<div class="files">${state.files.map(f => `<div class="file"><div class="file-name" title="${esc(f.relative_path)}">${esc(f.relative_path)}</div><div class="file-meta">${fmtSize(f.size_bytes)}</div><button class="btn small" data-register-path="${esc(f.relative_path)}">データとして登録</button></div>`).join('')}</div>` : '<div class="empty">「再スキャン」で研究フォルダを確認します。</div>'}`;
}

function chatHtml() {
  const selected = state.selectedObject ? state.selectedObject.title : null;
  const messages = state.workspace.messages || [];
  const thread = messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`);
  if (state.pending) {
    thread.push(`<div class="message user">${esc(state.pending.text)}</div>`);
    thread.push(`<div class="message assistant thinking">
      <span class="stream" id="streamText">${esc(state.stream)}</span>
      <span class="status"><span class="dots"><i></i><i></i><i></i></span><span id="thinkingLabel">${state.stream ? '' : '考えています'}</span><span class="elapsed" id="thinkingElapsed">${fmtElapsed(Date.now() - state.pending.startedAt)}</span></span>
    </div>`);
  }
  return `<div class="chat-head">会話<span class="pill backend-pill" id="backendPill">Claude Code</span><div class="chat-context">${selected ? `<span class="target-label">対象: ${esc(selected)}</span><button class="clear-target" id="clearTarget" title="研究全体に戻す">×</button>` : '<span class="target-label">研究全体</span>'}</div></div>
    <div class="messages" id="messages">${thread.length ? thread.join('') : '<div class="muted chat-hint">「何を調べている研究か」から普通に話してください。</div>'}</div>
    <div class="chat-compose"><textarea id="chatInput" class="input" placeholder="研究について話す…">${esc(state.draft)}</textarea>${state.error ? `<div class="error">${esc(state.error)}</div>`:''}<div class="compose-actions"><div class="privacy">ファイル本文はAIへ自動送信しません</div><button class="btn primary" id="sendBtn"${state.pending ? ' disabled' : ''}>${state.pending ? '応答待ち…' : '送信'}</button></div></div>`;
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
  return `<div class="modal-wrap" id="modalWrap"><div class="modal"><h2>AI接続</h2>
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
    // Leaving the query set would show results while the nav looked switched.
    state.currentType = b.dataset.nav; state.query = ""; state.selectedObjectId = null; state.selectedObject = null; state.error = null;
    if (state.currentType === 'files' && !state.files.length) state.files = await api.scanFiles(state.workspace.project.id);
    render();
  }));
  document.querySelectorAll('[data-object-id]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    const id = el.dataset.objectId;
    if (id === state.selectedObjectId) { state.selectedObjectId = null; state.selectedObject = null; render(); return; }
    // A relation can point at another type, which the current list would not show.
    const type = el.dataset.objectType;
    if (type && state.currentType !== 'overview' && state.currentType !== type) state.currentType = type;
    loadSelected(id);
  }));
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = b.dataset.targetId || state.selectedObject?.id;
    if (!id) return;
    await api.setObjectStatus(id, b.dataset.status);
    await refreshWorkspace();
    if (state.selectedObject && state.selectedObject.id === id) await loadSelected(id);
    else render();
  }));
  document.getElementById('renameProject')?.addEventListener('click', () => {
    state.renaming = true; state.renameDraft = state.workspace.project.name; state.renameError = null; render();
    const input = document.getElementById('projectNameInput');
    input?.focus(); input?.select();
  });
  document.getElementById('cancelProjectName')?.addEventListener('click', cancelRename);
  document.getElementById('saveProjectName')?.addEventListener('click', saveProjectName);
  document.getElementById('projectNameInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveProjectName();
    if (event.key === 'Escape') cancelRename();
  });
  document.getElementById('changeRoot')?.addEventListener('click', changeProjectRoot);
  document.getElementById('dismissNotice')?.addEventListener('click', () => { state.rootNotice = null; render(); });
  document.getElementById('scanFiles')?.addEventListener('click', async () => { state.files = await api.scanFiles(state.workspace.project.id); render(); });
  document.querySelectorAll('[data-register-path]').forEach(b => b.addEventListener('click', async () => {
    await api.registerAsset(state.workspace.project.id, b.dataset.registerPath); await refreshWorkspace(); render();
  }));
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage(); });
  document.getElementById('chatInput')?.addEventListener('input', e => { state.draft = e.target.value; });
  document.getElementById('settingsBtn')?.addEventListener('click', () => { state.modal='settings'; state.error=null; render(); });
  document.getElementById('closeModal')?.addEventListener('click', closeModal);
  // Only the backdrop itself dismisses; a click that started inside the panel
  // must not close what the researcher is reading.
  document.getElementById('modalWrap')?.addEventListener('click', event => { if (event.target.id === 'modalWrap') closeModal(); });
  const search = document.getElementById('searchInput');
  search?.addEventListener('compositionstart', () => { composing = true; });
  search?.addEventListener('compositionend', event => {
    composing = false;
    state.query = event.target.value;
    render();
  });
  search?.addEventListener('input', event => {
    // Mid-conversion the field holds romaji and kana that are not what is being
    // searched for. Wait for the IME to commit.
    if (composing) return;
    state.query = event.target.value;
    render();
  });
  document.getElementById('clearTarget')?.addEventListener('click', () => { state.selectedObjectId = null; state.selectedObject = null; render(); });
  document.getElementById('refreshAgent')?.addEventListener('click', refreshAgent);
  document.getElementById('copyClaudeSetup')?.addEventListener('click', copyClaudeSetup);
  const messages = document.getElementById('messages'); if (messages) messages.scrollTop = messages.scrollHeight;
}

function cancelRename() {
  state.renaming = false; state.renameDraft = null; state.renameError = null; render();
}

async function saveProjectName() {
  state.renameDraft = document.getElementById('projectNameInput')?.value ?? '';
  const name = state.renameDraft.trim();
  if (!name) { state.renameError = '研究名を入力してください。'; render(); return; }
  try {
    state.workspace = await api.renameProject(state.workspace.project.id, name);
    // bootstrap.projects backs the project list, so keep it in step.
    const listed = state.bootstrap?.projects?.find(x => x.id === state.workspace.project.id);
    if (listed) listed.name = state.workspace.project.name;
    state.renaming = false; state.renameDraft = null; state.renameError = null;
  } catch (e) { state.renameError = errText(e); }
  render();
}

async function changeProjectRoot() {
  const folder = await api.chooseFolder();
  if (!folder) return;
  try {
    const result = await api.setProjectRoot(state.workspace.project.id, folder);
    state.workspace = result.workspace;
    state.files = [];   // the cached scan belongs to the old folder
    const missing = result.missing || [];
    state.rootNotice = missing.length
      ? `登録済みデータのうち ${missing.length} 件が新しいフォルダに見つかりません: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' ほか' : ''}`
      : null;
  } catch (e) { state.rootNotice = `研究フォルダを変更できませんでした: ${errText(e)}`; }
  render();
}

async function loadSelected(id) {
  state.selectedObjectId = id;
  state.selectedObject = await api.getObject(id);
  render();
}
async function refreshWorkspace() {
  state.workspace = await api.openProject(state.workspace.project.id);
}
// Ticks the elapsed label in place. A render() every second would throw away
// whatever the researcher has started typing for their next message.
let thinkingTimer = null;
function stopThinkingTimer() {
  if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
}
function startThinkingTimer() {
  stopThinkingTimer();
  thinkingTimer = setInterval(() => {
    const label = document.getElementById('thinkingElapsed');
    if (!label || !state.pending) { stopThinkingTimer(); return; }
    label.textContent = fmtElapsed(Date.now() - state.pending.startedAt);
  }, 1000);
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = (input?.value ?? state.draft).trim();
  if (!text || state.pending) return;
  state.pending = { text, startedAt: Date.now() };
  state.stream = '';
  state.draft = '';
  state.error = null;
  render();
  startThinkingTimer();
  try {
    const result = await api.sendMessage({ projectId: state.workspace.project.id, text, selectedObjectId: state.selectedObjectId });
    state.workspace = result.workspace;
    if (state.selectedObjectId) state.selectedObject = await api.getObject(state.selectedObjectId);
  } catch (e) {
    state.error = errText(e);
    // A failed turn hands the text back instead of making them retype it.
    state.draft = text;
  }
  stopThinkingTimer();
  state.pending = null;
  state.stream = '';
  render();
}

async function refreshAgent() {
  try { state.bootstrap.agent = await api.agentRefresh(); state.error = null; render(); }
  catch (e) { state.error = errText(e); render(); }
}
async function copyClaudeSetup() {
  try { await api.copyClaudeSetup(); state.error = null; alert('Claude Code用の設定コマンドをコピーしました。ターミナルで実行してください。'); }
  catch (e) { state.error = errText(e); render(); }
}

boot().catch(e => { root.innerHTML = `<div class="onboarding"><div class="onboarding-card"><div class="brand">rescicle</div><div class="error">${esc(e.message || e)}</div></div></div>`; });
