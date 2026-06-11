export async function analyzeResume(resumeText, jobDescription = '', filename = '') {
  const proToken = localStorage.getItem('resume_pro_token') || undefined;
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDescription, proToken, filename }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || `Server error: ${response.status}`);
    err.rateLimited = data.rateLimited || false;
    throw err;
  }
  return data;
}
