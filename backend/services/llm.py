import time

from backend.config import GROQ_LLM_MODEL
from backend.services.groq_pool import pool

# Segments per LLM call. Each batch uses ~3 000–5 000 tokens (input + output),
# well inside Groq's 12 000 TPM free-tier limit.
_BATCH_SIZE = 5

# Tokens to generate per batch. ~1 500 ≈ 1–2 pages of prose.
_BATCH_OUTPUT_TOKENS = 1500

# Seconds to wait between batches so successive calls don't exceed 12 000 TPM.
# At ~4 000 tokens per call: 12 000 / 4 000 = 3 calls/min → 1 call every 20 s.
_BATCH_DELAY = 20


def _chat(prompt: str, max_tokens: int = 4096) -> str:
    result = pool.chat(
        model=GROQ_LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return result.choices[0].message.content.strip()


def _seg_block(segments: list[dict]) -> str:
    return "\n\n".join(
        f"[{seg.get('intent', 'informational').upper()}]: {seg['text']}"
        for seg in segments
    )


def generate_chapter(chunks: list[dict], chapter_number: int, lead_in: str = "") -> str:
    """lead_in: existing chapter text (e.g. from an uploaded manuscript) that the
    generated prose must continue from rather than open fresh."""
    summaries = [c for c in chunks if c.get("type") == "summary"]
    segments  = [c for c in chunks if c.get("type") == "segment"]

    # Previous-chapter context (kept short — summaries are already concise)
    context_block = ""
    if summaries:
        context_block = "PREVIOUS CHAPTERS CONTEXT:\n" + "\n\n".join(
            f"[Summary]: {s['text']}" for s in summaries
        ) + "\n\n"

    # Split segments into batches
    batches = [segments[i:i + _BATCH_SIZE] for i in range(0, len(segments), _BATCH_SIZE)]

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
            prompt = f"""STORY SO FAR — end of previous section (continue seamlessly from here):
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


def summarize_chapter(chapter_text: str, chapter_number: int) -> str:
    prompt = f"""Summarize this book chapter in 3-5 sentences. Capture key events, character developments, and tone. This summary will be used as context for writing the next chapter.

Chapter text:
{chapter_text[:3000]}

Summary:"""
    return _chat(prompt, max_tokens=300)


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
