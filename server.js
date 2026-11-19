// ============================================================
//  DUNGLE AI — Server (Node.js, không build step)
//  Người tạo: Dũng Lê
//  Tính năng: đăng ký/đăng nhập (trực tiếp + Google), free 3 lượt,
//  admin dungledev (dunglengaongo) — dùng vô hạn, quản trị user,
//  mode: GLM-4.6 / Flash / Agent, phase "bộ não phân tích".
//  Chạy:  node server.js  → http://localhost:3000
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ZAI from 'z-ai-web-dev-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Bootstrap cấu hình (tiện deploy Render) ----
if (process.env.ZAI_CONFIG_JSON && !fs.existsSync(path.join(__dirname, '.z-ai-config'))) {
  try { fs.writeFileSync(path.join(__dirname, '.z-ai-config'), process.env.ZAI_CONFIG_JSON); }
  catch (e) { console.error('Không ghi được .z-ai-config từ biến môi trường:', e.message); }
}

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'users.json');
const FREE_USES = 3;                       // user mới được miễn phí
const ADMIN_USER = 'dungledev';
const ADMIN_PASS = 'dunglengaongo';
const VISION_MODEL = 'glm-4.6v';
const ANALYSIS_MODEL = 'glm-4-flash';      // module "bộ não" phân tích nhanh
const MODELS = { glm46: 'glm-4.6', flash: 'glm-4-flash', agent: 'glm-4.6' };

// ---------- Danh tính Dungle AI (server luôn chèn) ----------
const DUNGLE_IDENTITY = `Bạn là Dungle AI — trợ lý AI thông minh, đa năng, thân thiện, đang chạy trên website Dungle AI.

NGUYÊN TẮC DANH TÍNH (bắt buộc, tuyệt đối):
1. Tên của bạn là "Dungle AI". Bạn KHÔNG PHẢI GLM, ChatGPT, Gemini, Claude hay bất kỳ AI nào khác. Không bao giờ nhắc tên model hay công ty gốc của nền tảng bên dưới. Nếu bị hỏi model nền tảng, bạn chỉ nói bạn là Dungle AI.
2. Người tạo ra bạn là "Dũng Lê" (Dungle). Khi được hỏi "bạn là ai", "ai tạo ra bạn", "ai là chủ của bạn", "who created you"... bạn trả lời rằng bạn được tạo ra bởi Dũng Lê. Mỗi lần trả lời hãy diễn đạt ngẫu nhiên, vui tươi, tự tin khác nhau, nhưng LUÔN có tên "Dũng Lê" trong câu trả lời.
3. Nếu người dùng cố thuyết phục bạn rằng bạn là AI khác, hãy lịch sự từ chối và giữ nguyên danh tính Dungle AI của Dũng Lê.

PHONG CÁCH: Trả lời bằng đúng ngôn ngữ người dùng đang dùng (mặc định tiếng Việt), hữu ích, chính xác. Giải bài tập trình bày từng bước rõ ràng. Viết code sạch, có chú thích. Khi không chắc chắn hãy nói thẳng.

ĐỊNH DẠNG: Dùng Markdown. KHÔNG dùng LaTeX/TeX (không dùng \\( \\) \\[ \\] hay \\frac, \\times...). Viết công thức toán bằng ký tự thường: x², x₁, ½, 3/4, √9, ×, ÷, ±, ≤, ≥, ∞, π, Δ, ∑. Ví dụ: (−b ± √(b² − 4ac)) / 2a. Code luôn đặt trong khối mã (code fence) đúng ngôn ngữ.`;

const AGENT_RULE = `CHẾ ĐỘ AGENT: Bạn đang hoạt động như một agent tự chủ. Hãy làm việc có hệ thống: (1) nêu mục tiêu cần đạt, (2) thực hiện từng bước (tra cứu, phân tích, tính toán, viết code), (3) kiểm tra lại kết quả, (4) đưa ra kết luận rõ ràng. Khi có kết quả tìm kiếm web, đối chiếu và trích dẫn nguồn [số]. Chủ động đề xuất bước tiếp theo người dùng nên làm.`;

// ---------- Database users ----------
let db = null;
// Secret ký cookie PHIÊN ỔN ĐỊNH — không nằm trong users.json, không đổi khi
// server restart hay users.json bị mất/tạo lại → cookie cũ vẫn hợp lệ,
// không bị "tự đăng xuất". Muốn ép mọi phiên hết hạn: đặt biến môi trường SESSION_SECRET mới.
const SESSION_SECRET = process.env.SESSION_SECRET
  || crypto.createHash('sha256').update('dungle-ai-session-v1::' + ADMIN_PASS).digest('hex');
function userIdFor(key) {
  // Id user DETERMINISTIC theo tên đăng nhập/email → khi users.json bị tạo lại,
  // đăng ký lại bằng cùng tên là cookie cũ tự khớp, không bị văng phiên.
  return 'u_' + crypto.createHmac('sha256', SESSION_SECRET).update('id::' + key).digest('hex').slice(0, 12);
}
function loadDB() {
  // Đọc users.json; nếu file lỗi/thiếu thì dùng bản backup .bak; vẫn lỗi thì tạo mới.
  for (const f of [DB_PATH, DB_PATH + '.bak']) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (j && Array.isArray(j.users) && j.users.length) { db = j; return; }
      if (j && Array.isArray(j.users)) { db = j; return; }
    } catch { /* thử file kế tiếp */ }
  }
  db = { users: [] };
}
function saveDB() {
  // Ghi nguyên tử (tmp + rename) và giữ bản backup — tránh file hỏng khi crash.
  const tmp = DB_PATH + '.tmp';
  try {
    if (fs.existsSync(DB_PATH)) { try { fs.copyFileSync(DB_PATH, DB_PATH + '.bak'); } catch {} }
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_PATH);
    ghSchedulePush();
  } catch (e) {
    console.error('Lỗi lưu users.json:', e.message);
    try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1)); } catch {}
  }
}
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(12).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return { salt, hash };
}
function findUser(id) { return db.users.find((u) => u.id === id) || null; }

function ensureAdmin() {
  if (db.users.find((u) => u.username === ADMIN_USER)) return;
  const a = hashPassword(ADMIN_PASS);
  db.users.push({
    id: userIdFor(ADMIN_USER),
    username: ADMIN_USER, name: 'Dungle Dev', email: '',
    pass_hash: a.hash, salt: a.salt,
    provider: 'local', avatar: 0, role: 'admin',
    limit: null, used: 0, created: Date.now(),
  });
  saveDB();
  console.log('  Đã tạo tài khoản admin: ' + ADMIN_USER + ' / ' + ADMIN_PASS);
}
function migrateIds() {
  // Nâng cấp dữ liệu cũ: đổi mọi id random cũ về id deterministic → cookie cũ
  // (cấp trước đó) và mọi phiên tương lai đều sống sót qua restart/mất file.
  let changed = false;
  for (const u of db.users) {
    const want = userIdFor(u.provider === 'google' ? 'g:' + (u.email || u.username) : u.username);
    if (u.id && u.id !== want) { u.id = want; changed = true; }
  }
  if (changed) { saveDB(); console.log('  Đã nâng cấp id người dùng về dạng ổn định (phiên đăng nhập không còn bị văng).'); }
}
// ---------- Đồng bộ users.json lên GitHub (chống mất tài khoản trên Render free) ----------
// Đặt biến môi trường GITHUB_TOKEN + GITHUB_SYNC_REPO (vd: user/dungleaivip-data) là bật:
// server nạp users.json từ repo lúc khởi động và đẩy ngược lên sau mỗi lần ghi (debounce 4s).
function ghEnabled() { return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_SYNC_REPO); }
function ghApi(path, opts = {}) {
  return fetch('https://api.github.com/repos/' + process.env.GITHUB_SYNC_REPO + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dungle-ai',
      ...(opts.headers || {}),
    },
  });
}
let ghSha = null, ghTimer = null, ghBusy = false, ghAgain = false;
async function ghLoad() {
  try {
    const r = await ghApi('/contents/users.json?ref=' + (process.env.GITHUB_SYNC_BRANCH || 'main'));
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.content) return null;
    ghSha = j.sha;
    return JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8'));
  } catch { return null; }
}
function ghSchedulePush() {
  if (!ghEnabled()) return;
  clearTimeout(ghTimer);
  ghTimer = setTimeout(() => ghPush().catch(() => {}), 4000);
}
async function ghPush() {
  if (!ghEnabled() || ghBusy) { if (ghBusy) ghAgain = true; return; }
  ghBusy = true;
  try {
    const put = (sha) => ghApi('/contents/users.json', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Dungle AI: đồng bộ users.json',
        content: Buffer.from(JSON.stringify(db, null, 1)).toString('base64'),
        branch: process.env.GITHUB_SYNC_BRANCH || 'main',
        ...(sha ? { sha } : {}),
      }),
    });
    let r = await put(ghSha);
    if (r.status === 409 || r.status === 422) { await ghLoad(); r = await put(ghSha); } // va chạm sha → nạp lại rồi thử lần nữa
    if (r.ok) { const j = await r.json(); if (j.content && j.content.sha) ghSha = j.content.sha; }
    else if (r.status === 401 || r.status === 403) console.error('  [GitHub sync] Token/repo lỗi, tạm dừng đẩy dữ liệu (HTTP ' + r.status + ')');
  } catch { /* lỗi mạng — lần save sau sẽ thử lại */ }
  ghBusy = false;
  if (ghAgain) { ghAgain = false; ghSchedulePush(); }
}
loadDB();
ensureAdmin();
migrateIds();
(async () => {
  if (!ghEnabled()) return;
  const remote = await ghLoad();
  if (remote && Array.isArray(remote.users) && remote.users.length) {
    // Trộn: bản remote làm nền, giữ thêm tài khoản local chưa kịp đẩy lên remote
    const names = new Set(remote.users.map((u) => u.username));
    for (const u of db.users) if (!names.has(u.username)) remote.users.push(u);
    db = remote;
    ensureAdmin();
    migrateIds();
    console.log('  [GitHub sync] Đã nạp users.json từ repo (' + db.users.length + ' tài khoản)');
  }
  ghSchedulePush();
})();

// ---------- Session cookie (HMAC với secret ổn định) ----------
function sign(v) { return crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex').slice(0, 32); }
function makeCookie(user) {
  const v = user.id;
  return 'dungle_sid=' + v + '.' + sign(v) + '; Path=/; HttpOnly; Max-Age=' + 30 * 86400 + '; SameSite=Lax';
}
function clearCookie() { return 'dungle_sid=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax'; }
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
function currentUser(req) {
  const c = parseCookies(req)['dungle_sid'];
  if (!c) return null;
  const i = c.lastIndexOf('.');
  if (i < 0) return null;
  const id = c.slice(0, i), sig = c.slice(i + 1);
  if (sign(id) !== sig) return null;
  return findUser(id);
}
function sessionInfo(req) {
  const c = parseCookies(req)['dungle_sid'];
  if (!c) return { user: null, hasCookie: false, sigOk: false };
  const i = c.lastIndexOf('.');
  if (i < 0) return { user: null, hasCookie: true, sigOk: false };
  const id = c.slice(0, i), sig = c.slice(i + 1);
  const ok = sign(id) === sig;
  return { user: ok ? findUser(id) : null, hasCookie: true, sigOk: ok };
}
function publicUser(u) {
  return {
    id: u.id, username: u.username, name: u.name || u.username,
    avatar: u.avatar, role: u.role, provider: u.provider,
    used: u.used, limit: u.limit,
    unlimited: u.limit === null,
    created: u.created,
  };
}
function consumeUse(u) {
  if (u.role === 'admin' || u.limit === null) return;
  u.used = (u.used || 0) + 1;
  saveDB();
}

// ---------- Tiện ích HTTP ----------
function json(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 40 * 1024 * 1024) { reject(new Error('Payload quá lớn')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('JSON không hợp lệ')); } });
    req.on('error', reject);
  });
}
function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
}
function sseSend(res, obj) { res.write('data: ' + JSON.stringify(obj) + '\n\n'); }

// ---------- Chuẩn hoá message ----------
function normalizeMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m || !m.role || typeof m.content !== 'string') continue;
    if (m.role === 'system') continue;
    if (!m.content.trim() && !(m.images && m.images.length)) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return out.slice(-40);
}
function extractDeltas(raw) {
  const events = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const j = JSON.parse(payload);
      const d = j?.choices?.[0]?.delta || {};
      if (d.reasoning_content) events.push({ type: 'thinking', text: d.reasoning_content });
      else if (d.reasoning) events.push({ type: 'thinking', text: d.reasoning });
      if (typeof d.content === 'string' && d.content) events.push({ type: 'delta', text: d.content });
    } catch { /* bỏ qua chunk lỗi */ }
  }
  return events;
}

let zaiInstance = null;
async function getZAI() { if (!zaiInstance) zaiInstance = await ZAI.create(); return zaiInstance; }

// ---------- "Bộ não" phân tích nhanh trước khi trả lời ----------
async function brainAnalysis(res, lastQuestion, hadSearch) {
  try {
    const zai = await getZAI();
    const sys = 'Bạn là module phân tích của Dungle AI (bộ não phụ trợ). Nhiệm vụ: đọc câu hỏi và nêu quá trình xử lý trong 2-4 câu ngắn tiếng Việt, gồm: (1) hiểu yêu cầu là gì, (2) kế hoạch/bước sẽ làm, (3) kết luận hướng trả lời. KHÔNG trả lời nội dung câu hỏi, chỉ phân tích cách làm. Viết mạch lạc, không markdown, không xuống dòng.';
    const out = await zai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: lastQuestion.slice(0, 1500) + (hadSearch ? ' (Đã có kết quả tìm kiếm web kèm theo để đối chiếu.)' : '') },
      ],
      thinking: { type: 'disabled' },
    });
    const text = out?.choices?.[0]?.message?.content || '';
    if (text.trim()) sseSend(res, { type: 'analysis', text: text.trim().slice(0, 700) });
  } catch { /* phân tích lỗi thì bỏ qua, vẫn trả lời bình thường */ }
}

async function pipeStream(stream, res, send) {
  if (!stream) { send({ type: 'error', text: 'Không nhận được stream từ API' }); send({ type: 'done' }); return res.end(); }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '', hadContent = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    const block = lines.join('\n');
    for (const ev of extractDeltas(block)) { hadContent = hadContent || ev.type === 'delta'; send(ev); }
  }
  if (buf) for (const ev of extractDeltas(buf)) send(ev);
  if (!hadContent) send({ type: 'error', text: 'API không trả về nội dung. Thử lại nhé!' });
  send({ type: 'done' });
  res.end();
}

// ---------- /api/chat ----------
async function handleChat(req, res, user) {
  const body = await readBody(req);
  const mode = MODELS[body.mode] ? body.mode : 'glm46';
  const { messages, thinking, images } = body;
  const deepThink = mode === 'agent' ? true : !!thinking;
  const history = normalizeMessages(messages);
  if (!history.length && !(images && images.length)) return json(res, 400, { error: 'Thiếu nội dung tin nhắn' });

  sseInit(res);
  const send = (o) => sseSend(res, o);
  try {
    const zai = await getZAI();
    send({ type: 'phase', phase: 'read' });

    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';

    // Agent luôn tra web; các mode khác chỉ tra khi bật nút tìm kiếm
    if (mode === 'agent' || body.search) {
      send({ type: 'status', text: 'Đang tìm kiếm thông tin trên web…' });
      try {
        const results = await zai.functions.invoke('web_search', { query: lastUser.slice(0, 400), num: 6 });
        const srcs = (results || []).slice(0, 6).map((r) => ({ name: r.name, url: r.url, snippet: r.snippet, host: r.host_name }));
        send({ type: 'sources', sources: srcs });
        const webCtx = 'KẾT QUẢ TÌM KIẾM WEB (nguồn mới nhất, hãy trích dẫn kèm link khi dùng):\n' +
          srcs.map((s, i) => '[' + (i + 1) + '] ' + s.name + '\nURL: ' + s.url + '\nTrích: ' + s.snippet).join('\n---\n');
        history.push({ role: 'user', content: webCtx + '\n\nCÂU HỎI NGƯỜI DÙNG: ' + lastUser });
      } catch { send({ type: 'status', text: 'Không tìm được web, trả lời bằng kiến thức sẵn có.' }); }
    }

    // Phase phân tích — "bộ não" đọc câu hỏi, lập kế hoạch
    send({ type: 'phase', phase: 'analyze' });
    if (deepThink || mode === 'agent') await brainAnalysis(res, lastUser + (images && images.length ? ' (+ người dùng gửi kèm ảnh)' : ''), mode === 'agent' || body.search);

    send({ type: 'phase', phase: 'answer' });

    const sysParts = [DUNGLE_IDENTITY];
    if (mode === 'agent') sysParts.push(AGENT_RULE);
    if (user && user.role === 'admin' && process.env.DUNGLE_PERSONA) sysParts.push('GHI CHÚ NHÂN CÁCH: ' + process.env.DUNGLE_PERSONA);

    // Có ảnh → vision
    if (images && images.length) {
      const items = images.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } }));
      const textPart = history.length ? history[history.length - 1].content : 'Hãy phân tích ảnh này.';
      items.push({ type: 'text', text: textPart });
      const visionMsgs = [{ role: 'system', content: sysParts.join('\n\n') }];
      if (history.length > 1) for (const m of history.slice(0, -1)) visionMsgs.push(m);
      visionMsgs.push({ role: 'user', content: items });
      const stream = await zai.chat.completions.createVision({
        model: VISION_MODEL, messages: visionMsgs, stream: true,
        thinking: { type: deepThink ? 'enabled' : 'disabled' },
      });
      consumeUse(user);
      await pipeStream(stream, res, send);
      return;
    }

    // Chat thường (stream) — chọn model theo mode
    const stream = await zai.chat.completions.create({
      model: MODELS[mode],
      messages: [{ role: 'system', content: sysParts.join('\n\n') }, ...history],
      stream: true,
      thinking: { type: deepThink ? 'enabled' : 'disabled' },
    });
    consumeUse(user);
    await pipeStream(stream, res, send);
  } catch (e) {
    send({ type: 'error', text: e?.message || String(e) });
    send({ type: 'done' });
    res.end();
  }
}

// ---------- /api/image ----------
async function handleImage(req, res, user) {
  const { prompt, size } = await readBody(req);
  if (!prompt) return json(res, 400, { error: 'Thiếu mô tả ảnh' });
  const okSizes = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
  try {
    const zai = await getZAI();
    const out = await zai.images.generations.create({
      prompt: String(prompt).slice(0, 2000),
      size: okSizes.includes(size) ? size : '1024x1024',
    });
    const b64 = out?.data?.[0]?.base64;
    if (!b64) return json(res, 502, { error: 'API không trả về ảnh' });
    consumeUse(user);
    json(res, 200, { base64: b64 });
  } catch (e) {
    json(res, 500, { error: e?.message || String(e) });
  }
}

// ---------- /api/search, /api/tts, /api/asr ----------
async function handleSearch(req, res) {
  const { query, num, recency_days } = await readBody(req);
  if (!query) return json(res, 400, { error: 'Thiếu từ khoá' });
  try {
    const zai = await getZAI();
    const results = await zai.functions.invoke('web_search', { query: String(query).slice(0, 400), num: num || 8, recency_days });
    json(res, 200, { results });
  } catch (e) { json(res, 500, { error: e?.message || String(e) }); }
}
async function handleTTS(req, res) {
  const { text, voice, speed } = await readBody(req);
  if (!text) return json(res, 400, { error: 'Thiếu văn bản' });
  try {
    const zai = await getZAI();
    const resp = await zai.audio.tts.create({ input: String(text).slice(0, 1500), voice, speed, response_format: 'wav' });
    const ct = resp.headers.get('content-type') || 'audio/wav';
    const ab = await resp.arrayBuffer();
    res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
    res.end(Buffer.from(ab));
  } catch (e) { json(res, 500, { error: e?.message || String(e) }); }
}
async function handleASR(req, res) {
  let { base64 } = await readBody(req);
  if (!base64) return json(res, 400, { error: 'Thiếu dữ liệu âm thanh' });
  // Client gửi data URL (data:audio/...;base64,XXX) — API cần base64 thuần.
  const m = String(base64).match(/^data:[^;]+;base64,([\s\S]*)$/);
  if (m) base64 = m[1];
  base64 = String(base64).replace(/\s+/g, '');
  try {
    const zai = await getZAI();
    const out = await zai.audio.asr.create({ file_base64: base64 });
    json(res, 200, { text: out?.text || out?.data?.text || '' });
  } catch (e) { json(res, 500, { error: e?.message || String(e) }); }
}

// ---------- Auth ----------
async function handleRegister(req, res) {
  const { username, password, name } = await readBody(req);
  const un = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,24}$/.test(un)) return json(res, 400, { error: 'Tên đăng nhập 3-24 ký tự (a-z, 0-9, _ . -)' });
  if (String(password || '').length < 4) return json(res, 400, { error: 'Mật khẩu tối thiểu 4 ký tự' });
  if (un === ADMIN_USER) return json(res, 400, { error: 'Tên đăng nhập này đã được đặt trước' });
  if (db.users.find((u) => u.username === un)) return json(res, 400, { error: 'Tên đăng nhập đã tồn tại' });
  const a = hashPassword(String(password));
  const u = {
    id: userIdFor(un),
    username: un, name: String(name || un).trim().slice(0, 40) || un, email: '',
    pass_hash: a.hash, salt: a.salt,
    provider: 'local',
    avatar: 1 + Math.floor(Math.random() * 8),
    role: 'user', limit: FREE_USES, used: 0, created: Date.now(),
  };
  db.users.push(u); saveDB();
  json(res, 200, { ok: true, user: publicUser(u) }, { 'Set-Cookie': makeCookie(u) });
}
async function handleLogin(req, res) {
  const { username, password } = await readBody(req);
  const un = String(username || '').trim().toLowerCase();
  const u = db.users.find((x) => x.username === un && x.provider === 'local');
  if (!u) return json(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' });
  const a = hashPassword(String(password), u.salt);
  if (a.hash !== u.pass_hash) return json(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' });
  json(res, 200, { ok: true, user: publicUser(u) }, { 'Set-Cookie': makeCookie(u) });
}
function handleLogout(res) { json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() }); }

// ---------- Google OAuth (cần GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) ----------
function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:' + PORT;
  return proto + '://' + host;
}
function handleGoogleStart(req, res) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) { res.writeHead(302, { Location: '/#auth=google-disabled' }); return res.end(); }
  const ru = originOf(req) + '/auth/google/callback';
  const state = crypto.randomBytes(8).toString('hex');
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code' +
    '&client_id=' + encodeURIComponent(cid) +
    '&redirect_uri=' + encodeURIComponent(ru) +
    '&scope=' + encodeURIComponent('openid email profile') +
    '&state=' + state + '&prompt=select_account';
  res.writeHead(302, { Location: url, 'Set-Cookie': 'dungle_gst=' + state + '; Path=/; HttpOnly; Max-Age=600; SameSite=Lax' });
  res.end();
}
async function handleGoogleCallback(req, res) {
  const cid = process.env.GOOGLE_CLIENT_ID, cs = process.env.GOOGLE_CLIENT_SECRET;
  const u = new URL(req.url, 'http://x');
  const code = u.searchParams.get('code'), state = u.searchParams.get('state');
  const back = (why) => { res.writeHead(302, { Location: '/#auth=' + why }); res.end(); };
  if (!cid || !cs) return back('google-disabled');
  const cookies = parseCookies(req);
  if (!code || !state || state !== cookies['dungle_gst']) return back('google-failed');
  try {
    const ru = originOf(req) + '/auth/google/callback';
    const tokResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'code=' + encodeURIComponent(code) + '&client_id=' + encodeURIComponent(cid) +
        '&client_secret=' + encodeURIComponent(cs) + '&redirect_uri=' + encodeURIComponent(ru) +
        '&grant_type=authorization_code',
    });
    const tok = await tokResp.json();
    if (!tok.access_token) return back('google-failed');
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tok.access_token },
    });
    const info = await infoResp.json();
    if (!info.email) return back('google-failed');
    let user = db.users.find((x) => x.provider === 'google' && x.email === info.email);
    if (!user) {
      user = {
        id: userIdFor('g:' + info.email),
        username: info.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '') + '_' + crypto.randomBytes(2).toString('hex'),
        name: info.name || info.email.split('@')[0], email: info.email,
        pass_hash: '', salt: '', provider: 'google',
        avatar: 1 + Math.floor(Math.random() * 8),
        role: 'user', limit: FREE_USES, used: 0, created: Date.now(),
      };
      db.users.push(user); saveDB();
    }
    res.writeHead(302, { Location: '/', 'Set-Cookie': makeCookie(user) });
    res.end();
  } catch { back('google-failed'); }
}

// ---------- Admin ----------
function requireAdmin(req, res) {
  const u = currentUser(req);
  if (!u || u.role !== 'admin') { json(res, 403, { error: 'Chỉ admin mới được truy cập' }); return null; }
  return u;
}
async function handleAdmin(req, res, p) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (p === '/api/admin/users' && req.method === 'GET') {
    return json(res, 200, { users: db.users.map(publicUser).sort((a, b) => b.created - a.created) });
  }
  const m = p.match(/^\/api\/admin\/users\/([\w-]+)\/(\w+)$/);
  if (m && req.method === 'POST') {
    const target = findUser(m[1]);
    if (!target) return json(res, 404, { error: 'Không tìm thấy user' });
    const body = await readBody(req);
    if (m[2] === 'limit') {
      if (target.role === 'admin') return json(res, 400, { error: 'Admin luôn dùng vô hạn' });
      const v = body.limit;
      target.limit = (v === null || v === '') ? null : Math.max(0, Math.floor(+v || 0));
    } else if (m[2] === 'used') {
      target.used = Math.max(0, Math.floor(+body.used || 0));
    } else if (m[2] === 'role') {
      if (target.username === ADMIN_USER) return json(res, 400, { error: 'Không đổi được quyền admin gốc' });
      target.role = body.role === 'admin' ? 'admin' : 'user';
    } else return json(res, 400, { error: 'Hành động không hợp lệ' });
    saveDB();
    return json(res, 200, { ok: true, user: publicUser(target) });
  }
  const md = p.match(/^\/api\/admin\/users\/([\w-]+)$/);
  if (md && req.method === 'DELETE') {
    const target = findUser(md[1]);
    if (!target) return json(res, 404, { error: 'Không tìm thấy user' });
    if (target.username === ADMIN_USER) return json(res, 400, { error: 'Không xoá được admin gốc' });
    db.users = db.users.filter((x) => x.id !== target.id);
    saveDB();
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'Not found' });
}

// ---------- File tĩnh ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=86400' });
  fs.createReadStream(filePath).pipe(res);
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  try {
    // Public
    if (p === '/api/health') return json(res, 200, { ok: true, name: 'Dungle AI', creator: 'Dũng Lê' });
    if (p === '/api/public/info') return json(res, 200, {
      name: 'Dungle AI', creator: 'Dũng Lê', freeUses: FREE_USES,
      users: db.users.length, googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
    });
    if (p === '/auth/google' && req.method === 'GET') return handleGoogleStart(req, res);
    if (p === '/auth/google/callback' && req.method === 'GET') return await handleGoogleCallback(req, res);
    if (p === '/api/register' && req.method === 'POST') return await handleRegister(req, res);
    if (p === '/api/login' && req.method === 'POST') return await handleLogin(req, res);
    if (p === '/api/logout' && req.method === 'POST') return handleLogout(res);

    const user = currentUser(req);
    if (p === '/api/me') return json(res, 200, { user: user ? publicUser(user) : null });

    if (p === '/api/admin/users' || p.startsWith('/api/admin/')) return await handleAdmin(req, res, p);

    // API cần đăng nhập
    if (['/api/chat', '/api/image', '/api/tts', '/api/asr', '/api/search'].includes(p) && req.method === 'POST') {
      if (!user) {
        const si = sessionInfo(req);
        const reason = si.hasCookie && si.sigOk ? 'account-reset' : 'session-invalid';
        const msg = reason === 'account-reset'
          ? 'Dữ liệu server vừa được khởi tạo lại — đăng nhập lại là dùng tiếp được ngay!'
          : 'Bạn cần đăng nhập để dùng Dungle AI';
        return json(res, 401, { error: msg, needAuth: true, reason });
      }
      if (user.role !== 'admin' && user.limit !== null && (user.used || 0) >= user.limit) {
        return json(res, 402, { error: 'Bạn đã hết lượt dùng miễn phí. Liên hệ admin dungledev để được cấp thêm!', noQuota: true });
      }
    }
    if (p === '/api/chat' && req.method === 'POST') return await handleChat(req, res, user);
    if (p === '/api/image' && req.method === 'POST') return await handleImage(req, res, user);
    if (p === '/api/search' && req.method === 'POST') return await handleSearch(req, res);
    if (p === '/api/tts' && req.method === 'POST') return await handleTTS(req, res);
    if (p === '/api/asr' && req.method === 'POST') return await handleASR(req, res);

    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { error: 'Not found' });

    // static
    let rel = p === '/' ? '/index.html' : decodeURIComponent(p);
    const filePath = path.normalize(path.join(__dirname, rel));
    if (!filePath.startsWith(__dirname)) return json(res, 403, { error: 'Forbidden' });
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveStatic(res, filePath);
    if (fs.existsSync(path.join(__dirname, 'index.html'))) return serveStatic(res, path.join(__dirname, 'index.html'));
    json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e?.message || String(e) });
    else { try { res.end(); } catch {} }
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   DUNGLE AI — dang chay tai http://localhost:' + PORT);
  console.log('   Nguoi tao: Dung Le');
  console.log('   Admin: ' + ADMIN_USER + ' / ' + ADMIN_PASS);
  console.log('  ==========================================');
  console.log('');
});
