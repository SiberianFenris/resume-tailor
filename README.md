# Resume Tailor

Paste or upload your resume and a job description, bring your own API key, and get AI-powered rewrite suggestions and keyword gap analysis in seconds.

## Live demo

[Live demo](https://your-vercel-url-here)

## Features

- Resume paste or file upload (PDF and DOCX)
- Job description input
- AI-powered per-bullet rewrite suggestions
- Keyword gap analysis
- Saved resumes via localStorage
- Bring-your-own-key design for privacy
- Browser-based localStorage for saved resumes (data persists unless site data is cleared)
- Dark mode default with toggle

## Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Google Gemini API (or AI provider of your choice)
- mammoth.js
- pdf.js

## Getting started

1. Get an API key from your preferred AI provider.
2. Open the app and paste your key into the API key field.
3. Your key is saved locally in your browser and never leaves your device.

## Privacy

- Your API key is stored in your browser's localStorage and is never transmitted to any server other than the AI provider API directly.
- Your resume text and saved resumes are stored locally in your browser and never leave your device.
