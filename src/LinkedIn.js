import React, { useState } from 'react';
import Nav from './Nav';
import s from './App.module.css';
import ls from './LinkedIn.module.css';

// ── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r    = 54;
  const circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;
  const color = score >= 80 ? '#E4002B' : score >= 60 ? '#ff4d6a' : score >= 40 ? '#ff8c00' : '#cc001a';
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="65" y="60" textAnchor="middle" fill={color} fontSize="28" fontWeight="600" dy="6">{score}</text>
      <text x="65" y="82" textAnchor="middle" fill="var(--text-dim)" fontSize="12">/100</text>
    </svg>
  );
}

// ── Mini score bar ────────────────────────────────────────────────────────────
function ScoreBar({ value }) {
  const pct   = (value / 10) * 100;
  const color = value >= 8 ? '#E4002B' : value >= 6 ? '#ff4d6a' : value >= 4 ? '#ff8c00' : '#cc001a';
  return (
    <div className={ls.scoreBarTrack}>
      <div className={ls.scoreBarFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const GRADE_STYLES = {
  'Excellent':  { bg: '#1a0005', text: '#E4002B' },
  'Good':       { bg: '#0d1a2e', text: '#4a90d2' },
  'Average':    { bg: '#1a1000', text: '#ff8c00' },
  'Needs Work': { bg: '#1a0005', text: '#cc001a' },
};

const SEVERITY_META = {
  critical:  { label: 'Critical',  color: '#cc001a', bg: '#1a0005', dot: '🔴' },
  moderate:  { label: 'Moderate',  color: '#ff8c00', bg: '#1a0800', dot: '🟡' },
  quick_win: { label: 'Quick Win', color: '#4a90d2', bg: '#0d1a2e', dot: '🟢' },
};

const SECTION_LABELS = {
  headline: 'Headline', about: 'About', experience: 'Experience',
  skills: 'Skills', education: 'Education',
};

export default function LinkedIn() {
  const [inputMode, setInputMode]         = useState('url');   // 'url' | 'paste'
  const [profileUrl, setProfileUrl]       = useState('');
  const [profileText, setProfileText]     = useState('');
  const [targetRole, setTargetRole]       = useState('');
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');
  const [copied, setCopied]               = useState('');
  const [activeHeadline, setActiveHeadline] = useState(0);
  const [expandedWeak, setExpandedWeak]   = useState(null);
  const proToken = localStorage.getItem('resume_pro_token') || undefined;

  async function analyse() {
    const hasUrl  = inputMode === 'url'   && profileUrl.trim().length > 0;
    const hasText = inputMode === 'paste' && profileText.trim().length >= 50;
    if (!hasUrl && !hasText) return;

    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUrl:  hasUrl  ? profileUrl.trim()  : undefined,
          profileText: hasText ? profileText.trim() : undefined,
          targetRole: targetRole.trim() || undefined,
          proToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.noProxycurl || data.fetchFailed) {
          // Auto-fetch unavailable — switch to paste mode
          setInputMode('paste');
          setError(data.error + (data.noProxycurl ? '' : ' Switch to "Paste Text" below.'));
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  function reset() {
    setResult(null); setError('');
    setProfileUrl(''); setProfileText(''); setTargetRole('');
    setActiveHeadline(0); setExpandedWeak(null);
  }

  const gradeStyle   = result ? (GRADE_STYLES[result.grade] || GRADE_STYLES['Average']) : null;
  const canSubmitUrl  = profileUrl.trim().length > 10;
  const canSubmitPaste = profileText.trim().length >= 50;
  const canSubmit    = (inputMode === 'url' && canSubmitUrl) || (inputMode === 'paste' && canSubmitPaste);

  // Sort weaknesses: critical → moderate → quick_win
  const SORDER = { critical: 0, moderate: 1, quick_win: 2 };
  const weaknesses = (result?.weaknesses || []).slice().sort(
    (a, b) => (SORDER[a.severity] ?? 3) - (SORDER[b.severity] ?? 3)
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Nav active="LinkedIn" />

      <div className={ls.page}>

        {/* ── Input form ────────────────────────────────────────────── */}
        {!result && !loading && (
          <>
            <div className={ls.hero}>
              <h1 className={ls.title}>LinkedIn Profile Analyser</h1>
              <p className={ls.subtitle}>
                Get an AI-powered deep analysis — section scores, severity-ranked weaknesses,
                before/after rewrites, ATS keyword gaps, and optimised headline options.
              </p>
            </div>

            <div className={ls.formWrap}>
              {/* Mode toggle */}
              <div className={ls.modeToggle}>
                <button
                  className={inputMode === 'url' ? ls.modeOn : ls.modeOff}
                  onClick={() => setInputMode('url')}
                >🔗 Profile URL</button>
                <button
                  className={inputMode === 'paste' ? ls.modeOn : ls.modeOff}
                  onClick={() => setInputMode('paste')}
                >📋 Paste Text</button>
              </div>

              {/* URL input */}
              {inputMode === 'url' && (
                <>
                  <label className={ls.label}>LinkedIn Profile URL</label>
                  <input
                    className={ls.input}
                    placeholder="https://www.linkedin.com/in/your-profile"
                    value={profileUrl}
                    onChange={e => setProfileUrl(e.target.value)}
                    type="url"
                  />
                  <p className={ls.modeHint}>
                    Paste your public LinkedIn profile URL. Auto-fetch must be enabled on the server — if it fails, switch to Paste Text.
                  </p>
                </>
              )}

              {/* Paste input */}
              {inputMode === 'paste' && (
                <>
                  <div className={ls.tipBox}>
                    <p className={ls.tipItem}><span className={ls.tipBullet}>→</span>Open LinkedIn → View Profile → select all and copy everything visible</p>
                    <p className={ls.tipItem}><span className={ls.tipBullet}>→</span>Include headline, About, experience, skills, and education for best results</p>
                  </div>
                  <label className={ls.label}>
                    Your LinkedIn Profile Text
                    <span className={ls.charCount}>{profileText.length} chars</span>
                  </label>
                  <textarea
                    className={ls.textarea}
                    rows={12}
                    placeholder="Paste your full LinkedIn profile here — headline, about, experience, skills, education…"
                    value={profileText}
                    onChange={e => setProfileText(e.target.value)}
                  />
                  {profileText.trim().length > 0 && profileText.trim().length < 50 && (
                    <p className={ls.hintMsg}>Paste more of your profile for accurate results.</p>
                  )}
                </>
              )}

              {/* Target role (both modes) */}
              <label className={ls.label} style={{ marginTop: 16 }}>
                Target Role <span className={ls.optional}>(optional — unlocks ATS keyword analysis)</span>
              </label>
              <input
                className={ls.input}
                placeholder="e.g. Product Manager, Software Engineer, Marketing Lead…"
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
              />

              {error && <p className={ls.errorMsg}>{error}</p>}

              <button
                className={ls.analyseBtn}
                disabled={!canSubmit}
                onClick={analyse}
              >
                Analyse Profile →
              </button>
            </div>
          </>
        )}

        {/* ── Loading ───────────────────────────────────────────────── */}
        {loading && (
          <div className={s.loadingWrap}>
            <div className={s.spinner} />
            <p className={s.loadingMsg}>Analysing your LinkedIn profile…</p>
            <p className={s.loadingTip}>Scoring sections, finding weaknesses, rewriting copy.</p>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────── */}
        {result && !loading && (
          <div className={ls.results}>

            {/* ── Overall score ── */}
            <div className={ls.scoreCard}>
              <ScoreRing score={result.score} />
              <div className={ls.scoreMeta}>
                <span className={s.gradeBadge} style={{ background: gradeStyle.bg, color: gradeStyle.text }}>
                  {result.grade}
                </span>
                <h2 className={ls.scoreTitle}>Profile Strength: {result.score}/100</h2>
                <p className={ls.scoreSummary}>{result.summary}</p>
              </div>
            </div>

            {/* ── Section scores ── */}
            {result.sectionScores && (
              <div className={ls.card}>
                <h3 className={ls.cardTitle}><span>📊</span> Section Scores</h3>
                <div className={ls.sectionGrid}>
                  {Object.entries(result.sectionScores).map(([key, val]) => {
                    const color = val >= 8 ? '#E4002B' : val >= 6 ? '#ff4d6a' : val >= 4 ? '#ff8c00' : '#cc001a';
                    return (
                      <div key={key} className={ls.sectionItem}>
                        <div className={ls.sectionLabelRow}>
                          <span className={ls.sectionName}>{SECTION_LABELS[key] || key}</span>
                          <span className={ls.sectionScore} style={{ color }}>{val}/10</span>
                        </div>
                        <ScoreBar value={val} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Weaknesses ── */}
            {weaknesses.length > 0 && (
              <div className={ls.card}>
                <h3 className={ls.cardTitle}><span>⚠️</span> Weaknesses</h3>
                <p className={ls.cardHint}>Fixed from most to least impactful. Click to see before/after rewrite.</p>
                <div className={ls.weakList}>
                  {weaknesses.map((w, i) => {
                    const meta = SEVERITY_META[w.severity] || SEVERITY_META.moderate;
                    const open = expandedWeak === i;
                    return (
                      <div key={i} className={ls.weakItem} onClick={() => setExpandedWeak(open ? null : i)}>
                        <div className={ls.weakHeader}>
                          <span className={ls.severityBadge} style={{ background: meta.bg, color: meta.color }}>
                            {meta.dot} {meta.label}
                          </span>
                          <span className={ls.weakSection}>{w.section}</span>
                          <span className={ls.weakChevron}>{open ? '▲' : '▼'}</span>
                        </div>
                        <p className={ls.weakIssue}>{w.issue}</p>
                        {open && (
                          <div className={ls.weakExpanded}>
                            {w.original && (
                              <div className={ls.beforeBox}>
                                <span className={ls.beforeLabel}>Before</span>
                                <p className={ls.beforeText}>"{w.original}"</p>
                              </div>
                            )}
                            <div className={ls.afterBox}>
                              <div className={ls.afterLabelRow}>
                                <span className={ls.afterLabel}>Rewrite</span>
                                <button className={ls.copyBtn} onClick={e => { e.stopPropagation(); copyText(w.rewrite, `w${i}`); }}>
                                  {copied === `w${i}` ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                              <p className={ls.afterText}>{w.rewrite}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── ATS keyword gaps (if target role provided) ── */}
            {(result.atsKeywordsFound?.length > 0 || result.atsKeywordGaps?.length > 0) && (
              <div className={ls.card}>
                <h3 className={ls.cardTitle}><span>🔍</span> ATS Keyword Analysis</h3>
                <p className={ls.cardHint}>Keywords recruiters search for in "{targetRole}" roles.</p>
                {result.atsKeywordGaps?.length > 0 && (
                  <>
                    <p className={ls.atsLabel} style={{ color: '#cc001a' }}>Missing from your profile</p>
                    <div className={ls.atsTags}>
                      {result.atsKeywordGaps.map((k, i) => (
                        <span key={i} className={ls.atsTagMissing}>{k}</span>
                      ))}
                    </div>
                  </>
                )}
                {result.atsKeywordsFound?.length > 0 && (
                  <>
                    <p className={ls.atsLabel} style={{ color: '#2e7d32', marginTop: 12 }}>Already in your profile</p>
                    <div className={ls.atsTags}>
                      {result.atsKeywordsFound.map((k, i) => (
                        <span key={i} className={ls.atsTagFound}>{k}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Job match ── */}
            {result.jobMatchScore != null && (
              <div className={ls.card}>
                <h3 className={ls.cardTitle}>
                  <span>🎯</span> Match for "{targetRole}"
                  <span className={ls.cardScore} style={{
                    color: result.jobMatchScore >= 70 ? '#E4002B' : result.jobMatchScore >= 50 ? '#ff8c00' : '#cc001a'
                  }}>{result.jobMatchScore}%</span>
                </h3>
                <ul className={ls.tipList}>
                  {(result.jobMatchTips || []).map((t, i) => (
                    <li key={i} className={ls.tipListItem}><span className={ls.tipNum}>{i + 1}</span>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Headlines ── */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>✏️</span> Headline Options</h3>
              <p className={ls.cardHint}>Pick one — or blend elements from multiple options.</p>
              <div className={ls.headlineList}>
                {(result.headlines || []).map((h, i) => (
                  <div key={i}
                    className={activeHeadline === i ? ls.headlineOptionOn : ls.headlineOption}
                    onClick={() => setActiveHeadline(i)}
                  >
                    <div className={ls.headlineTop}>
                      <span className={ls.headlineNum}>Option {i + 1}</span>
                      <button className={ls.copyBtn} onClick={e => { e.stopPropagation(); copyText(h, `h${i}`); }}>
                        {copied === `h${i}` ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className={ls.headlineText}>{h}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── About section ── */}
            <div className={ls.card}>
              <div className={ls.cardTitleRow}>
                <h3 className={ls.cardTitle}><span>📝</span> Rewritten About Section</h3>
                <button className={ls.copyBtnLg} onClick={() => copyText(result.aboutSection, 'about')}>
                  {copied === 'about' ? '✓ Copied' : '↓ Copy'}
                </button>
              </div>
              <p className={ls.cardHint}>Replace your current About section. Edit to match your voice.</p>
              <div className={ls.aboutBox}>
                <p className={ls.aboutText}>{result.aboutSection}</p>
              </div>
            </div>

            {/* ── Skills to add ── */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>🛠</span> Skills to Add</h3>
              <p className={ls.cardHint}>Add these to your Skills section to improve recruiter search visibility.</p>
              <div className={ls.skillTags}>
                {(result.skillsToAdd || []).map((skill, i) => (
                  <span key={i} className={ls.skillTag}>{skill}</span>
                ))}
              </div>
            </div>

            {/* ── Quick wins ── */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>⚡</span> Quick Wins</h3>
              <ul className={ls.tipList}>
                {(result.quickWins || []).map((t, i) => (
                  <li key={i} className={ls.tipListItem}><span className={ls.tipNum}>{i + 1}</span>{t}</li>
                ))}
              </ul>
            </div>

            {/* ── Actions ── */}
            <div className={ls.actionRow}>
              <button className={ls.resetBtn} onClick={reset}>← Analyse Another Profile</button>
              <button className={ls.copyBtnLg} onClick={() => {
                const text = [
                  `LinkedIn Profile Score: ${result.score}/100 (${result.grade})`,
                  result.summary,
                  '',
                  '— Section Scores —',
                  ...Object.entries(result.sectionScores || {}).map(([k, v]) => `${SECTION_LABELS[k] || k}: ${v}/10`),
                  '',
                  '— Weaknesses —',
                  ...(weaknesses).map(w => `[${w.severity.toUpperCase()}] ${w.section}: ${w.issue}`),
                  '',
                  '— Headlines —',
                  ...(result.headlines || []).map((h, i) => `Option ${i+1}: ${h}`),
                  '',
                  '— About Section —',
                  result.aboutSection,
                  '',
                  '— Skills to Add —',
                  (result.skillsToAdd || []).join(', '),
                  '',
                  '— Quick Wins —',
                  ...(result.quickWins || []).map((t, i) => `${i+1}. ${t}`),
                  ...(result.atsKeywordGaps?.length ? ['', '— Missing ATS Keywords —', result.atsKeywordGaps.join(', ')] : []),
                ].join('\n');
                copyText(text, 'all');
              }}>
                {copied === 'all' ? '✓ Copied All' : '↓ Copy All Results'}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
