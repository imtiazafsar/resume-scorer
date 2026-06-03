import React, { useState, useRef, useEffect } from 'react';
import { extractText } from './extractText';
import { analyzeResume } from './api';
import styles from './App.module.css';

// ── Constants ────────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { step: 'Reading your resume…',         tip: 'Tip: Quantified achievements get 3× more callbacks' },
  { step: 'Extracting content…',          tip: 'Tip: 75% of resumes are filtered by ATS before a human sees them' },
  { step: 'Running AI analysis…',         tip: 'Tip: Mirror the exact language from the job description' },
  { step: 'Scoring your CV…',             tip: 'Tip: A LinkedIn URL increases interview chances by 71%' },
  { step: 'Generating recommendations…',  tip: 'Tip: 1-page resumes are preferred for under 10 years of experience' },
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

// ── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#c8f04a', '#4af0c8', '#f0c84a', '#c84af0', '#4ac8f0'];

function useConfetti(trigger) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!trigger) return;
    setPieces(Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.5 + Math.random() * 1.5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 5 + Math.random() * 7,
      skew: Math.random() * 30 - 15,
    })));
    const t = setTimeout(() => setPieces([]), 5000);
    return () => clearTimeout(t);
  }, [trigger]);
  return pieces;
}

function Confetti({ pieces }) {
  if (!pieces.length) return null;
  return (
    <div className={styles.confettiRoot} aria-hidden>
      {pieces.map(p => (
        <div key={p.id} className={styles.confettiPiece} style={{
          left: `${p.left}%`,
          width: p.size,
          height: p.size * 0.6,
          background: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          transform: `skewX(${p.skew}deg)`,
        }} />
      ))}
    </div>
  );
}

// ── Animated Number ───────────────────────────────────────────────────────────
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

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 54, circ = 2 * Math.PI * r;
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

// ── Dimension Bar ─────────────────────────────────────────────────────────────
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

// ── Quick Wins ────────────────────────────────────────────────────────────────
function QuickWins({ wins }) {
  if (!wins?.length) return null;
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        ⚡ Quick Wins
        <span className={styles.sectionHint}>do these to boost your score</span>
      </h3>
      <ul className={styles.list}>
        {wins.map((w, i) => (
          <li key={i} className={styles.listItem}>
            <span className={styles.winBadge}>{i + 1}</span>
            {w}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Keyword Cloud ─────────────────────────────────────────────────────────────
function KeywordCloud({ keywords }) {
  if (!keywords) return null;
  const { matched = [], missing = [] } = keywords;
  if (!matched.length && !missing.length) return null;
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>ATS Keywords</h3>
      {matched.length > 0 && (
        <div className={styles.kwGroup}>
          <span className={styles.kwGroupLabel} style={{ color: '#c8f04a' }}>✓ Matched</span>
          <div className={styles.kwTags}>
            {matched.map((k, i) => (
              <span key={i} className={styles.kwTag} style={{ background: '#1a2e0588', borderColor: '#c8f04a55', color: '#c8f04a' }}>{k}</span>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div className={styles.kwGroup}>
          <span className={styles.kwGroupLabel} style={{ color: '#f04a4a' }}>✗ Missing</span>
          <div className={styles.kwTags}>
            {missing.map((k, i) => (
              <span key={i} className={styles.kwTag} style={{ background: '#2e050588', borderColor: '#f04a4a55', color: '#f04a4a' }}>{k}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('upload'); // upload | loading | results | rewriting | product_result | rate_limited
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('general');
  const [jobDesc, setJobDesc] = useState('');
  const [loadingStep, setLoadingStep] = useState(LOADING_STEPS[0]);
  const [result, setResult] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [clLoading, setClLoading] = useState(false);
  const [productResult, setProductResult] = useState(null); // { content, type }
  const [productCopied, setProductCopied] = useState(false);
  const fileInputRef = useRef();
  const stepInterval = useRef();

  const confettiPieces = useConfetti(view === 'results' && result?.score >= 80);

  // Handle Lemon Squeezy post-payment redirect
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
        else { setProductResult(data); setView('product_result'); }
      })
      .catch(() => { setError('Generation failed. Please contact support.'); setView('upload'); });
  }, []);

  function handleFile(f) {
    if (!f) return;
    if (!/\.(pdf|doc|docx|txt)$/i.test(f.name)) { setError('Please upload a PDF, DOC, DOCX, or TXT file.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File must be under 5 MB.'); return; }
    setError('');
    setFile(f);
  }

  async function runAnalysis() {
    if (!file) return;
    setView('loading');
    setError('');
    let idx = 0;
    setLoadingStep(LOADING_STEPS[0]);
    stepInterval.current = setInterval(() => {
      idx = (idx + 1) % LOADING_STEPS.length;
      setLoadingStep(LOADING_STEPS[idx]);
    }, 1800);
    try {
      const text = await extractText(file);
      if (!text || text.trim().length < 30) throw new Error('Could not extract text. Try a different format or a text-based PDF.');
      setResumeText(text);
      const data = await analyzeResume(text, mode === 'job' ? jobDesc : '');
      const entry = { id: Date.now(), filename: file.name, date: new Date().toLocaleDateString(), score: data.score, grade: data.grade, result: data };
      saveToHistory(entry);
      setHistory(loadHistory());
      setResult(data);
      setView('results');
    } catch (err) {
      if (err.rateLimited) {
        setView('rate_limited');
      } else {
        setError(err.message);
        setView('upload');
      }
    } finally {
      clearInterval(stepInterval.current);
    }
  }

  function reset() {
    setFile(null); setResult(null); setResumeText(''); setError(''); setView('upload');
    setProductResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function copyResults() {
    if (!result) return;
    const lines = [
      `Resume Score: ${result.score}/100 — ${result.grade}`, '', result.summary, '',
      'DIMENSIONS', ...result.dimensions.map(d => `  ${d.name}: ${d.score}/100`), '',
      'STRENGTHS', ...result.strengths.map(s => `  ✓ ${s}`), '',
      'RECOMMENDATIONS', ...result.recommendations.map(r => `  → ${r}`),
    ];
    if (result.jobMatch != null) lines.splice(2, 0, `Job Match: ${result.jobMatch}%`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function shareScore() {
    const text = `I just scored ${result.score}/100 on my resume (${result.grade})! Get yours scored free at resume-scorer-5taf.vercel.app`;
    if (navigator.share) {
      navigator.share({ title: 'My Resume Score', text, url: 'https://resume-scorer-5taf.vercel.app' }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  }

  async function startCheckout(type) {
    if (!resumeText) return;
    if (type === 'coverletter' && !jobDesc.trim()) {
      setError('Cover letter generation requires a job description. Please use Job Match mode.');
      return;
    }
    type === 'coverletter' ? setClLoading(true) : setRewriteLoading(true);
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText, jobDescription: jobDesc || '', type }),
    }).catch(() => null);
    type === 'coverletter' ? setClLoading(false) : setRewriteLoading(false);
    if (!res?.ok) { setError('Could not start checkout. Please try again.'); return; }
    const { url, error: err } = await res.json();
    if (err) { setError(err); return; }
    window.location.href = url;
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
          <p className={styles.subtitle}>Drop your CV and get an AI-powered score, dimension breakdown,<br />strengths, and actionable recommendations.</p>
        </header>

        <div className={styles.modeRow}>
          <button className={`${styles.modeBtn} ${mode === 'general' ? styles.modeBtnOn : ''}`} onClick={() => setMode('general')}>General Review</button>
          <button className={`${styles.modeBtn} ${mode === 'job' ? styles.modeBtnOn : ''}`} onClick={() => setMode('job')}>Job Match</button>
        </div>

        {mode === 'job' && (
          <textarea className={styles.jobTextarea} placeholder="Paste the job description here…"
            value={jobDesc} onChange={e => setJobDesc(e.target.value)} rows={5} />
        )}

        <div className={`${styles.dropZone} ${drag ? styles.dropActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => handleFile(e.target.files[0])} />
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
        {mode === 'job' && !jobDesc.trim() && <p className={styles.hintMsg}>Paste a job description above to enable job matching.</p>}
      </div>
    );
  }

  // ── Loading view ─────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingMsg}>{loadingStep.step}</p>
          <p className={styles.loadingTip}>{loadingStep.tip}</p>
        </div>
      </div>
    );
  }

  // ── Rate limited view ────────────────────────────────────────────────────
  if (view === 'rate_limited') {
    return (
      <div className={styles.page}>
        <div className={styles.limitWrap}>
          <div className={styles.limitIcon}>⏳</div>
          <h2 className={styles.limitTitle}>Daily limit reached</h2>
          <p className={styles.limitSub}>
            You've used all <strong>5 free scans</strong> for today.<br />
            Your limit resets at midnight.
          </p>
          <div className={styles.limitActions}>
            <button className={styles.analyzeBtn} onClick={() => { setView('upload'); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Rewriting view ───────────────────────────────────────────────────────
  if (view === 'rewriting') {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingMsg}>Generating your document…</p>
          <p className={styles.loadingTip}>This takes 15–30 seconds. Please don't close this tab.</p>
        </div>
      </div>
    );
  }

  // ── Product result view ──────────────────────────────────────────────────
  if (view === 'product_result' && productResult) {
    const isCL = productResult.type === 'coverletter';
    function download() {
      const blob = new Blob([productResult.content], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = isCL ? 'cover_letter.txt' : 'optimized_resume.txt';
      a.click();
    }
    return (
      <div className={styles.page}>
        <div className={styles.results}>
          <div className={styles.rewriteHero}>
            <span className={styles.rewriteTag}>{isCL ? 'Cover Letter' : 'Optimized Resume'}</span>
            <h2 className={styles.rewriteTitle}>{isCL ? 'Your cover letter is ready' : 'Your resume has been rewritten'}</h2>
            <p className={styles.rewriteSub}>{isCL ? 'Tailored to your target role. Copy it into your email or Word doc.' : 'Tailored to your target job. Paste into Word or Google Docs to format.'}</p>
          </div>
          <div className={styles.rewriteBox}>
            <pre className={styles.rewriteText}>{productResult.content}</pre>
          </div>
          <div className={styles.actionRow}>
            <button className={styles.copyBtn} onClick={() => {
              navigator.clipboard.writeText(productResult.content).then(() => { setProductCopied(true); setTimeout(() => setProductCopied(false), 2000); });
            }}>{productCopied ? '✓ Copied!' : '⎘ Copy'}</button>
            <button className={styles.downloadBtn} onClick={download}>↓ Download .txt</button>
          </div>
          <button className={styles.resetBtn} style={{ marginTop: 10 }} onClick={reset}>← Analyze Another Resume</button>
        </div>
      </div>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────────
  const gradeStyle = GRADE_STYLES[result.grade] || GRADE_STYLES['Average'];

  return (
    <div className={styles.page}>
      <Confetti pieces={confettiPieces} />
      <div className={styles.results}>

        {/* Score hero */}
        <div className={styles.scoreHero}>
          <ScoreRing score={result.score} />
          <div className={styles.scoreMeta}>
            <span className={styles.gradeBadge} style={{ background: gradeStyle.bg, color: gradeStyle.text }}>{result.grade}</span>
            <h2 className={styles.scoreTitle}>Overall Score</h2>
            <p className={styles.scoreSummary}>{result.summary}</p>
          </div>
        </div>

        {/* Premium: Resume Rewrite */}
        <div className={styles.premiumCard}>
          <div className={styles.premiumLeft}>
            <span className={styles.premiumBadge}>Premium</span>
            <h3 className={styles.premiumTitle}>
              {result.jobMatch != null ? 'Get your resume rewritten for this job' : 'Get a professionally rewritten resume'}
            </h3>
            <p className={styles.premiumSub}>
              {result.jobMatch != null
                ? 'AI rewrites every bullet point, adds the right keywords, and tailors your summary — ready to send.'
                : 'AI rewrites every bullet point with strong action verbs, improves your summary, and optimises for ATS.'}
            </p>
          </div>
          <div className={styles.premiumRight}>
            <span className={styles.premiumPrice}>$2.99</span>
            <button className={styles.premiumBtn} disabled={rewriteLoading || !resumeText} onClick={() => startCheckout('rewrite')}>
              {rewriteLoading ? 'Preparing…' : 'Rewrite Resume →'}
            </button>
          </div>
        </div>

        {/* Premium: Cover Letter (job match mode only) */}
        {result.jobMatch != null && (
          <div className={styles.premiumCard} style={{ background: 'linear-gradient(135deg, #000d2e 0%, #001a33 100%)', borderColor: '#4af0c844' }}>
            <div className={styles.premiumLeft}>
              <span className={styles.premiumBadge} style={{ color: '#4af0c8', background: '#4af0c818', borderColor: '#4af0c844' }}>Premium</span>
              <h3 className={styles.premiumTitle}>Generate a tailored cover letter</h3>
              <p className={styles.premiumSub}>AI writes a compelling, role-specific cover letter using your resume and the job description — ready to send.</p>
            </div>
            <div className={styles.premiumRight}>
              <span className={styles.premiumPrice} style={{ color: '#4af0c8' }}>$1.99</span>
              <button className={styles.premiumBtn} style={{ background: '#4af0c8' }} disabled={clLoading || !resumeText} onClick={() => startCheckout('coverletter')}>
                {clLoading ? 'Preparing…' : 'Write Cover Letter →'}
              </button>
            </div>
          </div>
        )}

        {/* Job match score */}
        {result.jobMatch != null && (
          <div className={styles.jobMatchCard}>
            <div className={styles.jobMatchTop}>
              <span className={styles.jobMatchLabel}>Job Match</span>
              <span className={styles.jobMatchPct} style={{ color: result.jobMatch >= 70 ? '#c8f04a' : result.jobMatch >= 50 ? '#f0c84a' : '#f04a4a' }}>
                <AnimatedNumber target={result.jobMatch} />%
              </span>
            </div>
            {result.matchGaps?.length > 0 && (
              <ul className={styles.gapList}>
                {result.matchGaps.map((g, i) => <li key={i} className={styles.gapItem}>⚠ {g}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* ATS Keywords */}
        <KeywordCloud keywords={result.keywords} />

        {/* Quick Wins */}
        <QuickWins wins={result.quickWins} />

        {/* Dimensions */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Dimension Breakdown <span className={styles.sectionHint}>tap any row for detail</span></h3>
          <div className={styles.dimsGrid}>
            {result.dimensions.map(d => <DimBar key={d.name} name={d.name} score={d.score} feedback={d.feedback} />)}
          </div>
        </section>

        {/* Strengths */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Strengths</h3>
          <ul className={styles.list}>
            {result.strengths.map((s, i) => (
              <li key={i} className={styles.listItem}><span className={styles.listIcon} style={{ color: '#c8f04a' }}>✓</span>{s}</li>
            ))}
          </ul>
        </section>

        {/* Recommendations */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recommendations</h3>
          <ul className={styles.list}>
            {result.recommendations.map((r, i) => (
              <li key={i} className={styles.listItem}><span className={styles.listIcon} style={{ color: '#f0c84a' }}>→</span>{r}</li>
            ))}
          </ul>
        </section>

        {/* Action row */}
        <div className={styles.actionRow}>
          <button className={styles.copyBtn} onClick={copyResults}>{copied ? '✓ Copied!' : '⎘ Copy Results'}</button>
          <button className={styles.shareBtn} onClick={shareScore}>↗ Share Score</button>
          <button className={styles.resetBtn} onClick={reset}>← Analyze Another</button>
        </div>

      </div>
    </div>
  );
}
