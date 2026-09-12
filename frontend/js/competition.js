(async function () {
  const user = requireSession(['leader', 'member']);
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const caseId = params.get('case');
  if (!caseId) { window.location.href = '/cases.html'; return; }

  const flashHost = document.getElementById('flashHost');
  const socket = createSocket();

  const TAB_DEFS = [
    { key: 'phishing', label: '📧 Phishing', evidenceTypes: ['email'] },
    { key: 'browser', label: '🌐 Browser', evidenceTypes: ['browser'] },
    { key: 'login', label: '🔑 Login Logs', evidenceTypes: ['login'] },
    { key: 'chat', label: '💬 Chats', evidenceTypes: ['chat'] },
    { key: 'transaction', label: '💳 Transactions', evidenceTypes: ['transaction'], noQuestions: true },
    { key: 'suspect', label: '🕵️ Suspects', evidenceTypes: [], suspects: true },
    { key: 'forensic', label: '🔬 Forensic Lab', evidenceTypes: ['forensic', 'document'] },
  ];

  let state = null;
  let activeTab = 'phishing';

  async function load() {
    try {
      state = await Api.get(`/api/team/case/${caseId}`);
    } catch (err) {
      flash(flashHost, err.message, 'error');
      return;
    }
    document.getElementById('caseTitle').textContent = `${state.case.case_code} — ${state.case.title}`;
    document.getElementById('caseSub').textContent = state.case.description;
    updateScore();

    if (state.team.timerStartedAt) {
      showConsole();
      startTimerLoop();
    } else {
      document.getElementById('startScreen').classList.remove('hidden');
    }
  }

  function updateScore() {
    document.getElementById('scoreDisplay').textContent = state.team.score - state.team.hintPenalty;
  }

  document.getElementById('beginBtn').addEventListener('click', async () => {
    try {
      const t = await Api.post(`/api/team/case/${caseId}/timer/start`);
      state.team.timerStartedAt = t.timerStartedAt;
      state.team.timerEndsAt = t.timerEndsAt;
      showConsole();
      startTimerLoop();
    } catch (err) { flash(flashHost, err.message, 'error'); }
  });

  function showConsole() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('mainConsole').classList.remove('hidden');
    renderTabs();
    renderTab(activeTab);
    renderBoard();
    if (state.submission) renderFinalLocked();
  }

  // Backend timestamps are always UTC, but a naive ISO string (no trailing
  // 'Z'/offset — this can happen depending on the DB driver) would be
  // misread as LOCAL time by the browser, silently corrupting the
  // countdown. Force UTC interpretation whenever no offset is present.
  function parseUtcTimestamp(value) {
    if (!value) return null;
    const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(value);
    return new Date(hasOffset ? value : `${value}Z`);
  }

  function startTimerLoop() {
    const el = document.getElementById('timerDisplay');
    let intervalId = null;
    function tick() {
      const end = parseUtcTimestamp(state.team.timerEndsAt).getTime();
      const remaining = Math.max(0, end - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      el.classList.toggle('low', remaining < 5 * 60000);
      if (remaining <= 0) { if (intervalId) clearInterval(intervalId); el.textContent = "TIME'S UP"; }
    }
    tick();
    intervalId = setInterval(tick, 1000);
  }

  // ---------------- Tabs ----------------
  function renderTabs() {
    const tabsEl = document.getElementById('tabs');
    tabsEl.innerHTML = TAB_DEFS.map((t) => `<div class="evidence-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</div>`).join('');
    tabsEl.querySelectorAll('[data-tab]').forEach((el) =>
      el.addEventListener('click', () => { activeTab = el.dataset.tab; renderTabs(); renderTab(activeTab); })
    );
  }

  function renderTab(key) {
    const def = TAB_DEFS.find((t) => t.key === key);
    const panel = document.getElementById('panel');
    let html = `<div class="card-title">${def.label}</div>`;

    if (def.suspects) {
      html += (state.suspects || []).map((s) => `
        <div class="evidence-card">
          <div class="meta">${escapeHtml(s.role || '')}</div>
          <b>${escapeHtml(s.name)}</b>
          <p style="margin:6px 0 0;">${escapeHtml(s.description || '')}</p>
        </div>`).join('');
    } else {
      def.evidenceTypes.forEach((type) => {
        const items = (state.evidence[type] || []);
        items.forEach((item) => {
          const c = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
          html += renderEvidenceCard(type, item.title, c);
        });
      });
    }

    if (!def.noQuestions) {
      const questions = state.questions.filter((q) => q.round_name === key);
      const hints = state.hints.filter((h) => h.round_name === key);
      html += `<div class="qa-block"><h4>Questions</h4>`;
      questions.forEach((q) => { html += renderQuestion(q); });
      if (hints.length) {
        html += `<div style="margin-top:10px;">`;
        hints.forEach((h) => {
          const revealed = state.revealedHints.find((r) => r.id === h.id);
          html += revealed
            ? `<div class="flash info">💡 ${escapeHtml(revealed.hint_text)}</div>`
            : `<button class="btn btn-sm" data-hint="${h.id}">💡 Reveal Hint (−${h.penalty} pts)</button> `;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }

    if (def.key === 'forensic') html += renderForensicTools();

    panel.innerHTML = html;
    wirePanelEvents();

    Api.post(`/api/team/case/${caseId}/view`, { roundName: key }).catch(() => {});
  }

  function renderEvidenceCard(type, title, c) {
    if (type === 'email') {
      return `<div class="evidence-card ${c.suspicious ? 'suspicious' : ''}">
        <div class="meta">From: ${escapeHtml(c.from)} · ${escapeHtml(c.time)}</div>
        <b>${escapeHtml(c.subject)}</b>
        <p style="margin:6px 0;">${escapeHtml(c.body)}</p>
        ${c.link ? `<div class="console-block">${escapeHtml(c.link)}</div>` : ''}
      </div>`;
    }
    if (type === 'login') {
      return `<div class="evidence-card">
        <div class="meta">${escapeHtml(c.time)} · ${escapeHtml(c.device)} · ${escapeHtml(c.location)}</div>
        <span class="badge ${c.status === 'Success' ? 'badge-primary' : 'badge-danger'}">${c.status}</span>
      </div>`;
    }
    if (type === 'browser') {
      return `<div class="evidence-card"><div class="meta">${escapeHtml(c.time)}</div><div class="console-block">${escapeHtml(c.url)}</div></div>`;
    }
    if (type === 'chat') {
      return `<div class="evidence-card"><div class="meta">${escapeHtml(c.time)}</div>
        <p><b>Person A:</b> ${escapeHtml(c.person_a)}</p><p><b>Person B:</b> ${escapeHtml(c.person_b)}</p></div>`;
    }
    if (type === 'transaction') {
      return `<div class="evidence-card"><div class="meta">${escapeHtml(c.time)}</div>
        ₹${c.amount} → ${escapeHtml(c.to_account)} <span class="badge badge-primary">${escapeHtml(c.status)}</span></div>`;
    }
    if (type === 'document') {
      return `<div class="evidence-card"><b>${escapeHtml(c.file_name)}</b> (${escapeHtml(c.file_type)}, ${c.size_kb}KB)
        <div class="meta">Created ${escapeHtml(c.created)} · Modified ${escapeHtml(c.modified)} · Author: ${escapeHtml(c.author)}</div></div>`;
    }
    if (type === 'forensic') {
      if (c.type === 'base64') return `<div class="evidence-card"><div class="meta">Base64 fragment</div><div class="console-block">${escapeHtml(c.encoded)}</div></div>`;
      if (c.type === 'hash') return `<div class="evidence-card"><div class="meta">Hash record</div><div class="console-block">expected: ${escapeHtml(c.expected_hash)}\nevidence: ${escapeHtml(c.evidence_hash)}</div></div>`;
    }
    return `<div class="evidence-card"><pre>${escapeHtml(JSON.stringify(c, null, 2))}</pre></div>`;
  }

  function renderQuestion(q) {
    const solved = state.solved.find((s) => s.question_id === q.id);
    if (solved) {
      return `<div class="qa-row"><div style="flex:1;">
        <b>${escapeHtml(q.question)}</b> <span class="badge">${q.marks} pts</span><br>
        <span class="${solved.is_correct ? 'result-ok' : 'result-bad'}">Your answer: "${escapeHtml(solved.answer_text)}" — ${solved.is_correct ? `Correct (+${solved.marks_awarded})` : 'Incorrect'}</span>
      </div></div>`;
    }
    return `<div class="qa-row">
      <div style="flex:1;">
        <b>${escapeHtml(q.question)}</b> <span class="badge">${q.marks} pts</span><br>
        <input type="text" data-answer-input="${q.id}" placeholder="Type your answer…" />
      </div>
      <button class="btn btn-primary btn-sm" data-answer-submit="${q.id}">Submit</button>
    </div>`;
  }

  function renderForensicTools() {
    return `
      <div class="qa-block">
        <h4>🧪 Base64 Decoder</h4>
        <input id="b64Input" placeholder="Paste base64 string…" />
        <button class="btn btn-sm" id="b64Btn">Decode</button>
        <div id="b64Result" class="console-block" style="margin-top:8px; display:none;"></div>
      </div>
      <div class="qa-block">
        <h4>🔐 Hash Verifier</h4>
        <input id="hashExpected" placeholder="Expected hash" />
        <input id="hashEvidence" placeholder="Evidence hash" />
        <button class="btn btn-sm" id="hashBtn">Compare</button>
        <div id="hashResult" style="margin-top:8px;"></div>
      </div>`;
  }

  function wirePanelEvents() {
    document.querySelectorAll('[data-answer-submit]').forEach((btn) =>
      btn.addEventListener('click', () => submitAnswer(btn.dataset.answerSubmit))
    );
    document.querySelectorAll('[data-hint]').forEach((btn) =>
      btn.addEventListener('click', () => revealHint(btn.dataset.hint))
    );
    const b64Btn = document.getElementById('b64Btn');
    if (b64Btn) b64Btn.addEventListener('click', async () => {
      try {
        const { decoded } = await Api.post('/api/team/forensic/decode', { text: document.getElementById('b64Input').value });
        const r = document.getElementById('b64Result');
        r.style.display = 'block';
        r.textContent = decoded;
      } catch (err) { flash(flashHost, err.message, 'error'); }
    });
    const hashBtn = document.getElementById('hashBtn');
    if (hashBtn) hashBtn.addEventListener('click', async () => {
      const { match } = await Api.post('/api/team/forensic/hash-verify', {
        expectedHash: document.getElementById('hashExpected').value,
        evidenceHash: document.getElementById('hashEvidence').value,
      });
      document.getElementById('hashResult').innerHTML = match ? '<span class="result-ok">✔ Hashes match</span>' : '<span class="result-bad">✘ Hashes do not match</span>';
    });
  }

  async function submitAnswer(questionId) {
    const input = document.querySelector(`[data-answer-input="${questionId}"]`);
    const answer = input.value.trim();
    if (!answer) return;
    try {
      const result = await Api.post(`/api/team/case/${caseId}/answer`, { questionId: Number(questionId), answer });
      state.solved.push({ question_id: Number(questionId), is_correct: result.isCorrect, marks_awarded: result.marksAwarded, answer_text: answer });
      state.team.score = result.caseScore;
      updateScore();
      renderTab(activeTab);
      flash(flashHost, result.isCorrect ? `Correct! +${result.marksAwarded} points` : 'Incorrect — try re-checking the evidence.', result.isCorrect ? 'success' : 'error');
    } catch (err) { flash(flashHost, err.message, 'error'); }
  }

  async function revealHint(hintId) {
    try {
      const result = await Api.post(`/api/team/case/${caseId}/hint`, { hintId: Number(hintId) });
      state.revealedHints.push({ id: result.hintId, hint_text: result.hintText });
      state.team.hintPenalty = result.caseHintPenalty;
      updateScore();
      renderTab(activeTab);
    } catch (err) { flash(flashHost, err.message, 'error'); }
  }

  // ---------------- Evidence board (simple up/down reorder — robust across all browsers) ----------------
  let boardOrder = ['email', 'browser', 'login', 'transaction'];
  function renderBoard() {
    const labels = { email: '📧 Phishing Email', browser: '🌐 Browser Visit', login: '🔑 Login Event', chat: '💬 Chat', transaction: '💳 Transaction' };
    const present = boardOrder.filter((t) => state.evidence[t]);
    if (present.length) boardOrder = present.concat(Object.keys(state.evidence).filter((t) => !present.includes(t) && labels[t]));
    const list = document.getElementById('boardList');
    const alreadyAnswered = state.questions.find((q) => q.round_name === 'evidence_board' && state.solved.find((s) => s.question_id === q.id));
    list.innerHTML = boardOrder.map((type, i) => `
      <li class="evidence-card" style="display:flex; align-items:center; justify-content:space-between;" data-type="${type}">
        <span>${i + 1}. ${labels[type] || type}</span>
        <span>
          <button class="btn btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-move="down" data-idx="${i}" ${i === boardOrder.length - 1 ? 'disabled' : ''}>↓</button>
        </span>
      </li>`).join('');
    list.querySelectorAll('[data-move]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const dir = btn.dataset.move === 'up' ? -1 : 1;
        const swapIdx = idx + dir;
        [boardOrder[idx], boardOrder[swapIdx]] = [boardOrder[swapIdx], boardOrder[idx]];
        renderBoard();
      })
    );
    const submitBtn = document.getElementById('submitBoard');
    if (alreadyAnswered) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Already submitted';
    }
  }
  document.getElementById('submitBoard').addEventListener('click', async () => {
    try {
      const result = await Api.post(`/api/team/case/${caseId}/evidence-board`, { orderedEvidenceTypes: boardOrder });
      state.team.score = result.caseScore;
      updateScore();
      document.getElementById('boardResult').innerHTML = result.isCorrect
        ? `<div class="flash success">✔ Correct chain! +${result.marksAwarded} points</div>`
        : `<div class="flash error">✘ That's not the right order.</div>`;
      document.getElementById('submitBoard').disabled = true;
      document.getElementById('submitBoard').textContent = 'Submitted';
      await load();
    } catch (err) { flash(flashHost, err.message, 'error'); }
  });

  // ---------------- Final report ----------------
  function renderFinalLocked() {
    document.getElementById('finalForm').classList.add('hidden');
    document.getElementById('finalResult').innerHTML = `<div class="flash success">Final report already filed — case score: ${state.submission.final_score}</div>`;
  }
  document.getElementById('finalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await Api.post(`/api/team/case/${caseId}/final`, {
        suspect: document.getElementById('fSuspect').value,
        attackMethod: document.getElementById('fMethod').value,
        attackTime: document.getElementById('fTime').value,
        keyEvidence: document.getElementById('fEvidence').value,
        investigationTimeline: document.getElementById('fTimeline').value,
        conclusion: document.getElementById('fConclusion').value,
      });
      document.getElementById('finalResult').innerHTML = `<div class="flash success">Report filed! Case score: ${result.finalScore} (conclusion bonus +${result.conclusionMarksAwarded})</div>`;
      document.getElementById('finalForm').classList.add('hidden');
      state.team.score = result.finalScore;
      updateScore();
    } catch (err) { flash(flashHost, err.message, 'error'); }
  });

  // ---------------- Investigation Session (camera/mic, explicit consent) ----------------
  const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let sessionStream = null;
  let sessionActive = false;
  const sessionPeers = new Map();

  function setSessionStatusUI(active) {
    const badge = document.getElementById('sessionStatusBadge');
    badge.textContent = active ? 'ACTIVE' : 'INACTIVE';
    badge.className = `badge ${active ? 'badge-primary' : 'badge-secondary'}`;
    document.getElementById('sessionPrivacyNotice').classList.toggle('hidden', !active);
    document.getElementById('sessionStartBtn').classList.toggle('hidden', active);
    document.getElementById('sessionStopBtn').classList.toggle('hidden', !active);
    document.getElementById('sessionConsent').disabled = active;
    document.getElementById('sessionCamera').disabled = active;
    document.getElementById('sessionMic').disabled = active;
  }
  setSessionStatusUI(false);

  document.getElementById('sessionStartBtn').addEventListener('click', async () => {
    const consent = document.getElementById('sessionConsent').checked;
    const wantCamera = document.getElementById('sessionCamera').checked;
    const wantMic = document.getElementById('sessionMic').checked;
    if (!consent) { flash(flashHost, 'Please check the consent box before starting a session.', 'error'); return; }
    if (!wantCamera && !wantMic) { flash(flashHost, 'Select at least camera or microphone to share.', 'error'); return; }
    try {
      sessionStream = await navigator.mediaDevices.getUserMedia({ video: wantCamera, audio: wantMic });
    } catch (err) {
      flash(flashHost, 'Camera/microphone permission was not granted.', 'error');
      return;
    }
    document.getElementById('sessionPreview').srcObject = sessionStream;
    document.getElementById('sessionPreviewWrap').classList.remove('hidden');
    sessionActive = true;
    setSessionStatusUI(true);
    socket.emit('session:start', { camera: wantCamera, mic: wantMic });
  });

  document.getElementById('sessionStopBtn').addEventListener('click', stopSession);
  window.addEventListener('beforeunload', stopSession);

  function stopSession() {
    if (sessionStream) { sessionStream.getTracks().forEach((t) => t.stop()); sessionStream = null; }
    sessionPeers.forEach((pc) => pc.close());
    sessionPeers.clear();
    document.getElementById('sessionPreviewWrap').classList.add('hidden');
    if (sessionActive) socket.emit('session:stop');
    sessionActive = false;
    setSessionStatusUI(false);
  }

  socket.on('session:viewer-request', async ({ viewerConnId }) => {
    if (!sessionActive || !sessionStream) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    sessionPeers.set(viewerConnId, pc);
    sessionStream.getTracks().forEach((t) => pc.addTrack(t, sessionStream));
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('session:signal', { to: viewerConnId, data: { type: 'ice', candidate: e.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) { pc.close(); sessionPeers.delete(viewerConnId); }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('session:signal', { to: viewerConnId, data: { type: 'offer', sdp: offer } });
  });

  socket.on('session:signal', async ({ from, data }) => {
    const pc = sessionPeers.get(from);
    if (!pc) return;
    if (data.type === 'answer') await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    else if (data.type === 'ice') { try { await pc.addIceCandidate(data.candidate); } catch (_) {} }
  });

  socket.on('session:viewer-left', ({ viewerConnId }) => {
    const pc = sessionPeers.get(viewerConnId);
    if (pc) { pc.close(); sessionPeers.delete(viewerConnId); }
  });

  load();
})();
