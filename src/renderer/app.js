const api = window.rescicle;
const root = document.getElementById('app');

// Every user-facing label is Japanese; the English keys stay as the domain
// vocabulary in the database and in src-tauri/src/domain.rs.
const TYPE_LABEL = {
  question: '問い',
  hypothesis: '仮説',
  prediction: '予測',
  measurement: '測定',
  asset: 'データ'
};
const STATUS_LABEL = { proposed: '提案中', confirmed: '確定', rejected: '却下' };
// There used to be a note type here, with 未整理 / 残す / 不要 standing in for the
// three states because 確定 and 却下 are not things you do to a remark. Renaming
// them was the tell: a remark is not a claim and does not need deciding, and it
// is not an object either -- it belongs to the one thing it is about, which is a
// column on that thing rather than a row joined to it.
const statusLabel = o => STATUS_LABEL[o.status] || o.status;
// Only the two that are ever shown. `system` is in the domain's origins and on
// rows written before register_asset was told who was registering, but the card
// suppresses it -- it names neither the researcher nor the agent, so it says
// nothing -- and a label for a case that never renders tells the next reader
// there is a third kind of origin to think about. 測定機器 and インポート were
// here too, for values nothing in the codebase has ever written.
const ORIGIN_LABEL = { researcher: '研究者', agent: 'AI提案' };
// Two words for saying no, and one meaning each.
//
//   やめる  -- abandon something already started, or decline the thing being
//             asked about right now. The picker closes, the rename is dropped,
//             the deletion does not happen.
//   あとで  -- an offer that stands on its own is not being taken up now. The
//             registration can still be done, the measurement can still be
//             picked; nothing is being cancelled because nothing was started.
//
// There were four, and あとで and あとにする were nearly the same word for two
// different meanings, which is the worst of the ways to have too many.
//
// 閉じる is neither: it dismisses something that has already happened.
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

// Which screen lists a type. Only assets differ from their own name: a
// registered file and the file it points at are one thing to the researcher, so
// they are listed together and the pair has one place in the nav.
const LIST_SCREEN = { asset: 'data-files' };
const screenFor = (type) => LIST_SCREEN[type] || type;

const PREDICATE_LABEL = {
  addresses: '問いに答える', predicts: '予測する', tested_by: '検証される', produces: '生み出す', references: '参照する', related_to: '関連する'
};

let state = {
  bootstrap: null,
  workspace: null,
  // Which screen the centre column is showing. It held a type once, with
  // 'map' and 'data-files' sitting in it pretending to be types, which is why
  // screenFor() had to exist to translate one back.
  currentScreen: 'map',
  // Non-empty replaces the centre column with results across every type.
  query: '',
  selectedObjectId: null,
  selectedObject: null,
  // The object whose link picker is open, if any. Nothing is half-entered while
  // it is open -- picking is the whole act -- so this is all there is to keep.
  linking: null,
  // What the last register did, kept until the researcher moves on. The row it
  // happened to is easy to lose among the others.
  fileNotice: null,
  // The object the last reject threw away, and until when it can be taken back.
  // REJECTED_GRACE_SECS in src-tauri/src/db.rs is the same window on the side
  // that does the deleting.
  rejectedNotice: null,
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
  // What is being typed on the first screen: the research, which becomes the
  // first message and the name.
  onboardingText: '',
  // Whether to raise the Claude Code offer beside the work. Decided once, when
  // the project is made, so it cannot appear later over a machine that is set up.
  connectOffer: false,
  // What Claude Code has registered under `rescicle`, read back when the AI
  // connection screen opens. Null until that answer arrives.
  mcp: null,
  mcpBusy: false,
  mcpNotice: null,
  // True between pressing すべて消す and answering the confirmation.
  clearing: false,
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
  state.clearing = false;
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
  // Asked here, on a first run only, so that the answer is in hand by the time
  // the folder has been chosen. Asking after that would put the CLI's second or
  // two in front of a researcher who has just pressed a button.
  if (!state.workspace) loadMcpStatus();
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

// Somewhere to start from, for the researcher who knows their research far too
// well to answer "tell me about it". Each one is a corner of it, small enough to
// begin in the middle of.
const STARTERS = [
  '最近うまくいっていない実験について話したい',
  '次にやる測定を決めたい',
  '頭の中にある仮説を書き出したい',
];

// The first screen asks what the research is about, not where its files are.
// Asking for a folder first made rescicle introduce itself as a file tool --
// which is how the first user read it, and the first thing they asked for was
// bulk file registration. The folder is a thing the conversation never needs;
// it is asked for when there is a file to do something with.
//
// What is typed here is the first message as well as the name, so the app has
// answered once before it has finished being set up.
function onboardingHtml() {
  const text = state.onboardingText || '';
  return `<div class="onboarding"><div class="onboarding-card">
    <div class="brand">rescicle</div>
    <h1>いま、何を調べていますか</h1>
    <div class="muted">そのまま書いてください。話すうちに、問い・仮説・予測・測定が「もの」として現れます。出てきたものは一つずつ確かめられます。</div>
    <div class="field"><textarea id="researchText" class="input onboarding-text" placeholder="例: 浅いNV中心のT2を律速しているものが分からない。表面の吸着分子が怪しいと思っている。">${esc(text)}</textarea></div>
    <div class="starters"><div class="muted starters-head">書き出しに迷ったら</div>
      ${STARTERS.map(s => `<button class="starter" data-starter="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    <div class="actions"><button class="btn primary" id="startResearch"${text.trim() && !state.pending ? '' : ' disabled'}>${state.pending ? '考えています…' : 'はじめる'}</button></div>
  </div></div>`;
}

// Registering with Claude Code is about the machine, not the project, so it is
// worth offering once -- and only while there is still something to register.
// It is an offer in the notice slot rather than a screen of its own: it is
// optional, the conversation does not go through it, and a step between the
// question and the answer is a step in front of the thing they came for.
function mcpNeedsSetup() {
  const available = !!state.bootstrap?.agent?.claude?.available;
  // Before the answer is back, and when the CLI is missing, there is nothing
  // useful to offer here.
  if (!available || !state.mcp?.checked) return false;
  return !state.mcp.registered || state.mcp.stale;
}

// The conversation is the primary path and it does not come through here, so
// this step can always be walked past.
// Offered once, beside the work rather than in front of it, and only to a
// machine that still needs it. It is raised while the first turn is already
// running, so answering it costs nothing that was being waited for.
function connectNoticeHtml() {
  if (!state.connectOffer) return '';
  if (state.mcp?.registered && !state.mcp?.stale) {
    return `<div class="notice"><span>Claude Codeに追加しました。すでに開いているClaude Codeには、開き直すまで反映されません。</span>
      <button class="btn small" id="dismissConnect">閉じる</button></div>`;
  }
  if (!mcpNeedsSetup()) return '';
  return `<div class="notice"><span>Claude Code側からもrescicleを読み書きできます。追加はこの端末で一度だけ、会話するだけなら要りません。</span>
    <button class="btn small" id="registerMcp"${state.mcpBusy ? ' disabled' : ''}>${state.mcpBusy ? '追加しています…' : '追加する'}</button>
    <button class="btn small" id="dismissConnect">あとで</button></div>`;
}

function workspaceHtml() {
  const w = state.workspace;
  return `<div class="shell">
    <header class="topbar"><div class="brand">rescicle</div>${projectTitleHtml()}${w.project.root_path ? `<div class="root-hint" title="${esc(w.project.root_path)}">${esc(w.project.root_path)}</div>` : '<div class="root-hint"></div>'}<button class="btn small" id="settingsBtn">設定</button></header>
    <div class="layout">
      <aside class="sidebar">${sidebarHtml()}</aside>
      <main class="content"><div class="content-inner${wideScreen() ? ' wide' : ''}">${noticeHtml()}${contentHtml()}</div></main>
      <aside class="chat">${chatHtml()}</aside>
    </div>
    ${state.modal === 'settings' ? settingsModalHtml() : ''}
  </div>`;
}

function sidebarHtml() {
  // Counted the way the map draws it: rejected objects are off the map, so
  // counting them here made the sidebar and the map disagree with no
  // explanation. They are off the lists too now, and on their way out of the
  // database, so the count is of what is there.
  const counts = {};
  for (const o of state.workspace.objects || []) {
    if (o.status === 'rejected') continue;
    counts[o.type] = (counts[o.type] || 0) + 1;
  }
  // データ takes the files' place in the nav rather than sitting beside it: one
  // screen lists both. It carries no count, because the row names two
  // collections and one number cannot say which of them it counted -- it was
  // counting the データ, and read as counting the folder. Both counts are on the
  // screen itself, on the headings they belong to.
  const nav = [
    ['map', 'マップ', ''],
    ...Object.entries(TYPE_LABEL).map(([k, label]) =>
      k === 'asset' ? ['data-files', 'データ・ファイル', ''] : [k, label, counts[k] || 0]),
  ];
  return `<div class="search-box"><input id="searchInput" class="input" type="search" placeholder="検索（Ctrl+F）" value="${esc(state.query)}"></div>
    <div class="nav-title">研究オブジェクト</div>${nav.map(([id,label,count]) => `<button class="nav-btn ${state.currentScreen===id?'active':''}" data-nav="${id}"><span>${esc(label)}</span><span class="count">${count}</span></button>`).join('')}`;
}

// The two screens that are not cards and prose: the map, which is as wide as
// the chain is long, and the data and file lists, which are two columns. A
// search is cards wherever it was run from, so it reads at the narrow measure
// like every other list.
function wideScreen() {
  if (state.query.trim()) return false;
  return state.currentScreen === 'map' || state.currentScreen === 'data-files';
}

function contentHtml() {
  if (state.query.trim()) return searchHtml();
  if (state.currentScreen === 'map') return mapHtml();
  if (state.currentScreen === 'data-files') return dataFilesHtml();
  return objectListHtml(state.currentScreen);
}

function noticeHtml() {
  const root = state.rootNotice
    ? `<div class="notice"><span>${esc(state.rootNotice)}</span><button class="btn small" id="dismissNotice">閉じる</button></div>`
    : '';
  return root + connectNoticeHtml() + rejectedNoticeHtml();
}

// Rejecting deletes, so the one thing owed back is the few minutes in which a
// misplaced press is still a press the researcher remembers making. It sits in
// the notice slot rather than on the list it left, because the press comes from
// the detail view and from search just as often.
function rejectedNoticeHtml() {
  const notice = state.rejectedNotice;
  if (!notice || Date.now() >= notice.until) return '';
  const name = `「${esc(notice.title)}」`;
  const said = notice.type === 'asset'
    ? `${name}の登録を取り消しました。ファイルはフォルダにそのまま残ります。`
    : `${name}を却下しました。`;
  // Back to where it was, which is not the same place for everything: a
  // registered file was never proposed, so proposed is not a state to return it
  // to.
  const back = notice.type === 'asset' ? 'confirmed' : 'proposed';
  const left = Math.max(1, Math.ceil((notice.until - Date.now()) / 60000));
  return `<div class="notice"><span>${said}あと約${left}分は戻せます。そのあと削除されます。</span>
    <button class="btn small" data-status="${back}" data-target-id="${esc(notice.id)}">戻す</button></div>`;
}

function projectTitleHtml() {
  const name = state.workspace.project.name;
  if (!state.renaming) {
    return `<button class="project-title" id="renameProject" title="クリックして研究名を変更">${esc(name)}</button>`;
  }
  return `<div class="project-title renaming">
    <input id="projectNameInput" class="input project-name-input" value="${esc(state.renameDraft ?? name)}">
    <button class="btn primary small" id="saveProjectName">保存</button>
    <button class="btn small" id="cancelProjectName">やめる</button>
    ${state.renameError ? `<span class="error rename-error">${esc(state.renameError)}</span>` : ''}
  </div>`;
}

// The map page is the chain and nothing else. Notes sit outside the chain that
// allowed_relation() permits, so they were listed underneath it, but a section
// whose reason to exist is "the picture above cannot show these" earns its space
// on the page it belongs to instead: the sidebar already has one.
function mapHtml() {
  const g = buildMap(state.workspace.objects || [], state.workspace.relations || []);
  return `<div class="page-title"><h1>${esc(state.workspace.project.name)}</h1></div>
    <div class="muted page-note">問い → 仮説 → 予測 → 測定 → データ のつながりです。右側のAIと話すと、ここが育っていきます。</div>
    ${mapFigureHtml(g)}
    ${state.selectedObject && CHAIN.includes(state.selectedObject.type)
      // Sticks to the bottom of the column while the map is taller than the
      // viewport. Sitting in the flow under the map meant that with twenty
      // hypotheses the detail opened a thousand pixels below the fold, so
      // clicking a node looked like it had done nothing at all.
      //
      // As wide as the map and no wider. The map is as wide as the chain is
      // long -- three columns of it is 600px on a 1020px page -- so a panel
      // sized to the page stands out past the thing it belongs to, and one
      // sized to the reading measure falls short of a full chain. It takes the
      // map's own width, with a floor so a one-column map does not squeeze it.
      ? `<div class="map-detail" style="max-width:${Math.max(g.width, 520)}px">${cardHtml(state.selectedObject, { pinned: true })}</div>`
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
  // below and the curves in mapFigureHtml() need the left-hand end to really be on
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

function mapFigureHtml(g) {
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
      ${o.performed ? `<text class="map-done" x="${x + MAP.W - MAP.PAD}" y="${y + 17}">実施済み</text>` : ''}
      ${wrapTitle(o.title).map((line, i) => `<text class="map-title" x="${x + MAP.PAD}" y="${y + 36 + i * MAP.LINE}">${esc(line)}</text>`).join('')}
    </g>`).join('');
  return `<div class="map-scroll"><svg class="map" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${edges}${heads}${nodes}</svg></div>
    <div class="map-legend"><span>実線 = 確定</span><span>破線 = 提案中（AI提案）</span><span>ノードをクリックすると詳細が開きます</span></div>`;
}

// Searches across every type at once, including rejected objects -- and since
// the lists stopped carrying those, this is the way back to one. The reason to
// go looking for something is often that it is no longer where you expect it.
// Results keep the chain's order, so a question comes before the hypotheses
// under it rather than whatever order they were last touched in.
function searchHtml() {
  const needle = state.query.trim().toLowerCase();
  const order = new Map(CHAIN.map((type, i) => [type, i]));
  const hits = (state.workspace.objects || [])
    .filter(o => `${o.title} ${o.body || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99));
  return `<div class="page-title"><h1>検索</h1><span class="muted">「${esc(state.query.trim())}」に ${hits.length}件</span></div>${
    hits.length
      ? `<div class="object-grid">${hits.map(o => cardHtml(o)).join('')}</div>`
      : '<div class="empty">一致する研究オブジェクトはありません。</div>'}`;
}

// Rejecting something is throwing it away, so the list stops carrying it. It
// used to sit at the bottom under its own heading, which gave discarded work a
// permanent place on a screen the researcher reads to see where the research is.
// Nothing offers to put it back: wanting it again is a reason to say so and have
// it made again, which is the same way back a removed relation has.
//
// The record is kept rather than deleted, for the agent rather than the screen.
// It is told not to propose again what has been thrown away, and it can only be
// told that about something it can still see.
function objectListHtml(type) {
  const label = TYPE_LABEL[type] || type;
  const live = (state.workspace.objects || []).filter(o => o.type === type && o.status !== 'rejected');
  const body = live.length
    ? `<div class="object-grid">${live.map(o => cardHtml(o)).join('')}</div>`
    : `<div class="empty">まだ${esc(label)}はありません。右側で研究について話してみてください。</div>`;
  return `<div class="page-title"><h1>${esc(label)}</h1></div>${body}`;
}

// A decision has to be reversible. Rejecting something used to remove the only
// buttons it had, so a researcher who changed their mind had no way back except
// asking the agent to undo it. Deciding again goes through `proposed` rather
// than flipping straight over: re-deciding is a decision too.
// Deciding to run a measurement and having run it are different things, so the
// pill sits next to the status rather than replacing it: 確定・未実施 is the
// ordinary state of a measurement and has to be one thing the card can say.
//
// Run and run-on-a-known-date are different again. Most of the time the date is
// not known -- saying so is honest, and better than showing the day somebody
// pressed a button as though it were the day of the measurement.
function performedPillHtml(o) {
  if (o.type !== 'measurement') return '';
  if (!o.performed) return '<span class="pill">未実施</span>';
  return o.performed_at
    ? `<span class="pill done" title="このデータファイルの更新日時です">実施済み ${esc(fmtDay(o.performed_at))}</span>`
    : '<span class="pill done">実施済み</span>';
}

function performedButtonHtml(o) {
  if (o.type !== 'measurement') return '';
  return `<button class="btn small" data-performed="${o.performed ? 'false' : 'true'}" data-target-id="${o.id}" title="${o.performed ? 'まだ実施していないことにする' : '実施したことにする'}">${o.performed ? '未実施に戻す' : '実施した'}</button>`;
}

function statusButtonsHtml(o) {
  // An asset is not a claim waiting to be decided on. Registering the file was
  // the decision, and nothing reads a proposed asset differently, so 提案中に戻す
  // was a verb the object does not have -- the press changed a pill and left the
  // file registered. The one decision left is whether it stays registered, and
  // that is 却下: the record goes, the file on disk does not.
  if (o.type === 'asset') {
    return `<button class="btn danger small" data-status="rejected" data-target-id="${o.id}" title="ファイルはそのまま、研究の記録から外します">登録を取り消す</button>`;
  }
  if (o.status === 'proposed') {
    return `<button class="btn primary small" data-status="confirmed" data-target-id="${o.id}">確定</button><button class="btn danger small" data-status="rejected" data-target-id="${o.id}">却下</button>`;
  }
  return `<button class="btn small" data-status="proposed" data-target-id="${o.id}">提案中に戻す</button>`;
}

// `fileLine` replaces the type label for a registered file. Where the card is
// listed under データ the type is already said by the heading, and what the card
// cannot otherwise say is which file it is: two runs under different folders
// share a name, and the title is only the name.
function cardHtml(o, { pinned = false, extraActions = '', fileLine = null } = {}) {
  const open = state.selectedObjectId === o.id;
  // getObject() carries the relations, and it lands one render later than the click.
  const full = open && state.selectedObject?.id === o.id ? state.selectedObject : null;
  // Only the summary row toggles. Clicking inside an open card -- or anywhere on the
  // panel the map drives, which `pinned` marks -- must not dismiss what you opened.
  const row = pinned
    ? '<div class="card-row">'
    : `<div class="card-row clickable" data-object-id="${o.id}" data-object-type="${esc(o.type)}">`;
  const head = fileLine !== null
    ? `<div class="card-file" title="${fileLine}">${fileLine}</div>`
    : `<div class="type">${esc(TYPE_LABEL[o.type] || o.type)}</div>`;
  // A registered file has one state worth naming and it is named by being in the
  // list at all, so the 確定 pill would be a decision nobody made.
  const status = o.type === 'asset' ? '' : `<span class="pill ${o.status}">${esc(statusLabel(o))}</span>`;
  // Who it came from, where that is worth saying.
  //
  // On a hypothesis it is about the research: whose idea it was is a fact about
  // the thinking, and 研究者 and AI提案 are both worth reading.
  //
  // On a registered file it is bookkeeping. 研究者 there says only that the
  // researcher pressed the button they are looking at the result of, which they
  // knew. AI提案 is the one that carries anything -- something is in the record
  // that they did not put there -- so that is the one that speaks.
  //
  // `system` is what register_asset wrote before it was told who was
  // registering. It names neither of them, so it says nothing at all.
  const quiet = o.origin === 'system' || (o.type === 'asset' && o.origin !== 'agent');
  const origin = quiet
    ? ''
    : `<span class="pill ${o.origin === 'agent' ? 'agent' : ''}">${esc(ORIGIN_LABEL[o.origin] || o.origin)}</span>`;
  // On the map, what a node is for is being looked at, and the move that follows
  // is talking about it. Deciding a claim stays -- confirming what the agent
  // proposed is the loop the map is the front of -- but administering a record
  // does not: 登録を取り消す on an asset is bookkeeping, and the map is not where
  // the books are kept. The list the object lives on still has it.
  const actions = pinned
    ? `<button class="btn small primary" id="talkAbout">これについて話す</button>${o.type === 'asset' ? '' : performedButtonHtml(o) + statusButtonsHtml(o)}`
    : `${extraActions}${performedButtonHtml(o)}${statusButtonsHtml(o)}`;
  return `<div class="card ${open ? 'open' : ''} ${o.status}">${row}<div class="card-main">${head}<div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}${o.note ? `<div class="card-note">${esc(o.note)}</div>`:''}<div class="pills">${status}${origin}${performedPillHtml(o)}</div></div><div class="card-actions">${actions}</div></div>${full ? expansionHtml(full) : ''}</div>`;
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
    if (r.status === 'rejected') return `<button class="btn small" data-relation-status="proposed" data-relation-id="${r.id}" title="このつながりを提案中に戻す">提案中に戻す</button>${drop}`;
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
  const chained = ends;
  const upstream = chained
    .filter(e => (rank.get(e.type) ?? 99) < mine)
    .map(e => relRow(e.r, e.id, e.title, e.type, 'up'));
  const downstream = chained
    .filter(e => (rank.get(e.type) ?? 99) >= mine)
    .map(e => relRow(e.r, e.id, e.title, e.type, 'down'));
  // Drawing a link is rare next to reading what is already there, so at rest it
  // is one faint line under the map and the card looks as it always did. Opened,
  // the candidates fall into the column the finished link would land in, because
  // position is what says which way the chain runs.
  const slots = linkSlots(o, chained);
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
  // ＋つなぐ draws the chain and nothing else now: a remark used to go through it
  // too, which said writing something down was structural work.
  const link = slots.length
    ? `<button class="link-add${picking ? ' open' : ''}" data-link-toggle="${esc(o.id)}">${picking ? 'やめる' : '＋ つなぐ'}</button>`
    : '';

  return `<div class="card-expand">
    <div class="expand-head">つながり</div>${graph}${link}
    ${o.type==='asset' && o.asset ? `<div class="expand-head">ローカルファイル</div><div class="card-body">${esc(o.asset.relative_path)}
${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div>` : ''}
  </div>`;
}

// Registering a file makes a Research Object, and one that nothing points at
// floats off the end of the map -- which is where the first four ended up. The
// chain allows exactly one link into an asset, measurement produces asset, so
// the measurement is worth asking about while the file is in front of the
// researcher rather than leaving it to be found from the other side later.
//
// It is asked after the file is registered, not before. Asking first made the
// press do nothing on its own: the picker opened, and anyone who read the button
// as "register this" and walked away had registered nothing at all. That is what
// happened to the first user -- five measurements on hand, so every press opened
// a question, and the データ list stayed empty. The press now does what it says,
// and the link is an offer on top of a thing that already exists.
function measurementsOnHand() {
  return (state.workspace.objects || []).filter(o => o.type === 'measurement' && o.status !== 'rejected');
}

// Only the day. A file's modification time is good to the second, but the
// measurement it came out of is not, so the rest of it would be precision the
// value does not have.
function fmtDay(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

// The folder it is in, not the path: the card's title is already the file name,
// so the whole path put the name on screen twice and buried the one part of it
// that tells two runs of the same name apart.
function fileLineHtml(f) {
  const cut = Math.max(f.relative_path.lastIndexOf('/'), f.relative_path.lastIndexOf('\\'));
  const folder = cut > 0 ? f.relative_path.slice(0, cut) : '';
  return `${folder ? `${esc(folder)} · ` : ''}${fmtSize(f.size_bytes)}${f.read ? ' · 読み込み済み' : ''}`;
}

// Whether the agent has read this file. It is a record of something that
// happened, not a switch: there is nothing here to turn on or off, which is why
// it is text and not a button.
function readMarkHtml(f) {
  return f.read ? '<div class="file-meta read-mark" title="AIがこのファイルを読みました">読み込み済み</div>' : '<div class="file-meta"></div>';
}

function fileRowHtml(f) {
  return `<div class="file-entry"><div class="file">
    <div class="file-name" title="${esc(f.relative_path)}">${esc(f.relative_path)}</div>
    <div class="file-meta">${fmtSize(f.size_bytes)}</div>
    ${readMarkHtml(f)}
    <button class="btn small" data-register-path="${esc(f.relative_path)}" title="研究のデータとして記録します">データとして登録</button>
  </div></div>`;
}

// Registering used to change a label three rows down and nothing else, which
// reads as nothing having happened. This says what happened, in the words of
// what was pressed, offers the object it made, and -- while the answer is still
// worth having -- asks the one question the chain leaves open about it.
function fileNoticeHtml() {
  const notice = state.fileNotice;
  if (!notice) return '';
  // The app's one notice look, not a second one: white with a thin border and a
  // button at the right end is exactly what a file row and a card look like, so
  // the notice read as another row in the list it was sitting on top of.
  const done = `<div class="notice"><span>${esc(notice.path)} — ${notice.measurement
    ? `「${esc(notice.measurement)}」が生み出したデータとして登録しました。`
    : 'データとして登録しました。'}</span>
    <button class="btn small" data-open-asset="${esc(notice.assetId)}">開く</button></div>`;
  const measurements = measurementsOnHand();
  if (notice.measurement || !measurements.length) return done;
  // Same picking as a chain link in a card: the pair of types fixes the
  // predicate, so the measurement is the whole choice.
  return `${done}<div class="file-link">
    <div class="file-link-head">どの測定が生み出したデータですか</div>
    ${measurements.map(m => `<button class="link-pick" data-link-asset="${esc(notice.assetId)}" data-measurement="${esc(m.id)}">
      <span class="rel-plus" aria-hidden="true">＋</span><span class="type">${esc(TYPE_LABEL.measurement)}</span><span class="rel-title">${esc(m.title)}</span>
    </button>`).join('')}
    <button class="link-skip" id="dismissFileNotice">あとで</button>
  </div>`;
}

// One screen for both, because they are one thing to the researcher: a file
// they have, which either is part of the research record or is not yet. Two
// lists made that a mapping to hold in your head, and the データ list was the
// one that could be looked at without ever seeing how anything got into it.
//
// Registered first. A research folder holds hundreds of files and a handful of
// them are the data, so a single flat list would lose the research to the noise
// of everything sitting next to it.
function dataFilesHtml() {
  const assets = new Map(
    (state.workspace.objects || [])
      .filter(o => o.type === 'asset' && o.status !== 'rejected')
      .map(o => [o.id, o]),
  );
  const registered = [];
  const plain = [];
  for (const f of state.files) {
    const asset = f.asset_id && assets.get(f.asset_id);
    if (asset) { registered.push([f, asset]); assets.delete(f.asset_id); }
    else plain.push(f);
  }
  // Whatever object is left over has no file under it any more: registered once,
  // then moved, renamed or deleted outside rescicle. Saying so beats dropping it
  // off the screen, which is how it would go unnoticed.
  const orphaned = [...assets.values()];
  const readCount = state.files.filter(f => f.read).length;

  // `action` is for a verb that belongs to one collection rather than to the
  // screen. 再スキャン is one: it re-reads the folder, and the データ beside it
  // are in the database and do not change when it runs.
  const group = (title, count, body, action = '') =>
    `<section class="section"><div class="section-head"><h2>${title}</h2><span class="muted">${count}件</span>${action}</div>${body}</section>`;

  // Side by side rather than stacked. A folder holds hundreds of files and a
  // handful of them are the data, so stacking put the research above a list long
  // enough to push it off the screen -- and whichever went second was the one
  // nobody scrolled to. In a column each, the data stays in view while the
  // folder is read. .file-columns collapses back to one column when the window
  // is too narrow to give each of them a readable width.
  // The notice goes in the column, not above both of them. It is about a file
  // that has just become data, so it belongs over the データ it joined -- and it
  // then takes that column's width, instead of being cut off at the reading
  // width while the columns beside it ran wider and nothing lined up.
  const dataColumn = `${fileNoticeHtml()}${registered.length
      ? group('データ', registered.length,
          `<div class="object-grid">${registered.map(([f, asset]) => cardHtml(asset, {
            fileLine: fileLineHtml(f),
          })).join('')}</div>`)
      : '<div class="empty">まだデータはありません。フォルダのファイルから登録できます。</div>'}
    ${orphaned.length
      ? group('ファイルが見つからないデータ', orphaned.length,
          `<div class="muted settings-note">登録したあとに、rescicleの外で移動・改名・削除されたようです。</div>
           <div class="object-grid">${orphaned.map(o => cardHtml(o, { fileLine: 'ファイルが見つかりません' })).join('')}</div>`)
      : ''}`;

  // The path belongs to this column and not to the screen. データ on the other
  // side is research objects, which are in the database and stay there whichever
  // folder is pointed at; only this list is a view of a folder. At the top of
  // the page it claimed the whole screen was that folder's, which is the
  // reading it invites and not a true one.
  const root = state.workspace?.project?.root_path || "";
  // A caption on the collection, not a row in it. Boxed it was the same shape as
  // a file row -- rounded rect, text at the left, button at the right -- so it
  // read as a file named C:\Users\... sitting at the top of the list.
  const folderBar = `<div class="folder-line">
    ${root
      ? `<span class="folder-line-path" title="${esc(root)}">${esc(root)}</span>`
      : '<span class="folder-line-path">研究フォルダはまだ選ばれていません</span>'}
    <button class="link-add" id="changeRootHere">${root ? "別のフォルダに変更" : "研究フォルダを選ぶ"}</button>
  </div>`;
  const folderBody = !root
    ? '<div class="empty">研究フォルダを選ぶと、その中のファイルがここに並びます。</div>'
    : plain.length
      ? `<div class="files">${plain.map(fileRowHtml).join("")}</div>`
      // Nothing to do is not worth a box the size of a list. One line says it.
      : state.files.length
        ? '<div class="muted settings-note">このフォルダのファイルはすべて登録済みです。</div>'
        : '<div class="empty">「再スキャン」でフォルダを確認します。</div>';
  const folderColumn = group(
    "フォルダ内のファイル",
    plain.length,
    folderBar + folderBody,
    root ? '<button class="btn small" id="scanFiles">再スキャン</button>' : '',
  );

  // Two columns are for when both sides have something to show. With one of them
  // empty the split just halves the width and puts an empty box in the other
  // half, so the one that has content takes the whole column.
  const columns = registered.length && plain.length ? 'file-columns' : 'file-columns one';

  return `<div class="page-title"><h1>データ・ファイル</h1></div>
    <div class="muted page-note">研究フォルダにあるファイルと、そのうちデータとして登録したものです。<strong>rescicleはファイルを読むだけです。</strong>書き換え・移動・コピー・削除はしません。</div>
    <div class="muted file-legend">
      <div><strong>データとして登録</strong> — そのファイルを研究のデータとして記録し、測定とつなげられるようにします。</div>
      <div>ファイルの中身は、AIが必要だと判断したときに読みます。研究フォルダの外は読めません。読んだファイルには「読み込み済み」が付きます。${readCount ? `いままでに${readCount}件を読みました。` : ''}</div>
    </div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    <div class="${columns}"><div>${dataColumn}</div><div>${folderColumn}</div></div>`;
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
    <div class="chat-compose"><textarea id="chatInput" class="input" placeholder="研究について話す…（Ctrl+K）">${esc(state.draft)}</textarea>${state.error ? `<div class="error">${esc(state.error)}</div>`:''}<div class="compose-actions"><div class="privacy">ファイルはAIが必要なときだけ読みます</div><button class="btn primary" id="sendBtn"${state.pending ? ' disabled' : ''}>${state.pending ? '応答待ち…' : '送信'}</button></div></div>`;
}

function claudeSectionHtml(agent) {
  const claude = agent.claude || {};
  const body = claude.available
    ? `<div class="connection-ok"><strong>利用可能</strong><div class="muted">${esc(claude.version || 'claude')}</div></div>`
    : `<div class="error">Claude Codeが見つかりません: ${esc(claude.error || 'unknown error')}</div>
       <div class="muted settings-note">claudeコマンドをインストールして、rescicleを再起動してください。</div>`;
  return `<div class="settings-section"><h3>Claude Code</h3>${body}
    <div class="actions"><button class="btn small" id="refreshAgent">状態を更新</button></div>
    <div class="muted settings-note">画面のチャットは、すでにログイン済みのClaude Codeをローカルで実行して応答します。APIキーは不要です。研究フォルダをAIの作業ディレクトリにはせず、会話・研究オブジェクトの要約・ファイル名/サイズ/更新日時を渡します。ファイルの中身は、AIが必要だと判断したものだけを、研究フォルダの内側から先頭4KBまで読みます。読んだファイルはファイル画面に記録されます。</div>
  </div>`;
}

// What Claude Code has registered, in the words the researcher needs to decide
// whether to press the button. A path that is not this build's is its own state:
// the registration looks fine from the terminal and cannot work, which is the
// one case where nothing on screen would otherwise say anything is wrong.
function mcpStateHtml() {
  const mcp = state.mcp;
  if (!mcp) return '<div class="muted settings-note">追加されているか確認しています…</div>';
  if (!mcp.checked) return `<div class="error">追加されているか確認できませんでした: ${esc(mcp.error || 'unknown error')}</div>`;
  if (!mcp.registered) return '<div class="muted settings-note">まだ追加されていません。</div>';
  if (mcp.stale) {
    return `<div class="error">別の場所のrescicleが追加されています。いまのrescicleに追加し直してください。</div>
      <div class="muted settings-note">追加されているパス: ${esc(mcp.command || '')}</div>`;
  }
  return `<div class="connection-ok"><strong>追加済み</strong><div class="muted">${esc(mcp.command || '')}</div></div>`;
}

function mcpSectionHtml(agent) {
  const available = !!(agent.claude || {}).available;
  const registered = state.mcp?.registered && !state.mcp?.stale;
  const label = state.mcpBusy ? '追加しています…' : registered ? '追加し直す' : 'Claude Codeに追加';
  return `<div class="settings-section"><h3>Claude Code側から操作する</h3>
    <div class="muted settings-note">rescicleをMCP serverとしてClaude Codeに追加すると、Claude Code側をUIにしてrescicleを操作できます。画面のチャットだけを使うなら、追加は要りません。</div>
    ${mcpStateHtml()}
    ${state.mcpNotice ? `<div class="muted settings-note">${esc(state.mcpNotice)}</div>` : ''}
    <div class="actions"><button class="btn small primary" id="registerMcp"${state.mcpBusy || !available ? ' disabled' : ''}>${esc(label)}</button></div>
    ${available ? '' : '<div class="muted settings-note">Claude Codeが見つからないあいだは追加できません。</div>'}
    <div class="muted settings-note">自分でターミナルから実行したい場合は、同じ内容のコマンドをコピーできます。</div>
    <button class="btn small settings-action" id="copyClaudeSetup">追加コマンドをコピー</button>
  </div>`;
}

// The path in the top bar was a button that looked like a label, and the one
// researcher who wanted this asked for it twice without ever finding it. The bar
// now only says where the research is; changing it lives here, where someone
// looking for a setting looks for one.
function folderSectionHtml() {
  const root = state.workspace?.project?.root_path || '';
  return `<div class="settings-section"><h3>研究フォルダ</h3>
    ${root
      ? `<div class="connection-ok"><div class="muted">${esc(root)}</div></div>
         <div class="actions"><button class="btn small" id="changeRoot">別のフォルダに変更</button></div>
         <div class="muted settings-note">rescicleはファイルを読むだけなので、変更してもどちらのフォルダの中身も動きません。登録済みのデータが新しいフォルダに見つからないときは、その件数をお知らせします。</div>`
      : `<div class="muted settings-note">選ぶと、その中のファイルをデータとして登録できるようになります。rescicleはファイルを読むだけで、書き換えも移動もしません。</div>
         <div class="actions"><button class="btn small" id="changeRoot">研究フォルダを選ぶ</button></div>`}
  </div>`;
}

// Two presses, because the first one is the one that gets pressed by accident.
// What it does not touch is said in both states: the fear is about the research
// folder, and rescicle has never had anything in it to lose.
//
// It says 記録 and never データ. データ is the name of a registered file -- the
// type, the nav entry, the heading over the list, データとして登録 -- so a button
// called データをリセットする sat next to a list of データ and read as clearing
// that list. It clears the research, the objects, the links and the whole
// conversation. The most dangerous button in the app was the one whose name
// could be misread as the smallest.
function recordSectionHtml() {
  if (state.clearing) {
    return `<div class="settings-section"><h3>rescicleの記録</h3>
      <div class="error">研究・オブジェクト・つながり・会話をすべて削除します。取り消せません。</div>
      <div class="muted settings-note">研究フォルダのファイルには触れません。消えるのは、rescicleが持っている記録だけです。</div>
      <div class="actions"><button class="btn danger small" id="clearConfirm">消す</button><button class="btn small" id="clearCancel">やめる</button></div>
    </div>`;
  }
  return `<div class="settings-section"><h3>rescicleの記録</h3>
    <div class="muted settings-note">研究・オブジェクト・つながり・会話。消すと最初の画面に戻ります。研究フォルダのファイルには触れません。</div>
    <button class="btn small settings-action" id="clearStart">すべて消す</button>
  </div>`;
}

function settingsModalHtml() {
  const agent = state.bootstrap?.agent || {};
  return `<div class="modal-wrap" id="modalWrap"><div class="modal"><h2>設定</h2>
    ${folderSectionHtml()}
    ${claudeSectionHtml(agent)}
    ${mcpSectionHtml(agent)}
    ${recordSectionHtml()}
    ${state.error ? `<div class="error">${esc(state.error)}</div>`:''}
    <div class="modal-actions"><button class="btn" id="closeModal">閉じる</button></div></div></div>`;
}
function bind() {
  // render() rebuilds the card, so what is being typed has to live in state or
  // it is lost the moment anything else redraws -- and something does, when the
  // registration check answers a second or two in.
  document.getElementById('researchText')?.addEventListener('input', e => { state.onboardingText = e.target.value; });
  document.querySelectorAll('[data-starter]').forEach(b => b.addEventListener('click', () => {
    // A starting point, not a submission: it goes into the box to be edited.
    state.onboardingText = b.dataset.starter;
    render();
    const box = document.getElementById('researchText');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }));
  document.getElementById('startResearch')?.addEventListener('click', startResearch);
  document.getElementById('dismissConnect')?.addEventListener('click', () => {
    state.connectOffer = false; state.mcpNotice = null; render();
  });
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', async () => {
    // Leaving the query set would show results while the nav looked switched.
    state.currentScreen = b.dataset.nav; state.query = ""; state.selectedObjectId = null; state.selectedObject = null; state.linking = null; state.fileNotice = null; state.error = null;
    try {
      if (state.currentScreen === 'data-files' && !state.files.length) state.files = await api.scanFiles(state.workspace.project.id);
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
    const screen = el.dataset.objectType && screenFor(el.dataset.objectType);
    if (screen && state.currentScreen !== 'map' && state.currentScreen !== screen) state.currentScreen = screen;
    loadSelected(id);
  }));
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = b.dataset.targetId || state.selectedObject?.id;
    if (!id) return;
    const before = (state.workspace.objects || []).find(o => o.id === id);
    await api.setObjectStatus(id, b.dataset.status);
    // Rejecting takes the card off every screen and starts the clock on the row
    // itself, so it is the one decision that leaves something behind. Any other
    // decision, 戻す included, clears the offer: it is about the last one.
    setRejectedNotice(b.dataset.status === 'rejected' ? before : null);
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
  document.querySelectorAll('[data-register-path]').forEach(b => b.addEventListener('click', () =>
    registerFile(b.dataset.registerPath)));
  document.querySelectorAll('[data-link-asset]').forEach(b => b.addEventListener('click', () =>
    linkAssetToMeasurement(b.dataset.linkAsset, b.dataset.measurement)));
  document.getElementById('dismissFileNotice')?.addEventListener('click', () => {
    state.fileNotice = null; render();
  });
  document.querySelectorAll('[data-open-asset]').forEach(b => b.addEventListener('click', () => {
    state.currentScreen = 'data-files'; state.query = ''; state.linking = null; state.fileNotice = null; state.error = null;
    loadSelected(b.dataset.openAsset);
  }));
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage(); });
  document.getElementById('chatInput')?.addEventListener('input', e => { state.draft = e.target.value; });
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    state.modal = 'settings'; state.error = null; state.mcp = null; state.mcpNotice = null;
    render();
    // Asking Claude Code costs a subprocess, so it is asked when the screen that
    // shows the answer opens rather than on every project open.
    loadMcpStatus();
  });
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
  // Selecting the node already pointed the conversation at it -- the chat head
  // says 対象 -- so this is the rest of the move: the caret, where what you were
  // about to ask goes.
  document.getElementById('talkAbout')?.addEventListener('click', () => {
    const box = document.getElementById('chatInput');
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });
  document.getElementById('changeRootHere')?.addEventListener('click', changeProjectRoot);
  document.getElementById('clearStart')?.addEventListener('click', () => { state.clearing = true; state.error = null; render(); });
  document.getElementById('clearCancel')?.addEventListener('click', () => { state.clearing = false; render(); });
  document.getElementById('clearConfirm')?.addEventListener('click', clearRecord);
  document.getElementById('registerMcp')?.addEventListener('click', registerMcp);
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
  // The notice belongs to the screen behind the settings, and it is the whole
  // answer to what the change did, so the modal gets out of its way.
  state.modal = null;
  state.clearing = false;
  // Standing on the list the new folder fills, an empty scan would read as an
  // empty folder rather than as one nobody has looked in yet.
  if (state.currentScreen === 'data-files' && state.workspace) {
    try { state.files = await api.scanFiles(state.workspace.project.id); } catch { /* the notice already says why */ }
  }
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
async function registerFile(relativePath) {
  state.error = null;
  state.fileNotice = null;
  try {
    const projectId = state.workspace.project.id;
    const asset = await api.registerAsset(projectId, relativePath);
    await refreshWorkspace();
    state.files = await api.scanFiles(projectId);
    state.fileNotice = { path: relativePath, assetId: asset.id, measurement: null };
  } catch (e) {
    state.error = errText(e);
  }
  render();
}

// The second half, when the researcher takes the offer. Registering already
// happened, so a failure here loses the link and not the file.
async function linkAssetToMeasurement(assetId, measurementId) {
  state.error = null;
  try {
    // Read before the workspace is replaced, so the notice can name what the
    // file was joined to rather than just that it was joined to something.
    const measurement = measurementsOnHand().find(m => m.id === measurementId);
    state.workspace = await api.createRelation(state.workspace.project.id, measurementId, 'produces', assetId);
    if (state.fileNotice) state.fileNotice.measurement = measurement?.title || '測定';
  } catch (e) {
    state.error = errText(e);
  }
  render();
}

async function refreshWorkspace() {
  state.workspace = await api.openProject(state.workspace.project.id);
}
// Must match REJECTED_GRACE_SECS in src-tauri/src/db.rs: the offer has to go
// before the row it points at does, or 戻す would reach something already gone.
const REJECT_UNDO_MS = 180_000;
let undoTimer = null;

function setRejectedNotice(object) {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (!object) { state.rejectedNotice = null; return; }
  state.rejectedNotice = { id: object.id, title: object.title, type: object.type, until: Date.now() + REJECT_UNDO_MS };
  // The window closing is a thing that happens on its own, so the screen has to
  // stop offering without waiting to be visited again.
  undoTimer = setTimeout(() => { undoTimer = null; state.rejectedNotice = null; render(); }, REJECT_UNDO_MS);
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

// The name is the first line of what they wrote, because that is what they would
// have typed into a name field anyway, and one field is better than two.
function nameFromText(text) {
  const line = text.trim().split('\n')[0].trim();
  if (!line) return '研究';
  return line.length > 30 ? `${line.slice(0, 29)}…` : line;
}

// Setting up and the first turn are one press. What they wrote is the project's
// name and its first message, so the screen they land on already has the turn
// running in it rather than an empty map and an invitation to start.
async function startResearch() {
  const text = (document.getElementById('researchText')?.value ?? state.onboardingText).trim();
  if (!text || state.pending) return;
  try {
    state.workspace = await api.createProject({ name: nameFromText(text), rootPath: null });
    state.error = null;
    // Decided here, while the answer from boot is in hand, so it cannot surface
    // later over a machine that has since been set up.
    state.connectOffer = mcpNeedsSetup();
    state.onboardingText = '';
    state.draft = text;
    render();
    await sendMessage();
  } catch (e) {
    state.error = errText(e);
    render();
  }
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
// Back to a first run without restarting: bootstrap answers from an empty
// database, and everything the screen was holding about a project that no longer
// exists is dropped with it.
async function clearRecord() {
  try {
    await api.clearRecord();
    state.bootstrap = await api.bootstrap();
    state.workspace = state.bootstrap.workspace;
    Object.assign(state, {
      modal: null, clearing: false, onboardingText: '', connectOffer: false,
      files: [], selectedObjectId: null, selectedObject: null, linking: null,
      fileNotice: null, rejectedNotice: null, rootNotice: null,
      currentScreen: 'map', query: '', draft: '', error: null,
    });
    setRejectedNotice(null);
  } catch (e) { state.error = errText(e); }
  render();
}

async function loadMcpStatus() {
  try { state.mcp = await api.claudeMcpStatus(); }
  catch (e) { state.mcp = { checked: false, registered: false, command: null, stale: false, error: errText(e) }; }
  // The CLI takes a second or two, so whatever is on screen by the time it
  // answers is redrawn -- the settings screen, the connect step, or neither.
  render();
}

// One press is the whole registration. What comes back is what Claude Code has
// afterwards, so the section redraws into its real state rather than announcing
// a success it did not read back.
async function registerMcp() {
  state.mcpBusy = true; state.mcpNotice = null; state.error = null;
  render();
  try {
    state.mcp = await api.claudeMcpRegister();
    if (state.mcp?.registered) {
      state.mcpNotice = 'すでに開いているClaude Codeには、開き直すまで反映されません。';
    }
  } catch (e) { state.error = errText(e); }
  state.mcpBusy = false;
  render();
}

async function copyClaudeSetup() {
  try { await api.copyClaudeSetup(); state.error = null; alert('Claude Code用の追加コマンドをコピーしました。ターミナルで実行してください。'); }
  catch (e) { state.error = errText(e); render(); }
}

boot().catch(e => { root.innerHTML = `<div class="onboarding"><div class="onboarding-card"><div class="brand">rescicle</div><div class="error">${esc(e.message || e)}</div></div></div>`; });
