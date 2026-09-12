(async function () {
  const user = requireSession(['leader', 'member']);
  if (!user) return;

  const flashHost = document.getElementById('flashHost');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await Api.post('/api/auth/logout'); } catch (_) {}
    Api.clearSession();
    window.location.href = '/index.html';
  });

  // ---------------- Roster ----------------
  async function loadRoster() {
    try {
      const { team, members } = await Api.get('/api/leader/team').catch(async () => {
        // Members can't call /api/leader/team (leader-only) — fall back to
        // what we already know from the login response for a read-only view.
        return { team: { team_name: user.teamName || 'Your Team', college: null, total_score: 0, hint_penalty: 0 }, members: null };
      });
      document.getElementById('teamName').textContent = team.team_name;
      document.getElementById('teamSub').textContent = team.college ? `${team.college} · Net score: ${team.total_score - team.hint_penalty}` : `Net score: ${team.total_score - team.hint_penalty}`;

      if (members) renderRoster(members);
      else document.getElementById('rosterCard').classList.add('hidden');
    } catch (err) {
      flash(flashHost, err.message, 'error');
    }
  }

  function renderRoster(members) {
    const chips = document.getElementById('memberChips');
    chips.innerHTML = members.map((m) => `
      <span class="member-chip">
        <span class="avatar">${escapeHtml(m.full_name.slice(0, 1).toUpperCase())}</span>
        ${escapeHtml(m.full_name)} <small style="color:var(--text-faint);">(${m.role})</small>
        ${user.role === 'leader' && m.role !== 'leader' ? `<span class="remove" data-remove="${m.id}">✕</span>` : ''}
      </span>`).join('');
    chips.querySelectorAll('[data-remove]').forEach((el) =>
      el.addEventListener('click', () => removeMember(el.dataset.remove))
    );

    const box = document.getElementById('addMemberBox');
    if (user.role === 'leader') {
      box.innerHTML = `<button class="btn btn-sm btn-primary" id="addMemberBtn">+ Add Teammate</button>`;
      document.getElementById('addMemberBtn').addEventListener('click', showAddMemberForm);
    }
  }

  function showAddMemberForm() {
    const box = document.getElementById('addMemberBox');
    box.innerHTML = `
      <form id="addMemberForm" style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
        <div><label style="margin-bottom:4px;">Name</label><input id="mFullName" style="margin-bottom:0; width:140px;" required /></div>
        <div><label style="margin-bottom:4px;">Username</label><input id="mUsername" style="margin-bottom:0; width:120px;" required /></div>
        <div><label style="margin-bottom:4px;">Password</label><input id="mPassword" type="text" style="margin-bottom:0; width:120px;" required /></div>
        <button class="btn btn-sm btn-primary" type="submit">Add</button>
        <button class="btn btn-sm" type="button" id="cancelAddMember">Cancel</button>
      </form>`;
    document.getElementById('cancelAddMember').addEventListener('click', loadRoster);
    document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.post('/api/leader/members', {
          fullName: document.getElementById('mFullName').value,
          username: document.getElementById('mUsername').value,
          password: document.getElementById('mPassword').value,
        });
        flash(flashHost, 'Teammate added.', 'success');
        loadRoster();
      } catch (err) { flash(flashHost, err.message, 'error'); }
    });
  }

  async function removeMember(id) {
    if (!confirm('Remove this teammate?')) return;
    try {
      await Api.del(`/api/leader/members/${id}`);
      loadRoster();
    } catch (err) { flash(flashHost, err.message, 'error'); }
  }

  // ---------------- Case grid ----------------
  const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
  const STATUS_BADGE = { not_started: 'badge-secondary', in_progress: 'badge-warning', completed: 'badge-primary' };

  async function loadCases() {
    try {
      const { cases } = await Api.get('/api/team/cases');
      const grid = document.getElementById('caseGrid');
      grid.innerHTML = cases.map((c) => {
        const pct = c.status === 'completed' ? 100 : c.status === 'in_progress' ? 50 : 0;
        const actionLabel = c.status === 'not_started' ? 'Start Investigation' : c.status === 'in_progress' ? 'Continue' : 'Review Report';
        return `
        <div class="case-card">
          <span class="status-pill badge ${STATUS_BADGE[c.status]}">${STATUS_LABEL[c.status]}</span>
          <div class="code">${escapeHtml(c.case_code)}</div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.description || '')}</p>
          <div class="meta-row">
            <span>💰 ₹${c.financial_loss ?? '—'}</span>
            <span>⏱ ${c.duration_minutes} min</span>
            <span>🏆 ${c.score} pts</span>
          </div>
          <div class="case-progress-bar"><div class="fill" style="width:${pct}%"></div></div>
          <button class="btn btn-primary btn-block" data-open="${c.id}">${actionLabel}</button>
        </div>`;
      }).join('');
      grid.querySelectorAll('[data-open]').forEach((b) =>
        b.addEventListener('click', () => { window.location.href = `/competition.html?case=${b.dataset.open}`; })
      );
    } catch (err) {
      flash(flashHost, err.message, 'error');
    }
  }

  loadRoster();
  loadCases();
})();
