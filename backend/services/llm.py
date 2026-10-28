import logging
import re
import time

from groq import APIConnectionError, APITimeoutError

from backend.config import GROQ_LLM_MODEL
from backend.services.groq_pool import pool

log = logging.getLogger(__name__)

# Notes per LLM call, in characters (~1 250 tokens). Batches are packed by size,
# not count — five 10-minute recordings in one call blew past Groq's 12 000 TPM.
_NOTES_BUDGET = 5000

# Previous-chapter summaries fed into a chapter, in characters (~1 000 tokens).
# Most recent chapters win when a long book doesn't fit.
_CONTEXT_BUDGET = 4000

# Tokens to generate per batch. ~2 000 ≈ 2–3 pages of prose.
_BATCH_OUTPUT_TOKENS = 2000

# Seconds to wait between batches so successive calls don't exceed 12 000 TPM.
# At ~5 000 tokens per call that's ~2 calls/min including the call itself.
_BATCH_DELAY = 20

# Chapter text per summary call when a chapter is too long to summarise in one go.
_SUMMARY_PIECE = 12000

# Waits when every Groq key is rate-limited or the API is unreachable, so one
# busy minute doesn't throw away a chapter that's half written.
_RETRY_WAITS = (30, 60, 90, 120)


def _chat(prompt: str, max_tokens: int = 4096) -> str:
    for attempt, wait in enumerate((*_RETRY_WAITS, None)):
        try:
            result = pool.chat(
                model=GROQ_LLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=0.7,
            )
            return result.choices[0].message.content.strip()
        except (RuntimeError, APIConnectionError, APITimeoutError) as exc:
            if wait is None:
                raise
            log.warning("llm: %s — retry %d in %ds", exc, attempt + 1, wait)
            time.sleep(wait)


def _split_text(text: str, limit: int) -> list[str]:
    """Split text into pieces of at most `limit` chars, at sentence ends where possible."""
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    sentences = re.split(r"(?<=[.!?])\s+", text)
    pieces: list[str] = []
    cur = ""
    for sent in sentences:
        while len(sent) > limit:  # a run-on with no sentence breaks (common in transcripts)
            cut = sent.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if cur:
                pieces.append(cur)
                cur = ""
            pieces.append(sent[:cut].strip())
            sent = sent[cut:].strip()
        if cur and len(cur) + 1 + len(sent) > limit:
            pieces.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    if cur:
        pieces.append(cur)
    return pieces


def _batch_segments(segments: list[dict]) -> list[list[dict]]:
    """Pack segments, in order, into batches of at most _NOTES_BUDGET chars.
    A recording longer than the budget is split across consecutive batches."""
    batches: list[list[dict]] = []
    cur: list[dict] = []
    size = 0
    for seg in segments:
        for piece in _split_text(seg["text"], _NOTES_BUDGET):
            if cur and size + len(piece) > _NOTES_BUDGET:
                batches.append(cur)
                cur, size = [], 0
            cur.append({**seg, "text": piece})
            size += len(piece)
    if cur:
        batches.append(cur)
    return batches


def _context_block(summaries: list[dict]) -> str:
    """Previous-chapter summaries, newest kept first when they don't all fit."""
    kept: list[str] = []
    used = 0
    for s in reversed(summaries):
        text = s["text"].strip()
        if kept and used + len(text) > _CONTEXT_BUDGET:
            break
        kept.append(text[:_CONTEXT_BUDGET])
        used += len(text)
    if not kept:
        return ""
    kept.reverse()
    omitted = len(summaries) - len(kept)
    lead = f"[{omitted} earlier chapter(s) omitted]\n\n" if omitted else ""
    return "PREVIOUS CHAPTERS CONTEXT (oldest to most recent):\n" + lead + "\n\n".join(
        f"[Summary]: {t}" for t in kept
    ) + "\n\n"


def _seg_block(segments: list[dict]) -> str:
    return "\n\n".join(
        f"[{seg.get('intent', 'informational').upper()}]: {seg['text']}"
        for seg in segments
    )


def generate_chapter(chunks: list[dict], chapter_number: int, lead_in: str = "") -> str:
    """lead_in: existing chapter text (e.g. from an uploaded manuscript) that the
    generated prose must continue from rather than open fresh."""
    summaries = [c for c in chunks if c.get("type") == "summary"]
    segments  = [c for c in chunks if c.get("type") == "segment" and c.get("text", "").strip()]

    context_block = _context_block(summaries)
    batches = _batch_segments(segments)

    parts: list[str] = []
    prev_tail = lead_in[-600:]  # last ~600 chars of previous section for continuity

    for idx, batch in enumerate(batches):
        is_first = idx == 0 and not lead_in
        notes = _seg_block(batch)

        if is_first:
            prompt = f"""{context_block}AUTHOR'S RAW NOTES FOR THIS CHAPTER (in order):
{notes}

---
You are a professional book author writing the opening of this chapter as polished, engaging prose.

Rules:
- Cover EVERY note thoroughly — expand each into at least one full paragraph of prose.
- Follow intent labels: [FUNNY] → humour, [SERIOUS] → weight, [DRAMATIC] → tension, [EMOTIONAL] → feeling, [SUSPENSEFUL] → dread, [ROMANTIC] → warmth.
- Do NOT include the intent labels in the output.
- Do NOT add a chapter heading — start directly with prose.
- Use previous chapters context only for continuity; do not repeat it.
- Write in a literary fiction style unless the notes suggest otherwise.
- Write until you have fully covered every note above.

Begin writing:"""
        else:
            # The first pass of a manuscript chapter still needs the earlier chapters' context.
            ctx = context_block if idx == 0 else ""
            prompt = f"""{ctx}STORY SO FAR — end of previous section (continue seamlessly from here):
{prev_tail}

AUTHOR'S RAW NOTES TO CONTINUE WITH (in order):
{notes}

---
You are a professional book author continuing this chapter from exactly where the story left off.

Rules:
- Do NOT repeat, summarise, or reference what already happened — pick up mid-story.
- Cover EVERY note thoroughly — expand each into at least one full paragraph.
- Follow intent labels for tone.
- Do NOT include intent labels in output.
- Do NOT add any heading.
- Maintain the same literary fiction style and narrative voice.
- Write until you have fully covered every note above.

Continue writing:"""

        section = _chat(prompt, max_tokens=_BATCH_OUTPUT_TOKENS)
        parts.append(section)
        prev_tail = section[-600:]  # last ~150 words feeds next batch

        # Throttle between batches to stay inside Groq's TPM limit
        if idx < len(batches) - 1:
            time.sleep(_BATCH_DELAY)

    return "\n\n".join(parts)


_SUMMARY_RULES = (
    "Capture key events, character developments, and tone. Be specific about how the chapter "
    "ENDS — where the characters are, what has just happened, what is unresolved — because the "
    "next chapter is written to continue from it."
)


def summarize_chapter(chapter_text: str, chapter_number: int) -> str:
    pieces = _split_text(chapter_text, _SUMMARY_PIECE)
    if len(pieces) <= 1:
        return _chat(f"""Summarize this book chapter in 3-5 sentences. {_SUMMARY_RULES}

Chapter text:
{chapter_text}

Summary:""", max_tokens=300)

    # Long chapter: summarise each part, then merge — so the summary covers the whole
    # chapter, not just its opening pages.
    part_notes: list[str] = []
    for i, piece in enumerate(pieces):
        part_notes.append(_chat(f"""This is part {i + 1} of {len(pieces)} of a book chapter. Summarize what happens in it in 2-3 sentences.

Text:
{piece}

Summary:""", max_tokens=200))
        time.sleep(_BATCH_DELAY // 2)

    joined = "\n".join(f"Part {i + 1}: {n}" for i, n in enumerate(part_notes))
    return _chat(f"""Below are summaries of consecutive parts of one book chapter, in order.

{joined}

Combine them into one summary of the whole chapter in 4-6 sentences. {_SUMMARY_RULES}

Summary:""", max_tokens=350)


def enhance_passage(passage: str, prev_tail: str = "", genre: str = "fiction") -> str:
    """Polish one passage of an author's own manuscript without changing its content."""
    voice = (
        "This is a memoir: keep the first-person voice and every factual detail exactly as told."
        if genre == "memoir" else
        "This is fiction: keep the plot, characters, names and point of view exactly as written."
    )
    continuity = (
        f"END OF THE PREVIOUS POLISHED PASSAGE (for continuity only — do not repeat it):\n{prev_tail}\n\n"
        if prev_tail else ""
    )
    prompt = f"""{continuity}AUTHOR'S ORIGINAL PASSAGE (extracted from their PDF — line breaks may be broken):
{passage}

---
You are a professional book editor polishing this passage of the author's manuscript.

Rules:
- Improve grammar, rhythm, word choice, flow and vividness while preserving the author's voice.
- {voice}
- Do NOT add new events or remove existing ones. Keep all dialogue meaning intact.
- Fix broken line wraps, stray page numbers, running headers and hyphenation left over from the PDF.
- Separate paragraphs with a blank line.
- Do NOT add headings, notes, or commentary — return only the polished passage.

Polished passage:"""
    return _chat(prompt, max_tokens=_BATCH_OUTPUT_TOKENS + 500)
