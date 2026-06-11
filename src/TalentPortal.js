import React, { useState, useRef, useCallback } from 'react';
import { extractText } from './extractText';
import s from './TalentPortal.module.css';

const DEMO_CODE = 'TALENT2024';

// ─── Score helpers ────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return '#E4002B';
  if (score >= 60) return '#ff4d6a';
  if (score >= 40) return '#ff8c00';
  return '#666';
}

const GRADE_STYLE = {
  'Excellent':        { bg: '#2a0008', color: '#E4002B' },
  'Strong':           { bg: '#0d2a1a', color: '#2ec27e' },
  'Good':             { bg: '#042e2e', color: '#4fb8c2' },
  'Average':          { bg: '#2a1e00', color: '#ff8c00' },
  'Weak':             { bg: '#1a0005', color: '#cc001a' },
  'Needs Work':       { bg: '#1a0005', color: '#cc001a' },
  'Error':            { bg: '#1a1a1a', color: '#666' },
};

const RECO_STYLE = {
  'Strongly Recommend': { color: '#E4002B', icon: '⭐' },
  'Interview':          { color: '#2ec27e', icon: '✅' },
  'Borderline':         { color: '#ff8c00', icon: '⚠️' },
  'Pass':               { color: '#666',    icon: '✗' },
};

function ScoreDial({ score, size = 72 }) {
  const r    = size * 0.4;
  const circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;
  const c    = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#222" strokeWidth={size*0.08} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={size*0.08}
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x={size/2} y={size/2+2} textAnchor="middle" fill={c} fontSize={size*0.28} fontWeight="700" dy="0">{score}</text>
    </svg>
  );
}

function GradeBadge({ grade }) {
  const st = GRADE_STYLE[grade] || GRADE_STYLE['Average'];
  return <span className={s.gradeBadge} style={{ background: st.bg, color: st.color }}>{grade}</span>;
}

function RecoBadge({ reco }) {
  const st = RECO_STYLE[reco] || RECO_STYLE['Pass'];
  return <span className={s.recoBadge} style={{ color: st.color }}>{st.icon} {reco}</span>;
}

// ─── Candidate results table (shared by both modes) ──────────────────────────
function CandidateTable({ candidates, jobTitle, mode }) {
  const [expanded, setExpanded] = useState(null);

  function exportCSV() {
    const headers = mode === 'linkedin'
      ? ['Rank','Name','Current Title','Company','Score','Grade','Recommendation','Experience','Top Strength','Key Gap','Skills Matched','Summary']
      : ['Rank','Name','Score','Grade','Recommendation','Experience','Top Strength','Key Gap','Skills Matched','Summary','File'];

    const rows = candidates.map(c => mode === 'linkedin'
      ? [c.rank, c.name, c.currentTitle||'', c.currentCompany||'', c.score, c.grade, c.recommendation, c.experienceLevel||'', c.topStrength, c.keyGap, (c.skillsMatched||[]).join('; '), c.summary]
      : [c.rank, c.name, c.score, c.grade, c.recommendation||'', c.experienceLevel||'', c.topStrength, c.keyGap, (c.skillsMatched||[]).join('; '), c.summary, c.filename||'']
    );

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `talent-screening-${(jobTitle||'results').replace(/\s+/g,'-').toLowerCase()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  const shortlist = candidates.filter(c => !c.error && (c.recommendation === 'Strongly Recommend' || c.recommendation === 'Interview'));

  return (
    <div className={s.resultsWrap}>
      <div className={s.resultsHeader}>
        <div className={s.resultsStats}>
          <span className={s.statPill}>{candidates.length} screened</span>
          <span className={s.statPill} style={{ color: '#2ec27e' }}>{shortlist.length} to interview</span>
          <span className={s.statPill} style={{ color: '#ff8c00' }}>
            avg score: {candidates.filter(c=>!c.error).length
              ? Math.round(candidates.filter(c=>!c.error).reduce((a,c)=>a+c.score,0)/candidates.filter(c=>!c.error).length)
              : 0}
          </span>
        </div>
        <button className={s.exportBtn} onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      <div className={s.candidateList}>
        {candidates.map(c => (
          <div key={c.id || c.rank} className={`${s.candidateCard} ${expanded===c.rank ? s.cardExpanded : ''}`}>
            <div className={s.cardTop} onClick={() => setExpanded(expanded === c.rank ? null : c.rank)}>
              <div className={s.rankNum}>#{c.rank}</div>
              <ScoreDial score={c.error ? 0 : c.score} size={60} />
              <div className={s.candidateInfo}>
                <div className={s.candidateName}>{c.name}</div>
                {mode === 'linkedin' && c.currentTitle && (
                  <div className={s.candidateTitle}>{c.currentTitle}{c.currentCompany ? ` · ${c.currentCompany}` : ''}</div>
                )}
                {mode === 'cv' && c.filename && (
                  <div className={s.candidateTitle}>{c.filename}</div>
                )}
                <div className={s.candidateMeta}>
                  <GradeBadge grade={c.grade} />
                  {c.recommendation && <RecoBadge reco={c.recommendation} />}
                  {c.experienceLevel && <span className={s.expBadge}>{c.experienceLevel}</span>}
                </div>
              </div>
              <div className={s.cardChevron}>{expanded === c.rank ? '▲' : '▼'}</div>
            </div>

            {expanded === c.rank && !c.error && (
              <div className={s.cardBody}>
                <div className={s.twoCol}>
                  <div className={s.strengthBox}>
                    <div className={s.boxLabel}>⚡ Top Strength</div>
                    <div className={s.boxText}>{c.topStrength}</div>
                  </div>
                  <div className={s.gapBox}>
                    <div className={s.boxLabel}>⚠ Key Gap</div>
                    <div className={s.boxText}>{c.keyGap}</div>
                  </div>
                </div>
                <div className={s.summaryRow}>
                  <div className={s.boxLabel}>Hiring Manager Summary</div>
                  <div className={s.summaryText}>{c.summary}</div>
                </div>
                {c.skillsMatched?.length > 0 && (
                  <div className={s.skillsRow}>
                    <div className={s.boxLabel}>Skills Matched</div>
                    <div className={s.skillTags}>
                      {c.skillsMatched.map((sk, i) => <span key={i} className={s.skillTag}>{sk}</span>)}
                    </div>
                  </div>
                )}
                {mode === 'linkedin' && c.notableAchievements?.length > 0 && (
                  <div className={s.achieveRow}>
                    <div className={s.boxLabel}>Notable Achievements</div>
                    <ul className={s.achieveList}>
                      {c.notableAchievements.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LinkedIn Screening Section ───────────────────────────────────────────────
function LinkedInSection({ jobTitle, jobDescription }) {
  const [candidates, setCandidates] = useState([]);
  const [profileText, setProfileText] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const nextId = useRef(1);

  function addCandidate() {
    if (!profileText.trim() || profileText.trim().length < 50) {
      setError('Please paste more profile text (at least 50 characters).'); return;
    }
    setCandidates(prev => [...prev, {
      id: nextId.current++,
      name: candidateName.trim() || `Candidate ${nextId.current - 1}`,
      profileText: profileText.trim(),
    }]);
    setProfileText('');
    setCandidateName('');
    setError('');
  }

  function removeCandidate(id) {
    setCandidates(prev => prev.filter(c => c.id !== id));
  }

  async function screenAll() {
    if (!jobTitle.trim()) { setError('Please enter a job title in the role setup above.'); return; }
    if (!jobDescription.trim()) { setError('Please enter job requirements in the role setup above.'); return; }
    if (candidates.length === 0) { setError('Add at least one candidate to screen.'); return; }
    setError(''); setLoading(true); setResults(null);

    try {
      const res = await fetch('/api/talent-linkedin-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates, jobTitle, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Screening failed. Please try again.'); return; }
      setResults(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.sectionContent}>
      <div className={s.sectionIntro}>
        <p>Paste LinkedIn profile text for each candidate. The AI evaluates their fit against your job requirements and ranks them for you.</p>
        <div className={s.tipBox}>
          <strong>How to copy a LinkedIn profile:</strong> Open the candidate's profile → scroll to the bottom → select all text (Ctrl+A) → copy and paste below.
        </div>
      </div>

      {!results && (
        <div className={s.inputArea}>
          <div className={s.inputRow}>
            <input
              className={s.nameInput}
              placeholder="Candidate name (optional — AI will extract from profile)"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
            />
          </div>
          <textarea
            className={s.profileTextarea}
            placeholder="Paste LinkedIn profile text here…&#10;&#10;Include their headline, About, work experience, skills, and education for the most accurate screening."
            value={profileText}
            onChange={e => setProfileText(e.target.value)}
            rows={8}
          />
          <button className={s.addBtn} onClick={addCandidate} disabled={!profileText.trim()}>
            + Add to Queue
          </button>
        </div>
      )}

      {candidates.length > 0 && !results && (
        <div className={s.queue}>
          <div className={s.queueHeader}>
            <span className={s.queueTitle}>Candidate Queue ({candidates.length})</span>
            <button className={s.clearBtn} onClick={() => setCandidates([])}>Clear all</button>
          </div>
          {candidates.map(c => (
            <div key={c.id} className={s.queueItem}>
              <span className={s.queueIcon}>👤</span>
              <span className={s.queueName}>{c.name}</span>
              <span className={s.queueLen}>{c.profileText.length} chars</span>
              <button className={s.removeBtn} onClick={() => removeCandidate(c.id)}>✕</button>
            </div>
          ))}
          <button
            className={s.screenBtn}
            onClick={screenAll}
            disabled={loading || !jobTitle.trim() || !jobDescription.trim()}
          >
            {loading ? '⏳ Screening candidates…' : `🔍 Screen All ${candidates.length} Candidate${candidates.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {error && <div className={s.errorMsg}>{error}</div>}

      {results && (
        <>
          <div className={s.resultsTopBar}>
            <span className={s.resultsFor}>Results for: <strong>{results.jobTitle}</strong></span>
            <button className={s.newSearchBtn} onClick={() => { setResults(null); setCandidates([]); }}>
              ← New Search
            </button>
          </div>
          <CandidateTable candidates={results.candidates} jobTitle={results.jobTitle} mode="linkedin" />
        </>
      )}
    </div>
  );
}

// ─── CV / Resume Screening Section ───────────────────────────────────────────
function CVSection({ jobTitle, jobDescription }) {
  const [files, setFiles]         = useState([]);
  const [drag, setDrag]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState({ done: 0, total: 0 });
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState('');
  const fileRef                   = useRef();

  const addFiles = useCallback((newFiles) => {
    const valid = [...newFiles].filter(f =>
      /\.(pdf|docx|doc|txt)$/i.test(f.name) && f.size <= 5 * 1024 * 1024
    );
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      const unique = valid.filter(f => !existing.has(f.name));
      return [...prev, ...unique].slice(0, 25);
    });
  }, []);

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    addFiles(e.dataTransfer.files);
  }

  async function screenAll() {
    if (!jobTitle.trim()) { setError('Please enter a job title in the role setup above.'); return; }
    if (!jobDescription.trim()) { setError('Please enter job requirements in the role setup above.'); return; }
    if (files.length === 0) { setError('Please upload at least one CV or resume.'); return; }
    setError(''); setLoading(true); setResults(null);
    setProgress({ done: 0, total: files.length });

    try {
      const resumes = [];
      for (let i = 0; i < files.length; i++) {
        const text = await extractText(files[i]);
        resumes.push({ filename: files[i].name, text });
        setProgress({ done: i + 1, total: files.length });
      }

      const res = await fetch('/api/enterprise-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumes, jobTitle, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Screening failed. Please try again.'); return; }
      // Normalize to add recommendation field
      const enriched = {
        ...data,
        candidates: data.candidates.map(c => ({
          ...c,
          recommendation: c.score >= 80 ? 'Strongly Recommend'
            : c.score >= 60 ? 'Interview'
            : c.score >= 45 ? 'Borderline'
            : 'Pass',
        })),
      };
      setResults(enriched);
    } catch {
      setError('Extraction or network error. Please try again.');
    } finally {
      setLoading(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  return (
    <div className={s.sectionContent}>
      <div className={s.sectionIntro}>
        <p>Upload CVs or resumes in bulk. The AI screens every candidate against your job requirements and delivers a ranked shortlist.</p>
        <p className={s.supportedFormats}>Supported formats: PDF · DOCX · TXT · up to 5 MB each · max 25 files</p>
      </div>

      {!results && (
        <>
          <div
            className={`${s.dropZone} ${drag ? s.dropActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt"
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
            <div className={s.dropIcon}>📄</div>
            <div className={s.dropText}>
              {drag ? 'Drop files here' : 'Click or drag CVs / resumes here'}
            </div>
            <div className={s.dropSub}>PDF, DOCX, TXT — up to 25 files</div>
          </div>

          {files.length > 0 && (
            <div className={s.fileList}>
              <div className={s.fileListHeader}>
                <span>{files.length} file{files.length !== 1 ? 's' : ''} ready</span>
                <button className={s.clearBtn} onClick={() => setFiles([])}>Clear all</button>
              </div>
              {files.map((f, i) => (
                <div key={i} className={s.fileItem}>
                  <span className={s.fileIcon}>📄</span>
                  <span className={s.fileName}>{f.name}</span>
                  <span className={s.fileSize}>{(f.size/1024).toFixed(0)} KB</span>
                  <button className={s.removeBtn} onClick={() => setFiles(prev => prev.filter((_,j)=>j!==i))}>✕</button>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <button
              className={s.screenBtn}
              onClick={screenAll}
              disabled={loading || !jobTitle.trim() || !jobDescription.trim()}
            >
              {loading
                ? progress.total > 0
                  ? `⏳ Extracting text… (${progress.done}/${progress.total})`
                  : '⏳ Screening candidates…'
                : `🔍 Screen All ${files.length} CV${files.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}

      {error && <div className={s.errorMsg}>{error}</div>}

      {results && (
        <>
          <div className={s.resultsTopBar}>
            <span className={s.resultsFor}>Results for: <strong>{results.jobTitle}</strong></span>
            <button className={s.newSearchBtn} onClick={() => { setResults(null); setFiles([]); }}>
              ← New Search
            </button>
          </div>
          <CandidateTable candidates={results.candidates} jobTitle={results.jobTitle} mode="cv" />
        </>
      )}
    </div>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────
export default function TalentPortal() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode]         = useState('');
  const [codeErr, setCodeErr]   = useState('');
  const [tab, setTab]           = useState('linkedin');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDesc, setJobDesc]   = useState('');

  function unlock() {
    if (code.trim().toUpperCase() === DEMO_CODE) {
      setUnlocked(true); setCodeErr('');
    } else {
      setCodeErr('Invalid access code. Please contact us for demo access.');
    }
  }

  // ── Access gate ────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className={s.gateWrap}>
        <div className={s.gateBox}>
          <div className={s.gateLogo}>
            <span className={s.gateLogoMark}>TI</span>
            <div>
              <div className={s.gateLogoName}>Talent Intelligence</div>
              <div className={s.gateLogoSub}>Enterprise Hiring Platform</div>
            </div>
          </div>
          <p className={s.gateDesc}>
            AI-powered candidate screening that saves your team hundreds of hours.
            Screen LinkedIn profiles and CVs against any role in seconds.
          </p>
          <div className={s.gateInputRow}>
            <input
              className={s.gateInput}
              type="text"
              placeholder="Enter access code"
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && unlock()}
              autoFocus
            />
            <button className={s.gateBtn} onClick={unlock}>Access →</button>
          </div>
          {codeErr && <div className={s.gateErr}>{codeErr}</div>}
          <div className={s.gateContact}>
            Don't have a code? <a href="mailto:imtiazafsar456@gmail.com">Request demo access</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Portal ─────────────────────────────────────────────────────────────────
  return (
    <div className={s.portal}>
      {/* Header */}
      <header className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerBrand}>
            <span className={s.headerLogoMark}>TI</span>
            <div>
              <div className={s.headerTitle}>Talent Intelligence Platform</div>
              <div className={s.headerSub}>Enterprise Candidate Screening · Powered by AI</div>
            </div>
          </div>
          <div className={s.headerBadge}>🔒 Private Demo</div>
        </div>
      </header>

      <main className={s.main}>
        {/* Role Setup */}
        <section className={s.roleSetup}>
          <div className={s.setupLabel}>📋 Role Definition</div>
          <div className={s.setupGrid}>
            <div className={s.setupField}>
              <label className={s.fieldLabel}>Job Title *</label>
              <input
                className={s.setupInput}
                placeholder="e.g. Senior Software Engineer, Product Manager…"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
              />
            </div>
            <div className={s.setupFieldWide}>
              <label className={s.fieldLabel}>Key Requirements *</label>
              <textarea
                className={s.setupTextarea}
                placeholder="List the key skills, experience, and qualifications required for this role. The more specific you are, the more accurate the screening."
                value={jobDesc}
                onChange={e => setJobDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* Mode tabs */}
        <div className={s.modeTabs}>
          <button
            className={`${s.modeTab} ${tab === 'linkedin' ? s.modeTabActive : ''}`}
            onClick={() => setTab('linkedin')}
          >
            <span className={s.modeIcon}>💼</span>
            <div>
              <div className={s.modeLabel}>LinkedIn Screening</div>
              <div className={s.modeSub}>Evaluate LinkedIn profiles</div>
            </div>
          </button>
          <button
            className={`${s.modeTab} ${tab === 'cv' ? s.modeTabActive : ''}`}
            onClick={() => setTab('cv')}
          >
            <span className={s.modeIcon}>📄</span>
            <div>
              <div className={s.modeLabel}>CV / Resume Screening</div>
              <div className={s.modeSub}>Batch upload &amp; rank applicants</div>
            </div>
          </button>
        </div>

        {/* Section content */}
        {tab === 'linkedin'
          ? <LinkedInSection jobTitle={jobTitle} jobDescription={jobDesc} />
          : <CVSection jobTitle={jobTitle} jobDescription={jobDesc} />
        }
      </main>

      <footer className={s.footer}>
        AI screening is a tool to assist — not replace — human judgment. Always review shortlisted candidates personally.
      </footer>
    </div>
  );
}
