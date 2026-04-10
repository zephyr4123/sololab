"""Citation formatter — multiple academic citation styles.

Supports: Nature (numeric superscript), IEEE (numeric bracket),
APA (author-year), GB/T 7714 (Chinese standard).
"""
from __future__ import annotations


def format_reference(ref: dict, style: str = "nature-numeric") -> str:
    """Format a single reference in the given citation style.

    Args:
        ref: Reference dict with keys: title, authors, year, venue, volume, pages, doi, url.
        style: Citation style identifier.

    Returns:
        Formatted citation string.
    """
    formatter = _FORMATTERS.get(style, _format_nature)
    return formatter(ref)


def format_reference_list(references: list[dict], style: str = "nature-numeric") -> str:
    """Format a complete numbered reference list."""
    lines = []
    for ref in references:
        num = ref.get("number", 0)
        formatted = format_reference(ref, style)
        lines.append(f"[{num}] {formatted}")
    return "\n".join(lines)


# ── Nature Numeric ──────────────────────────────────────

def _format_nature(ref: dict) -> str:
    """Nature style: Authors. Title. _Venue_ **vol**, pages (year)."""
    authors = _format_authors(ref.get("authors", []), max_authors=5)
    title = ref.get("title", "Untitled")
    venue = ref.get("venue", "")
    year = ref.get("year", "")
    volume = ref.get("volume", "")
    pages = ref.get("pages", "")
    doi = ref.get("doi", "")

    parts = [f"{authors}."]
    parts.append(f"{title}.")

    venue_part = f"_{venue}_" if venue else ""
    if volume:
        venue_part += f" **{volume}**"
    if pages:
        venue_part += f", {pages}"
    if venue_part:
        parts.append(f"{venue_part} ({year})." if year else f"{venue_part}.")
    elif year:
        parts.append(f"({year}).")

    if doi:
        parts.append(f"doi:{doi}")

    return " ".join(parts)


# ── IEEE Numeric ────────────────────────────────────────

def _format_ieee(ref: dict) -> str:
    """IEEE style: Authors, "Title," Venue, vol. X, pp. Y-Z, year."""
    authors = _format_authors_ieee(ref.get("authors", []), max_authors=6)
    title = ref.get("title", "Untitled")
    venue = ref.get("venue", "")
    year = ref.get("year", "")
    volume = ref.get("volume", "")
    pages = ref.get("pages", "")

    parts = [authors + ","]
    parts.append(f'"{title},"')

    if venue:
        parts.append(f"in {venue}," if "conf" in venue.lower() or "proc" in venue.lower() else f"{venue},")
    if volume:
        parts.append(f"vol. {volume},")
    if pages:
        parts.append(f"pp. {pages},")
    if year:
        parts.append(f"{year}.")

    return " ".join(parts)


# ── APA (Author-Year) ──────────────────────────────────

def _format_apa(ref: dict) -> str:
    """APA style: Authors (Year). Title. Venue, Vol(Issue), Pages."""
    authors = _format_authors_apa(ref.get("authors", []), max_authors=7)
    title = ref.get("title", "Untitled")
    venue = ref.get("venue", "")
    year = ref.get("year", "n.d.")
    volume = ref.get("volume", "")
    pages = ref.get("pages", "")

    parts = [f"{authors} ({year})."]
    parts.append(f"{title}.")

    if venue:
        venue_str = f"_{venue}_"
        if volume:
            venue_str += f", _{volume}_"
        if pages:
            venue_str += f", {pages}"
        parts.append(f"{venue_str}.")

    return " ".join(parts)


# ── GB/T 7714 (Chinese Standard) ───────────────────────

def _format_gbt7714(ref: dict) -> str:
    """GB/T 7714 style: Authors. Title[J]. Venue, Year, Vol(Issue): Pages."""
    authors = _format_authors_gbt(ref.get("authors", []), max_authors=3)
    title = ref.get("title", "Untitled")
    venue = ref.get("venue", "")
    year = ref.get("year", "")
    volume = ref.get("volume", "")
    pages = ref.get("pages", "")
    doc_type = ref.get("doc_type", "J")  # J=journal, C=conference, M=book

    parts = [f"{authors}."]
    parts.append(f"{title}[{doc_type}].")

    if venue:
        venue_str = venue
        if year:
            venue_str += f", {year}"
        if volume:
            venue_str += f", {volume}"
        if pages:
            venue_str += f": {pages}"
        parts.append(f"{venue_str}.")

    return " ".join(parts)


# ── Author Formatting Helpers ───────────────────────────

def _format_authors(authors: list[str], max_authors: int = 5) -> str:
    """Generic author list: A., B. & C. or A. et al."""
    if not authors:
        return "Unknown"
    if len(authors) <= max_authors:
        if len(authors) == 1:
            return authors[0]
        return ", ".join(authors[:-1]) + " & " + authors[-1]
    return ", ".join(authors[:max_authors]) + " et al."


def _format_authors_ieee(authors: list[str], max_authors: int = 6) -> str:
    """IEEE author list: A. B. Author, C. D. Author, and E. F. Author."""
    if not authors:
        return "Unknown"
    if len(authors) <= max_authors:
        if len(authors) == 1:
            return authors[0]
        return ", ".join(authors[:-1]) + ", and " + authors[-1]
    return ", ".join(authors[:1]) + " et al."


def _format_authors_apa(authors: list[str], max_authors: int = 7) -> str:
    """APA author list: Author, A. B., Author, C. D., & Author, E. F."""
    if not authors:
        return "Unknown"
    if len(authors) <= max_authors:
        if len(authors) == 1:
            return authors[0]
        return ", ".join(authors[:-1]) + ", & " + authors[-1]
    return ", ".join(authors[:6]) + ", ... " + authors[-1]


def _format_authors_gbt(authors: list[str], max_authors: int = 3) -> str:
    """GB/T 7714 author list: uses comma, et al. after max."""
    if not authors:
        return "佚名"
    if len(authors) <= max_authors:
        return ", ".join(authors)
    return ", ".join(authors[:max_authors]) + ", 等"


# ── Style Registry ──────────────────────────────────────

_FORMATTERS = {
    "nature-numeric": _format_nature,
    "ieee-numeric": _format_ieee,
    "apa-author-year": _format_apa,
    "gbt-7714": _format_gbt7714,
}

SUPPORTED_STYLES = list(_FORMATTERS.keys())
