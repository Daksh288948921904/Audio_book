const BASE = "";

// ── Auth token (stored in localStorage for 30-day persistence) ──────────────
let _token: string | null = localStorage.getItem("ink_token");

export function setAuthToken(t: string) {
  _token = t;
  localStorage.setItem("ink_token", t);
}

export function clearAuthToken() {
  _token = null;
  localStorage.removeItem("ink_token");
}

function authHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Book {
  id: number;
  title: string;
  genre: "fiction" | "memoir";
  created_at: string;
  chapter_count: number;
  done_count: number;
}

export interface Chapter {
  id: number;
  book_id: number | null;
  number: number;
  title: string | null;
  section_type: "front_matter" | "chapter" | "back_matter";
  status: "recording" | "generating" | "done";
  created_at: string;
  finished_at: string | null;
  generated_text?: string;
  summary?: string;
}

export interface Segment {
  id: number;
  order_index: number;
  transcript: string;
  intent: string;
  filename: string;
  has_audio: boolean;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function loginWithGoogle(
  credential: string
): Promise<{ token: string; email: string; name: string; is_admin: boolean }> {
  const res = await fetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMe(): Promise<{ sub: string; email: string; name: string; is_admin: boolean }> {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Books ─────────────────────────────────────────────────────────────────────
export async function listBooks(): Promise<Book[]> {
  const res = await fetch(`${BASE}/books/`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBook(title: string, genre: "fiction" | "memoir" = "fiction"): Promise<Book> {
  const res = await fetch(`${BASE}/books/?title=${encodeURIComponent(title)}&genre=${genre}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBook(id: number): Promise<void> {
  const res = await fetch(`${BASE}/books/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function clearAll(): Promise<void> {
  const res = await fetch(`${BASE}/books/all`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listBookChapters(bookId: number): Promise<Chapter[]> {
  const res = await fetch(`${BASE}/books/${bookId}/chapters`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBookChapters(
  bookId: number,
  count: number,
  includePrologue = false,
  includeEpilogue = false,
): Promise<Chapter[]> {
  const params = new URLSearchParams({ count: String(count) });
  if (includePrologue) params.set("include_prologue", "true");
  if (includeEpilogue) params.set("include_epilogue", "true");
  const res = await fetch(`${BASE}/books/${bookId}/chapters?${params}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Chapters ──────────────────────────────────────────────────────────────────
export async function getChapter(id: number): Promise<Chapter> {
  const res = await fetch(`${BASE}/chapters/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function finishChapter(id: number): Promise<{ status: string; generated_text: string }> {
  const res = await fetch(`${BASE}/chapters/${id}/finish`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateChapterTitle(id: number, title: string): Promise<void> {
  const res = await fetch(
    `${BASE}/chapters/${id}/title?title=${encodeURIComponent(title)}`,
    { method: "PATCH", headers: authHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function updateChapterText(id: number, text: string): Promise<void> {
  const res = await fetch(`${BASE}/chapters/${id}/text`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteChapter(id: number): Promise<void> {
  const res = await fetch(`${BASE}/chapters/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function reopenChapter(id: number): Promise<void> {
  const res = await fetch(`${BASE}/chapters/${id}/reopen`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Audio / Segments ──────────────────────────────────────────────────────────
export async function uploadAudio(chapterId: number, file: File): Promise<Segment> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/audio/upload/${chapterId}`, {
    method: "POST",
    headers: authHeaders(), // auth only — browser sets Content-Type for FormData
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSegments(chapterId: number): Promise<Segment[]> {
  const res = await fetch(`${BASE}/audio/segments/${chapterId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function reorderSegments(chapterId: number, segmentIds: number[]): Promise<void> {
  const res = await fetch(`${BASE}/audio/segments/reorder`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_id: chapterId, segment_ids: segmentIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function moveSegment(segmentId: number, targetChapterId: number): Promise<Segment> {
  const res = await fetch(`${BASE}/audio/segments/${segmentId}/move`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ target_chapter_id: targetChapterId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSegment(segmentId: number): Promise<void> {
  const res = await fetch(`${BASE}/audio/segments/${segmentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchAudioBlob(segmentId: number): Promise<string | null> {
  const res = await fetch(`${BASE}/audio/file/${segmentId}`, { headers: authHeaders() });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function pdfUrl(chapterId: number): string {
  return `${BASE}/chapters/${chapterId}/pdf`;
}

export async function fetchChapterSpeech(chapterId: number): Promise<string | null> {
  const res = await fetch(`${BASE}/chapters/${chapterId}/speech`, { headers: authHeaders() });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
