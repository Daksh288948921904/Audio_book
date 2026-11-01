from backend.config import GROQ_INTENT_MODEL
from backend.services.groq_pool import pool

CANDIDATE_LABELS = [
    # Humor & lightness
    "funny", "humorous", "sarcastic", "witty", "playful", "absurd",
    # Gravity & weight
    "serious", "solemn", "melancholic", "tragic", "dark", "grim",
    # Intensity & conflict
    "dramatic", "tense", "suspenseful", "thrilling", "confrontational", "urgent",
    # Action & energy
    "action", "adventurous", "heroic", "triumphant",
    # Heart & connection
    "emotional", "romantic", "nostalgic", "hopeful", "heartwarming", "vulnerable",
    # Mind & exposition
    "informational", "reflective", "philosophical", "mysterious", "ominous",
]
_LABELS_STR = ", ".join(CANDIDATE_LABELS)
# The tone of the opening is enough, and a long recording's full transcript
# would exceed the small model's per-request token limit.
_MAX_CHARS = 4000


def classify_intent(text: str) -> str:
    if not text.strip():
        return "informational"

    result = pool.chat(
        model=GROQ_INTENT_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a tone classifier. Given a piece of text, reply with exactly one word "
                    f"that best describes its tone. Choose only from: {_LABELS_STR}. "
                    "Reply with the single word only, no punctuation."
                ),
            },
            {"role": "user", "content": text[:_MAX_CHARS]},
        ],
        max_tokens=300,  # room for the model's (short) reasoning before the one-word answer
        temperature=0,
    )
    words = (result.choices[0].message.content or "").strip().lower().split()
    label = words[0].strip(".,!\"'") if words else ""
    return label if label in CANDIDATE_LABELS else "informational"
