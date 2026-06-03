import React, { useState, useEffect, useCallback } from 'react';
import s from './Admin.module.css';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={s.statCard}>
      <span className={s.statValue} style={accent ? { color: accent } : {}}>{value}</span>
      <span className={s.statLabel}>{label}</span>
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}

function GradeBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={s.gradeRow}>
      <span className={s.gradeLabel}>{label}</span>
      <div className={s.gradeTrack}>
        <div className={s.gradeFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={s.gradeCount} style={{ color }}>{count} <span className={s.gradePct}>({pct}%)</span></span>
    </div>
  );
}

function Histogram({ scores }) {
  const buckets = ['0–20', '21–40', '41–60', '61–80', '81–100'];
  const ranges  = [[0,20],[21,40],[41,60],[61,80],[81,100]];
  const counts  = ranges.map(([lo, hi]) => scores.filter(s => s >= lo && s <= hi).length);
  const max     = Math.max(...counts, 1);
  return (
    <div className={s.histogram}>
      {buckets.map((label, i) => (
        <div key={label} className={s.histCol}>
          <span className={s.histCount}>{counts[i]}</span>
          <div className={s.histBar} style={{ height: `${Math.max(4, (counts[i] / max) * 100)}%` }} />
          <span className={s.histLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [authed,   setAuthed]   = useState(false);
  const [password, setPassword] = useState('');
  const [authErr,  setAuthErr]  = useState('');
  const [stats,    setStats]    = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [fetchErr, setFetchErr] = useState('');

  const fetchStats = useCallback(async (pw) => {
    setBusy(true);
    setFetchErr('');
    try {
      const res = await fetch('/api/admin', { headers: { 'x-admin-key': pw } });
      if (res.status === 401) { sessionStorage.removeItem('admin_key'); setAuthed(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setAuthed(true);
    } catch (e) {
      setFetchErr('Failed to load stats: ' + e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key');
    if (saved) fetchStats(saved);
  }, [fetchStats]);

  async function login() {
    setBusy(true);
    setAuthErr('');
    const res = await fetch('/api/admin', { headers: { 'x-admin-key': password } }).catch(() => null);
    setBusy(false);
    if (!res || res.status === 401) { setAuthErr('Wrong password.'); return; }
    sessionStorage.setItem('admin_key', password);
    setStats(await res.json());
    setAuthed(true);
  }

  function logout() {
    sessionStorage.removeItem('admin_key');
    setAuthed(false);
    setStats(null);
    setPassword('');
  }

  if (!authed) {
    return (
      <div className={s.loginPage}>
        <div className={s.loginBox}>
          <div className={s.loginBrand}>RS</div>
          <h1 className={s.loginTitle}>Admin Panel</h1>
          <input className={s.loginInput} type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()} autoFocus />
          {authErr && <p className={s.loginError}>{authErr}</p>}
          <button className={s.loginBtn} onClick={login} disabled={!password || busy}>
            {busy ? 'Checking…' : 'Enter →'}
          </button>
        </div>
      </div>
    );
  }

  const totalGrades = stats.grades.excellent + stats.grades.good + stats.grades.average + stats.grades.needsWork;
  const totalModes  = stats.modes.general + stats.modes.job;
  const avgScore    = stats.scores.length
    ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
    : null;
  const jobPct = totalModes > 0 ? Math.round((stats.modes.job / totalModes) * 100) : 0;
  const pw = sessionStorage.getItem('admin_key');

  return (
    <div className={s.page}>
      <div className={s.topBar}>
        <span className={s.topLogo}>RS <span className={s.topAdmin}>Admin</span></span>
        <div className={s.topActions}>
          <button className={s.refreshBtn} onClick={() => fetchStats(pw)} disabled={busy}>
            {busy ? '…' : '↻ Refresh'}
          </button>
          <button className={s.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      {fetchErr && <p className={s.fetchErr}>{fetchErr}</p>}

      <div className={s.body}>

        {/* KV not connected notice */}
        {stats.redisConnected === false && (
          <div className={s.notice}>
            <strong>Redis not connected yet.</strong> Go to Vercel → Integrations → search "Upstash Redis" → install and connect to this project. Then add <code>ADMIN_PASSWORD</code> in Environment Variables and redeploy.
          </div>
        )}

        {/* Stat cards */}
        <div className={s.statsRow}>
          <StatCard label="Total Scans"  value={stats.total} />
          <StatCard label="Today"        value={stats.today} />
          <StatCard label="Avg Score"    value={avgScore != null ? `${avgScore}/100` : '—'} />
          <StatCard label="Est. Cost"    value={`$${stats.costUSD}`}
            sub={`${((stats.tokens.input + stats.tokens.output) / 1000).toFixed(1)}k tokens`} />
          <StatCard label="Errors"       value={stats.errors}
            accent={stats.errors > 0 ? '#f04a4a' : undefined} />
        </div>

        <div className={s.midRow}>
          {/* Grade distribution */}
          <div className={s.card}>
            <h3 className={s.cardTitle}>Grade Distribution</h3>
            <div className={s.gradeBars}>
              <GradeBar label="Excellent"  count={stats.grades.excellent} total={totalGrades} color="#c8f04a" />
              <GradeBar label="Good"       count={stats.grades.good}      total={totalGrades} color="#4af0c8" />
              <GradeBar label="Average"    count={stats.grades.average}   total={totalGrades} color="#f0c84a" />
              <GradeBar label="Needs Work" count={stats.grades.needsWork} total={totalGrades} color="#f04a4a" />
            </div>
          </div>

          <div className={s.rightCol}>
            {/* Mode split */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Mode Split</h3>
              <div className={s.modeSplit}>
                <div className={s.modeItem}>
                  <span className={s.modeNum}>{stats.modes.general}</span>
                  <span className={s.modeLbl}>General</span>
                </div>
                <div className={s.modeSep} />
                <div className={s.modeItem}>
                  <span className={s.modeNum} style={{ color: '#4af0c8' }}>{stats.modes.job}</span>
                  <span className={s.modeLbl}>Job Match</span>
                  {totalModes > 0 && <span className={s.modePct}>{jobPct}%</span>}
                </div>
              </div>
            </div>

            {/* Score histogram */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Score Distribution</h3>
              {stats.scores.length > 0
                ? <Histogram scores={stats.scores} />
                : <p className={s.empty}>No data yet</p>}
            </div>
          </div>
        </div>

        {/* Activity log */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>
            Recent Activity
            <span className={s.cardHint}>{stats.activity.length} entries</span>
          </h3>
          {stats.activity.length === 0
            ? <p className={s.empty}>No activity logged yet</p>
            : (
              <div className={s.table}>
                <div className={`${s.tableRow} ${s.tableHead}`}>
                  <span>Time</span><span>Score</span><span>Grade</span><span>Mode</span><span>Tokens</span>
                </div>
                {stats.activity.map((a, i) => {
                  const color = a.score >= 80 ? '#c8f04a' : a.score >= 60 ? '#4af0c8' : a.score >= 40 ? '#f0c84a' : '#f04a4a';
                  return (
                    <div key={i} className={s.tableRow}>
                      <span className={s.cellTime}>{new Date(a.ts).toLocaleString()}</span>
                      <span style={{ color, fontWeight: 500 }}>{a.score}/100</span>
                      <span className={s.cellMuted}>{a.grade}</span>
                      <span className={s.cellMuted}>{a.mode === 'job' ? 'Job Match' : 'General'}</span>
                      <span className={s.cellMuted}>{(a.tokens || 0).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>

      </div>
    </div>
  );
}
