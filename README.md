# Resume Scorer

An AI-powered resume scoring app built with React and the Anthropic API. Upload any resume and get an instant score, dimension breakdown, strengths, and actionable recommendations.

## Features

- Upload PDF, DOCX, DOC, or TXT resumes
- AI-powered scoring across 6 dimensions (Contact, Experience, Skills, Education, Formatting, ATS)
- Identified strengths and actionable recommendations
- Clean dark UI

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Copy the PDF worker
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.js public/
```

### 3. Add your API key
```bash
cp .env.example .env
```
Open `.env` and set your Anthropic API key (get one at https://console.anthropic.com).

### 4. Start the app (with Vercel CLI for the API route)
```bash
npm install -g vercel
vercel dev
```
Or for frontend-only testing (no API calls):
```bash
npm start
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to https://vercel.com, import your GitHub repo
3. In **Project Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
4. Deploy — your app is live and the API key stays secret on the server

## Project Structure

```
api/
  analyze.js       — Vercel serverless function (keeps API key server-side)
src/
  App.js           — Main UI and state management
  App.module.css   — Component styles
  api.js           — Calls /api/analyze
  extractText.js   — PDF / DOCX / TXT text extraction
  index.js         — React entry point
  index.css        — Global styles
public/
  index.html
  pdf.worker.min.js
```

## Security

The Anthropic API key is stored as a **server-side environment variable** and never exposed to the browser. All AI calls go through the `/api/analyze` serverless function.
