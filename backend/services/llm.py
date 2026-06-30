from backend.config import GROQ_LLM_MODEL
from backend.services.groq_pool import pool


def _chat(prompt: str, max_tokens: int = 4096) -> str:
    result = pool.chat(
        model=GROQ_LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return result.choices[0].message.content.strip()


def generate_chapter(chunks: list[dict], chapter_number: int) -> str:
    summaries = [c for c in chunks if c.get("type") == "summary"]
    segments  = [c for c in chunks if c.get("type") == "segment"]

    context_block = ""
    if summaries:
        context_block = "PREVIOUS CHAPTERS CONTEXT:\n" + "\n\n".join(
            f"[Summary]: {s['text']}" for s in summaries
        ) + "\n\n"

    segments_block = "AUTHOR'S RAW NOTES FOR THIS CHAPTER (in order):\n" + "\n\n".join(
        f"[{seg.get('intent', 'informational').upper()}]: {seg['text']}" for seg in segments
    )

    # Scale output budget with content: ~1500 tokens per segment, capped at 32768
    max_tokens = min(1500 * max(len(segments), 1), 32768)

    prompt = f"""{context_block}{segments_block}

---
You are a professional book author. Using the author's raw notes above, write Chapter {chapter_number} of the book as polished, engaging prose.

Rules:
- Cover EVERY note thoroughly — do not skip or compress any part of the material.
- Each recording note should expand into at least one full paragraph of prose.
- Follow the intent labels: write [FUNNY] sections with humor, [SERIOUS] with weight, [DRAMATIC] with tension, [EMOTIONAL] with feeling, [SUSPENSEFUL] with dread, [ROMANTIC] with warmth.
- Do NOT include the intent labels in the output.
- Use the previous chapters context only to maintain continuity — do not repeat it.
- Start with "Chapter {chapter_number}" as the heading.
- Write in a literary fiction style unless the notes suggest otherwise.
- Write as many pages as needed to fully honour all the author's notes.

Chapter {chapter_number}:"""

    return _chat(prompt, max_tokens=max_tokens)


def summarize_chapter(chapter_text: str, chapter_number: int) -> str:
    prompt = f"""Summarize Chapter {chapter_number} of a book in 3-5 sentences. Capture key events, character developments, and tone. This summary will be used as context for writing the next chapter.

Chapter {chapter_number}:
{chapter_text}

Summary:"""
    return _chat(prompt, max_tokens=300)
