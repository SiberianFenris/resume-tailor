export const SAVED_RESUMES_KEY = "savedResumes";

export type SavedResume = {
  id: string;
  label: string;
  text: string;
};

function parseStoredList(raw: string | null): SavedResume[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SavedResume[] = [];
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as SavedResume).id === "string" &&
      typeof (item as SavedResume).label === "string" &&
      typeof (item as SavedResume).text === "string"
    ) {
      const r = item as SavedResume;
      out.push({ id: r.id, label: r.label, text: r.text });
    }
  }
  return out;
}

export function readSavedResumes(): SavedResume[] {
  try {
    return parseStoredList(localStorage.getItem(SAVED_RESUMES_KEY));
  } catch {
    return [];
  }
}

export function writeSavedResumes(list: SavedResume[]): void {
  const normalized = list.map(({ id, label, text }) => ({ id, label, text }));
  localStorage.setItem(SAVED_RESUMES_KEY, JSON.stringify(normalized));
}
