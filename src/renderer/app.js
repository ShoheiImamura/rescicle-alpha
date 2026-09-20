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
// A note is something written down, not a claim about the world. The three
// states are the same underneath, but confirming or rejecting a reminder to
// redo some wiring is not what those words mean.
const NOTE_STATUS_LABEL = { proposed: '未整理', confirmed: '残す', rejected: '不要' };
const statusLabel = o => (o.type === 'note' ? NOTE_STATUS_LABEL : STATUS_LABEL)[o.status] || o.status;
const ORIGIN_LABEL = { researcher: '研究者', agent: 'AI提案', system: 'システム', instrument: '測定機器', imported: 'インポート' };
// allowed_relation() in src-tauri/src/domain.rs fixes the chain question ->
// hypothesis -> prediction -> measurement -> asset, so the map is a layered DAG:
// one column per type, left to right, and no layout search is needed.
const CHAIN = ['question', 'hypothesis', 'prediction', 'measurement', 'asset'];
// The four edges allowed_relation() in src-tauri/src/domain.rs accepts exactly.
// A pair of types fixes the predicate, so drawing a link by hand is a choice of
// the other end and nothing else. The two loose predicates -- references and
// related_to, which join any pair -- would need the predicate picked too, and
// stay with the agent for now.
const CHAIN_EDGES = [
  { subject: 'hypothesis', predicate: 'addresses', object: 'question' },
  { subject: 'hypothesis', predicate: 'predicts', object: 'prediction' },
  { subject: 'prediction', predicate: 'tested_by', object: 'measurement' },
  { subject: 'measurement', predicate: 'produces', object: 'asset' }
];
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
  // The object whose link picker is open, if any. Nothing is half-entered while
  // it is open -- picking is the whole act -- so this is all there is to keep.
  linking: null,
  // The file whose "which measurement produced this" list is open, if any.
  registering: null,
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
    // Ctrl+K is the way back to the conversation from wherever the researcher
    // has got to, the way Ctrl+F is the way to search. What is half-typed there
    // is kept, so the caret goes to the end of it rather than over it.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      const box = document.getElementById('chatInput');
      if (!box) return;
      event.preventDefault();
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
      return;
    }
    if (event.key !== 'Escape') return;
    // Escape cancels an IME conversion. Taking it here would clear the search
    // instead of the half-typed word, which is not what was asked for.
    if (composing || event.isComposing) return;
    // The rename field binds its own Escape; let that one win.
    if (state.renaming) return;
    if (state.modal) { closeModal(); return; }
    // and Escape is the way back out of the box Ctrl+K puts you in, without
    // touching the message that is being written.
    if (document.activeElement?.id === 'chatInput') { document.activeElement.blur(); return; }
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

// The map page is the chain and nothing else. Notes sit outside the chain that
// allowed_relation() permits, so they were listed underneath it, but a section
// whose reason to exist is "the picture above cannot show these" earns its space
// on the page it belongs to instead: the sidebar already has one.
function overviewHtml() {
  return `<div class="page-title"><h1>${esc(state.workspace.project.name)}</h1></div>
    <div class="muted page-note">問い → 仮説 → 予測 → 測定 → データ のつながりです。右側のAIと話すと、ここが育っていきます。</div>
    ${mapHtml()}
    ${state.selectedObject && CHAIN.includes(state.selectedObject.type)
      // Sticks to the bottom of the column while the map is taller than the
      // viewport. Sitting in the flow under the map meant that with twenty
      // hypotheses the detail opened a thousand pixels below the fold, so
      // clicking a node looked like it had done nothing at all.
      ? `<div class="map-detail">${cardHtml(state.selectedObject, { pinned: true })}</div>`
      : ''}`;
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
    // A rejected relation leaves the map the way a rejected object does.
    .filter(r => r.status !== 'rejected' && byId.has(r.subject_id) && byId.has(r.object_id))
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
      ${o.performed_at ? `<text class="map-done" x="${x + MAP.W - MAP.PAD}" y="${y + 17}">実施済み</text>` : ''}
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
    ? `<section class="section"><div class="section-head"><h2>${type === 'note' ? '不要としたもの' : '却下したもの'}</h2><span class="muted">${dropped.length}件</span></div><div class="object-grid">${dropped.map(o => cardHtml(o)).join('')}</div></section>`
    : '';
  return `<div class="page-title"><h1>${esc(label)}</h1></div>${body}${rejected}`;
}

// A decision has to be reversible. Rejecting something used to remove the only
// buttons it had, so a researcher who changed their mind had no way back except
// asking the agent to undo it. Deciding again goes through `proposed` rather
// than flipping straight over: re-deciding is a decision too.
// Deciding to run a measurement and having run it are different things, so the
// pill sits next to the status rather than replacing it: 確定・未実施 is the
// ordinary state of a measurement and has to be one thing the card can say.
function performedPillHtml(o) {
  if (o.type !== 'measurement') return '';
  return o.performed_at
    ? `<span class="pill done">実施済み ${esc(fmtDay(o.performed_at))}</span>`
    : '<span class="pill">未実施</span>';
}

function performedButtonHtml(o) {
  if (o.type !== 'measurement') return '';
  const done = Boolean(o.performed_at);
  return `<button class="btn small" data-performed="${done ? 'false' : 'true'}" data-target-id="${o.id}" title="${done ? 'まだ実施していないことにする' : '今日実施したことにする'}">${done ? '未実施に戻す' : '実施した'}</button>`;
}

function statusButtonsHtml(o) {
  const note = o.type === 'note';
  if (o.status === 'proposed') {
    return `<button class="btn primary small" data-status="confirmed" data-target-id="${o.id}">${note ? '残す' : '確定'}</button><button class="btn danger small" data-status="rejected" data-target-id="${o.id}">${note ? '不要' : '却下'}</button>`;
  }
  return `<button class="btn small" data-status="proposed" data-target-id="${o.id}">${note ? '戻す' : '提案中に戻す'}</button>`;
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
  return `<div class="card ${open ? 'open' : ''} ${o.status}">${row}<div class="card-main"><div class="type">${esc(TYPE_LABEL[o.type] || o.type)}</div><div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}<div class="pills"><span class="pill ${o.status}">${esc(statusLabel(o))}</span><span class="pill ${o.origin==='agent'?'agent':''}">${esc(ORIGIN_LABEL[o.origin] || o.origin)}</span>${performedPillHtml(o)}</div></div><div class="card-actions">${performedButtonHtml(o)}${statusButtonsHtml(o)}</div></div>${full ? expansionHtml(full) : ''}</div>`;
}

// The far end a new chain link could have, one slot per edge this object's type
// appears in. Which side of the edge the object sits on decides the direction,
// and the type pair has already decided the predicate, so a slot is settled the
// moment the other object is picked.
function linkSlots(o, ends) {
  const taken = new Set(ends.map(e => `${e.r.predicate}|${e.id}`));
  const pool = (state.workspace.objects || []).filter(c => c.id !== o.id && c.status !== 'rejected');
  return CHAIN_EDGES
    .filter(e => e.subject === o.type || e.object === o.type)
    .map(e => {
      const asSubject = e.subject === o.type;
      const otherType = asSubject ? e.object : e.subject;
      return {
        predicate: e.predicate,
        asSubject,
        otherType,
        // A link that is already drawn comes back out of create_relation
        // untouched, so offering it again would be a row that does nothing. That
        // includes one left rejected from before, which its own row takes back
        // or removes.
        candidates: pool.filter(c => c.type === otherType && !taken.has(`${e.predicate}|${c.id}`))
      };
    })
    .filter(slot => slot.candidates.length);
}

// A candidate stands where the link would land, and choosing it is what draws
// the link: there is no field to fill in and no verb to press afterwards,
// because the pair of types has already named the only predicate that could
// join them. It does not borrow the dashed border, though. Dashed already means
// a line the agent drew and nobody has decided on yet, which is a line that
// exists; a candidate is one that does not. It carries a ＋ and no frame until
// the pointer is on it.
function candidateRowHtml(slot, c, side) {
  return `<div class="rel-row candidate ${side}" data-link-add="${esc(c.id)}" data-link-predicate="${esc(slot.predicate)}" data-link-subject="${slot.asSubject ? 'self' : 'picked'}">
      <span class="rel-plus" aria-hidden="true">＋</span>
      <span class="rel-pred">${esc(PREDICATE_LABEL[slot.predicate] || slot.predicate)}</span>
      <span class="type">${esc(TYPE_LABEL[slot.otherType] || slot.otherType)}</span>
      <span class="rel-title">${esc(c.title)}</span>
    </div>`;
}

// The open half of a card: everything the old detail page added on top of what
// the collapsed card already shows.
function expansionHtml(o) {
  // The chain reads left to right on the map, so the same idea is used here
  // turned on its side: what leads here above, this object itself in the
  // middle, what it leads to below. A flat list of arrows never said where you
  // were standing.
  // Laid out the way the map reads: the chain runs from upper left to lower
  // right, so what leads here sits above and left of this object and what it
  // leads to sits below and right. Position carries the direction, so the rows
  // need no arrows and no headings, and the nodes borrow the map's own look —
  // white, dashed while still proposed, a heavy border on the one you are on.
  // A relation is decided on like anything else -- keeping a hypothesis while
  // turning down the link an agent drew from it has to be sayable -- but saying
  // no to a line removes it rather than parking it in a rejected state. A line
  // is structure, not a claim, so a guess the researcher never asked for has
  // nothing to say once it has been turned down, and leaving it as a struck-out
  // row put the agent's mistake in both of the cards it touched for good.
  // Nothing is lost by taking it out, because ＋つなぐ draws it again.
  const relActs = r => {
    // Red is for 却下 on an object, which cannot be made again by hand. Taking
    // a line out is two clicks from being back, so it reads as the ordinary
    // thing it is.
    const drop = `<button class="btn small" data-relation-drop="${r.id}" title="このつながりを外す">はずす</button>`;
    if (r.status === 'proposed') return `<button class="btn primary small" data-relation-status="confirmed" data-relation-id="${r.id}">確定</button>${drop}`;
    // Links rejected before they could be removed are still in the database.
    // The state is out of the vocabulary now, so give those rows both ways out.
    if (r.status === 'rejected') return `<button class="btn small" data-relation-status="proposed" data-relation-id="${r.id}" title="このつながりを提案中に戻す">戻す</button>${drop}`;
    return drop;
  };

  const relRow = (r, id, title, type, side) => `<div class="rel-row ${side} ${esc(r.status)} clickable" data-object-id="${id}" data-object-type="${esc(type)}">
      <span class="rel-pred">${esc(PREDICATE_LABEL[r.predicate] || r.predicate)}</span>
      <span class="type">${esc(TYPE_LABEL[type] || type)}</span>
      <span class="rel-title">${esc(title)}</span>
      <span class="rel-acts">${relActs(r)}</span>
      <span class="rel-go" aria-hidden="true">›</span>
    </div>`;

  // Which side a relation belongs on is decided by the column its other end
  // sits in, never by which end the database calls the subject. `addresses`
  // runs hypothesis -> question, so reading it as an outgoing edge put the
  // question below and to the right of its own hypothesis, the opposite of
  // where the map draws it.
  const rank = new Map(CHAIN.map((type, i) => [type, i]));
  const mine = rank.get(o.type) ?? 99;
  const ends = [
    ...(o.incoming || []).map(r => ({ r, id: r.subject_id, title: r.subject_title, type: r.subject_type })),
    ...(o.outgoing || []).map(r => ({ r, id: r.object_id, title: r.object_title, type: r.object_type }))
  ];
  const upstream = ends
    .filter(e => (rank.get(e.type) ?? 99) < mine)
    .map(e => relRow(e.r, e.id, e.title, e.type, 'up'));
  const downstream = ends
    .filter(e => (rank.get(e.type) ?? 99) >= mine)
    .map(e => relRow(e.r, e.id, e.title, e.type, 'down'));
  // Drawing a link is rare next to reading what is already there, so at rest it
  // is one faint line under the map and the card looks as it always did. Opened,
  // the candidates fall into the column the finished link would land in, because
  // position is what says which way the chain runs.
  const slots = linkSlots(o, ends);
  const picking = state.linking === o.id;
  if (picking) {
    for (const slot of slots) {
      const up = (rank.get(slot.otherType) ?? 99) < mine;
      for (const c of slot.candidates) {
        (up ? upstream : downstream).push(candidateRowHtml(slot, c, up ? 'up' : 'down'));
      }
    }
  }
  const graph = upstream.length || downstream.length
    ? `<div class="rel-map">${upstream.join('')}<div class="rel-here"><span class="type">${esc(TYPE_LABEL[o.type] || o.type)}</span></div>${downstream.join('')}</div>`
    : '<div class="expand-empty">まだつながりはありません。</div>';
  const link = slots.length
    ? `<button class="link-add${picking ? ' open' : ''}" data-link-toggle="${esc(o.id)}">${picking ? 'やめる' : '＋ つなぐ'}</button>`
    : '';

  return `<div class="card-expand">
    <div class="expand-head">つながり</div>
    ${graph}
    ${link}
    ${o.type==='asset' && o.asset ? `<div class="expand-head">ローカルファイル</div><div class="card-body">${esc(o.asset.relative_path)}
${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div>` : ''}
  </div>`;
}

// Registering a file makes a Research Object, and one that nothing points at
// floats off the end of the map -- which is where the first four ended up. The
// chain allows exactly one link into an asset, measurement produces asset, so
// the measurement is asked for here instead of being left to be found from the
// other side afterwards. Asked for, not required: a file can be registered on
// its own, and there is nothing to ask before the first measurement exists.
function measurementsOnHand() {
  return (state.workspace.objects || []).filter(o => o.type === 'measurement' && o.status !== 'rejected');
}

function registerPickerHtml(f) {
  if (state.registering !== f.relative_path) return '';
  return `<div class="file-link">
    <div class="file-link-head">どの測定が生み出したデータですか</div>
    ${measurementsOnHand().map(m => `<button class="link-pick" data-register-with="${esc(f.relative_path)}" data-measurement="${esc(m.id)}">
      <span class="rel-plus" aria-hidden="true">＋</span><span class="type">${esc(TYPE_LABEL.measurement)}</span><span class="rel-title">${esc(m.title)}</span>
    </button>`).join('')}
    <button class="link-skip" data-register-with="${esc(f.relative_path)}" data-measurement="">つなげずに登録する</button>
  </div>`;
}

// Only the day. The hour a button was pressed says nothing about when the
// measurement ran, so showing it would be precision the value does not have.
function fmtDay(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

function fileRowHtml(f) {
  const share = f.shared
    ? `<button class="btn small primary" data-share-path="${esc(f.relative_path)}" data-share="false" title="共有をやめる">共有中</button>`
    : `<button class="btn small" data-share-path="${esc(f.relative_path)}" data-share="true" title="先頭4KBまでをAIに渡します">中身を見せる</button>`;
  // Registering twice hands back the object that is already there, so the row
  // says what happened to the file and offers a way to it instead.
  const register = f.asset_id
    ? `<button class="btn small" data-open-asset="${esc(f.asset_id)}" title="登録済みです">データを見る</button>`
    : `<button class="btn small${state.registering === f.relative_path ? ' primary' : ''}" data-register-path="${esc(f.relative_path)}">データとして登録</button>`;
  return `<div class="file-entry"><div class="file ${f.shared ? 'shared' : ''}">
    <div class="file-name" title="${esc(f.relative_path)}">${esc(f.relative_path)}</div>
    <div class="file-meta">${fmtSize(f.size_bytes)}</div>
    ${share}
    ${register}
  </div>${registerPickerHtml(f)}</div>`;
}

function filesHtml() {
  const shared = state.files.filter(f => f.shared).length;
  // The promise is about what the researcher has chosen, so say which files
  // those are rather than claiming nothing is ever sent.
  const note = shared
    ? `本文が送られるのは、共有中の${shared}件だけです。それぞれ先頭4KBまでを抜粋して渡します。`
    : '一覧はファイル名と基本メタデータだけです。本文は、共有したファイルに限って送られます。';
  return `<div class="page-title"><h1>ファイル</h1><button class="btn small" id="scanFiles">再スキャン</button></div>
    <div class="muted page-note">${note}</div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    ${state.files.length
      ? `<div class="files">${state.files.map(fileRowHtml).join('')}</div>`
      : '<div class="empty">「再スキャン」で研究フォルダを確認します。</div>'}`;
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
    <div class="chat-compose"><textarea id="chatInput" class="input" placeholder="研究について話す…（Ctrl+K）">${esc(state.draft)}</textarea>${state.error ? `<div class="error">${esc(state.error)}</div>`:''}<div class="compose-actions"><div class="privacy">本文を送るのは共有したファイルだけです</div><button class="btn primary" id="sendBtn"${state.pending ? ' disabled' : ''}>${state.pending ? '応答待ち…' : '送信'}</button></div></div>`;
}

function claudeSectionHtml(agent) {
  const claude = agent.claude || {};
  const body = claude.available
    ? `<div class="connection-ok"><strong>利用可能</strong><div class="muted">${esc(claude.version || 'claude')}</div></div>`
    : `<div class="error">Claude Codeが見つかりません: ${esc(claude.error || 'unknown error')}</div>
       <div class="muted settings-note">claudeコマンドをインストールして、rescicleを再起動してください。</div>`;
  return `<div class="settings-section"><h3>Claude Code</h3>${body}
    <div class="actions"><button class="btn small" id="refreshAgent">状態を更新</button></div>
    <div class="muted settings-note">画面のチャットは、すでにログイン済みのClaude Codeをローカルで実行して応答します。APIキーは不要です。研究フォルダをAIの作業ディレクトリにはせず、会話・研究オブジェクトの要約・ファイル名/サイズ/更新日時を渡します。ファイル本文が渡るのは、ファイル画面であなたが「中身を見せる」を押したものだけで、先頭4KBまでの抜粋です。</div>
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
    state.currentType = b.dataset.nav; state.query = ""; state.selectedObjectId = null; state.selectedObject = null; state.linking = null; state.registering = null; state.error = null;
    try {
      if (state.currentType === 'files' && !state.files.length) state.files = await api.scanFiles(state.workspace.project.id);
    } catch (e) {
      // A throw here used to skip the redraw entirely, so a failing scan made
      // the sidebar look dead: the click had already moved the state, and
      // nothing on screen ever caught up with it.
      state.error = errText(e);
    }
    render();
  }));
  document.querySelectorAll('[data-object-id]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    const id = el.dataset.objectId;
    state.linking = null;
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
  document.querySelectorAll('[data-relation-status]').forEach(b => b.addEventListener('click', async (event) => {
    // The row itself navigates, so the button has to keep the click.
    event.stopPropagation();
    state.workspace = await api.setRelationStatus(b.dataset.relationId, b.dataset.relationStatus);
    if (state.selectedObjectId) await loadSelected(state.selectedObjectId);
    else render();
  }));
  document.querySelectorAll('[data-performed]').forEach(b => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = b.dataset.targetId;
    state.error = null;
    try {
      await api.setMeasurementPerformed(id, b.dataset.performed === 'true');
      await refreshWorkspace();
      if (state.selectedObject && state.selectedObject.id === id) await loadSelected(id);
      else render();
    } catch (e) {
      state.error = errText(e);
      render();
    }
  }));
  document.querySelectorAll('[data-relation-drop]').forEach(b => b.addEventListener('click', async (event) => {
    // The row itself navigates, so the button has to keep the click.
    event.stopPropagation();
    state.error = null;
    try {
      state.workspace = await api.deleteRelation(b.dataset.relationDrop);
      if (state.selectedObjectId) await loadSelected(state.selectedObjectId);
      else render();
    } catch (e) {
      state.error = errText(e);
      render();
    }
  }));
  document.querySelectorAll('[data-link-toggle]').forEach(b => b.addEventListener('click', event => {
    event.stopPropagation();
    const id = b.dataset.linkToggle;
    state.linking = state.linking === id ? null : id;
    state.error = null;
    render();
  }));
  document.querySelectorAll('[data-link-add]').forEach(row => row.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = state.selectedObject?.id;
    if (!id) return;
    state.error = null;
    try {
      // Which end this object is on was settled when the slot was built; the
      // Rust side takes a subject and an object, not a direction.
      const other = row.dataset.linkAdd;
      const [subjectId, objectId] = row.dataset.linkSubject === 'self' ? [id, other] : [other, id];
      state.workspace = await api.createRelation(state.workspace.project.id, subjectId, row.dataset.linkPredicate, objectId);
      // The link is drawn and is now a row of its own. Leaving the picker open
      // over it would hide the one thing the click was for.
      state.linking = null;
      await loadSelected(id);
    } catch (e) {
      state.error = errText(e);
      render();
    }
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
  document.querySelectorAll('[data-share-path]').forEach(b => b.addEventListener('click', async () => {
    state.error = null;
    try {
      await api.setFileShared(state.workspace.project.id, b.dataset.sharePath, b.dataset.share === 'true');
      state.files = await api.scanFiles(state.workspace.project.id);
    } catch (e) {
      // Without this a refusal from the Rust side looked like a dead button.
      state.error = errText(e);
    }
    render();
  }));
  document.querySelectorAll('[data-register-path]').forEach(b => b.addEventListener('click', async () => {
    const path = b.dataset.registerPath;
    // With no measurement to point at there is nothing to ask, so asking would
    // only be a step to dismiss.
    if (!measurementsOnHand().length) { await registerFile(path, null); return; }
    state.registering = state.registering === path ? null : path;
    state.error = null;
    render();
  }));
  document.querySelectorAll('[data-register-with]').forEach(b => b.addEventListener('click', () =>
    registerFile(b.dataset.registerWith, b.dataset.measurement || null)));
  document.querySelectorAll('[data-open-asset]').forEach(b => b.addEventListener('click', () => {
    state.currentType = 'asset'; state.query = ''; state.linking = null; state.registering = null; state.error = null;
    loadSelected(b.dataset.openAsset);
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
// Registering and linking are two writes, and the second one can only be the
// chain's single edge into an asset, so there is no predicate to choose here
// either. A refusal from the Rust side has to reach the page: the file list is
// redrawn from the scan, not from what the button assumed happened.
async function registerFile(relativePath, measurementId) {
  state.error = null;
  try {
    const projectId = state.workspace.project.id;
    const asset = await api.registerAsset(projectId, relativePath);
    if (measurementId) state.workspace = await api.createRelation(projectId, measurementId, 'produces', asset.id);
    else await refreshWorkspace();
    state.files = await api.scanFiles(projectId);
    state.registering = null;
  } catch (e) {
    state.error = errText(e);
  }
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
