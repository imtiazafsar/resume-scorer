export async function analyzeResume(resumeText) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Server error: ${response.status}`);
  }

  return data;
}
