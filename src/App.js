import React, { useState, useRef, useEffect } from 'react';
import { extractText } from './extractText';
import { analyzeResume } from './api';
import styles from './App.module.css';

const LOADING_MESSAGES = [
  'Reading your resume…',
  'Extracting content…',
  'Running AI analysis…',
  'Scoring your CV…',
  'Generating recommendations…',
];

const DIMENSION_COLORS = {
  'Contact & Links': '#c8f04a',
  'Work Experience': '#4af0c8',
  'Skills':          '#f0c84a',
  'Education':       '#c84af0',
  'Formatting':      '#4ac8f0',
  'Keywords & ATS':  '#f04a4a',
};

const GRADE_STYLES = {
  'Excellent':  { bg: '#1a2e05', text: '#c8f04a' },
  'Good':       { bg: '#042e2e', text: '#4af0c8' },
  'Average':    { bg: '#2e2005', text: '#f0c84a' },
  'Needs Work': { bg: '#2e0505', text: '#f04a4a' },
};

const HISTORY_KEY = 'resume_scorer_history';
const MAX_HISTORY = 5;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveToHistory(entry) {
  const prev = loadHistory();
  const next = [entry, ...prev.filter(h => h.id !== entry.id)].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function AnimatedNumber({ target }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let n = 0;
    const step = Math.max(1, Math.ceil(target / 50));
    const id = setInterval(() => {
      n = Math.min(n + step, target);
      setVal(n);
      if (n >= target) clearInterval(id);
    }, 20);
    return () => clearInterval(id);
  }, [target]);
  return <>{val}</>;
}

function ScoreRing({ score }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#c8f04a' : score >= 60 ? '#4af0c8' : score >= 40 ? '#f0c84a' : '#f04a4a';
  return (
    <div className={styles.ringWrap}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#2a2a2a" strokeWidth="8" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className={styles.ringText}>
        <span className={styles.ringScore} style={{ color }}><AnimatedNumber target={score} /></span>
        <span className={styles.ringDenom}>/100</span>
      </div>
    </div>
  );
}

function DimBar({ name, score, feedback }) {
  const [open, setOpen] = useState(false);
  const color = DIMENSION_COLORS[name] || '#888';
  return (
    <div className={`${styles.dimBar} ${feedback ? styles.dimBarClickable : ''}`}
      onClick={() => feedback && setOpen(o => !o)}>
      <div className={styles.dimTop}>
        <span className={styles.dimName}>{name}</span>
        <div className={styles.dimRight}>
          <span className={styles.dimScore} style={{ color }}>{score}</span>
          {feedback && <span className={styles.dimChevron} style={{ color }}>{open ? '▲' : '▼'}</span>}
        </div>
      </div>
      <div className={styles.dimTrack}>
        <div className={styles.dimFill} style={{ width: `${score}%`, background: color }} />
      </div>
      {open && feedback && <p className={styles.dimFeedback}>{feedback}</p>}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('upload');
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('general');
  const [jobDesc, setJobDesc] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState('');
  const [rewriteCopied, setRewriteCopied] = useState(false);
  const fileInputRef = useRef();
  const msgInterval = useRef();

  // Handle post-payment redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    const key = params.get('rewrite_key');
    if (!orderId || !key) return;
    window.history.replaceState({}, '', '/');
    setView('rewriting');
    fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, key }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setView('upload'); }
        else { setRewriteResult(data.rewritten); setView('rewrite_result'); }
      })
      .catch(() => { setError('Rewrite failed. Please contact support.'); setView('upload'); });
  }, []);

  function handleFile(f) {
    if (!f) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(f.name)) {
      setError('Please upload a PDF, DOC, DOCX, or TXT file.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function runAnalysis() {
    if (!file) return;
    setView('loading');
    setError('');
    let msgIdx = 0;
    msgInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 1800);
    try {
      const text = await extractText(file);
      if (!text || text.trim().length < 30)
        throw new Error('Could not extract text. Try a different format or a text-based PDF.');
      setResumeText(text);
      const data = await analyzeResume(text, mode === 'job' ? jobDesc : '');
      const entry = { id: Date.now(), filename: file.name, date: new Date().toLocaleDateString(), score: data.score, grade: data.grade, result: data };
      saveToHistory(entry);
      setHistory(loadHistory());
      setResult(data);
      setView('results');
    } catch (err) {
      setError(err.message);
      setView('upload');
    } finally {
      clearInterval(msgInterval.current);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    setView('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function copyResults() {
    if (!result) return;
    const lines = [
      `Resume Score: ${result.score}/100 — ${result.grade}`,
      ``,
      result.summary,
      ``,
      `DIMENSIONS`,
      ...result.dimensions.map(d => `  ${d.name}: ${d.score}/100`),
      ``,
      `STRENGTHS`,
      ...result.strengths.map(s => `  ✓ ${s}`),
      ``,
      `RECOMMENDATIONS`,
      ...result.recommendations.map(r => `  → ${r}`),
    ];
    if (result.jobMatch != null) {
      lines.splice(2, 0, `Job Match: ${result.jobMatch}%`);
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Upload view ──────────────────────────────────────────────────────────
  if (view === 'upload') {
    const canAnalyze = file && (mode === 'general' || jobDesc.trim().length > 20);
    return (
      <div className={styles.page}>

        {history.length > 0 && (
          <button className={styles.historyToggle} onClick={() => setShowHistory(h => !h)}>
            {showHistory ? '✕ Close' : `History (${history.length})`}
          </button>
        )}

        {showHistory && (
          <div className={styles.historyPanel}>
            <p className={styles.historyHeading}>Previous Analyses</p>
            {history.map(h => {
              const color = h.score >= 80 ? '#c8f04a' : h.score >= 60 ? '#4af0c8' : h.score >= 40 ? '#f0c84a' : '#f04a4a';
              return (
                <div key={h.id} className={styles.historyItem}
                  onClick={() => { setResult(h.result); setView('results'); setShowHistory(false); }}>
                  <span className={styles.historyFile}>{h.filename}</span>
                  <div className={styles.historyMeta}>
                    <span style={{ color, fontWeight: 500, fontSize: 13 }}>{h.score}/100</span>
                    <span className={styles.historyDate}>{h.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <header className={styles.header}>
          <h1 className={styles.title}>Resume<br />Scorer</h1>
          <p className={styles.subtitle}>
            Drop your CV and get an AI-powered score, dimension breakdown,<br />
            strengths, and actionable recommendations.
          </p>
        </header>

        <div className={styles.modeRow}>
          <button className={`${styles.modeBtn} ${mode === 'general' ? styles.modeBtnOn : ''}`}
            onClick={() => setMode('general')}>General Review</button>
          <button className={`${styles.modeBtn} ${mode === 'job' ? styles.modeBtnOn : ''}`}
            onClick={() => setMode('job')}>Job Match</button>
        </div>

        {mode === 'job' && (
          <textarea
            className={styles.jobTextarea}
            placeholder="Paste the job description here…"
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
            rows={5}
          />
        )}

        <div className={`${styles.dropZone} ${drag ? styles.dropActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt"
            onChange={e => handleFile(e.target.files[0])} />
          <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className={styles.dropLabel}>{file ? file.name : 'Click or drag your resume here'}</p>
          <p className={styles.dropSub}>PDF, DOC, DOCX, TXT — up to 5 MB</p>
        </div>

        {file && (
          <div className={styles.filePill}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" />
              <polyline points="14 2 14 8 20 8" strokeLinecap="round" />
            </svg>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
            <button className={styles.removeBtn} onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}

        <button className={styles.analyzeBtn} disabled={!canAnalyze} onClick={runAnalysis}>
          {mode === 'job' ? 'Match to Job →' : 'Analyze Resume →'}
        </button>

        {mode === 'job' && !jobDesc.trim() && (
          <p className={styles.hintMsg}>Paste a job description above to enable job matching.</p>
        )}
      </div>
    );
  }

  // ── Rewriting view ───────────────────────────────────────────────────────
  if (view === 'rewriting') {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingMsg}>Rewriting your resume for this job…</p>
        </div>
      </div>
    );
  }

  // ── Rewrite result view ──────────────────────────────────────────────────
  if (view === 'rewrite_result') {
    function downloadTxt() {
      const blob = new Blob([rewriteResult], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'optimized_resume.txt';
      a.click();
    }
    return (
      <div className={styles.page}>
        <div className={styles.results}>
          <div className={styles.rewriteHero}>
            <span className={styles.rewriteTag}>Optimized Resume</span>
            <h2 className={styles.rewriteTitle}>Your resume has been rewritten</h2>
            <p className={styles.rewriteSub}>Tailored to your target job. Copy it into Word or Google Docs to format.</p>
          </div>
          <div className={styles.rewriteBox}>
            <pre className={styles.rewriteText}>{rewriteResult}</pre>
          </div>
          <div className={styles.actionRow}>
            <button className={styles.copyBtn} onClick={() => {
              navigator.clipboard.writeText(rewriteResult).then(() => {
                setRewriteCopied(true);
                setTimeout(() => setRewriteCopied(false), 2000);
              });
            }}>
              {rewriteCopied ? '✓ Copied!' : '⎘ Copy Resume'}
            </button>
            <button className={styles.downloadBtn} onClick={downloadTxt}>↓ Download .txt</button>
          </div>
          <button className={styles.resetBtn} style={{ marginTop: 10 }} onClick={() => {
            setRewriteResult('');
            setResult(null);
            setFile(null);
            setView('upload');
          }}>← Analyze Another Resume</button>
        </div>
      </div>
    );
  }

  // ── Loading view ─────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingMsg}>{loadingMsg}</p>
        </div>
      </div>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────────
  const gradeStyle = GRADE_STYLES[result.grade] || GRADE_STYLES['Average'];

  return (
    <div className={styles.page}>
      <div className={styles.results}>

        <div className={styles.scoreHero}>
          <ScoreRing score={result.score} />
          <div className={styles.scoreMeta}>
            <span className={styles.gradeBadge} style={{ background: gradeStyle.bg, color: gradeStyle.text }}>
              {result.grade}
            </span>
            <h2 className={styles.scoreTitle}>Overall Score</h2>
            <p className={styles.scoreSummary}>{result.summary}</p>
          </div>
        </div>

        {/* Premium rewrite card */}
        <div className={styles.premiumCard}>
          <div className={styles.premiumLeft}>
            <span className={styles.premiumBadge}>Premium</span>
            <h3 className={styles.premiumTitle}>Get your resume rewritten for this job</h3>
            <p className={styles.premiumSub}>
              Our AI rewrites every bullet point, adds the right keywords, and tailors your summary — ready to send.
            </p>
          </div>
          <div className={styles.premiumRight}>
            <span className={styles.premiumPrice}>$2.99</span>
            <button
              className={styles.premiumBtn}
              disabled={rewriteLoading || !resumeText}
              onClick={async () => {
                if (!resumeText) return;
                const jd = result.jobMatch != null ? jobDesc : '';
                if (!jd.trim()) {
                  alert('For best results, use Job Match mode and paste a job description before analyzing.');
                  return;
                }
                setRewriteLoading(true);
                const res = await fetch('/api/create-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ resumeText, jobDescription: jd }),
                }).catch(() => null);
                setRewriteLoading(false);
                if (!res?.ok) { alert('Could not start checkout. Please try again.'); return; }
                const { url } = await res.json();
                window.location.href = url;
              }}
            >
              {rewriteLoading ? 'Preparing…' : 'Rewrite My Resume →'}
            </button>
          </div>
        </div>

        {result.jobMatch != null && (
          <div className={styles.jobMatchCard}>
            <div className={styles.jobMatchTop}>
              <span className={styles.jobMatchLabel}>Job Match</span>
              <span className={styles.jobMatchPct}
                style={{ color: result.jobMatch >= 70 ? '#c8f04a' : result.jobMatch >= 50 ? '#f0c84a' : '#f04a4a' }}>
                <AnimatedNumber target={result.jobMatch} />%
              </span>
            </div>
            {result.matchGaps?.length > 0 && (
              <ul className={styles.gapList}>
                {result.matchGaps.map((g, i) => (
                  <li key={i} className={styles.gapItem}>⚠ {g}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Dimension Breakdown
            <span className={styles.sectionHint}>tap any row for detail</span>
          </h3>
          <div className={styles.dimsGrid}>
            {result.dimensions.map(d => (
              <DimBar key={d.name} name={d.name} score={d.score} feedback={d.feedback} />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Strengths</h3>
          <ul className={styles.list}>
            {result.strengths.map((s, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.listIcon} style={{ color: '#c8f04a' }}>✓</span>{s}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recommendations</h3>
          <ul className={styles.list}>
            {result.recommendations.map((r, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.listIcon} style={{ color: '#f0c84a' }}>→</span>{r}
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.actionRow}>
          <button className={styles.copyBtn} onClick={copyResults}>
            {copied ? '✓ Copied!' : '⎘ Copy Results'}
          </button>
          <button className={styles.resetBtn} onClick={reset}>← Analyze Another</button>
        </div>

      </div>
    </div>
  );
}
