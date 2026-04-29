import {
  type ChangeEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isAllowedResumeFile, isPdfFile } from "./resumeFileTypes";
import {
  type SavedResume,
  readSavedResumes,
  writeSavedResumes,
} from "./savedResumesStorage";

const THEME_KEY = "resume-tailor-theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";
const REQUEST_COOLDOWN_MS = 15_000;
const DAILY_REQUEST_LIMIT = 10;
const RATE_LIMIT_STORAGE_KEY = "resume-tailor-ai-rate-limit";
const AI_API_KEY_STORAGE_KEY = "aiApiKey";

type TailorSuggestion = {
  original: string;
  suggested: string;
  reason: string;
};

type TailorResponse = {
  suggestions: TailorSuggestion[];
  keywords: string[];
};

type RateLimitState = {
  lastRequestAt: number;
  dayStamp: string;
  requestsToday: number;
};

const buildDayStamp = () => new Date().toISOString().slice(0, 10);

const readRateLimitState = (): RateLimitState => {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) {
      return { lastRequestAt: 0, dayStamp: buildDayStamp(), requestsToday: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<RateLimitState>;
    return {
      lastRequestAt:
        typeof parsed.lastRequestAt === "number" ? parsed.lastRequestAt : 0,
      dayStamp: typeof parsed.dayStamp === "string" ? parsed.dayStamp : "",
      requestsToday:
        typeof parsed.requestsToday === "number" ? parsed.requestsToday : 0,
    };
  } catch {
    return { lastRequestAt: 0, dayStamp: buildDayStamp(), requestsToday: 0 };
  }
};

const normalizeRateLimitState = (state: RateLimitState): RateLimitState => {
  const today = buildDayStamp();
  if (state.dayStamp === today) return state;
  return {
    lastRequestAt: state.lastRequestAt,
    dayStamp: today,
    requestsToday: 0,
  };
};

const writeRateLimitState = (state: RateLimitState) => {
  localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(state));
};

const isTailorSuggestion = (value: unknown): value is TailorSuggestion => {
  if (!value || typeof value !== "object") return false;
  const suggestion = value as Record<string, unknown>;
  return (
    typeof suggestion.original === "string" &&
    typeof suggestion.suggested === "string" &&
    typeof suggestion.reason === "string"
  );
};

const isTailorResponse = (value: unknown): value is TailorResponse => {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (
    !Array.isArray(response.suggestions) ||
    !Array.isArray(response.keywords)
  ) {
    return false;
  }
  return (
    response.suggestions.every(isTailorSuggestion) &&
    response.keywords.every((keyword) => typeof keyword === "string")
  );
};

const getInitialDarkMode = () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  return savedTheme ? savedTheme === DARK_THEME : true;
};

function App() {
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);
  const [resumeText, setResumeText] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [resumeFileError, setResumeFileError] = useState<string | null>(null);
  const [isResumeExtracting, setIsResumeExtracting] = useState(false);
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const [savedResumes, setSavedResumes] = useState<SavedResume[]>(() =>
    readSavedResumes(),
  );
  const [saveResumePanelOpen, setSaveResumePanelOpen] = useState(false);
  const [saveResumeLabelInput, setSaveResumeLabelInput] = useState("");
  const [saveResumeFormError, setSaveResumeFormError] = useState<string | null>(
    null,
  );
  const saveResumeLabelInputRef = useRef<HTMLInputElement>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorResponse, setTailorResponse] = useState<TailorResponse | null>(
    null,
  );
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [copiedSuggestionIndex, setCopiedSuggestionIndex] = useState<
    number | null
  >(null);
  const [aiApiKeyInput, setAiApiKeyInput] = useState(() =>
    localStorage.getItem(AI_API_KEY_STORAGE_KEY) ?? "",
  );
  const [savedAiApiKey, setSavedAiApiKey] = useState(() =>
    localStorage.getItem(AI_API_KEY_STORAGE_KEY) ?? "",
  );
  const [isAiApiKeyJustSaved, setIsAiApiKeyJustSaved] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(() =>
    !(localStorage.getItem(AI_API_KEY_STORAGE_KEY) ?? "").trim(),
  );
  const [areSavedResumesExpanded, setAreSavedResumesExpanded] = useState(() => {
    const existing = readSavedResumes();
    return existing.length === 0;
  });
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>(() =>
    normalizeRateLimitState(readRateLimitState()),
  );

  const canTailor =
    resumeText.trim().length > 0 && jobDescriptionText.trim().length > 0;

  const cooldownActive =
    Date.now() - rateLimitState.lastRequestAt < REQUEST_COOLDOWN_MS;
  const hasDailyRequestsLeft =
    rateLimitState.requestsToday < DAILY_REQUEST_LIMIT;
  const canSubmitTailorRequest =
    canTailor && !isTailoring && !cooldownActive && hasDailyRequestsLeft;

  const sanitizeModelResponse = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("```")) {
      return trimmed.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    }
    return trimmed;
  };

  const handleSaveAiApiKey = () => {
    const trimmed = aiApiKeyInput.trim();
    if (trimmed) {
      localStorage.setItem(AI_API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
    }
    setSavedAiApiKey(trimmed);
    setIsAiApiKeyJustSaved(true);
    if (trimmed) setIsEditingApiKey(false);
    window.setTimeout(() => setIsAiApiKeyJustSaved(false), 1500);
  };

  const handleDeleteAiApiKey = () => {
    localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
    setSavedAiApiKey("");
    setAiApiKeyInput("");
    setIsEditingApiKey(true);
    setIsAiApiKeyJustSaved(false);
  };

  const handleTailorClick = async () => {
    const apiKey = savedAiApiKey.trim();
    if (!canSubmitTailorRequest) return;
    if (!apiKey) {
      setTailorError(
        "No API key is saved. Add it in the API key field above, then click Save.",
      );
      return;
    }

    setIsTailoring(true);
    setTailorResponse(null);
    setTailorError(null);
    setCopiedSuggestionIndex(null);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const resumeSnippet = resumeText.trim().slice(0, 12_000);
      const jobDescriptionSnippet = jobDescriptionText.trim().slice(0, 12_000);
      const prompt = `You are helping tailor resume bullets for a job application.
Only provide resume improvement content that is directly grounded in the provided resume and job description.
Do not include unrelated advice, personal opinions, or content outside resume tailoring.
Return JSON only with this exact shape:
{
  "suggestions": [
    { "original": string, "suggested": string, "reason": string }
  ],
  "keywords": string[]
}

Rules:
- suggestions must be per-bullet rewrite suggestions from the resume.
- original must be a bullet from the resume text.
- suggested must be a rewritten version of that bullet aligned to the job description.
- reason must explain why the rewrite is stronger for this role.
- keywords must include important terms from the job description that are currently missing from the resume.
- return only valid JSON and no markdown.

Resume:
${resumeSnippet}

Job Description:
${jobDescriptionSnippet}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const parsed = JSON.parse(sanitizeModelResponse(responseText)) as unknown;
      if (!isTailorResponse(parsed)) {
        setTailorError(
          "We received an unexpected response format from the AI service. Please try again.",
        );
        return;
      }
      setTailorResponse(parsed);

      const nextRateLimitState = normalizeRateLimitState({
        ...rateLimitState,
        lastRequestAt: Date.now(),
        requestsToday: rateLimitState.requestsToday + 1,
      });
      writeRateLimitState(nextRateLimitState);
      setRateLimitState(nextRateLimitState);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setTailorError(
          "The AI service returned malformed JSON. Please try again.",
        );
        return;
      }
      setTailorError(
        "Could not tailor your resume right now. Please try again.",
      );
    } finally {
      setIsTailoring(false);
    }
  };

  const handleCopySuggestion = async (suggestedText: string, index: number) => {
    await navigator.clipboard.writeText(suggestedText);
    setCopiedSuggestionIndex(index);
    window.setTimeout(() => {
      setCopiedSuggestionIndex((current) =>
        current === index ? null : current,
      );
    }, 1400);
  };

  const handleResumeTextChange = (value: string) => {
    setResumeText(value);
    if (resumeFileError) setResumeFileError(null);
  };

  const openSaveResumePanel = () => {
    if (!resumeText.trim()) return;
    setSaveResumeFormError(null);
    setSaveResumeLabelInput("");
    setSaveResumePanelOpen(true);
  };

  const cancelSaveResumePanel = () => {
    setSaveResumePanelOpen(false);
    setSaveResumeLabelInput("");
    setSaveResumeFormError(null);
  };

  const commitSaveResume = () => {
    const label = saveResumeLabelInput.trim();
    if (!label) {
      setSaveResumeFormError("Please enter a label.");
      return;
    }
    const entry: SavedResume = {
      id: crypto.randomUUID(),
      label,
      text: resumeText,
    };
    try {
      const next = [entry, ...savedResumes];
      writeSavedResumes(next);
      setSavedResumes(next);
      cancelSaveResumePanel();
    } catch {
      setSaveResumeFormError(
        "Could not save to this browser. Storage may be full or unavailable.",
      );
    }
  };

  const loadSavedResume = (id: string) => {
    const found = savedResumes.find((r) => r.id === id);
    if (found) {
      setResumeText(found.text);
      setResumeFileError(null);
    }
  };

  const deleteSavedResume = (id: string) => {
    try {
      const next = savedResumes.filter((r) => r.id !== id);
      writeSavedResumes(next);
      setSavedResumes(next);
    } catch {
      /* ignore storage errors for delete */
    }
  };

  useLayoutEffect(() => {
    if (saveResumePanelOpen) {
      saveResumeLabelInputRef.current?.focus();
    }
  }, [saveResumePanelOpen]);

  const handleResumeFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setResumeFileError(null);

    if (!isAllowedResumeFile(file)) {
      setResumeText("");
      setResumeFileError(
        "That file type is not supported. Please use a .pdf or .docx file, or paste your resume text manually instead.",
      );
      return;
    }

    setIsResumeExtracting(true);
    try {
      const { extractTextFromDocx, extractTextFromPdf } =
        await import("./extractResumeText");
      const buffer = await file.arrayBuffer();
      const raw = isPdfFile(file)
        ? await extractTextFromPdf(buffer)
        : await extractTextFromDocx(buffer);
      const trimmed = raw.trim();
      if (!trimmed) {
        setResumeText("");
        setResumeFileError(
          "We could not read any text from that file. Please paste your resume text manually instead.",
        );
        return;
      }
      setResumeText(raw);
    } catch {
      setResumeText("");
      setResumeFileError(
        "We could not read that file. Please paste your resume text manually instead.",
      );
    } finally {
      setIsResumeExtracting(false);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle(DARK_THEME, isDarkMode);
    localStorage.setItem(THEME_KEY, isDarkMode ? DARK_THEME : LIGHT_THEME);
  }, [isDarkMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRateLimitState((previous) => normalizeRateLimitState(previous));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingCooldownMs = Math.max(
    0,
    REQUEST_COOLDOWN_MS - (Date.now() - rateLimitState.lastRequestAt),
  );
  const cooldownSeconds = Math.ceil(remainingCooldownMs / 1000);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <nav className="border-b border-slate-300 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Resume Tailor
          </h1>
          <button
            type="button"
            onClick={() => setIsDarkMode((previous) => !previous)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isDarkMode ? "Switch to Light" : "Switch to Dark"}
            {/*TODO: Make this button look nicer, maybe icons instead of text.*/}
          </button>
        </div>
      </nav>
      {/*TODO: Look at reworking the layout of this area. Maybe change resume list dropdown or have it show selected resume name. Add in resume overwriting.*/}
      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Settings
          </h2>
          {savedAiApiKey && !isEditingApiKey ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                <span className="mr-2 text-emerald-600 dark:text-emerald-400">
                  ✓
                </span>
                API key saved
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAiApiKeyInput(savedAiApiKey);
                    setIsEditingApiKey(true);
                    setIsAiApiKeyJustSaved(false);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAiApiKey}
                  className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <label
                htmlFor="ai-api-key"
                className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                AI API key
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id="ai-api-key"
                  type="password"
                  value={aiApiKeyInput}
                  onChange={(event) => setAiApiKeyInput(event.target.value)}
                  className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
                />
                <button
                  type="button"
                  onClick={handleSaveAiApiKey}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Save
                </button>
              </div>
              {isAiApiKeyJustSaved ? (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                  API key saved.
                </p>
              ) : null}
            </>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Your API key is stored locally in your browser and never sent to our
            servers.
          </p>
        </section>

        <section className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Resume</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Upload a .pdf or .docx file, or paste your resume text below. Save a
            version as a master resume to load it later when tailoring to
            different roles.
            {/* TODO: Look at the wording of this paragraph. */}
          </p>
          <input
            ref={resumeFileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={handleResumeFileChange}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isResumeExtracting}
              onClick={() => resumeFileInputRef.current?.click()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {isResumeExtracting ? "Reading file…" : "Upload resume"}
            </button>
            <button
              type="button"
              disabled={!resumeText.trim() || isResumeExtracting}
              onClick={openSaveResumePanel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Save resume
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              .pdf and .docx only
            </span>
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setAreSavedResumesExpanded((previous) => !previous)}
              className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span>Saved resumes ({savedResumes.length})</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {areSavedResumesExpanded ? "Hide" : "Show"}
              </span>
            </button>
            {areSavedResumesExpanded ? (
              savedResumes.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  No saved resumes yet
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {savedResumes.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2.5 first:rounded-t-lg last:rounded-b-lg dark:bg-slate-900/40"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                        {r.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => loadSavedResume(r.id)}
                        className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedResume(r.id)}
                        className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Saved resumes are stored locally in your browser and will persist
              unless you clear your browser&apos;s site data.
            </p>
          </div>
          {saveResumePanelOpen ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/80">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Label this saved resume
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                For example: “Software Engineer — Full Stack” or “ACME master
                resume”.
              </p>
              <input
                ref={saveResumeLabelInputRef}
                type="text"
                value={saveResumeLabelInput}
                onChange={(event) => {
                  setSaveResumeLabelInput(event.target.value);
                  if (saveResumeFormError) setSaveResumeFormError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitSaveResume();
                  }
                  if (event.key === "Escape") cancelSaveResumePanel();
                }}
                placeholder="e.g. Master resume — product manager"
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
              />
              {saveResumeFormError ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {saveResumeFormError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={commitSaveResume}
                  className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelSaveResumePanel}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {resumeFileError ? (
            <p
              className="mt-3 text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {resumeFileError}
            </p>
          ) : null}
          <textarea
            value={resumeText}
            onChange={(event) => handleResumeTextChange(event.target.value)}
            rows={12}
            placeholder="Paste your resume here…"
            className="mt-4 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
          />
        </section>

        <section className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Job description</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Paste the full job posting or description.
          </p>
          <textarea
            value={jobDescriptionText}
            onChange={(event) => setJobDescriptionText(event.target.value)}
            rows={12}
            placeholder="Paste the job description here…"
            className="mt-4 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
          />
        </section>

        <button
          type="button"
          disabled={!canSubmitTailorRequest}
          onClick={handleTailorClick}
          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
        >
          {isTailoring ? "Tailoring..." : "Tailor my resume"}
        </button>
        {!hasDailyRequestsLeft ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Daily request limit reached. Try again tomorrow.
          </p>
        ) : null}
        {cooldownActive ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Please wait {cooldownSeconds}s before sending another request.
          </p>
        ) : null}
        {tailorError ? (
          <p
            className="mt-1 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {tailorError}
          </p>
        ) : null}

        <section className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Tailored Results</h2>
          <div className="mt-4 space-y-6">
            {isTailoring ? (
              <div className="space-y-4">
                <div className="animate-pulse space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="animate-pulse space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            ) : null}
            <div>
              <h3 className="text-base font-semibold">Suggestions</h3>
              {!isTailoring &&
              (!tailorResponse || tailorResponse.suggestions.length === 0) ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No suggestions yet.
                </p>
              ) : !isTailoring ? (
                <div className="mt-3 space-y-3">
                  {(tailorResponse?.suggestions ?? []).map((suggestion, index) => (
                    <article
                      key={`${suggestion.original}-${index}`}
                      className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-700 dark:bg-slate-800/30"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Original
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                        {suggestion.original}
                      </p>

                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Suggested
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                        {suggestion.suggested}
                      </p>

                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Reason
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                        {suggestion.reason}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopySuggestion(suggestion.suggested, index)
                        }
                        className="mt-3 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        {copiedSuggestionIndex === index
                          ? "Copied!"
                          : "Copy suggestion"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="text-base font-semibold">Missing keywords</h3>
              {!isTailoring &&
              (!tailorResponse || tailorResponse.keywords.length === 0) ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No missing keywords yet.
                </p>
              ) : !isTailoring ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(tailorResponse?.keywords ?? []).map((keyword, index) => (
                    <span
                      key={`${keyword}-${index}`}
                      className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
