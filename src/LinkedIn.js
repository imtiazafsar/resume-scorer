import React, { useState } from 'react';
import Nav from './Nav';
import s from './App.module.css';
import ls from './LinkedIn.module.css';

const TIPS = [
  'Paste your LinkedIn profile: open LinkedIn → View Profile → copy everything visible (headline, about, experience, skills)',
  'Include your current headline, About section, job titles, and skills for the best results',
];

function ScoreRing({ score }) {
  const r = 54;
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

const GRADE_STYLES = {
  'Excellent':  { bg: '#1a0005', text: '#E4002B' },
  'Good':       { bg: '#0d1a2e', text: '#4a90d2' },
  'Average':    { bg: '#1a1000', text: '#ff8c00' },
  'Needs Work': { bg: '#1a0005', text: '#cc001a' },
};

export default function LinkedIn() {
  const [profileText, setProfileText] = useState('');
  const [targetRole, setTargetRole]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');
  const [copied, setCopied]           = useState('');
  const [activeHeadline, setActiveHeadline] = useState(0);
  const proToken = localStorage.getItem('resume_pro_token') || undefined;

  async function analyse() {
    if (profileText.trim().length < 50) { setError('Please paste more of your LinkedIn profile.'); return; }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileText, targetRole: targetRole.trim() || undefined, proToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimited) {
          setError(data.error);
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
    setProfileText(''); setTargetRole('');
    setActiveHeadline(0);
  }

  const gradeStyle = result ? (GRADE_STYLES[result.grade] || GRADE_STYLES['Average']) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Nav active="LinkedIn" />

      <div className={ls.page}>
        {/* ── Input form ── */}
        {!result && !loading && (
          <>
            <div className={ls.hero}>
              <h1 className={ls.title}>LinkedIn Profile Optimiser</h1>
              <p className={ls.subtitle}>
                Paste your LinkedIn profile and get AI-powered headline rewrites, an improved About section,
                skills recommendations, and quick wins — in seconds.
              </p>
            </div>

            <div className={ls.formWrap}>
              <div className={ls.tipBox}>
                {TIPS.map((t, i) => (
                  <p key={i} className={ls.tipItem}><span className={ls.tipBullet}>→</span>{t}</p>
                ))}
              </div>

              <label className={ls.label}>Target Role <span className={ls.optional}>(optional — for role-specific tips)</span></label>
              <input
                className={ls.input}
                placeholder="e.g. Product Manager, Software Engineer, Marketing Lead…"
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
              />

              <label className={ls.label} style={{ marginTop: 16 }}>
                Your LinkedIn Profile Text
                <span className={ls.charCount}>{profileText.length} chars</span>
              </label>
              <textarea
                className={ls.textarea}
                rows={14}
                placeholder="Paste your full LinkedIn profile here — headline, about, experience, skills, education…"
                value={profileText}
                onChange={e => setProfileText(e.target.value)}
              />

              {error && <p className={ls.errorMsg}>{error}</p>}

              <button
                className={ls.analyseBtn}
                disabled={profileText.trim().length < 50}
                onClick={analyse}
              >
                Optimise My Profile →
              </button>
              {profileText.trim().length < 50 && profileText.length > 0 && (
                <p className={ls.hintMsg}>Paste more of your profile for accurate results.</p>
              )}
            </div>
          </>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className={s.loadingWrap}>
            <div className={s.spinner} />
            <p className={s.loadingMsg}>Analysing your LinkedIn profile…</p>
            <p className={s.loadingTip}>Rewriting headlines, crafting your About section, and finding quick wins.</p>
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <div className={ls.results}>
            {/* Score hero */}
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

            {/* Job match score (if targeted) */}
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

            {/* Headlines */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>✏️</span> Headline Options</h3>
              <p className={ls.cardHint}>Pick one — or blend elements from multiple options.</p>
              <div className={ls.headlineList}>
                {(result.headlines || []).map((h, i) => (
                  <div
                    key={i}
                    className={`${ls.headlineOption} ${activeHeadline === i ? ls.headlineOptionOn : ''}`}
                    onClick={() => setActiveHeadline(i)}
                  >
                    <div className={ls.headlineTop}>
                      <span className={ls.headlineNum}>Option {i + 1}</span>
                      <button
                        className={ls.copyBtn}
                        onClick={e => { e.stopPropagation(); copyText(h, `h${i}`); }}
                      >
                        {copied === `h${i}` ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className={ls.headlineText}>{h}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* About section */}
            <div className={ls.card}>
              <div className={ls.cardTitleRow}>
                <h3 className={ls.cardTitle}><span>📝</span> Rewritten About Section</h3>
                <button className={ls.copyBtnLg} onClick={() => copyText(result.aboutSection, 'about')}>
                  {copied === 'about' ? '✓ Copied' : '↓ Copy'}
                </button>
              </div>
              <p className={ls.cardHint}>Replace your current About section with this. Edit to match your voice.</p>
              <div className={ls.aboutBox}>
                <p className={ls.aboutText}>{result.aboutSection}</p>
              </div>
            </div>

            {/* Skills to add */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>🛠</span> Skills to Add</h3>
              <p className={ls.cardHint}>Add these to your Skills section to improve recruiter search visibility.</p>
              <div className={ls.skillTags}>
                {(result.skillsToAdd || []).map((skill, i) => (
                  <span key={i} className={ls.skillTag}>{skill}</span>
                ))}
              </div>
            </div>

            {/* Quick wins */}
            <div className={ls.card}>
              <h3 className={ls.cardTitle}><span>⚡</span> Quick Wins</h3>
              <ul className={ls.tipList}>
                {(result.quickWins || []).map((t, i) => (
                  <li key={i} className={ls.tipListItem}><span className={ls.tipNum}>{i + 1}</span>{t}</li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div className={ls.actionRow}>
              <button className={ls.resetBtn} onClick={reset}>← Analyse Another Profile</button>
              <button className={ls.copyBtnLg} onClick={() => {
                const text = [
                  `LinkedIn Profile Score: ${result.score}/100 (${result.grade})`,
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
