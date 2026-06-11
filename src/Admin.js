import React, { useState, useEffect, useCallback } from 'react';
import s from './Admin.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function scoreColor(score) {
  return score >= 80 ? '#E4002B' : score >= 60 ? '#ff4d6a' : score >= 40 ? '#ff8c00' : '#cc001a';
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={s.statCard}>
      {icon && <span className={s.statIcon}>{icon}</span>}
      <span className={s.statValue} style={accent ? { color: accent } : {}}>{value}</span>
      <span className={s.statLabel}>{label}</span>
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}

// ── SVG Bar Chart (7-day trend) ───────────────────────────────────────────────
function BarChart({ data, color = '#d4a017', height = 90 }) {
  if (!data || !data.length) return <p className={s.empty}>No data yet</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = 60 / data.length;
  const gap  = 40 / data.length;
  return (
    <div className={s.barChart}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
        {data.map((d, i) => {
          const barH = Math.max(2, (d.value / max) * 80);
          const x = i * (barW + gap) + gap / 2;
          return (
            <g key={i}>
              <rect x={x} y={80 - barH} width={barW} height={barH}
                fill={color} opacity={d.today ? 1 : 0.38} rx={1} />
              {d.today && (
                <rect x={x} y={79} width={barW} height={2} fill={color} rx={1} />
              )}
            </g>
          );
        })}
      </svg>
      <div className={s.barLabels}>
        {data.map((d, i) => (
          <span key={i} className={s.barLabel}
            style={{ fontWeight: d.today ? 600 : 400, color: d.today ? 'var(--text)' : 'var(--text-dim)' }}>
            {d.label}
          </span>
        ))}
      </div>
      <div className={s.barValues}>
        {data.map((d, i) => (
          <span key={i} className={s.barValue}
            style={{ color: d.today ? color : 'var(--text-dim)' }}>
            {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grade Bar ─────────────────────────────────────────────────────────────────
function GradeBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={s.gradeRow}>
      <span className={s.gradeLabel}>{label}</span>
      <div className={s.gradeTrack}>
        <div className={s.gradeFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={s.gradeCount} style={{ color }}>
        {count}<span className={s.gradePct}> {pct}%</span>
      </span>
    </div>
  );
}

// ── Score Histogram ───────────────────────────────────────────────────────────
function Histogram({ scores }) {
  const buckets = ['0–20', '21–40', '41–60', '61–80', '81–100'];
  const ranges  = [[0,20],[21,40],[41,60],[61,80],[81,100]];
  const colors  = ['#c0392b', '#f0a84a', '#e09030', '#c4855a', '#d4a017'];
  const counts  = ranges.map(([lo, hi]) => scores.filter(n => n >= lo && n <= hi).length);
  const max     = Math.max(...counts, 1);
  return (
    <div className={s.histogram}>
      {buckets.map((label, i) => (
        <div key={label} className={s.histCol}>
          <span className={s.histCount}>{counts[i]}</span>
          <div className={s.histBar} style={{
            height: `${Math.max(4, (counts[i] / max) * 100)}%`,
            background: colors[i],
          }} />
          <span className={s.histLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mode Donut ────────────────────────────────────────────────────────────────
function ModeDonut({ general, job }) {
  const total   = general + job || 1;
  const jobFrac = job / total;
  const genFrac = general / total;
  const r = 34, cx = 50, cy = 50, sw = 10;
  const circ    = 2 * Math.PI * r;
  return (
    <div className={s.donutWrap}>
      <svg viewBox="0 0 100 100" style={{ width: 130, height: 130, flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#c8f04a" strokeWidth={sw}
          strokeDasharray={`${genFrac * circ} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4af0c8" strokeWidth={sw}
          strokeDasharray={`${jobFrac * circ} ${circ}`}
          strokeDashoffset={-(genFrac * circ)}
          transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
        <text x="50" y="47" textAnchor="middle" fill="var(--text)" fontSize="11" fontWeight="600">{general + job}</text>
        <text x="50" y="59" textAnchor="middle" fill="var(--text-dim)" fontSize="7">total</text>
      </svg>
      <div className={s.donutLegend}>
        <div className={s.donutItem}>
          <span className={s.donutDot} style={{ background: '#d4a017' }} />
          <span className={s.donutName}>General</span>
          <strong className={s.donutNum}>{general}</strong>
          <span className={s.donutPct}>{Math.round(genFrac * 100)}%</span>
        </div>
        <div className={s.donutItem}>
          <span className={s.donutDot} style={{ background: '#c4855a' }} />
          <span className={s.donutName}>Job Match</span>
          <strong className={s.donutNum} style={{ color: '#c4855a' }}>{job}</strong>
          <span className={s.donutPct}>{Math.round(jobFrac * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Revenue Bar ───────────────────────────────────────────────────────────────
function RevenueBar({ label, count, revenue, total, color }) {
  const pct = total > 0 ? Math.round((revenue / total) * 100) : 0;
  return (
    <div className={s.revRow}>
      <div className={s.revLeft}>
        <span className={s.revDot} style={{ background: color }} />
        <span className={s.revLabel}>{label}</span>
        <span className={s.revCount}>{count} sales</span>
      </div>
      <div className={s.gradeTrack} style={{ flex: 1 }}>
        <div className={s.gradeFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={s.revAmount} style={{ color }}>${(revenue / 100).toFixed(2)}</span>
    </div>
  );
}

// ── Activity Table Row ────────────────────────────────────────────────────────
function TRow({ cols, children, style }) {
  return (
    <div className={s.tableRow} style={{ gridTemplateColumns: cols, ...style }}>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Admin() {
  const [authed,   setAuthed]   = useState(false);
  const [password, setPassword] = useState('');
  const [authErr,  setAuthErr]  = useState('');
  const [stats,    setStats]    = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [tab,      setTab]      = useState('overview');

  const fetchStats = useCallback(async (pw) => {
    setBusy(true); setFetchErr('');
    try {
      const res = await fetch('/api/admin', { headers: { 'x-admin-key': pw } });
      if (res.status === 401) { sessionStorage.removeItem('admin_key'); setAuthed(false); setBusy(false); return; }
      if (!res.ok) {
        const txt = await res.text().catch(() => `HTTP ${res.status}`);
        setFetchErr(`Server error (${res.status}): ${txt.slice(0, 120)}`);
        setBusy(false);
        return;
      }
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
    setBusy(true); setAuthErr('');
    try {
      const res = await fetch('/api/admin', { headers: { 'x-admin-key': password } });
      if (res.status === 401) { setAuthErr('Wrong password.'); setBusy(false); return; }
      if (!res.ok) {
        const txt = await res.text().catch(() => `HTTP ${res.status}`);
        setAuthErr(`Server error (${res.status}): ${txt.slice(0, 120)}`);
        setBusy(false);
        return;
      }
      const data = await res.json();
      sessionStorage.setItem('admin_key', password);
      setStats(data);
      setAuthed(true);
    } catch (e) {
      setAuthErr(`Network error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('admin_key');
    setAuthed(false); setStats(null); setPassword('');
  }

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className={s.loginPage}>
        <div className={s.loginBox}>
          <div className={s.loginBrand}>RS</div>
          <h1 className={s.loginTitle}>Admin Dashboard</h1>
          <p className={s.loginSub}>Analytics · Revenue · Enterprise</p>
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

  // ── Derived values ────────────────────────────────────────────────────────
  const totalGrades  = stats.grades.excellent + stats.grades.good + stats.grades.average + stats.grades.needsWork;
  const avgScore     = stats.scores.length
    ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
    : null;
  const totalRevenue = stats.revenue?.total || 0;
  const pw           = sessionStorage.getItem('admin_key');
  const todayStr     = new Date().toISOString().slice(0, 10);

  const daily = (stats.daily || []).map(d => ({
    ...d,
    today: d.date === todayStr,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
  }));

  const TABS = [
    { id: 'overview',    label: '📊 Overview'   },
    { id: 'scans',       label: '📋 Scans'       },
    { id: 'enterprise',  label: '🏢 Enterprise'  },
    { id: 'revenue',     label: '💰 Revenue'     },
  ];

  return (
    <div className={s.page}>

      {/* ── Top bar ── */}
      <div className={s.topBar}>
        <span className={s.topLogo}>RS <span className={s.topAdmin}>Admin</span></span>
        <nav className={s.tabs}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${s.tab} ${tab === t.id ? s.tabOn : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className={s.topActions}>
          <button className={s.refreshBtn} onClick={() => fetchStats(pw)} disabled={busy}>
            {busy ? '…' : '↻ Refresh'}
          </button>
          <button className={s.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      {fetchErr && <p className={s.fetchErr}>{fetchErr}</p>}

      {stats.redisConnected === false && (
        <div className={s.notice}>
          <strong>Redis not connected.</strong> Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.
          {stats.redisError && <code> {stats.redisError}</code>}
        </div>
      )}

      <div className={s.body}>

        {/* ══════════════════════ OVERVIEW ══════════════════════ */}
        {tab === 'overview' && (
          <>
            <div className={s.statsRow}>
              <StatCard icon="📈" label="Total Scans"      value={stats.total.toLocaleString()} />
              <StatCard icon="📅" label="Scans Today"      value={stats.today} />
              <StatCard icon="⭐" label="Avg Score"
                value={avgScore != null ? avgScore : '—'}
                sub="/100"
                accent={avgScore >= 80 ? '#d4a017' : avgScore >= 60 ? '#c4855a' : '#e09030'} />
              <StatCard icon="💰" label="Est. Revenue"
                value={`$${(totalRevenue / 100).toFixed(2)}`}
                sub={`${stats.revenue?.totalSales || 0} sales`}
                accent="#c8f04a" />
              <StatCard icon="🏢" label="Enterprise Batches"
                value={stats.enterprise?.batches || 0}
                sub={`${stats.enterprise?.total || 0} candidates`} />
              <StatCard icon="⚠️" label="Errors"
                value={stats.errors}
                accent={stats.errors > 0 ? '#c0392b' : undefined} />
            </div>

            <div className={s.chartsRow}>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Daily Scans — Last 7 Days</h3>
                <BarChart
                  data={daily.map(d => ({ label: d.label, value: d.scans, today: d.today }))}
                  color="#c8f04a" />
              </div>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Enterprise Batches — Last 7 Days</h3>
                <BarChart
                  data={daily.map(d => ({ label: d.label, value: d.enterpriseBatches, today: d.today }))}
                  color="#4af0c8" />
              </div>
            </div>

            <div className={s.midRow}>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Grade Distribution</h3>
                <div className={s.gradeBars}>
                  <GradeBar label="Excellent"  count={stats.grades.excellent} total={totalGrades} color="#c8f04a" />
                  <GradeBar label="Good"       count={stats.grades.good}      total={totalGrades} color="#4af0c8" />
                  <GradeBar label="Average"    count={stats.grades.average}   total={totalGrades} color="#f0c84a" />
                  <GradeBar label="Needs Work" count={stats.grades.needsWork} total={totalGrades} color="#f04a4a" />
                </div>
              </div>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Mode Split</h3>
                <ModeDonut general={stats.modes.general} job={stats.modes.job} />
              </div>
            </div>

            <div className={s.card}>
              <h3 className={s.cardTitle}>
                AI Cost Tracker
                <span className={s.cardHint}>${stats.costUSD} estimated</span>
              </h3>
              <div className={s.costRow}>
                <div className={s.costItem}>
                  <span className={s.costNum}>{stats.tokens.input.toLocaleString()}</span>
                  <span className={s.costLbl}>Input tokens</span>
                </div>
                <div className={s.costItem}>
                  <span className={s.costNum}>{stats.tokens.output.toLocaleString()}</span>
                  <span className={s.costLbl}>Output tokens</span>
                </div>
                <div className={s.costItem}>
                  <span className={s.costNum} style={{ color: '#d4a017' }}>${stats.costUSD}</span>
                  <span className={s.costLbl}>Est. AI cost (USD)</span>
                </div>
                <div className={s.costItem}>
                  <span className={s.costNum} style={{ color: totalRevenue / 100 - stats.costUSD > 0 ? '#d4a017' : '#c0392b' }}>
                    ${((totalRevenue / 100) - stats.costUSD).toFixed(2)}
                  </span>
                  <span className={s.costLbl}>Est. profit</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════ SCANS ══════════════════════ */}
        {tab === 'scans' && (
          <>
            <div className={s.statsRow} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <StatCard icon="📈" label="Total Scans"  value={stats.total.toLocaleString()} />
              <StatCard icon="📅" label="Today"        value={stats.today} />
              <StatCard icon="⭐" label="Avg Score"    value={avgScore != null ? `${avgScore}/100` : '—'}
                accent={avgScore >= 80 ? '#d4a017' : avgScore >= 60 ? '#c4855a' : '#e09030'} />
              <StatCard icon="⚠️" label="Errors"       value={stats.errors}
                accent={stats.errors > 0 ? '#c0392b' : undefined} />
            </div>

            <div className={s.midRow}>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Grade Distribution</h3>
                <div className={s.gradeBars}>
                  <GradeBar label="Excellent"  count={stats.grades.excellent} total={totalGrades} color="#c8f04a" />
                  <GradeBar label="Good"       count={stats.grades.good}      total={totalGrades} color="#4af0c8" />
                  <GradeBar label="Average"    count={stats.grades.average}   total={totalGrades} color="#f0c84a" />
                  <GradeBar label="Needs Work" count={stats.grades.needsWork} total={totalGrades} color="#f04a4a" />
                </div>
              </div>
              <div className={s.card}>
                <h3 className={s.cardTitle}>Score Distribution</h3>
                {stats.scores.length > 0
                  ? <Histogram scores={stats.scores} />
                  : <p className={s.empty}>No score data yet</p>}
              </div>
            </div>

            <div className={s.card} style={{ marginBottom: 16 }}>
              <h3 className={s.cardTitle}>Mode Split</h3>
              <ModeDonut general={stats.modes.general} job={stats.modes.job} />
            </div>

            <div className={s.card}>
              <h3 className={s.cardTitle}>
                Recent Activity
                <span className={s.cardHint}>{stats.activity.length} entries shown</span>
              </h3>
              <div className={s.tableWrap}>
                <TRow cols="1.5fr 2fr 80px 100px 110px 80px" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8 }}>
                  {['Time','File','Score','Grade','Mode','Tokens'].map(h => (
                    <span key={h} className={s.tableHead}>{h}</span>
                  ))}
                </TRow>
                {stats.activity.length === 0
                  ? <p className={s.empty}>No activity yet</p>
                  : stats.activity.map((a, i) => (
                    <TRow key={i} cols="1.5fr 2fr 80px 100px 110px 80px">
                      <span className={s.cellTime}>{fmtTime(a.ts)}</span>
                      <span className={s.cellMuted} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.filename || ''}>{a.filename || '—'}</span>
                      <span style={{ color: scoreColor(a.score), fontWeight: 600 }}>{a.score}/100</span>
                      <span className={s.cellMuted}>{a.grade}</span>
                      <span className={s.cellMuted}>{a.mode === 'job' ? '🎯 Job Match' : '📋 General'}</span>
                      <span className={s.cellMuted}>{(a.tokens || 0).toLocaleString()}</span>
                    </TRow>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════ ENTERPRISE ══════════════════════ */}
        {tab === 'enterprise' && (
          <>
            <div className={s.statsRow} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <StatCard icon="👥" label="Total Candidates" value={(stats.enterprise?.total || 0).toLocaleString()} />
              <StatCard icon="📦" label="Total Batches"    value={stats.enterprise?.batches || 0} />
              <StatCard icon="📅" label="Batches Today"    value={stats.enterprise?.today || 0} />
              <StatCard icon="⭐" label="Avg Candidate Score"
                value={stats.enterprise?.avgScore != null ? `${stats.enterprise.avgScore}` : '—'}
                sub="/100"
                accent={stats.enterprise?.avgScore >= 70 ? '#d4a017' : '#e09030'} />
            </div>

            <div className={s.card} style={{ marginBottom: 16 }}>
              <h3 className={s.cardTitle}>Enterprise Batches — Last 7 Days</h3>
              <BarChart
                data={daily.map(d => ({ label: d.label, value: d.enterpriseBatches, today: d.today }))}
                color="#4af0c8" height={100} />
            </div>

            <div className={s.card}>
              <h3 className={s.cardTitle}>Recent Screening Batches</h3>
              <div className={s.tableWrap}>
                <TRow cols="2fr 2fr 90px 100px" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8 }}>
                  {['Time','Job Title','Candidates','Avg Score'].map(h => (
                    <span key={h} className={s.tableHead}>{h}</span>
                  ))}
                </TRow>
                {(stats.enterprise?.activity || []).length === 0
                  ? <p className={s.empty}>No enterprise screenings recorded yet</p>
                  : (stats.enterprise?.activity || []).map((a, i) => (
                    <TRow key={i} cols="2fr 2fr 90px 100px">
                      <span className={s.cellTime}>{fmtTime(a.ts)}</span>
                      <span className={s.cellBold}>{a.jobTitle}</span>
                      <span className={s.cellMuted}>{a.count}</span>
                      <span style={{ color: scoreColor(a.avgScore), fontWeight: 600 }}>{a.avgScore}/100</span>
                    </TRow>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════ REVENUE ══════════════════════ */}
        {tab === 'revenue' && (
          <>
            <div className={s.statsRow}>
              <StatCard icon="💰" label="Total Revenue"
                value={`$${(totalRevenue / 100).toFixed(2)}`}
                accent="#c8f04a" />
              <StatCard icon="🛒" label="Total Sales"     value={stats.revenue?.totalSales || 0} />
              <StatCard icon="📝" label="Resume Rewrites"
                value={stats.revenue?.rewrite?.count || 0}
                sub={`$${((stats.revenue?.rewrite?.total || 0) / 100).toFixed(2)}`} />
              <StatCard icon="✉️" label="Cover Letters"
                value={stats.revenue?.coverletter?.count || 0}
                sub={`$${((stats.revenue?.coverletter?.total || 0) / 100).toFixed(2)}`} />
              <StatCard icon="📦" label="Bundles"
                value={stats.revenue?.bundle?.count || 0}
                sub={`$${((stats.revenue?.bundle?.total || 0) / 100).toFixed(2)}`}
                accent="#a855f7" />
              <StatCard icon="💼" label="LinkedIn Opts."
                value={stats.revenue?.linkedin?.count || 0}
                sub={`$${((stats.revenue?.linkedin?.total || 0) / 100).toFixed(2)}`}
                accent="#0a84ff" />
              <StatCard icon="⭐" label="Pro Subscribers"
                value={stats.revenue?.pro?.count || 0}
                sub={`$${((stats.revenue?.pro?.total || 0) / 100).toFixed(2)}`}
                accent="#c8f04a" />
            </div>

            <div className={s.card} style={{ marginBottom: 16 }}>
              <h3 className={s.cardTitle}>Revenue Breakdown by Product</h3>
              <div className={s.revBars}>
                <RevenueBar label="Resume Rewrite"
                  count={stats.revenue?.rewrite?.count || 0}
                  revenue={stats.revenue?.rewrite?.total || 0}
                  total={totalRevenue || 1} color="#c8f04a" />
                <RevenueBar label="Cover Letter"
                  count={stats.revenue?.coverletter?.count || 0}
                  revenue={stats.revenue?.coverletter?.total || 0}
                  total={totalRevenue || 1} color="#4af0c8" />
                <RevenueBar label="Bundle (Rewrite + CL)"
                  count={stats.revenue?.bundle?.count || 0}
                  revenue={stats.revenue?.bundle?.total || 0}
                  total={totalRevenue || 1} color="#a855f7" />
                <RevenueBar label="LinkedIn Optimizer"
                  count={stats.revenue?.linkedin?.count || 0}
                  revenue={stats.revenue?.linkedin?.total || 0}
                  total={totalRevenue || 1} color="#0a84ff" />
                <RevenueBar label="Pro Subscription ($9.99/mo)"
                  count={stats.revenue?.pro?.count || 0}
                  revenue={stats.revenue?.pro?.total || 0}
                  total={totalRevenue || 1} color="#c8f04a" />
              </div>
            </div>

            <div className={s.card}>
              <h3 className={s.cardTitle}>
                Recent Purchases
                <span className={s.cardHint}>{(stats.revenue?.activity || []).length} shown</span>
              </h3>
              <div className={s.tableWrap}>
                <TRow cols="2fr 1fr 90px" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8 }}>
                  {['Time','Product','Amount'].map(h => (
                    <span key={h} className={s.tableHead}>{h}</span>
                  ))}
                </TRow>
                {(stats.revenue?.activity || []).length === 0
                  ? <p className={s.empty}>No purchases recorded yet</p>
                  : (stats.revenue?.activity || []).map((a, i) => {
                    const LABELS = { rewrite: 'Resume Rewrite', coverletter: 'Cover Letter', bundle: 'Bundle', linkedin: 'LinkedIn Opt.', pro: 'Pro Subscription' };
                    const COLORS = { rewrite: '#d4a017', coverletter: '#c4855a', bundle: '#9b6b1e', linkedin: '#4a90d2', pro: '#d4a017' };
                    return (
                      <TRow key={i} cols="2fr 1fr 90px">
                        <span className={s.cellTime}>{fmtTime(a.ts)}</span>
                        <span style={{ color: COLORS[a.type] || 'var(--text)', fontWeight: 500 }}>
                          {LABELS[a.type] || a.type}
                        </span>
                        <span style={{ color: '#d4a017', fontWeight: 600 }}>${(a.cents / 100).toFixed(2)}</span>
                      </TRow>
                    );
                  })}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
