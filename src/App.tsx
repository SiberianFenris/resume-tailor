import { useEffect, useState } from "react";

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

  const canTailor =
    resumeText.trim().length > 0 && jobDescriptionText.trim().length > 0;

  const handleTailorClick = () => {
    console.log({ resumeText, jobDescriptionText });
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
            Paste your resume text below.
          </p>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
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
