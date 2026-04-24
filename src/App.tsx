import {
  type ChangeEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isAllowedResumeFile, isPdfFile } from "./resumeFileTypes";
import {
  type SavedResume,
  readSavedResumes,
  writeSavedResumes,
} from "./savedResumesStorage";

const THEME_KEY = "resume-tailor-theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

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
  const [loadSavedResumeSelectKey, setLoadSavedResumeSelectKey] = useState(0);
  const saveResumeLabelInputRef = useRef<HTMLInputElement>(null);

  const canTailor =
    resumeText.trim().length > 0 && jobDescriptionText.trim().length > 0;

  const handleTailorClick = () => {
    console.log({ resumeText, jobDescriptionText });
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
      savedAt: new Date().toISOString(),
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

  const handleLoadSavedResumeChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const id = event.target.value;
    if (!id) return;
    const found = savedResumes.find((r) => r.id === id);
    if (found) {
      setResumeText(found.text);
      setResumeFileError(null);
    }
    setLoadSavedResumeSelectKey((k) => k + 1);
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
          </button>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-8 px-6 py-12">
        <section className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Resume</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Upload a .pdf or .docx file, or paste your resume text below. Save a
            version as a master resume to load it later when tailoring to
            different roles.
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
          {saveResumePanelOpen ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/80">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Label this saved resume
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                For example: “Software engineer — full stack” or “Acme master
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
          {savedResumes.length > 0 ? (
            <div className="mt-4">
              <label
                htmlFor="load-saved-resume"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Load a saved resume
              </label>
              <select
                key={loadSavedResumeSelectKey}
                id="load-saved-resume"
                defaultValue=""
                onChange={handleLoadSavedResumeChange}
                className="mt-1.5 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
              >
                <option value="">Choose a saved resume…</option>
                {savedResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
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
          disabled={!canTailor}
          onClick={handleTailorClick}
          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
        >
          Tailor my resume
        </button>

        <section className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Tailored Results</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            Placeholder: this is where tailored resume output and suggestions
            will be shown.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
