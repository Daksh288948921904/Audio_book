import unicodedata
from fpdf import FPDF


def _sanitize(text: str) -> str:
    """Replace Unicode typographic characters with latin-1 equivalents so fpdf core fonts don't crash."""
    text = (
        text
        .replace("–", "-")      # en dash
        .replace("—", "--")     # em dash
        .replace("‘", "'")      # left single quote
        .replace("’", "'")      # right single quote
        .replace("“", '"')      # left double quote
        .replace("”", '"')      # right double quote
        .replace("…", "...")    # ellipsis
        .replace(" ", " ")     # non-breaking space
        .replace("•", "-")     # bullet
    )
    # Decompose remaining accented chars to base + combining, then drop combining
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("latin-1", errors="ignore").decode("latin-1")


def generate_pdf(chapter_number: int, title: str | None, text: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    heading = _sanitize(title if title else f"Chapter {chapter_number}")
    heading_full = f"Chapter {chapter_number}: {heading}" if title else f"Chapter {chapter_number}"

    # Heading
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 14, heading_full, ln=True, align="C")
    pdf.ln(10)

    # Divider
    pdf.set_draw_color(180, 180, 180)
    pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + pdf.epw, pdf.get_y())
    pdf.ln(10)

    # Body
    pdf.set_font("Helvetica", size=12)
    for paragraph in text.split("\n\n"):
        paragraph = _sanitize(paragraph.strip())
        if not paragraph:
            continue
        pdf.multi_cell(0, 7, paragraph)
        pdf.ln(5)

    return bytes(pdf.output())
