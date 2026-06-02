import React, { useState, useRef } from 'react';
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
  'Contact & Links':  '#c8f04a',
  'Work Experience':  '#4af0c8',
  'Skills':           '#f0c84a',
  'Education':        '#c84af0',
  'Formatting':       '#4ac8f0',
  'Keywords & ATS':   '#f04a4a',
};

const GRADE_STYLES = {
  'Excellent':   { bg: '#1a2e05', text: '#c8f04a' },
  'Good':        { bg: '#042e2e', text: '#4af0c8' },
  'Average':     { bg: '#2e2005', text: '#f0c84a' },
  'Needs Work':  { bg: '#2e0505', text: '#f04a4a' },
};

function ScoreRing({ score }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#c8f04a' : score >= 60 ? '#4af0c8' : score >= 40 ? '#f0c84a' : '#f04a4a';

  return (
    <div className={styles.ringWrap}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#2a2a2a" strokeWidth="8" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className={styles.ringText}>
        <span className={styles.ringScore} style={{ color }}>{score}</span>
        <span className={styles.ringDenom}>/100</span>
      </div>
    </div>
  );
}

function DimBar({ name, score }) {
  const color = DIMENSION_COLORS[name] || '#888';
  return (
    <div className={styles.dimBar}>
      <div className={styles.dimTop}>
        <span className={styles.dimName}>{name}</span>
        <span className={styles.dimScore} style={{ color }}>{score}</span>
      </div>
      <div className={styles.dimTrack}>
        <div className={styles.dimFill} style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('upload'); // upload | loading | results
  const [file, setFile] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef();
  const msgInterval = useRef();

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

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
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
      if (!text || text.trim().length < 30) {
        throw new Error('Could not extract text. Try a different format or a text-based PDF.');
      }
      const data = await analyzeResume(text);
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

  // ── Upload view ──────────────────────────────────────────────────────────────
  if (view === 'upload') {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Resume<br />Scorer</h1>
          <p className={styles.subtitle}>
            Drop your CV and get an AI-powered score, dimension breakdown,<br />
            strengths, and actionable recommendations.
          </p>
        </header>

        <div
          className={`${styles.dropZone} ${drag ? styles.dropActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className={styles.dropLabel}>
            {file ? file.name : 'Click or drag your resume here'}
          </p>
          <p className={styles.dropSub}>PDF, DOC, DOCX, TXT — up to 5 MB</p>
        </div>

        {file && (
          <div className={styles.filePill}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round"/>
              <polyline points="14 2 14 8 20 8" strokeLinecap="round"/>
            </svg>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
            <button className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); setFile(null); }}>✕</button>
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}

        <button
          className={styles.analyzeBtn}
          disabled={!file}
          onClick={runAnalysis}
        >
          Analyze Resume →
        </button>
      </div>
    );
  }

  // ── Loading view ─────────────────────────────────────────────────────────────
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

  // ── Results view ─────────────────────────────────────────────────────────────
  const gradeStyle = GRADE_STYLES[result.grade] || GRADE_STYLES['Average'];

  return (
    <div className={styles.page}>
      <div className={styles.results}>

        {/* Score hero */}
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

        {/* Dimensions */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Dimension Breakdown</h3>
          <div className={styles.dimsGrid}>
            {result.dimensions.map((d) => (
              <DimBar key={d.name} name={d.name} score={d.score} />
            ))}
          </div>
        </section>

        {/* Strengths */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Strengths</h3>
          <ul className={styles.list}>
            {result.strengths.map((s, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.listIcon} style={{ color: '#c8f04a' }}>✓</span>
                {s}
              </li>
            ))}
          </ul>
        </section>

        {/* Recommendations */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recommendations</h3>
          <ul className={styles.list}>
            {result.recommendations.map((r, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.listIcon} style={{ color: '#f0c84a' }}>→</span>
                {r}
              </li>
            ))}
          </ul>
        </section>

        <button className={styles.resetBtn} onClick={reset}>
          ← Analyze Another Resume
        </button>
      </div>
    </div>
  );
}
