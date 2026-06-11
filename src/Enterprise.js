import React, { useState, useRef, useEffect } from 'react';
import { extractText } from './extractText';
import s from './Enterprise.module.css';

const MAX_FILES = 10;

function scoreColor(score) {
  if (score >= 80) return '#E4002B';
  if (score >= 60) return '#ff4d6a';
  if (score >= 40) return '#ff8c00';
  return '#cc001a';
}

const GRADE_STYLE = {
  'Excellent':  { bg: '#1a0005', color: '#E4002B' },
  'Good':       { bg: '#042e2e', color: '#ff4d6a' },
  'Average':    { bg: '#2e2005', color: '#ff8c00' },
  'Needs Work': { bg: '#2e0505', color: '#cc001a' },
  'Error':      { bg: '#1a1a1a', color: '#666' },
};

function GradeBadge({ grade }) {
  const st = GRADE_STYLE[grade] || GRADE_STYLE['Average'];
  return <span className={s.gradeBadge} style={{ background: st.bg, color: st.color }}>{grade}</span>;
}

function ScorePill({ score }) {
  const color = scoreColor(score);
  return <span className={s.scorePill} style={{ color, borderColor: color + '44' }}>{score}</span>;
}

function exportCSV(candidates, jobTitle) {
  const headers = ['Rank', 'Name', 'Score', 'Grade', 'Top Strength', 'Key Gap', 'Summary', 'File'];
  const rows = candidates.map(c => [
    c.rank, c.name, c.score, c.grade,
    c.topStrength, c.keyGap, c.summary, c.filename,
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `screening-${(jobTitle || 'results').replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.click();
}

export default function Enterprise() {
  const [view, setView]         = useState('pricing');  // pricing | setup | extracting | screening | results
  const [jobTitle, setJobTitle]  = useState('');
  const [jobDesc, setJobDesc]    = useState('');
  const [files, setFiles]        = useState([]);
  const [drag, setDrag]          = useState(false);
  const [progress, setProgress]  = useState('');
  const [results, setResults]    = useState(null);
  const [error, setError]        = useState('');
  const [expanded, setExpanded]  = useState(null);
  const fileRef = useRef();

  const GUMROAD_URLS = {
    batch:   'https://imtiazafsar.gumroad.com/l/enterprise-batch',
    monthly: 'https://imtiazafsar.gumroad.com/l/enterprise-monthly',
  };

  // Listen for Gumroad purchase success → unlock screening
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
    const valid = Array.from(newFiles).filter(f =>
      /\.(pdf|doc|docx|txt)$/i.test(f.name) && f.size <= 5 * 1024 * 1024
    );
    setFiles(prev => {
      const merged = [...prev];
      for (const f of valid) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.find(e => e.name === f.name)) merged.push(f);
      }
      return merged;
    });
  }

  async function run() {
    if (!files.length || !jobTitle.trim() || !jobDesc.trim()) return;
    setError('');
    setView('extracting');
    setProgress(`Extracting text from ${files.length} resume${files.length > 1 ? 's' : ''}…`);

    let resumes;
    try {
      resumes = await Promise.all(
        files.map(async f => ({ filename: f.name, text: await extractText(f) }))
      );
    } catch (e) {
      setError('Failed to read one or more files. Please check the formats and try again.');
      setView('setup');
      return;
    }

    setView('screening');
    setProgress(`Screening ${resumes.length} candidate${resumes.length > 1 ? 's' : ''} against "${jobTitle}"…`);

    const res = await fetch('/api/enterprise-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumes, jobTitle, jobDescription: jobDesc }),
    }).catch(() => null);

    if (!res) { setError('Network error. Please try again.'); setView('setup'); return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Screening failed.'); setView('setup'); return; }

    setResults(data);
    setView('results');
  }

  function reset() {
    setFiles([]); setResults(null); setError(''); setExpanded(null);
    setJobTitle(''); setJobDesc('');
    setView('setup');
    if (fileRef.current) fileRef.current.value = '';
  }

  const avgScore  = results ? Math.round(results.candidates.filter(c => !c.error).reduce((a, c) => a + c.score, 0) / (results.candidates.filter(c => !c.error).length || 1)) : 0;
  const excellent = results ? results.candidates.filter(c => c.grade === 'Excellent').length : 0;
  const shortlist = results ? results.candidates.filter(c => c.score >= 70).length : 0;

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
            <p className={s.pricingSubtitle}>Upload up to 10 resumes, paste a job description, and get an AI-ranked shortlist with scores, gaps, and summaries.</p>

            <div className={s.pricingCards}>
              {/* Pay-per-batch */}
              <div className={s.pricingCard}>
                <span className={s.pricingPlan}>Pay per batch</span>
                <div className={s.pricingAmount}><span className={s.pricingAmt}>$19</span><span className={s.pricingPer}>/batch</span></div>
                <p className={s.pricingDesc}>Screen up to 10 candidates against one job. One-time payment, results in under 60 seconds.</p>
                <ul className={s.pricingFeats}>
                  <li>✓ Up to 10 resumes per run</li>
                  <li>✓ AI ranked shortlist</li>
                  <li>✓ Score, grade, strengths &amp; gaps</li>
                  <li>✓ CSV export</li>
                </ul>
                <button className={s.pricingBtn} onClick={() => openGumroad('batch')}>
                  Buy a batch →
                </button>
              </div>

              {/* Monthly plan */}
              <div className={s.pricingCard} style={{ borderColor: '#E4002B88', background: 'linear-gradient(135deg, #1a0005 0%, #0d0d0d 100%)' }}>
                <span className={s.pricingPopular}>Most Popular</span>
                <span className={s.pricingPlan} style={{ color: '#E4002B' }}>Monthly</span>
                <div className={s.pricingAmount}><span className={s.pricingAmt} style={{ color: '#E4002B' }}>$99</span><span className={s.pricingPer}>/month</span></div>
                <p className={s.pricingDesc}>Unlimited batches. For teams actively hiring across multiple roles.</p>
                <ul className={s.pricingFeats}>
                  <li>✓ Unlimited screening runs</li>
                  <li>✓ Up to 10 resumes per run</li>
                  <li>✓ All batch features</li>
                  <li>✓ Priority support</li>
                </ul>
                <button
                  className={s.pricingBtn}
                  style={{ background: '#E4002B', color: '#0e0e0e' }}
                  onClick={() => openGumroad('monthly')}
                >
                  Start monthly plan →
                </button>
              </div>
            </div>

            <p className={s.pricingNote}>Not sure? <button className={s.pricingTryLink} onClick={() => setView('setup')}>Try it free with 3 resumes</button> — no payment required.</p>
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
              <input className={s.input} placeholder="e.g. Senior Software Engineer"
                value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
              <label className={s.fieldLabel} style={{ marginTop: 16 }}>Job Description <span className={s.req}>*</span></label>
              <textarea className={s.textarea} rows={10}
                placeholder="Paste the full job description here — responsibilities, requirements, skills…"
                value={jobDesc} onChange={e => setJobDesc(e.target.value)} />
            </div>

            {/* Right: Resume upload */}
            <div className={s.panel}>
              <h2 className={s.panelTitle}>Upload Resumes <span className={s.panelLimit}>up to {MAX_FILES} files</span></h2>

              <div className={`${s.dropZone} ${drag ? s.dropActive : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" multiple
                  onChange={e => addFiles(e.target.files)} />
                <svg className={s.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className={s.dropLabel}>Click or drag resumes here</p>
                <p className={s.dropSub}>PDF, DOC, DOCX, TXT — 5 MB max each</p>
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
            <p className={s.processingMsg}>{progress}</p>
            <p className={s.processingHint}>
              {view === 'extracting' ? 'Reading file contents…' : 'Running AI analysis in parallel — this takes about 10–20 seconds.'}
            </p>
            <div className={s.processingFiles}>
              {files.map((f, i) => (
                <div key={i} className={s.processingFile}>
                  <span className={`${s.processingDot} ${view === 'screening' ? s.dotActive : ''}`} />
                  {f.name}
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
              <span className={s.statNum} style={{ color: '#ff4d6a' }}>{shortlist}</span>
              <span className={s.statLbl}>Recommended (70+)</span>
            </div>
            <div className={s.statActions}>
              <button className={s.exportBtn} onClick={() => exportCSV(results.candidates, results.jobTitle)}>
                ↓ Export CSV
              </button>
              <button className={s.newBatchBtn} onClick={reset}>+ New Batch</button>
            </div>
          </div>

          <div className={s.jobBadge}>
            Screening for: <strong>{results.jobTitle}</strong>
          </div>

          {/* Results table */}
          <div className={s.tableWrap}>
            <div className={s.tableHead}>
              <span>#</span>
              <span>Candidate</span>
              <span>Score</span>
              <span>Grade</span>
              <span>Top Strength</span>
              <span>Key Gap</span>
              <span></span>
            </div>
            {results.candidates.map(c => (
              <React.Fragment key={c.rank}>
                <div className={`${s.tableRow} ${expanded === c.rank ? s.tableRowOpen : ''}`}
                  onClick={() => setExpanded(expanded === c.rank ? null : c.rank)}>
                  <span className={s.rankNum} style={{ color: c.rank <= 3 ? scoreColor(c.score) : 'var(--text-dim)' }}>
                    {c.rank <= 3 ? ['🥇','🥈','🥉'][c.rank - 1] : c.rank}
                  </span>
                  <div className={s.candidateCell}>
                    <span className={s.candidateName}>{c.name}</span>
                    <span className={s.candidateFile}>{c.filename}</span>
                        </div>
                  <ScorePill score={c.score} />
                  <GradeBadge grade={c.grade} />
                  <span className={s.strengthCell}>{c.topStrength}</span>
                  <span className={s.gapCell}>{c.keyGap}</span>
                  <span className={s.expandChevron}>{expanded === c.rank ? '▲' : '▼'}</span>
                </div>
                {expanded === c.rank && (
                  <div className={s.expandedRow}>
                    <p className={s.expandedSummary}>{c.summary}</p>
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
