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
  'Contact & Links': '#E4002B',
  'Work Experience': '#ff4d6a',
  'Skills':          '#ff8c00',
  'Education':       '#4a90d2',
  'Formatting':      '#b0b0b0',
  'Keywords & ATS':  '#cc001a',
};

const GRADE_STYLES = {
  'Excellent':  { bg: '#1a0005', text: '#E4002B' },
  'Good':       { bg: '#0d1a2e', text: '#4a90d2' },
  'Average':    { bg: '#1a1000', text: '#ff8c00' },
  'Needs Work': { bg: '#1a0005', text: '#cc001a' },
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
const CONFETTI_COLORS = ['#E4002B', '#ff4d6a', '#ff8c00', '#4a90d2', '#ffffff'];

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
  const color = score >= 80 ? '#E4002B' : score >= 60 ? '#ff4d6a' : score >= 40 ? '#ff8c00' : '#cc001a';
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
          <span className={styles.kwGroupLabel} style={{ color: '#E4002B' }}>✓ Matched</span>
          <div className={styles.kwTags}>
            {matched.map((k, i) => (
              <span key={i} className={styles.kwTag} style={{ background: '#1a000588', borderColor: '#E4002B55', color: '#E4002B' }}>{k}</span>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div className={styles.kwGroup}>
          <span className={styles.kwGroupLabel} style={{ color: '#cc001a' }}>✗ Missing</span>
          <div className={styles.kwTags}>
            {missing.map((k, i) => (
              <span key={i} className={styles.kwTag} style={{ background: '#1a000888', borderColor: '#cc001a55', color: '#cc001a' }}>{k}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('upload'); // upload | loading | results | rewriting | product_result | rate_limited | pro_success
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
  const [productResult, setProductResult] = useState(null); // { content, type } | { type:'bundle', bundleRewrite, bundleCoverLetter }
  const [productCopied, setProductCopied] = useState(false);
  const fileInputRef = useRef();
  const stepInterval = useRef();

  const confettiPieces = useConfetti(view === 'results' && result?.score >= 80);

  // Gumroad product URLs
  const GUMROAD_URLS = {
    rewrite:     'https://imtiazafsar.gumroad.com/l/resume-rewrite',
    coverletter: 'https://imtiazafsar.gumroad.com/l/cover-letter',
    bundle:      'https://imtiazafsar.gumroad.com/l/resume-bundle',
    linkedin:    'https://imtiazafsar.gumroad.com/l/linkedin-optimizer',
    pro:         'https://imtiazafsar.gumroad.com/l/resume-scorer-pro',
  };

  // Generate document after confirmed payment (shared by postMessage + fallback button)
  function deliverProduct(saleId) {
    const pendingType   = sessionStorage.getItem('gumroad_pending_type');
    const pendingResume = sessionStorage.getItem('gumroad_pending_resume');
    const pendingJD     = sessionStorage.getItem('gumroad_pending_jd') || '';

    if (!pendingType) return;
    sessionStorage.removeItem('gumroad_pending_type');
    sessionStorage.removeItem('gumroad_pending_resume');
    sessionStorage.removeItem('gumroad_pending_jd');

    if (pendingType === 'pro') {
      fetch('/api/activate-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId }),
      }).catch(() => {});
      localStorage.setItem('resume_pro_token', saleId);
      setView('pro_success');
      return;
    }

    if (!pendingResume) return;
    setView('rewriting');
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: pendingResume, jobDescription: pendingJD, type: pendingType, saleId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setView('results'); }
        else { setProductResult(d); setView('product_result'); }
      })
      .catch(() => { setError('Generation failed. Please contact support.'); setView('results'); });
  }

  // Listen for Gumroad purchase success postMessage (multiple formats)
  useEffect(() => {
    function onMessage(e) {
      if (!e.data) return;
      let isSale = false;
      let saleId = Date.now().toString();

      // Format 1: plain string
      if (e.data === 'gumroad:purchase') { isSale = true; }

      // Format 2: JSON string
      if (!isSale && typeof e.data === 'string') {
        try {
          const d = JSON.parse(e.data);
          if (d.post_message_name === 'sale' || d.event === 'purchase') {
            isSale = true;
            saleId = d.sale?.id || d.id || saleId;
          }
        } catch {}
      }

      // Format 3: object
      if (!isSale && typeof e.data === 'object') {
        if (e.data.post_message_name === 'sale' || e.data.event === 'purchase') {
          isSale = true;
          saleId = e.data.sale?.id || e.data.id || saleId;
        }
      }

      if (!isSale) return;
      deliverProduct(saleId);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const data = await analyzeResume(text, mode === 'job' ? jobDesc : '', file?.name);
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

  function startProCheckout() {
    sessionStorage.setItem('gumroad_pending_type', 'pro');
    const url = GUMROAD_URLS.pro;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url + '?wanted=true';
    a.setAttribute('data-gumroad-overlay-checkout', 'true');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function startCheckout(type) {
    if (!resumeText) return;
    if ((type === 'coverletter' || type === 'bundle') && !jobDesc.trim()) {
      setError('This product requires a job description. Please use Job Match mode.');
      return;
    }
    setError('');
    // Store data in sessionStorage — retrieved after Gumroad overlay purchase
    sessionStorage.setItem('gumroad_pending_type', type);
    sessionStorage.setItem('gumroad_pending_resume', resumeText);
    sessionStorage.setItem('gumroad_pending_jd', jobDesc || '');

    // Open Gumroad overlay
    const url = GUMROAD_URLS[type];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url + '?wanted=true';
    a.setAttribute('data-gumroad-overlay-checkout', 'true');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
              const color = h.score >= 80 ? '#E4002B' : h.score >= 60 ? '#ff4d6a' : h.score >= 40 ? '#ff8c00' : '#cc001a';
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

        <a href="/enterprise" className={styles.enterpriseBanner}>
          🏢 Hiring? Screen multiple candidates at once — <strong>Enterprise →</strong>
        </a>

        <header className={styles.header}>
          <h1 className={styles.title}>Resume<br />Scorer</h1>
          <p className={styles.subtitle}>Drop your CV and get an AI-powered score, dimension breakdown,<br />strengths, and actionable recommendations.</p>
          <div className={styles.socialProof}>
            <span className={styles.socialDot} />
            <span>Trusted by <strong>14,800+</strong> job seekers this month</span>
          </div>
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
          <div className={styles.limitIcon}>🚀</div>
          <h2 className={styles.limitTitle}>You're a power user</h2>
          <p className={styles.limitSub}>
            You've used all <strong>5 free scans</strong> for today. Upgrade to <strong style={{ color: '#E4002B' }}>Pro</strong> for unlimited access — no waiting, no resets.
          </p>

          <div className={styles.proCard}>
            <div className={styles.proCardHeader}>
              <span className={styles.proBadge}>Pro Plan</span>
              <div className={styles.proPrice}><span className={styles.proPriceAmt}>$9.99</span><span className={styles.proPricePer}>/month</span></div>
            </div>
            <ul className={styles.proFeatures}>
              <li><span className={styles.proCheck}>✓</span> Unlimited resume scans</li>
              <li><span className={styles.proCheck}>✓</span> Job match mode — compare against any role</li>
              <li><span className={styles.proCheck}>✓</span> ATS keyword analysis</li>
              <li><span className={styles.proCheck}>✓</span> Priority AI analysis (2× faster)</li>
              <li><span className={styles.proCheck}>✓</span> 20% off resume rewrites &amp; cover letters</li>
            </ul>
            <button
              className={styles.proUpgradeBtn}
              onClick={startProCheckout}
            >
              Upgrade to Pro →
            </button>
            <p className={styles.proGuarantee}>Instant access · Cancel anytime · 7-day money-back guarantee</p>
          </div>

          <button
            className={styles.resetBtn}
            style={{ marginTop: 4, maxWidth: 220 }}
            onClick={() => { setView('upload'); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          >
            ← Wait until midnight instead
          </button>
        </div>
      </div>
    );
  }

  // ── Pro success view ────────────────────────────────────────────────────
  if (view === 'pro_success') {
    return (
      <div className={styles.page}>
        <div className={styles.limitWrap}>
          <div className={styles.limitIcon}>🎉</div>
          <h2 className={styles.limitTitle}>You're now Pro!</h2>
          <p className={styles.limitSub}>
            Your subscription is active. You now have <strong style={{ color: '#E4002B' }}>unlimited</strong> resume scans — no daily limits, ever.
          </p>
          <button
            className={styles.analyzeBtn}
            style={{ marginTop: 8 }}
            onClick={() => { setView('upload'); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          >
            Start scanning →
          </button>
          <p className={styles.proGuarantee} style={{ marginTop: 12 }}>
            If you ever have issues, email <a href="mailto:imtiazafsar456@gmail.com" style={{ color: '#E4002B' }}>imtiazafsar456@gmail.com</a>
          </p>
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
    const isCL       = productResult.type === 'coverletter';
    const isRewrite  = productResult.type === 'rewrite';
    const isBundle   = productResult.type === 'bundle';
    const isLinkedIn = productResult.type === 'linkedin';

    const LABELS = {
      rewrite:     { tag: 'Optimized Resume',   title: 'Your resume has been rewritten',      sub: 'Paste into Word or Google Docs to format.' },
      coverletter: { tag: 'Cover Letter',        title: 'Your cover letter is ready',          sub: 'Copy it into your email or Word doc.' },
      bundle:      { tag: 'Bundle',              title: 'Your resume + cover letter are ready', sub: 'Download or copy each document below.' },
      linkedin:    { tag: 'LinkedIn Optimizer',  title: 'Your LinkedIn profile is ready',      sub: 'Copy each section directly into your LinkedIn profile.' },
    };
    const label = LABELS[productResult.type] || LABELS.rewrite;

    function download(content, filename) {
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }

    return (
      <div className={styles.page}>
        <div className={styles.results}>
          <div className={styles.rewriteHero}>
            <span className={styles.rewriteTag}>{label.tag}</span>
            <h2 className={styles.rewriteTitle}>{label.title}</h2>
            <p className={styles.rewriteSub}>{label.sub}</p>
          </div>

          {/* Bundle: two separate sections */}
          {isBundle ? (
            <>
              <div className={styles.bundleSection}>
                <div className={styles.bundleSectionHeader}>
                  <span className={styles.bundleSectionTag}>Optimized Resume</span>
                </div>
                <div className={styles.rewriteBox}>
                  <pre className={styles.rewriteText}>{productResult.bundleRewrite}</pre>
                </div>
                <div className={styles.actionRow}>
                  <button className={styles.copyBtn} onClick={() => {
                    navigator.clipboard.writeText(productResult.bundleRewrite)
                      .then(() => { setProductCopied('resume'); setTimeout(() => setProductCopied(false), 2000); });
                  }}>{productCopied === 'resume' ? '✓ Copied!' : '⎘ Copy Resume'}</button>
                  <button className={styles.downloadBtn} onClick={() => download(productResult.bundleRewrite, 'optimized_resume.txt')}>↓ Download</button>
                </div>
              </div>
              <div className={styles.bundleSection} style={{ marginTop: 14 }}>
                <div className={styles.bundleSectionHeader}>
                  <span className={styles.bundleSectionTag} style={{ color: '#ff4d6a', background: '#ff4d6a18', borderColor: '#ff4d6a44' }}>Cover Letter</span>
                </div>
                <div className={styles.rewriteBox}>
                  <pre className={styles.rewriteText}>{productResult.bundleCoverLetter}</pre>
                </div>
                <div className={styles.actionRow}>
                  <button className={styles.copyBtn} onClick={() => {
                    navigator.clipboard.writeText(productResult.bundleCoverLetter)
                      .then(() => { setProductCopied('cl'); setTimeout(() => setProductCopied(false), 2000); });
                  }}>{productCopied === 'cl' ? '✓ Copied!' : '⎘ Copy Cover Letter'}</button>
                  <button className={styles.downloadBtn} onClick={() => download(productResult.bundleCoverLetter, 'cover_letter.txt')}>↓ Download</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.rewriteBox}>
                <pre className={styles.rewriteText}>{productResult.content}</pre>
              </div>
              <div className={styles.actionRow}>
                <button className={styles.copyBtn} onClick={() => {
                  navigator.clipboard.writeText(productResult.content).then(() => { setProductCopied(true); setTimeout(() => setProductCopied(false), 2000); });
                }}>{productCopied ? '✓ Copied!' : '⎘ Copy'}</button>
                <button className={styles.downloadBtn} onClick={() => download(
                  productResult.content,
                  isCL ? 'cover_letter.txt' : isLinkedIn ? 'linkedin_profile.txt' : 'optimized_resume.txt'
                )}>↓ Download .txt</button>
              </div>

              {/* Cross-sell: rewrite → cover letter, CL → rewrite */}
              {isRewrite && jobDesc && (
                <div className={styles.premiumCard} style={{ marginTop: 16, background: 'linear-gradient(135deg, #1a0005 0%, #0d0d0d 100%)', borderColor: '#ff4d6a44' }}>
                  <div className={styles.premiumLeft}>
                    <span className={styles.premiumBadge} style={{ color: '#ff4d6a', background: '#ff4d6a18', borderColor: '#ff4d6a44' }}>Complete the package</span>
                    <h3 className={styles.premiumTitle}>Add a tailored cover letter</h3>
                    <p className={styles.premiumSub}>Pair your rewritten resume with a role-specific cover letter and send a complete, standout application.</p>
                  </div>
                  <div className={styles.premiumRight}>
                    <span className={styles.premiumPrice} style={{ color: '#ff4d6a' }}>$3.99</span>
                    <button className={styles.premiumBtn} style={{ background: '#ff4d6a' }}
                      onClick={() => startCheckout('coverletter')}>
                      Add Cover Letter →
                    </button>
                  </div>
                </div>
              )}
              {isCL && (
                <div className={styles.premiumCard} style={{ marginTop: 16 }}>
                  <div className={styles.premiumLeft}>
                    <span className={styles.premiumBadge}>Complete the package</span>
                    <h3 className={styles.premiumTitle}>Rewrite your resume too</h3>
                    <p className={styles.premiumSub}>Your cover letter is ready — now make your resume just as strong. AI rewrites every bullet for maximum impact.</p>
                  </div>
                  <div className={styles.premiumRight}>
                    <span className={styles.premiumPrice}>$4.99</span>
                    <button className={styles.premiumBtn}
                      onClick={() => startCheckout('rewrite')}>
                      Rewrite Resume →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <button className={styles.resetBtn} style={{ marginTop: 14 }} onClick={reset}>← Analyze Another Resume</button>
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

        {/* Premium: Bundle (job match mode only — shown first for maximum impact) */}
        {result.jobMatch != null && (
          <div className={styles.premiumCard} style={{ background: 'linear-gradient(135deg, #1a0d2e 0%, #0d1a1a 100%)', borderColor: '#a855f744', position: 'relative', overflow: 'hidden' }}>
            <div className={styles.bestValueBanner}>BEST VALUE — SAVE $1</div>
            <div className={styles.premiumLeft}>
              <span className={styles.premiumBadge} style={{ color: '#a855f7', background: '#a855f718', borderColor: '#a855f744' }}>Bundle</span>
              <h3 className={styles.premiumTitle}>Rewritten Resume + Cover Letter</h3>
              <ul className={styles.premiumBullets}>
                <li>✓ Full resume rewrite, tailored to this job</li>
                <li>✓ Role-specific cover letter, ready to send</li>
                <li>✓ Delivered in under 60 seconds</li>
              </ul>
            </div>
            <div className={styles.premiumRight}>
              <div style={{ textAlign: 'center' }}>
                <span className={styles.premiumStrike}>$8.98</span>
                <span className={styles.premiumPrice} style={{ color: '#a855f7' }}>$7.99</span>
              </div>
              <button className={styles.premiumBtn} style={{ background: '#a855f7' }}
                disabled={!resumeText}
                onClick={() => startCheckout('bundle')}>
                Get Bundle →
              </button>
            </div>
          </div>
        )}

        {/* Premium: Resume Rewrite */}
        <div className={styles.premiumCard}>
          <div className={styles.premiumLeft}>
            <span className={styles.premiumBadge}>Premium</span>
            <h3 className={styles.premiumTitle}>
              {result.jobMatch != null ? 'Get your resume rewritten for this job' : 'Get a professionally rewritten resume'}
            </h3>
            <ul className={styles.premiumBullets}>
              <li>✓ Every bullet point rewritten with impact verbs</li>
              <li>✓ Summary optimised for ATS &amp; recruiters</li>
              <li>✓ {result.jobMatch != null ? 'Targeted keywords from the job description' : 'Industry keywords baked in'}</li>
            </ul>
            <p className={styles.premiumTrust}>⚡ Ready in ~30 seconds · 30-day money-back guarantee</p>
          </div>
          <div className={styles.premiumRight}>
            <span className={styles.premiumPrice}>$4.99</span>
            <button className={styles.premiumBtn} disabled={!resumeText} onClick={() => startCheckout('rewrite')}>
              Rewrite Resume →
            </button>
          </div>
        </div>

        {/* Premium: Cover Letter (job match mode only) */}
        {result.jobMatch != null && (
          <div className={styles.premiumCard} style={{ background: 'linear-gradient(135deg, #1a0005 0%, #0d0d0d 100%)', borderColor: '#ff4d6a44' }}>
            <div className={styles.premiumLeft}>
              <span className={styles.premiumBadge} style={{ color: '#ff4d6a', background: '#ff4d6a18', borderColor: '#ff4d6a44' }}>Premium</span>
              <h3 className={styles.premiumTitle}>Generate a tailored cover letter</h3>
              <ul className={styles.premiumBullets} style={{ color: 'var(--text-dim)' }}>
                <li>✓ Written specifically for this role</li>
                <li>✓ Uses your experience and their keywords</li>
                <li>✓ Professional, human-sounding tone</li>
              </ul>
              <p className={styles.premiumTrust}>⚡ Ready in ~30 seconds · 30-day money-back guarantee</p>
            </div>
            <div className={styles.premiumRight}>
              <span className={styles.premiumPrice} style={{ color: '#ff4d6a' }}>$3.99</span>
              <button className={styles.premiumBtn} style={{ background: '#ff4d6a' }} disabled={!resumeText} onClick={() => startCheckout('coverletter')}>
                Write Cover Letter →
              </button>
            </div>
          </div>
        )}

        {/* Job match score */}
        {result.jobMatch != null && (
          <div className={styles.jobMatchCard}>
            <div className={styles.jobMatchTop}>
              <span className={styles.jobMatchLabel}>Job Match</span>
              <span className={styles.jobMatchPct} style={{ color: result.jobMatch >= 70 ? '#E4002B' : result.jobMatch >= 50 ? '#ff8c00' : '#cc001a' }}>
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

        {/* Premium: LinkedIn Optimizer */}
        <div className={styles.premiumCard} style={{ background: 'linear-gradient(135deg, #001829 0%, #001020 100%)', borderColor: '#0a66c244' }}>
          <div className={styles.premiumLeft}>
            <span className={styles.premiumBadge} style={{ color: '#0a84ff', background: '#0a84ff18', borderColor: '#0a84ff44' }}>New</span>
            <h3 className={styles.premiumTitle}>LinkedIn Profile Optimizer</h3>
            <ul className={styles.premiumBullets} style={{ color: 'var(--text-dim)' }}>
              <li>✓ Headline &amp; About rewritten for recruiter search</li>
              <li>✓ Skills section tuned for your target role</li>
              <li>✓ Copy-paste ready in 30 seconds</li>
            </ul>
            <p className={styles.premiumTrust}>⚡ 71% more recruiter views · 30-day money-back guarantee</p>
          </div>
          <div className={styles.premiumRight}>
            <span className={styles.premiumPrice} style={{ color: '#0a84ff' }}>$2.99</span>
            <button className={styles.premiumBtn} style={{ background: '#0a84ff' }}
              disabled={!resumeText}
              onClick={() => startCheckout('linkedin')}>
              Optimise LinkedIn →
            </button>
          </div>
        </div>

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
              <li key={i} className={styles.listItem}><span className={styles.listIcon} style={{ color: '#E4002B' }}>✓</span>{s}</li>
            ))}
          </ul>
        </section>

        {/* Recommendations */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recommendations</h3>
          <ul className={styles.list}>
            {result.recommendations.map((r, i) => (
              <li key={i} className={styles.listItem}><span className={styles.listIcon} style={{ color: '#ff8c00' }}>→</span>{r}</li>
            ))}
          </ul>
        </section>

        {/* Inline error for checkout failures */}
        {error && <p className={styles.errorMsg} style={{ textAlign: 'center', maxWidth: '100%' }}>{error}</p>}

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
