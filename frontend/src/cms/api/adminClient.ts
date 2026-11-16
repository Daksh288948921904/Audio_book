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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try { const d = JSON.parse(body).detail; if (typeof d === "string") msg = d; } catch { /* not JSON */ }
    if (!msg || msg.trimStart().startsWith("<")) msg = `Something went wrong (error ${res.status}).`;
    throw new Error(msg);
  }
  return res;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CmsUser {
  id: number;
  google_id: string;
  name: string | null;
  email: string;
  book_count: number;
  book_titles: string[];
  ai_access?: boolean;  // Write with AI + Review with Rig Editor turned on for this author
  created_at: string;
}

export interface SearchResult {
  users: { google_id: string; name: string | null; email: string }[];
  books: { id: number; title: string; genre: string; owner_name: string | null; owner_email: string; owner_google_id: string }[];
}

export interface CmsBook {
  id: number;
  title: string;
  genre: "fiction" | "memoir";
  chapter_count: number;
  done_count: number;
  created_at: string;
  manuscript_filename: string | null;
  manuscript_status: "uploaded" | "processing" | "done" | "error" | null;
  manuscript_progress: string | null;
}

export interface CmsManuscript {
  manuscript_filename: string | null;
  manuscript_status: CmsBook["manuscript_status"];
  manuscript_progress: string | null;
  manuscript_pages: number | null;
  manuscript_uploaded_at: string | null;
  word_count: number;
  running: boolean;
  preview: string;
  detected_chapters: { title: string | null; word_count: number }[];
}

export interface CmsChapter {
  id: number;
  book_id: number;
  number: number;
  title: string | null;
  section_type: "front_matter" | "chapter" | "back_matter";
  status: "recording" | "generating" | "done";
  generated_text?: string;
  summary?: string;
  from_manuscript?: boolean;
  generation_error?: string | null;  // last background write failure, while back in "recording"
  pdf_filename?: string | null;      // chapter PDF attached by the author, written in on the next Write
  has_written?: boolean;             // text the author typed in the app, written in after the PDF
  has_text?: boolean;
  published_at?: string | null;      // sent to the author (📧 Send); shows in their Published section
  review_requested_at?: string | null;  // author clicked "Review with Rig Editor"
  author_written?: boolean;          // text came from the author's own "Write with AI"
  parts?: { id: number; position: number; pdf_filename: string | null; has_written: boolean }[];
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
  status: "queued" | "done" | "skipped" | "error";
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

export async function cmsSetUserAccess(googleId: string, aiAccess: boolean): Promise<{ ai_access: boolean }> {
  return (await apiFetch(`/admin/users/${encodeURIComponent(googleId)}/access`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ai_access: aiAccess }),
  })).json();
}

export async function cmsSearch(q: string): Promise<SearchResult> {
  return (await apiFetch(`/admin/search?q=${encodeURIComponent(q)}`)).json();
}

export async function cmsListBooks(googleId: string): Promise<CmsBook[]> {
  return (await apiFetch(`/admin/users/${encodeURIComponent(googleId)}/books`)).json();
}

export async function cmsListChapters(bookId: number): Promise<CmsChapter[]> {
  return (await apiFetch(`/admin/books/${bookId}/chapters`)).json();
}

export async function cmsGetManuscript(bookId: number): Promise<CmsManuscript> {
  return (await apiFetch(`/admin/books/${bookId}/manuscript`)).json();
}

export async function cmsCreateChaptersFromManuscript(bookId: number): Promise<CmsManuscript> {
  return (await apiFetch(`/admin/books/${bookId}/manuscript/create-chapters`, { method: "POST" })).json();
}

export async function cmsGetChapter(chapterId: number): Promise<CmsChapter> {
  return (await apiFetch(`/admin/chapters/${chapterId}`)).json();
}

// Queues the chapter; it's written in the background — poll until status leaves "generating".
export async function cmsRewriteChapter(chapterId: number): Promise<{ status: string }> {
  return (await apiFetch(`/admin/chapters/${chapterId}/rewrite`, { method: "POST" })).json();
}

export async function cmsFinishChapter(chapterId: number): Promise<{ status: string }> {
  return (await apiFetch(`/chapters/${chapterId}/finish`, { method: "POST" })).json();
}

export async function cmsCompileBook(bookId: number): Promise<{ book_id: number; results: CompileResult[] }> {
  return (await apiFetch(`/admin/books/${bookId}/compile`, { method: "POST" })).json();
}

export async function cmsGetSegments(chapterId: number): Promise<CmsSegment[]> {
  return (await apiFetch(`/admin/audio/segments/${chapterId}`)).json();
}

export async function cmsReorderSegments(chapterId: number, segmentIds: number[]): Promise<void> {
  await apiFetch(`/audio/segments/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_id: chapterId, segment_ids: segmentIds }),
  });
}

export async function cmsMoveSegment(segmentId: number, targetChapterId: number): Promise<void> {
  await apiFetch(`/audio/segments/${segmentId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_chapter_id: targetChapterId }),
  });
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

export async function cmsSendChapterEmail(chapterId: number): Promise<{ status: string; to: string; published_at: string }> {
  return (await apiFetch(`/admin/chapters/${chapterId}/send-email`, { method: "POST" })).json();
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
