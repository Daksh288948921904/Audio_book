const BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("ink_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CmsUser {
  id: number;
  google_id: string;
  name: string | null;
  email: string;
  book_count: number;
  created_at: string;
}

export interface CmsBook {
  id: number;
  title: string;
  chapter_count: number;
  done_count: number;
  created_at: string;
}

export interface CmsChapter {
  id: number;
  book_id: number;
  number: number;
  title: string | null;
  status: "recording" | "generating" | "done";
  generated_text?: string;
  summary?: string;
  segment_count: number;
  created_at: string;
  finished_at: string | null;
}

export interface CmsSegment {
  id: number;
  order_index: number;
  transcript: string | null;
  intent: string | null;
  filename: string;
  has_audio: boolean;
}

export interface CompileResult {
  chapter_id: number;
  number: number;
  status: "done" | "skipped" | "error";
  generated_text?: string;
  reason?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function getAdminMe(): Promise<{ sub: string; email: string; name: string; is_admin: boolean }> {
  return (await apiFetch("/auth/me")).json();
}

// ── Admin API ──────────────────────────────────────────────────────────────────
export async function cmsListUsers(): Promise<CmsUser[]> {
  return (await apiFetch("/admin/users")).json();
}

export async function cmsListBooks(googleId: string): Promise<CmsBook[]> {
  return (await apiFetch(`/admin/users/${encodeURIComponent(googleId)}/books`)).json();
}

export async function cmsListChapters(bookId: number): Promise<CmsChapter[]> {
  return (await apiFetch(`/admin/books/${bookId}/chapters`)).json();
}

export async function cmsGetChapter(chapterId: number): Promise<CmsChapter> {
  return (await apiFetch(`/admin/chapters/${chapterId}`)).json();
}

export async function cmsFinishChapter(chapterId: number): Promise<{ status: string; generated_text: string }> {
  return (await apiFetch(`/chapters/${chapterId}/finish`, { method: "POST" })).json();
}

export async function cmsCompileBook(bookId: number): Promise<{ book_id: number; results: CompileResult[] }> {
  return (await apiFetch(`/admin/books/${bookId}/compile`, { method: "POST" })).json();
}

export async function cmsGetSegments(chapterId: number): Promise<CmsSegment[]> {
  return (await apiFetch(`/admin/audio/segments/${chapterId}`)).json();
}

export async function cmsFetchAudioBlob(segmentId: number): Promise<string | null> {
  try {
    const res = await apiFetch(`/admin/audio/file/${segmentId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function cmsUpdateChapterText(chapterId: number, text: string): Promise<void> {
  await apiFetch(`/admin/chapters/${chapterId}/text`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function cmsGenerateTts(chapterId: number, model: string, voice: string): Promise<string> {
  const res = await apiFetch(`/admin/chapters/${chapterId}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice }),
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function cmsDownloadPdf(chapterId: number, chapterNumber: number): Promise<void> {
  const res = await apiFetch(`/admin/chapters/${chapterId}/pdf`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chapter_${chapterNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
