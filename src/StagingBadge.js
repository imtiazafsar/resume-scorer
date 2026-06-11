import React, { useEffect } from 'react';

const IS_STAGING = process.env.REACT_APP_ENV === 'staging';

export default function StagingBadge() {
  // Change browser tab title
  useEffect(() => {
    if (IS_STAGING) {
      document.title = '[STAGING] ' + document.title.replace('[STAGING] ', '');
    }
  }, []);

  if (!IS_STAGING) return null;

  return (
    <>
      {/* Dashed orange outline around the whole viewport */}
      <div style={{
        position: 'fixed',
        inset: 0,
        border: '3px dashed #ff8c00',
        pointerEvents: 'none',
        zIndex: 9999,
      }} />

      {/* Fixed floating badge — bottom-right, always visible */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        background: '#7c3a00',
        color: '#ffcc80',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        padding: '6px 14px',
        borderRadius: 6,
        border: '1.5px solid #ff8c00',
        boxShadow: '0 0 0 3px rgba(255,140,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        userSelect: 'none',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#ff8c00',
          boxShadow: '0 0 6px #ff8c00',
          animation: 'stagingPulse 1.5s ease infinite',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        STAGING
      </div>

      {/* Pulse keyframe injected once */}
      <style>{`
        @keyframes stagingPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #ff8c00; }
          50%       { opacity: 0.4; box-shadow: none; }
        }
      `}</style>
    </>
  );
}
