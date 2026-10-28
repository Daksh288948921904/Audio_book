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
        max_tokens=5,
        temperature=0,
    )
    label = result.choices[0].message.content.strip().lower()
    return label if label in CANDIDATE_LABELS else "informational"
