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
const STATUS_LABEL = { proposed: '提案中', confirmed: '確定', rejected: '却下', archived: 'アーカイブ' };
// What is still in play. Rejected is on its way out and archived is done with,
// and neither belongs on the map or in a list of what the research is now.
// Search reaches both -- it is the one place that shows everything there is.
const isLive = o => o.status !== 'rejected' && o.status !== 'archived';
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
// Derived, so the two cannot drift: anything not in here is one of the loose
// predicates, whatever the pair of types it happens to join.
const CHAIN_PREDICATES = new Set(CHAIN_EDGES.map(e => e.predicate));
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
  // The measurement whose "which file did this produce" list is open, if any.
  dataPick: null,
  // What the last register did, kept until the researcher moves on. The row it
  // happened to is easy to lose among the others.
  fileNotice: null,
  // Which folders in the file tree are open. null means nobody has touched one,
  // so the size of the list decides -- see dirIsOpen().
  openDirs: null,
  // The folder a bulk register is working through, so its button can say so.
  registeringDir: null,
  // The object the last reject threw away, and until when it can be taken back.
  // REJECTED_GRACE_SECS in src-tauri/src/db.rs is the same window on the side
  // that does the deleting.
  decisionNotice: null,
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
  // Closed by hand for this session. It comes back on the next launch if nothing
  // has been decided by then, because that is still the situation.
  decideHintClosed: false,
  // What Claude Code has registered under `rescicle`, read back when the AI
  // connection screen opens. Null until that answer arrives.
  mcp: null,
  mcpBusy: false,
  mcpNotice: null,
  // True between pressing すべて消す and answering the confirmation.
  clearing: false,
  renaming: false,
  renameDraft: null,
  // A name is being thought up. The CLI takes a few seconds, and the field has
  // to say so or the press looks like it did nothing.
  namingBusy: false,
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

// How wide the conversation is. It is a display preference belonging to this
// window rather than to the research, so it lives in the webview's own storage
// and not in settings.json, which is for what the Rust side needs to know.
// Reading it can throw in a webview with storage blocked, and a first run has
// nothing there, so the CSS default stands in either case.
const CHAT_WIDTH_KEY = 'rescicle.chatWidth';
const CHAT_MIN = 300;

function chatWidthBounds() {
  // The centre column has a minimum of its own and the sidebar is fixed, so the
  // chat cannot take more than what is left. Without this the drag could squeeze
  // the map to nothing and there would be no way back except the other direction.
  const nav = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav'), 10) || 210;
  const centre = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--centre'), 10) || 420;
  return { min: CHAT_MIN, max: Math.max(CHAT_MIN, window.innerWidth - nav - centre - 5) };
}

function setChatWidth(px, remember) {
  const { min, max } = chatWidthBounds();
  const width = Math.round(Math.min(max, Math.max(min, px)));
  // Written on :root, so render() rebuilding the tree cannot lose it.
  document.documentElement.style.setProperty('--chat', `${width}px`);
  if (remember) { try { localStorage.setItem(CHAT_WIDTH_KEY, String(width)); } catch { /* not stored, still applied */ } }
  return width;
}

function restoreChatWidth() {
  let saved = null;
  try { saved = localStorage.getItem(CHAT_WIDTH_KEY); } catch { /* leave the CSS default */ }
  if (saved) setChatWidth(Number(saved), false);
}

// Bound once on the document, like the shortcuts: the handle is rebuilt by every
// render, and a listener per render would stack. Dragging writes the custom
// property directly and never calls render() -- redrawing the conversation and
// the map on every pointermove would fight the drag and throw away whatever is
// half-typed in the box.
function bindChatResize() {
  let dragging = null;
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest?.('#chatResize');
    if (!handle) return;
    event.preventDefault();
    dragging = handle;
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add('dragging');
  });
  document.addEventListener('pointermove', event => {
    if (!dragging) return;
    setChatWidth(window.innerWidth - event.clientX, false);
  });
  const stop = () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    const now = parseInt(document.documentElement.style.getPropertyValue('--chat'), 10);
    if (now) setChatWidth(now, true);
  };
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  // A window narrow enough to violate the bounds has to pull the chat back in.
  window.addEventListener('resize', () => {
    const now = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat'), 10);
    if (now) setChatWidth(now, false);
  });
}

// A link in the conversation opens in the system browser. Following it here
// would replace the app with a web page in a window that has no address bar and
// no back button, and the only way out would be to close rescicle.
//
// Bound on the document, once: the messages are rebuilt by every render, and the
// stream patches them in without going through bind() at all. auxclick is here
// for the middle button, which is a navigation this window equally cannot afford.
function bindExternalLinks() {
  const open = event => {
    const link = event.target.closest?.('[data-external]');
    if (!link) return;
    event.preventDefault();
    const url = link.dataset.external;
    // The scheme was matched when the anchor was written, and it is matched again
    // here because this is the side that hands it over. The one that actually
    // decides is neither: capabilities/default.json scopes opener:allow-open-url
    // to http and https, so Tauri refuses anything else before it reaches the
    // system -- which is where a rule like this belongs, since a page the agent
    // fetched is what wrote the text these anchors were built from.
    if (!/^https?:\/\//i.test(url)) return;
    api.openUrl(url).catch(e => { state.error = errText(e); render(); });
  };
  document.addEventListener('click', open);
  document.addEventListener('auxclick', open);
}

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

  bindChatResize();
  restoreChatWidth();
  bindExternalLinks();

  // Patch the streaming reply into the bubble directly. render() would rebuild
  // the tree on every chunk, throwing away the next message being typed and
  // fighting the scroll position several times a second.
  api.onReply(text => {
    if (!state.pending) return;
    state.stream = text;
    const node = document.getElementById('streamText');
    if (!node) { render(); return; }
    // chatText escapes before it formats, so this is the same safety textContent
    // gave and the same three tags the saved message will render with -- without
    // it the reply reformats the moment the turn ends.
    node.innerHTML = chatText(text);
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
      <div class="col-resize" id="chatResize" title="ドラッグして会話の幅を変えます"></div>
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
    if (!isLive(o)) continue;
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
  // One slot. The file notice used to sit inside the データ column, so
  // registering a file reported in one place and un-registering the same file
  // reported in another -- and doing both, which is one minute's work, put two
  // notice bars on screen in two different shapes saying the same kind of thing.
  // Un-registering is pressed from a card, which can be on the map or in search,
  // so it cannot live in that column; registering can, but being able to is not
  // a reason for the two halves of one act to answer in different places.
  return root + decideNoticeHtml() + connectNoticeHtml() + decisionNoticeHtml() + fileNoticeHtml();
}

// The moment the first objects appear is the moment the app is about, and until
// now nothing said what to do with them. The researcher has just watched things
// arrive on their own; that they are proposals waiting on a decision, and that
// the decision is theirs, is the one thing the screen never mentioned.
//
// It is written as a description of the situation rather than as a step in a
// tutorial, which is why it has no "seen" flag anywhere. It is shown exactly
// while the situation holds: something is waiting to be decided and nothing has
// been decided yet. Deciding one thing ends it, because after that they know.
// Twenty minutes in with fifteen proposals and no decisions, it is still true
// and still the thing worth saying -- a one-shot tutorial would have spent
// itself in the first minute and left nothing.
function decideNoticeHtml() {
  if (state.decideHintClosed) return '';
  const objects = state.workspace?.objects || [];
  const waiting = objects.some(o => o.status === 'proposed');
  const decided = objects.some(o => o.status !== 'proposed');
  if (!waiting || decided) return '';
  return `<div class="notice"><span>AIが提案したものが現れました。<strong>確かめるのは研究者です。</strong>マップのノードか一覧のカードを開くと、<strong>確定</strong>と<strong>却下</strong>があります。</span>
    <button class="btn small" id="dismissDecideHint">閉じる</button></div>`;
}

// Rejecting deletes, so the one thing owed back is the few minutes in which a
// misplaced press is still a press the researcher remembers making. It sits in
// the notice slot rather than on the list it left, because the press comes from
// the detail view and from search just as often.
function decisionNoticeHtml() {
  const notice = state.decisionNotice;
  if (!notice || Date.now() >= notice.until) return '';
  const name = `「${esc(notice.title)}」`;
  const said = notice.to === 'confirmed'
    ? `${name}を確定しました。`
    : notice.type === 'asset'
      ? `${name}の登録を取り消しました。ファイルはフォルダにそのまま残ります。`
      : `${name}を却下しました。`;
  // Rejecting ends in a deletion and confirming does not, so only one of them
  // has an after to warn about.
  const after = notice.to === 'rejected' ? 'そのあと削除されます。' : '';
  const left = Math.max(1, Math.ceil((notice.until - Date.now()) / 60000));
  return `<div class="notice"><span>${said}あと約${left}分は戻せます。${after}</span>
    <button class="btn small" data-status="${esc(notice.from)}" data-target-id="${esc(notice.id)}">戻す</button></div>`;
}

function projectTitleHtml() {
  const name = state.workspace.project.name;
  if (!state.renaming) {
    return `<button class="project-title" id="renameProject" title="クリックして研究名を変更">${esc(name)}</button>`;
  }
  // The suggestion goes into the field, not onto the project. The first name is
  // the first line of what was typed on day one, cut at thirty characters, and a
  // week later it is a half-sentence over a map of twenty objects -- by which
  // time what the research is about has become knowable. So it is offered here,
  // where renaming already is, and it lands as a draft the researcher can edit
  // and then save. The agent proposes; nothing renames itself.
  return `<div class="project-title renaming">
    <input id="projectNameInput" class="input project-name-input" value="${esc(state.renameDraft ?? name)}">
    <button class="btn primary small" id="saveProjectName"${state.namingBusy ? ' disabled' : ''}>保存</button>
    <button class="btn small" id="suggestName"${state.namingBusy ? ' disabled' : ''}>${state.namingBusy ? '考えています…' : 'AIに考えてもらう'}</button>
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
      // The full width of the column. It used to be sized to the map, which was
      // sized to however many columns happened to be occupied, so the panel's
      // width changed with the research and a card could open narrow for no
      // reason the researcher could see. The map is the chain's full width now,
      // and the panel is the column's.
      ? `<div class="map-detail">${cardHtml(state.selectedObject, { pinned: true })}</div>`
      : ''}
    ${rootPromptHtml()}`;
}

// The folder is not asked for during onboarding, because the conversation does
// not need it -- but then nothing ever mentions it, and the researcher has no
// reason to know that registering their own files is even on offer. This is the
// one place that says so: the foot of the map, which is where they are while
// they talk, and past everything they came to the screen for.
//
// It sends them to データ・ファイル rather than opening the picker here. That
// screen is the view of the folder, so choosing which folder belongs to it; a
// picker on the map would set something the map cannot show the result of.
//
// It goes away for good once a folder is set. There is nothing to promote after
// that, and changing the folder lives on the screen it scopes.
function rootPromptHtml() {
  if (state.workspace?.project?.root_path) return '';
  return `<div class="root-prompt">
    <div>手元のファイルを、この研究のデータにできます。研究フォルダを選ぶと、その中のファイルが一覧に出ます。</div>
    <div class="muted">rescicleはフォルダを読むだけで、書き換えません。</div>
    <button class="link-add" id="goDataFiles">データ・ファイルを開く</button>
  </div>`;
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

// An archived object leaves the map, unless something still live hangs off it.
// Archiving the question at the head of a branch used to drop it and leave its
// hypotheses standing in the middle of the page with nothing above them -- the
// chain still existed, and the one picture of the chain had stopped showing it.
//
// So it stays, drawn faint, for exactly as long as it is holding something up.
// Archive the hypotheses too and it goes with them; archive a leaf and it is
// gone at once. The map never fills with finished work, and it never lies about
// what is attached to what. A faint node reads as what it is: this branch is not
// finished yet.
function anchorsSomethingLive(id, objects, relations) {
  const live = new Set(objects.filter(isLive).map(o => o.id));
  return (relations || []).some(r =>
    r.status !== 'rejected'
    && ((r.subject_id === id && live.has(r.object_id))
      || (r.object_id === id && live.has(r.subject_id))));
}

function buildMap(objects, relations) {
  const alive = objects.filter(o =>
    CHAIN.includes(o.type)
    && (isLive(o)
      || (o.status === 'archived' && anchorsSomethingLive(o.id, objects, relations))));
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
  // Every type keeps its own column, whether or not anything is in it. Dropping
  // the empty ones packed the rest together, so a question and a datum with
  // nothing between them were drawn side by side -- as though the chain ran
  // straight from one to the other. They are four steps apart, and the gap is
  // the most useful thing the map has to say: it is where the missing hypothesis,
  // prediction and measurement go. The width stops moving too, so opening a node
  // no longer reshapes the page under the cursor.
  const cols = CHAIN.map(type => alive.filter(o => o.type === type));
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
  // Both passes only ever push a node down -- max(next, desired) in each -- so
  // nothing ever brings the finished layout back to the top. The first column
  // gets dragged down to meet the block it feeds, that block was itself placed
  // below whatever it was aiming at, and the whole map ends up hanging from the
  // lowest anchor in the chain: with twenty objects the first node sat 330px
  // below the headings and the researcher opened the map onto an empty band.
  //
  // The passes are about nodes relative to each other, and that is all they get
  // to decide. Where the result sits on the page is one subtraction afterwards.
  const top = Math.min(...[...pos.values()].map(q => q.y));
  if (Number.isFinite(top) && top !== MAP.HEAD) {
    for (const node of pos.values()) node.y -= top - MAP.HEAD;
  }
  const ys = [...pos.values()].map(q => q.y + MAP.H);
  return {
    pos, edges, cols,
    width: cols.length * (MAP.W + MAP.COL_GAP) - MAP.COL_GAP,
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
    // references and related_to are allowed between any two types, so they can
    // land in the same place a chain link would and used to be drawn the same.
    // A measurement joined to a hypothesis by references then looked exactly
    // like a measurement testing it -- the chain read as complete across a
    // prediction that was never made. It is a real connection and it stays on
    // the map, but faint, so it cannot be mistaken for the spine.
    const loose = !CHAIN_PREDICATES.has(r.predicate);
    return `<path class="map-edge ${loose ? 'loose' : ''} ${r.status === 'proposed' ? 'proposed' : ''}" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"></path>`;
  }).join('');
  const anyLoose = g.edges.some(r => !CHAIN_PREDICATES.has(r.predicate));
  // All five heads, including over a column with nothing under it: that is what
  // says where the empty space belongs to, and so what is missing between the
  // two things that are there. An empty one is drawn faint, so it reads as a
  // place kept rather than as a heading whose contents went astray.
  const heads = g.cols.map((col, c) => {
    const label = TYPE_LABEL[CHAIN[c]] || CHAIN[c];
    return `<text class="map-col-head ${col.length ? '' : 'empty'}" x="${c * (MAP.W + MAP.COL_GAP)}" y="12">${esc(label)}</text>`;
  }).join('');
  const nodes = [...g.pos.values()].map(({ x, y, o }) => `<g class="map-node ${esc(o.status)} ${state.selectedObjectId === o.id ? 'selected' : ''}" data-object-id="${o.id}">
      <rect x="${x}" y="${y}" width="${MAP.W}" height="${MAP.H}" rx="10"></rect>
      <text class="map-type" x="${x + MAP.PAD}" y="${y + 17}">${esc(TYPE_LABEL[o.type] || o.type)}</text>
      ${o.performed ? `<text class="map-done" x="${x + MAP.W - MAP.PAD}" y="${y + 17}">実施済み</text>` : ''}
      ${wrapTitle(o.title).map((line, i) => `<text class="map-title" x="${x + MAP.PAD}" y="${y + 36 + i * MAP.LINE}">${esc(line)}</text>`).join('')}
    </g>`).join('');
  return `<div class="map-scroll"><svg class="map" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${edges}${heads}${nodes}</svg></div>
    <div class="map-legend"><span>実線 = 確定</span><span>破線 = 提案中（AI提案）</span>${anyLoose ? '<span>薄い線 = 参考（鎖のつながりではありません）</span>' : ''}<span>ノードをクリックすると詳細が開きます</span></div>`;
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
  const live = (state.workspace.objects || []).filter(o => o.type === type && isLive(o));
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
  // A settled claim has nothing here. 提案中に戻す stood on every confirmed card
  // for good, and going back to being under discussion is not a thing anybody
  // does to a decision they made -- what is real is the few minutes in which the
  // press was a slip, and those are covered by the notice that follows it.
  return '';
}

// `fileLine` replaces the type label for a registered file. Where the card is
// listed under データ the type is already said by the heading, and what the card
// cannot otherwise say is which file it is: two runs under different folders
// share a name, and the title is only the name.
// Presses of three different weights used to sit in this row as peers, and two
// of them were filled dark -- so これについて話す, which changes nothing and is
// undone by clicking somewhere else, looked exactly like 確定, which settles a
// claim. That sameness is the problem, not the number of buttons.
//
// Left to right by what a press costs. これについて話す and 実施した are cheap and
// reversible: one moves the conversation, the other records something that
// happened in the lab and has 未実施に戻す waiting next to it. The decisions sit
// past a rule, because they are the other axis -- whether the researcher has
// accepted the claim at all, which 実施済み deliberately says nothing about.
//
// The fill is spent once, on the affirmative decision. 却下 keeps red, which in
// this app means what cannot be taken back.
function cardActionsHtml(o, pinned) {
  const move = pinned ? '<button class="btn small" id="talkAbout">これについて話す</button>' : '';
  // On the map an asset offers only the move. Administering the record is
  // bookkeeping, and the map is not where the books are kept; the データ・ファイル
  // list the file lives on still has 登録を取り消す.
  const onRecord = pinned && o.type === 'asset' ? '' : performedButtonHtml(o);
  const decide = pinned && o.type === 'asset' ? '' : statusButtonsHtml(o);
  const cheap = move + onRecord;
  if (!cheap || !decide) return cheap + decide;
  return `${cheap}<span class="action-split" aria-hidden="true"></span>${decide}`;
}

function cardHtml(o, { pinned = false, fileLine = null } = {}) {
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
  const actions = cardActionsHtml(o, pinned);
  return `<div class="card ${open ? 'open' : ''} ${o.status}">${row}<div class="card-main">${head}<div class="card-title">${esc(o.title)}</div>${o.body ? `<div class="card-body">${esc(o.body)}</div>`:''}${o.note ? `<div class="card-note">${esc(o.note)}</div>`:''}<div class="pills">${status}${origin}${performedPillHtml(o)}</div></div><div class="card-actions">${actions}</div></div>${full ? expansionHtml(full) : ''}</div>`;
}

// The far end a new chain link could have, one slot per edge this object's type
// appears in. Which side of the edge the object sits on decides the direction,
// and the type pair has already decided the predicate, so a slot is settled the
// moment the other object is picked.
function linkSlots(o, ends) {
  const taken = new Set(ends.map(e => `${e.r.predicate}|${e.id}`));
  const pool = (state.workspace.objects || []).filter(c => c.id !== o.id && isLive(c));
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
    // An archived card is a record of something finished, so it shows what it
    // was attached to and offers nothing. Deciding a live hypothesis from inside
    // a question that has been put away is reaching out of a closed box -- and
    // the same rows are on the live card at the other end of every one of these
    // lines, which is where the decision belongs.
    if (o.status === 'archived') return '';
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
  // Drawing a new line out of something that has been put away would be building
  // onto finished work; bring it back first if that is what is meant.
  const link = slots.length && o.status !== 'archived'
    ? `<button class="link-add${picking ? ' open' : ''}" data-link-toggle="${esc(o.id)}">${picking ? 'やめる' : '＋ つなぐ'}</button>`
    : '';

  return `<div class="card-expand">
    <div class="expand-head">つながり</div>${graph}${link}
    ${o.type==='asset' && o.asset ? `<div class="expand-head">ローカルファイル</div><div class="card-body">${esc(o.asset.relative_path)}
${fmtSize(o.asset.size_bytes)} · ${esc(o.asset.modified_at)}</div>` : ''}
    ${dataPickHtml(o)}
    ${archiveHtml(o)}
  </div>`;
}

// A measurement that has been run and has nothing hanging off it is the one
// gap the app can see for itself, and the moment the researcher is actually
// thinking about their data. Registering used to live only on the データ・ファイル
// screen, which you have to remember to visit -- and since the folder stopped
// being asked for on the first screen, nothing brought it up at all.
//
// So the trigger is on the measurement: the thing that produced the data is
// where "here is what came out" belongs, and it is the reverse of the order the
// files screen takes. Linking this way also fills in the date for free, because
// the measurement is marked run from the file's own modified time.
function needsData(o) {
  return o.type === 'measurement'
    && o.performed
    && !(o.outgoing || []).some(r => r.predicate === 'produces' && r.status !== 'rejected');
}

function dataPickHtml(o) {
  if (!needsData(o)) return '';
  const root = state.workspace?.project?.root_path || '';
  if (state.dataPick !== o.id) {
    return `<button class="link-add" data-data-pick="${esc(o.id)}">この測定が生み出したデータを登録する</button>`;
  }
  if (!root) {
    return `<div class="file-link">
      <div class="file-link-head">研究フォルダがまだ選ばれていません</div>
      <div class="muted settings-note">選ぶと、その中のファイルからデータを登録できます。rescicleはファイルを読むだけです。</div>
      <div class="actions"><button class="btn small" id="changeRoot">研究フォルダを選ぶ</button><button class="link-skip" data-data-pick="${esc(o.id)}">やめる</button></div>
    </div>`;
  }
  const spare = state.files.filter(f => !f.asset_id);
  return `<div class="file-link">
    <div class="file-link-head">どのファイルですか</div>
    ${spare.length
      ? spare.slice(0, 40).map(f => `<button class="link-pick" data-data-file="${esc(f.relative_path)}" data-measurement="${esc(o.id)}">
          <span class="rel-plus" aria-hidden="true">＋</span><span class="type">${esc(fmtSize(f.size_bytes))}</span><span class="rel-title">${esc(f.relative_path)}</span>
        </button>`).join('')
      : '<div class="expand-empty">このフォルダに、まだ登録していないファイルがありません。</div>'}
    <button class="link-skip" data-data-pick="${esc(o.id)}">やめる</button>
  </div>`;
}

// Where a confirmed claim goes when it is done with -- answered, superseded,
// disproved. 却下 is the wrong door for that: it means the thing was a mistake,
// and it deletes. A hypothesis that was tested and turned out false is not a
// mistake, it is the research, and throwing it away would throw away the part
// that was earned.
//
// It sits inside the opened card, in the quiet form that ＋つなぐ and はずす use,
// rather than beside 確定 and 却下. Those are the everyday decisions, taken many
// times a session; this one is taken rarely and on purpose, and a button that
// reads as rare is a button that is not pressed by accident.
//
// Nothing is destroyed, so there is no undo window and no warning: coming back
// is the same quiet press in the other direction, for as long as it is wanted.
function archiveHtml(o) {
  if (o.type === 'asset') return '';
  if (o.status === 'confirmed') {
    return `<button class="link-add" data-status="archived" data-target-id="${esc(o.id)}" title="片付いたものとして、マップと一覧から外します。消えません">アーカイブする</button>`;
  }
  if (o.status === 'archived') {
    return `<button class="link-add" data-status="confirmed" data-target-id="${esc(o.id)}">アーカイブから戻す</button>`;
  }
  return '';
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
  return (state.workspace.objects || []).filter(o => o.type === 'measurement' && isLive(o));
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

// A row, not a card. A card is for something the researcher decides about; these
// are the contents of a folder, and there can be three hundred of them. Boxed,
// the list was three hundred outlines of equal weight with the filename -- the
// only thing anyone reads here -- competing with its own border.
function fileRowHtml(f) {
  return `<div class="file">
    <div class="file-name" title="${esc(f.relative_path)}">${esc(f.name ?? f.relative_path)}</div>
    <div class="file-meta">${fmtSize(f.size_bytes)}</div>
    ${readMarkHtml(f)}
    <button class="btn small" data-register-path="${esc(f.relative_path)}" title="研究のデータとして記録します">データとして登録</button>
  </div>`;
}

// The folder's own shape. A flat list repeats `src\renderer\` on every row and
// says nothing about where anything is; the researcher is looking for the two
// CSVs they wrote this morning, and the only thing that helps is knowing which
// folder those are in. Grouping by directory is that, and it is also what makes
// registering a folder's worth of files a single act.
function groupByDirectory(files) {
  const dirs = new Map();
  for (const f of files) {
    const parts = f.relative_path.split(/[\\/]/);
    const dir = parts.slice(0, -1).join('\\');
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push({ ...f, name: parts[parts.length - 1] });
  }
  return [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Open by default while the whole list still fits on a screen, closed once it
// does not. Below the threshold, folding costs a click and hides nothing worth
// hiding; above it, the folders themselves are what the researcher needs to see
// first. Touching any one of them takes over from the default for the session.
const DIRS_OPEN_LIMIT = 30;

function dirIsOpen(dir, total) {
  if (!state.openDirs) return total <= DIRS_OPEN_LIMIT;
  return state.openDirs.has(dir);
}

function toggleDir(dir, groups, total) {
  // Materialise whatever is on screen before flipping one of them, so the first
  // click opens or closes exactly the folder it was aimed at and leaves the rest
  // as they were drawn.
  if (!state.openDirs) {
    state.openDirs = new Set(groups.filter(([d]) => dirIsOpen(d, total)).map(([d]) => d));
  }
  if (state.openDirs.has(dir)) state.openDirs.delete(dir);
  else state.openDirs.add(dir);
}

function directoryTreeHtml(files) {
  const groups = groupByDirectory(files);
  const total = files.length;
  return `<div class="tree">${groups.map(([dir, entries]) => {
    const open = dirIsOpen(dir, total);
    const parts = dir ? dir.split('\\') : [];
    // Indented by depth, with everything above the last segment dimmed. Only
    // folders that hold files get a row, so a nesting drawn from the rows alone
    // would have gaps in it -- src-tauri\gen\schemas with no src-tauri\gen above
    // it. Keeping the whole path visible says where it really is; dimming the
    // part that is not this folder's own name lets the eye read down the column
    // of names the way it would read a tree.
    const name = parts.length
      ? `<span class="tree-path">${esc(parts.slice(0, -1).map(p => p + '\\').join(''))}</span>${esc(parts[parts.length - 1])}`
      : 'このフォルダの直下';
    return `<div class="tree-dir" style="padding-left:${parts.length * 13}px">
      <button class="tree-head ${open ? 'open' : ''}" data-dir="${esc(dir)}">
        <span class="tree-caret">${open ? '▾' : '▸'}</span>
        <span class="tree-name">${name}</span>
        <span class="count">${entries.length}件</span>
      </button>
      ${open ? `<div class="files">${entries.map(fileRowHtml).join('')}</div>
        <button class="link-add tree-bulk" data-register-dir="${esc(dir)}"${state.registeringDir ? ' disabled' : ''}>${
          state.registeringDir === dir ? '登録しています…' : `この${entries.length}件をまとめて登録`}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
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
  // A whole folder at once has no one object to open and no sensible answer to
  // 「どの測定が生み出したか」, so it says what happened and stops there.
  if (notice.count > 1) {
    return `<div class="notice"><span>${esc(notice.path)} の ${notice.count}件をデータとして登録しました。</span>
      <button class="btn small" id="dismissFileNotice">閉じる</button></div>`;
  }
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
  // Before a folder is chosen there is nothing on this screen except the
  // choosing, so that is all it shows. It used to draw both columns anyway and
  // fill each with its empty state, which put two dashed rounded rectangles side
  // by side -- the shape of a text field, twice, and neither of them one. The
  // legend above them explained 「データとして登録」 and what the AI reads, both
  // of which describe controls and events that cannot happen yet.
  //
  // What is left is the sentence that is true now and the one verb that acts on
  // it. The rest of the screen exists as soon as there is a folder to show.
  const chosen = state.workspace?.project?.root_path || '';
  if (!chosen) {
    return `<div class="page-title"><h1>データ・ファイル</h1></div>
      <div class="muted page-note">研究フォルダを選ぶと、その中のファイルがここに並びます。そのうち研究のデータにするものを登録すると、測定とつなげられます。</div>
      <div class="start-block">
        <div class="start-block-head">まだ研究フォルダが選ばれていません</div>
        <div class="muted">見るのは選んだフォルダの中だけです。<strong>rescicleはファイルを読むだけで</strong>、書き換え・移動・コピー・削除はしません。</div>
        <div class="actions"><button class="btn" id="changeRootHere">研究フォルダを選ぶ</button></div>
      </div>
      ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}`;
  }

  const assets = new Map(
    (state.workspace.objects || [])
      .filter(o => o.type === 'asset' && isLive(o))
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
  const dataColumn = `${registered.length
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
  // A caption on the collection, not a row in it. Boxed it was the same shape as
  // a file row -- rounded rect, text at the left, button at the right -- so it
  // read as a file named C:\Users\... sitting at the top of the list.
  const folderBar = `<div class="folder-line">
    <span class="folder-line-path" title="${esc(chosen)}">${esc(chosen)}</span>
    <button class="link-add" id="changeRootHere">別のフォルダに変更</button>
  </div>`;
  const folderBody = plain.length
    ? directoryTreeHtml(plain)
    // Nothing to do is not worth a box the size of a list. One line says it.
    : state.files.length
      ? '<div class="muted settings-note">このフォルダのファイルはすべて登録済みです。</div>'
      : '<div class="empty">「再スキャン」でフォルダを確認します。</div>';
  const folderColumn = group(
    "フォルダ内のファイル",
    plain.length,
    folderBar + folderBody,
    '<button class="btn small" id="scanFiles">再スキャン</button>',
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

// The three pieces of markdown the agent actually writes, and nothing else.
// Replies came through with ** and - as literal characters, because the whole
// message was escaped and laid out with pre-wrap. Telling the model to stop
// using them fights how it writes and needs policing every turn; a reply listing
// four things it wants to know is easier to read with the bullets than without.
//
// Everything is escaped first and the patterns then run over the escaped text,
// so the only markup that can reach the page is the three tags below. A reply
// containing `<script>` is already &lt;script&gt; before this sees it.
//
// Not a markdown renderer. Headings, links, tables and the rest stay literal,
// which is the honest outcome: this is a conversation panel 390px wide, not a
// document, and anything that wants that shape belongs in an object's body.
// Links, since the agent got WebSearch: a reply that cites five papers was five
// PMC addresses printed as text, and the only thing to do with one was select it
// by hand. Both shapes the model writes are covered -- a markdown link and a bare
// address -- in one pass over the escaped text, so neither can be found inside
// what the other just produced.
//
// http and https only. The scheme is matched, not merely stripped of what looks
// dangerous: `javascript:` survives esc() intact, and a list of schemes to refuse
// is a list that the next one is missing from.
//
// The anchors do not navigate. This is a webview with no address bar and no way
// back, so following a link inside it would replace the app with a web page and
// leave no way to return; openExternally() in bind() takes the click and hands
// the URL to the system browser instead.
function chatLink(url, label) {
  return `<a href="${url}" data-external="${url}" title="${url}">${label}</a>`;
}

function chatText(raw) {
  return esc(raw ?? '')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // [label](url), or a bare address. One alternation rather than two passes.
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'）】]+)/g,
      (whole, label, linked, bare) => {
        // Trailing punctuation belongs to the sentence, not the address: a URL at
        // the end of a line takes the full stop with it otherwise.
        const url = (linked || bare).replace(/[.,;:、。）)\]]+$/, '');
        if (!url) return whole;
        return chatLink(url, label || url);
      })
    .replace(/^[-*] +/gm, '・');
}

function chatHtml() {
  const selected = state.selectedObject ? state.selectedObject.title : null;
  const messages = state.workspace.messages || [];
  const thread = messages.map(m => `<div class="message ${m.role}">${chatText(m.content)}</div>`);
  if (state.pending) {
    thread.push(`<div class="message user">${esc(state.pending.text)}</div>`);
    thread.push(`<div class="message assistant thinking">
      <span class="stream" id="streamText">${chatText(state.stream)}</span>
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
  document.getElementById('researchText')?.addEventListener('input', e => {
    state.onboardingText = e.target.value;
    // Patched in place rather than re-rendered, for the same reason the streaming
    // reply is: render() rebuilds the field and the caret goes with it. Without
    // this the button keeps whatever disabled state it was drawn with, which on a
    // first run is the one from before anything was typed -- so the researcher
    // writes out their research and はじめる stays grey.
    const start = document.getElementById('startResearch');
    if (start) start.disabled = !e.target.value.trim() || !!state.pending;
  });
  document.querySelectorAll('[data-starter]').forEach(b => b.addEventListener('click', () => {
    // A starting point, not a submission: it goes into the box to be edited.
    state.onboardingText = b.dataset.starter;
    render();
    const box = document.getElementById('researchText');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }));
  document.getElementById('startResearch')?.addEventListener('click', startResearch);
  document.getElementById('dismissDecideHint')?.addEventListener('click', () => { state.decideHintClosed = true; render(); });
  document.getElementById('dismissConnect')?.addEventListener('click', () => {
    state.connectOffer = false; state.mcpNotice = null; render();
  });
  // The same move as the nav entry, so it lands in the same state -- and the
  // nav follows, which is what tells the researcher where they have been sent.
  document.getElementById('goDataFiles')?.addEventListener('click', () =>
    document.querySelector('[data-nav="data-files"]')?.click());
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', async () => {
    // Leaving the query set would show results while the nav looked switched.
    state.currentScreen = b.dataset.nav; state.query = ""; state.selectedObjectId = null; state.selectedObject = null; state.linking = null; state.dataPick = null; state.fileNotice = null; state.error = null;
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
    // Both decisions leave the offer behind; pressing 戻す, which lands on
    // proposed, clears it. The notice is about the last decision made, and going
    // back is not one.
    const decided = b.dataset.status === 'rejected' || b.dataset.status === 'confirmed';
    setDecisionNotice(decided ? before : null, b.dataset.status);
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
  document.querySelectorAll('[data-data-pick]').forEach(b => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = b.dataset.dataPick;
    state.dataPick = state.dataPick === id ? null : id;
    state.error = null;
    // The folder has not necessarily been looked in yet: this screen is not the
    // one that scans it, and the researcher may never have opened that one.
    if (state.dataPick && state.workspace?.project?.root_path && !state.files.length) {
      try { state.files = await api.scanFiles(state.workspace.project.id); }
      catch (e) { state.error = errText(e); }
    }
    render();
  }));
  document.querySelectorAll('[data-data-file]').forEach(b => b.addEventListener('click', event => {
    event.stopPropagation();
    registerFileForMeasurement(b.dataset.dataFile, b.dataset.measurement);
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
  document.getElementById('suggestName')?.addEventListener('click', suggestProjectName);
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
  document.querySelectorAll('[data-register-dir]').forEach(b => b.addEventListener('click', () =>
    registerDirectory(b.dataset.registerDir)));
  document.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => {
    const spare = state.files.filter(f => !f.asset_id);
    toggleDir(b.dataset.dir, groupByDirectory(spare), spare.length);
    render();
  }));
  document.querySelectorAll('[data-link-asset]').forEach(b => b.addEventListener('click', () =>
    linkAssetToMeasurement(b.dataset.linkAsset, b.dataset.measurement)));
  document.getElementById('dismissFileNotice')?.addEventListener('click', () => {
    state.fileNotice = null; render();
  });
  document.querySelectorAll('[data-open-asset]').forEach(b => b.addEventListener('click', () => {
    state.currentScreen = 'data-files'; state.query = ''; state.linking = null; state.dataPick = null; state.fileNotice = null; state.error = null;
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
  state.renaming = false; state.renameDraft = null; state.renameError = null; state.namingBusy = false; render();
}

// Fills the field, and stops there. Renaming is still the researcher pressing
// 保存 on something they have read and can edit first -- the same shape as every
// other thing the agent proposes.
async function suggestProjectName() {
  // Whatever is half-typed is kept, so a suggestion that is not wanted can be
  // undone by 「やめる」 without losing the edit it interrupted.
  state.renameDraft = document.getElementById('projectNameInput')?.value ?? state.renameDraft;
  state.namingBusy = true; state.renameError = null;
  render();
  try {
    state.renameDraft = await api.suggestProjectName(state.workspace.project.id);
  } catch (e) { state.renameError = errText(e); }
  state.namingBusy = false;
  render();
  // Selected rather than merely filled: the next keystroke replaces it, which is
  // what someone does with a suggestion they do not want.
  const box = document.getElementById('projectNameInput');
  if (box) { box.focus(); box.select(); }
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
// Registering and linking in one press, from the measurement's side. The two
// writes are the same ones the files screen makes in the other order, and the
// second is what stamps the measurement's date from the file.
async function registerFileForMeasurement(relativePath, measurementId) {
  state.error = null;
  try {
    const projectId = state.workspace.project.id;
    const asset = await api.registerAsset(projectId, relativePath);
    state.workspace = await api.createRelation(projectId, measurementId, 'produces', asset.id);
    state.files = await api.scanFiles(projectId);
    state.dataPick = null;
    if (state.selectedObjectId) await loadSelected(state.selectedObjectId);
  } catch (e) { state.error = errText(e); }
  render();
}

// A folder's worth at once. Registered one at a time underneath, because that is
// the call the backend validates: each path is resolved against the research
// folder on its own, so one bad name cannot carry the rest in with it, and a
// failure part way leaves what already landed registered rather than rolling
// back work the researcher watched happen. The same stance as the agent's
// operations -- try each, keep what passes, say what did not.
//
// No measurement question afterwards. That question is「この1件はどの測定が生んだか」
// and it has no sensible answer for twelve files at once; the link is made per
// file from the card, or from the measurement's own データを登録する.
async function registerDirectory(dir) {
  state.error = null;
  state.fileNotice = null;
  const projectId = state.workspace.project.id;
  const targets = state.files.filter(f => {
    if (f.asset_id) return false;
    const parts = f.relative_path.split(/[\\/]/);
    return parts.slice(0, -1).join('\\') === dir;
  });
  if (!targets.length) return;
  state.registeringDir = dir;
  render();
  let done = 0;
  const failed = [];
  for (const f of targets) {
    try { await api.registerAsset(projectId, f.relative_path); done++; }
    catch (e) { failed.push(`${f.relative_path}（${errText(e)}）`); }
  }
  try {
    await refreshWorkspace();
    state.files = await api.scanFiles(projectId);
  } catch (e) { state.error = errText(e); }
  state.registeringDir = null;
  if (done) state.fileNotice = { path: dir || 'このフォルダの直下', count: done, assetId: null, measurement: null };
  // Named, not counted. "3件が失敗しました" leaves the researcher to work out
  // which three, in a folder they just registered all of.
  if (failed.length) state.error = `登録できなかったファイルがあります: ${failed.join('、')}`;
  render();
}

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
const UNDO_MS = 180_000;
let undoTimer = null;

// Whichever way the decision went, and the way back to where it was. Confirming
// used to leave 提案中に戻す standing on the card for good, which reads as an act
// nobody performs: a settled claim does not go back to being under discussion.
// What is real is the few minutes in which the press was a slip -- the same few
// minutes a rejection gets -- so both decisions leave the same offer and it goes
// the same way.
function setDecisionNotice(object, to) {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (!object) { state.decisionNotice = null; return; }
  state.decisionNotice = {
    id: object.id, title: object.title, type: object.type,
    from: object.status, to, until: Date.now() + UNDO_MS,
  };
  // The window closing is a thing that happens on its own, so the screen has to
  // stop offering without waiting to be visited again.
  undoTimer = setTimeout(() => { undoTimer = null; state.decisionNotice = null; render(); }, UNDO_MS);
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
      decideHintClosed: false,
      files: [], selectedObjectId: null, selectedObject: null, linking: null,
      fileNotice: null, decisionNotice: null, rootNotice: null,
      currentScreen: 'map', query: '', draft: '', error: null,
    });
    setDecisionNotice(null);
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
