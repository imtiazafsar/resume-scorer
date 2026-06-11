import React, { useState, useRef, useEffect, useCallback } from 'react';
import { extractText } from './extractText';
import s from './Enterprise.module.css';

const MAX_FILES      = 25;
const FREE_DAILY_CAP = 25;

function scoreColor(score) {
  if (score >= 80) return '#E4002B';
  if (score >= 60) return '#ff4d6a';
  if (score >= 40) return '#ff8c00';
  return '#cc001a';
}

const GRADE_STYLE = {
  'Excellent':  { bg: '#1a0005', color: '#E4002B' },
  'Good':       { bg: '#042e2e', color: '#ff4d6a' },
  'Average':    { bg: '#1a1000', color: '#ff8c00' },
  'Needs Work': { bg: '#1a0005', color: '#cc001a' },
  'Error':      { bg: '#1a1a1a', color: '#666' },
};

function GradeBadge({ grade }) {
  const st = GRADE_STYLE[grade] || GRADE_STYLE['Average'];
  return <span className={s.gradeBadge} style={{ background: st.bg, color: st.color }}>{grade}</span>;
}

function ScorePill({ score, error }) {
  if (error) return <span className={s.scorePill} style={{ color: '#555', borderColor: '#33333444' }}>—</span>;
  const color = scoreColor(score);
  return <span className={s.scorePill} style={{ color, borderColor: color + '44' }}>{score}</span>;
}

function exportCSV(candidates, jobTitle) {
  const headers = ['Rank','Name','Score','Grade','Experience','Top Strength','Key Gap','Skills Matched','Summary','File'];
  const rows = candidates.map(c => [
    c.rank, c.name, c.error ? 'Error' : c.score, c.grade,
    c.experienceLevel || '', c.topStrength, c.keyGap,
    (c.skillsMatched || []).join('; '), c.summary, c.filename,
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `screening-${(jobTitle || 'results').replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const SESSION_KEY = 'enterprise_results_v2';

export default function Enterprise() {
  const [view, setView]               = useState('pricing');
  const [jobTitle, setJobTitle]       = useState('');
  const [jobDesc, setJobDesc]         = useState('');
  const [files, setFiles]             = useState([]);
  const [drag, setDrag]               = useState(false);
  const [fileStatuses, setFileStatuses] = useState({});   // filename → 'extracting'|'screening'|'done'|'error'
  const [progress, setProgress]       = useState({ done: 0, total: 0, phase: '' });
  const [results, setResults]         = useState(null);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [filter, setFilter]           = useState('all');  // all | recommended | excellent | errors
  const [sortKey, setSortKey]         = useState('rank'); // rank | score | name | grade
  const [sortDir, setSortDir]         = useState('asc');
  const [proToken, setProToken]       = useState(() => localStorage.getItem('resume_pro_token') || '');
  const [showProInput, setShowProInput] = useState(false);
  const fileRef = useRef();
  const abortRef = useRef(null);

  const GUMROAD_URLS = {
    batch:   'https://imtiazafsar.gumroad.com/l/enterprise-batch',
    monthly: 'https://imtiazafsar.gumroad.com/l/enterprise-monthly',
  };

  // Restore saved results
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { results: r, jobTitle: jt } = JSON.parse(saved);
        if (r && jt) { setResults(r); setJobTitle(jt); setView('results'); }
      }
    } catch {}
  }, []);

  // Gumroad purchase listener
  useEffect(() => {
    function onMessage(e) {
      if (!e.data || typeof e.data !== 'string') return;
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data.post_message_name !== 'sale') return;
      setView('setup');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function openGumroad(type) {
    const url = GUMROAD_URLS[type];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url + '?wanted=true';
    a.setAttribute('data-gumroad-overlay-checkout', 'true');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function addFiles(newFiles) {
    const added = [], rejected = [];
    for (const f of Array.from(newFiles)) {
      if (!/\.(pdf|doc|docx|txt)$/i.test(f.name)) { rejected.push(`${f.name}: unsupported format`); continue; }
      if (f.size > 5 * 1024 * 1024)               { rejected.push(`${f.name}: over 5 MB`); continue; }
      added.push(f);
    }
    setFiles(prev => {
      const merged = [...prev];
      for (const f of added) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.find(e => e.name === f.name && e.size === f.size)) merged.push(f);
      }
      return merged;
    });
    if (rejected.length) setError(`Skipped: ${rejected.join(', ')}`);
  }

  const markStatus = useCallback((filename, status) => {
    setFileStatuses(prev => ({ ...prev, [filename]: status }));
  }, []);

  async function run() {
    if (!files.length || !jobTitle.trim() || !jobDesc.trim()) return;
    setError('');
    setExpanded(null);
    setFileStatuses({});

    // Phase 1: Extract text from all files
    setView('extracting');
    setProgress({ done: 0, total: files.length, phase: 'Extracting text' });

    const resumes = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      markStatus(f.name, 'extracting');
      try {
        const text = await extractText(f);
        resumes.push({ filename: f.name, text: text || '' });
        markStatus(f.name, 'extracted');
      } catch {
        resumes.push({ filename: f.name, text: '' });
        markStatus(f.name, 'error');
      }
      setProgress(p => ({ ...p, done: i + 1 }));
    }

    // Phase 2: Screen via API
    setView('screening');
    setProgress({ done: 0, total: files.length, phase: 'Screening candidates' });
    files.forEach(f => {
      const current = fileStatuses[f.name];
      if (current !== 'error') markStatus(f.name, 'screening');
    });

    let startTime = Date.now();
    // Simulate per-file completion while waiting (cosmetic progress)
    const tickInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const expected = files.length * 2.5; // ~2.5s per file estimate
      const done = Math.min(Math.floor((elapsed / expected) * files.length), files.length - 1);
      setProgress(p => ({ ...p, done }));
    }, 500);

    try {
      const res = await fetch('/api/enterprise-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumes, jobTitle, jobDescription: jobDesc, proToken: proToken || undefined }),
      });
      clearInterval(tickInterval);

      if (!res) { setError('Network error. Please try again.'); setView('setup'); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Screening failed.'); setView('setup'); return; }

      // Mark each file's final status
      data.candidates.forEach(c => markStatus(c.filename, c.error ? 'error' : 'done'));
      setProgress({ done: files.length, total: files.length, phase: 'Complete' });

      // Persist to session storage
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ results: data, jobTitle })); } catch {}

      setResults(data);
      setView('results');
    } catch {
      clearInterval(tickInterval);
      setError('Network error. Please try again.');
      setView('setup');
    }
  }

  function reset() {
    setFiles([]); setResults(null); setError(''); setExpanded(null);
    setJobTitle(''); setJobDesc(''); setFilter('all'); setSortKey('rank'); setSortDir('asc');
    setFileStatuses({});
    setView('setup');
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    if (fileRef.current) fileRef.current.value = '';
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  // Derived stats
  const allCandidates  = results?.candidates || [];
  const validCands     = allCandidates.filter(c => !c.error);
  const avgScore       = validCands.length ? Math.round(validCands.reduce((a, c) => a + c.score, 0) / validCands.length) : 0;
  const excellent      = allCandidates.filter(c => c.grade === 'Excellent').length;
  const recommended    = allCandidates.filter(c => c.score >= 70).length;
  const errorCount     = allCandidates.filter(c => c.error).length;

  // Filter + sort
  const filtered = allCandidates.filter(c => {
    if (filter === 'recommended') return c.score >= 70;
    if (filter === 'excellent')   return c.grade === 'Excellent';
    if (filter === 'errors')      return c.error;
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'rank')  cmp = a.rank - b.rank;
    if (sortKey === 'score') cmp = (b.score || 0) - (a.score || 0);
    if (sortKey === 'name')  cmp = (a.name || '').localeCompare(b.name || '');
    if (sortKey === 'grade') {
      const order = { 'Excellent': 0, 'Good': 1, 'Average': 2, 'Needs Work': 3, 'Error': 4 };
      cmp = (order[a.grade] ?? 5) - (order[b.grade] ?? 5);
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const statusIcon = (filename) => {
    const st = fileStatuses[filename];
    if (st === 'extracting') return '⟳';
    if (st === 'extracted')  return '✓';
    if (st === 'screening')  return '⟳';
    if (st === 'done')       return '✓';
    if (st === 'error')      return '✗';
    return '·';
  };

  const statusColor = (filename) => {
    const st = fileStatuses[filename];
    if (st === 'done' || st === 'extracted') return '#E4002B';
    if (st === 'error')    return '#cc001a';
    if (st === 'screening' || st === 'extracting') return '#ff8c00';
    return 'var(--text-dim)';
  };

  return (
    <div className={s.page}>
      {/* Top bar */}
      <div className={s.topBar}>
        <div className={s.brand}>
          <span className={s.brandRS}>RS</span>
          <div>
            <span className={s.brandName}>Enterprise</span>
            <span className={s.brandSub}>Candidate Screening Platform</span>
          </div>
        </div>
        <a href="/" className={s.backLink}>← Back to Resume Scorer</a>
      </div>

      {/* ── Pricing gate ── */}
      {view === 'pricing' && (
        <div className={s.body}>
          <div className={s.pricingWrap}>
            <h2 className={s.pricingTitle}>Screen candidates in seconds</h2>
            <p className={s.pricingSubtitle}>Upload up to 25 resumes, paste a job description, and get an AI-ranked shortlist with scores, experience levels, skills matched, and summaries.</p>

            <div className={s.pricingCards}>
              {/* Pay-per-batch */}
              <div className={s.pricingCard}>
                <span className={s.pricingPlan}>Pay per batch</span>
                <div className={s.pricingAmount}><span className={s.pricingAmt}>$19</span><span className={s.pricingPer}>/batch</span></div>
                <p className={s.pricingDesc}>Screen up to 25 candidates against one job. One-time payment, results in under 60 seconds.</p>
                <ul className={s.pricingFeats}>
                  <li>✓ Up to 25 resumes per run</li>
                  <li>✓ AI ranked shortlist + experience level</li>
                  <li>✓ Score, grade, skills matched &amp; gaps</li>
                  <li>✓ CSV export</li>
                </ul>
                <button className={s.pricingBtn} onClick={() => openGumroad('batch')}>Buy a batch →</button>
              </div>

              {/* Monthly plan */}
              <div className={s.pricingCard} style={{ borderColor: '#E4002B88', background: 'linear-gradient(135deg, #1a0005 0%, #0d0d0d 100%)' }}>
                <span className={s.pricingPopular}>Most Popular</span>
                <span className={s.pricingPlan} style={{ color: '#E4002B' }}>Monthly</span>
                <div className={s.pricingAmount}><span className={s.pricingAmt} style={{ color: '#E4002B' }}>$99</span><span className={s.pricingPer}>/month</span></div>
                <p className={s.pricingDesc}>Unlimited batches. For teams actively hiring across multiple roles.</p>
                <ul className={s.pricingFeats}>
                  <li>✓ Unlimited screening runs</li>
                  <li>✓ Up to 25 resumes per run</li>
                  <li>✓ All batch features</li>
                  <li>✓ Priority support</li>
                </ul>
                <button className={s.pricingBtn} style={{ background: '#E4002B', color: '#ffffff' }} onClick={() => openGumroad('monthly')}>
                  Start monthly plan →
                </button>
              </div>
            </div>

            <p className={s.pricingNote}>
              Not sure?{' '}
              <button className={s.pricingTryLink} onClick={() => setView('setup')}>
                Try it free — {FREE_DAILY_CAP} candidates/day
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ── Setup ── */}
      {view === 'setup' && (
        <div className={s.body}>
          <div className={s.setupGrid}>
            {/* Left: Job details */}
            <div className={s.panel}>
              <h2 className={s.panelTitle}>Job Details</h2>

              <label className={s.fieldLabel}>Job Title <span className={s.req}>*</span></label>
              <input className={s.input}
                placeholder="e.g. Senior Software Engineer"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)} />

              <label className={s.fieldLabel} style={{ marginTop: 16 }}>
                Job Description <span className={s.req}>*</span>
                {jobDesc.trim().length > 0 && jobDesc.trim().length < 100 && (
                  <span style={{ color: '#ff8c00', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                    — add more detail for better results
                  </span>
                )}
              </label>
              <textarea className={s.textarea} rows={10}
                placeholder="Paste the full job description — responsibilities, requirements, skills…&#10;&#10;Tip: longer descriptions yield more accurate screening."
                value={jobDesc}
                onChange={e => setJobDesc(e.target.value)} />

              {/* Pro token */}
              <div style={{ marginTop: 14 }}>
                {!showProInput ? (
                  <button className={s.proToggle} onClick={() => setShowProInput(true)}>
                    Have a Pro token? Unlock unlimited →
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className={s.input}
                      style={{ flex: 1, fontSize: 13 }}
                      placeholder="Pro token (from your purchase email)"
                      value={proToken}
                      onChange={e => { setProToken(e.target.value); localStorage.setItem('resume_pro_token', e.target.value); }}
                    />
                    <button className={s.clearBtn} style={{ fontSize: 13, padding: '0 4px' }} onClick={() => setShowProInput(false)}>✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Resume upload */}
            <div className={s.panel}>
              <h2 className={s.panelTitle}>
                Upload Resumes
                <span className={s.panelLimit}>
                  {files.length}/{MAX_FILES} files
                </span>
              </h2>

              <div className={`${s.dropZone} ${drag ? s.dropActive : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" multiple
                  onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                <svg className={s.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className={s.dropLabel}>Click or drag resumes here</p>
                <p className={s.dropSub}>PDF, DOC, DOCX, TXT · 5 MB max · up to {MAX_FILES} files</p>
              </div>

              {files.length > 0 && (
                <div className={s.fileList}>
                  <div className={s.fileListHeader}>
                    <span>{files.length} file{files.length > 1 ? 's' : ''} queued</span>
                    <button className={s.clearBtn} onClick={() => setFiles([])}>Clear all</button>
                  </div>
                  {files.map((f, i) => (
                    <div key={i} className={s.fileRow}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round"/>
                        <polyline points="14 2 14 8 20 8" strokeLinecap="round"/>
                      </svg>
                      <span className={s.fileRowName}>{f.name}</span>
                      <span className={s.fileRowSize}>{(f.size / 1024).toFixed(0)} KB</span>
                      <button className={s.removeFile} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className={s.errorMsg}>{error}</p>}

              <button className={s.screenBtn}
                disabled={!files.length || !jobTitle.trim() || !jobDesc.trim()}
                onClick={run}>
                Screen {files.length > 0 ? `${files.length} Candidate${files.length > 1 ? 's' : ''}` : 'Candidates'} →
              </button>
              {(!jobTitle.trim() || !jobDesc.trim()) && (
                <p className={s.hintMsg}>Fill in the job title and description to enable screening.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {(view === 'extracting' || view === 'screening') && (
        <div className={s.body}>
          <div className={s.processingWrap}>
            <div className={s.processingSpinner} />
            <p className={s.processingMsg}>
              {view === 'extracting' ? 'Extracting text from resumes…' : `Screening ${files.length} candidate${files.length > 1 ? 's' : ''}…`}
            </p>
            <p className={s.processingHint}>
              {view === 'extracting'
                ? 'Reading PDF, DOCX, and TXT files locally…'
                : `Running AI analysis — about ${Math.max(10, files.length * 2)}–${Math.max(20, files.length * 3)} seconds.`}
            </p>

            {/* Progress bar */}
            <div className={s.progressBar}>
              <div className={s.progressFill} style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className={s.progressLabel}>{progress.done} / {progress.total}</p>

            <div className={s.processingFiles}>
              {files.map((f, i) => (
                <div key={i} className={s.processingFile}>
                  <span style={{ color: statusColor(f.name), fontSize: 13, minWidth: 16, textAlign: 'center' }}>
                    {statusIcon(f.name)}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {view === 'results' && results && (
        <div className={s.body}>
          {/* Stats bar */}
          <div className={s.statsBar}>
            <div className={s.statItem}>
              <span className={s.statNum}>{results.total}</span>
              <span className={s.statLbl}>Screened</span>
            </div>
            <div className={s.statItem}>
              <span className={s.statNum} style={{ color: scoreColor(avgScore) }}>{avgScore}</span>
              <span className={s.statLbl}>Avg Score</span>
            </div>
            <div className={s.statItem}>
              <span className={s.statNum} style={{ color: '#E4002B' }}>{excellent}</span>
              <span className={s.statLbl}>Excellent</span>
            </div>
            <div className={s.statItem}>
              <span className={s.statNum} style={{ color: '#ff4d6a' }}>{recommended}</span>
              <span className={s.statLbl}>Recommended 70+</span>
            </div>
            {errorCount > 0 && (
              <div className={s.statItem}>
                <span className={s.statNum} style={{ color: '#555' }}>{errorCount}</span>
                <span className={s.statLbl}>Failed</span>
              </div>
            )}
            <div className={s.statActions}>
              <button className={s.exportBtn} onClick={() => exportCSV(results.candidates, results.jobTitle)}>↓ CSV</button>
              <button className={s.newBatchBtn} onClick={reset}>+ New Batch</button>
            </div>
          </div>

          {/* Filter + sort bar */}
          <div className={s.filterBar}>
            {[
              { key: 'all',         label: `All (${allCandidates.length})` },
              { key: 'recommended', label: `Recommended (${recommended})` },
              { key: 'excellent',   label: `Excellent (${excellent})` },
              ...(errorCount > 0 ? [{ key: 'errors', label: `Failed (${errorCount})` }] : []),
            ].map(tab => (
              <button
                key={tab.key}
                className={filter === tab.key ? s.filterTabOn : s.filterTab}
                onClick={() => setFilter(tab.key)}>
                {tab.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>
              Sort:
            </span>
            {[
              { key: 'rank',  label: 'Rank' },
              { key: 'score', label: 'Score' },
              { key: 'name',  label: 'Name' },
              { key: 'grade', label: 'Grade' },
            ].map(col => (
              <button key={col.key}
                className={sortKey === col.key ? s.filterTabOn : s.filterTab}
                onClick={() => toggleSort(col.key)}
                style={{ fontSize: 11 }}>
                {col.label}{sortIcon(col.key)}
              </button>
            ))}
          </div>

          <div className={s.jobBadge}>Screening for: <strong>{results.jobTitle}</strong></div>

          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
              No candidates match this filter.
            </p>
          )}

          {/* Results table */}
          <div className={s.tableWrap}>
            <div className={s.tableHead}>
              <span>#</span>
              <span>Candidate</span>
              <span>Score</span>
              <span>Grade</span>
              <span>Exp.</span>
              <span>Top Strength</span>
              <span>Key Gap</span>
              <span></span>
            </div>
            {filtered.map(c => (
              <React.Fragment key={c.rank}>
                <div className={`${s.tableRow} ${expanded === c.rank ? s.tableRowOpen : ''}`}
                  onClick={() => setExpanded(expanded === c.rank ? null : c.rank)}>
                  <span className={s.rankNum} style={{ color: c.rank <= 3 && !c.error ? scoreColor(c.score) : 'var(--text-dim)' }}>
                    {c.rank <= 3 && !c.error ? ['🥇','🥈','🥉'][c.rank - 1] : c.rank}
                  </span>
                  <div className={s.candidateCell}>
                    <span className={s.candidateName}>{c.name}</span>
                    <span className={s.candidateFile}>{c.filename}</span>
                  </div>
                  <ScorePill score={c.score} error={c.error} />
                  <GradeBadge grade={c.grade} />
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.experienceLevel || '—'}</span>
                  <span className={s.strengthCell}>{c.topStrength}</span>
                  <span className={s.gapCell}>{c.keyGap}</span>
                  <span className={s.expandChevron}>{expanded === c.rank ? '▲' : '▼'}</span>
                </div>
                {expanded === c.rank && (
                  <div className={s.expandedRow}>
                    <p className={s.expandedSummary}>{c.summary}</p>
                    {c.skillsMatched?.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>Skills matched:</span>
                        {c.skillsMatched.map((skill, i) => (
                          <span key={i} style={{ fontSize: 12, background: '#E4002B18', color: '#E4002B', border: '0.5px solid #E4002B44', borderRadius: 20, padding: '2px 10px' }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.error && (
                      <p style={{ marginTop: 8, fontSize: 12, color: '#cc001a' }}>
                        ⚠ {c.errorType === 'extraction' ? 'Text extraction failed — try re-saving as PDF.' : 'AI analysis failed. Try running a new batch.'}
                      </p>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
