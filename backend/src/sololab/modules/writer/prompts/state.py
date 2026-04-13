"""State-aware prompt helpers for the WriterAI multi-layer prompt system.

Pure functions — no I/O, no DB, no imports from writer internals. Designed
to be unit-testable in isolation. Callers in `agent.py` wire them into the
tool loop and message assembly.

Design principles:
- **Soft guidance, not hard enforcement.** The agent nudges the LLM via
  tool-result augmentation and per-turn state anchors. Nothing here blocks
  execution or forcibly rolls back output.
- **All state lives in `doc.metadata_json`** so no new DB columns or migrations.
- **Language detection is a hint, not an oracle.** Short snippets return
  None so we don't misclassify 30-character outputs.
"""
from __future__ import annotations

import re

_FIGURE_PLACEHOLDER_RE = re.compile(r"\[FIGURE:\s*([^\]\n]+)\]")
_MIN_LANG_DETECT_CHARS = 80
_LANG_NAMES = {"zh": "Chinese (中文)", "en": "English"}


# ── Extraction helpers ───────────────────────────────────

def extract_placeholders(html: str) -> list[str]:
    """Return `[FIGURE: name]` placeholder names in order, stripped."""
    return [m.strip() for m in _FIGURE_PLACEHOLDER_RE.findall(html or "")]


def detect_paper_language(html: str) -> str | None:
    """Best-effort language detection for a section's body text.

    Strips HTML tags, inline/display math, and citation brackets before
    counting characters. Returns None when the sample is too short to
    classify with reasonable confidence.
    """
    if not html:
        return None
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\$\$[\s\S]+?\$\$", " ", text)  # display math first
    text = re.sub(r"\$[^$\n]+?\$", " ", text)  # inline math
    text = re.sub(r"\\\[[\s\S]+?\\\]", " ", text)
    text = re.sub(r"\\\([^)]+?\\\)", " ", text)
    text = re.sub(r"\[\d+(?:,\s*\d+)*\]", " ", text)  # [1,2] citations
    stripped = text.strip()
    if len(stripped) < _MIN_LANG_DETECT_CHARS:
        return None
    cjk = sum(1 for c in stripped if "\u4e00" <= c <= "\u9fff")
    latin_words = len(re.findall(r"\b[a-zA-Z]{3,}\b", stripped))
    if cjk == 0 and latin_words == 0:
        return None
    return "zh" if cjk > latin_words * 0.3 else "en"


# ── State anchor (Layer 2) ───────────────────────────────

def build_state_anchor(
    doc: dict | None,
    language_lock: str | None,
    pending: list[dict],
) -> str:
    """Per-turn state reminder injected into the user message.

    The anchor is placed immediately before the user's actual request so that
    the LLM sees the latest doc state + active constraints in its most recent
    attention window — Layer 1 (system prompt) alone gets diluted by prior
    turn history over multi-turn conversations.
    """
    if doc is None:
        doc = {}

    lines: list[str] = ["[STATE ANCHOR — READ BEFORE RESPONDING]", ""]

    title = doc.get("title") or ""
    template_id = doc.get("template_id") or ""
    lines.append("## Document")
    if title:
        lines.append(f"Title: {title}")
    if template_id:
        lines.append(f"Template: {template_id}")

    if language_lock:
        lang_name = _LANG_NAMES.get(language_lock, language_lock)
        lines.append(
            f"🔒 LANGUAGE LOCK: {lang_name} — write EXCLUSIVELY in {lang_name}. "
            "Do NOT translate existing sections. Do NOT 'improve' the paper by "
            "switching language. Do NOT mix languages. Technical abbreviations "
            "(CNN, BERT, Transformer) stay as-is. Formulas in LaTeX are "
            "language-neutral."
        )
    else:
        lines.append(
            "Language: not yet locked — the first write_section output will "
            "determine the paper language."
        )

    sections = doc.get("sections") or []
    if sections:
        lines.append("")
        lines.append("## Progress")
        for sec in sections:
            icon = {"empty": "○", "writing": "◐", "complete": "●"}.get(
                sec.get("status", ""), "?"
            )
            wc = sec.get("word_count", 0)
            lines.append(
                f"  {icon} [{sec.get('id', '')}] {sec.get('title', '')} — {wc} words"
            )

    if pending:
        lines.append("")
        lines.append(
            f"## ⚠️ Pending Figure Placeholders ({len(pending)}) — "
            "FILL BEFORE WRITING ANY NEW SECTION"
        )
        for i, p in enumerate(pending, 1):
            name = p.get("section_title") or p.get("section_id", "?")
            lines.append(f"  {i}. [FIGURE: {p['placeholder']}] in '{name}'")
        lines.append("")
        lines.append("## Required Next Actions")
        first = pending[0]
        lines.append(
            f"  1. execute_code → generate '{first['placeholder']}' "
            "(matplotlib, save to /output/)"
        )
        lines.append(
            f"  2. insert_figure(section_id='{first['section_id']}', "
            f"placeholder='{first['placeholder']}', figure_url=..., caption=...)"
        )
        if len(pending) > 1:
            lines.append(
                f"  3. Repeat steps 1-2 for the remaining {len(pending) - 1} "
                "placeholder(s), one figure at a time"
            )
            step = 4
        else:
            step = 3
        lines.append(
            f"  {step}. Only AFTER the queue is empty, continue with the user "
            "request below."
        )
        lines.append("")
        lines.append(
            "## Figure Protocol Reminder\n"
            "Batching figures until the end of the paper causes you to FORGET "
            "them. The protocol is strict: placeholder → execute_code → "
            "insert_figure, ONE figure at a time, no write_section in between."
        )

    refs_count = len(doc.get("references") or [])
    figs_count = len(doc.get("figures") or [])
    if refs_count or figs_count:
        lines.append("")
        lines.append(
            f"## Resources: {refs_count} references cited, "
            f"{figs_count} figure(s) inserted"
        )

    return "\n".join(lines)


# ── Tool result augmentation (Layer 3) ───────────────────

def augment_write_section_result(
    base_result: str,
    placeholders: list[str],
    section_id: str,
    section_title: str,
    language_violation: tuple[str, str] | None = None,
) -> str:
    """Enrich write_section's plain result with state-aware guidance."""
    parts = [base_result]

    if language_violation is not None:
        locked, detected = language_violation
        parts.append("")
        parts.append(
            f"⚠️ LANGUAGE WARNING: the paper is locked to '{locked}' but this "
            f"section appears to be in '{detected}'. Please rewrite this "
            f"section in {locked}. Switching language mid-paper breaks "
            "coherence and wastes previous work — do not continue in the "
            "wrong language."
        )

    if placeholders:
        parts.append("")
        parts.append(
            f"⚠️ YOU CREATED {len(placeholders)} FIGURE PLACEHOLDER(S) — "
            "these MUST be filled BEFORE writing any new section:"
        )
        for i, p in enumerate(placeholders, 1):
            parts.append(f"  {i}. [FIGURE: {p}]")
        parts.append("")
        parts.append("YOUR NEXT ACTIONS (strict order, no detours):")
        parts.append(
            f"  → execute_code → generate '{placeholders[0]}' "
            "(matplotlib → /output/ → returns figure URL)"
        )
        parts.append(
            f"  → insert_figure(section_id='{section_id}', "
            f"placeholder='{placeholders[0]}', figure_url=..., caption=...)"
        )
        if len(placeholders) > 1:
            parts.append(
                f"  → Repeat the above for the remaining {len(placeholders) - 1} "
                "placeholder(s), one figure at a time"
            )
        parts.append("")
        parts.append(
            "DO NOT call write_section again until the pending queue is empty. "
            "If you write another section now, you WILL forget the pending "
            "figures and the paper will be incomplete."
        )

    return "\n".join(parts)


def augment_insert_figure_result(
    base_result: str,
    remaining_pending: list[dict],
) -> str:
    """Show how many placeholders are left + what to do next."""
    parts = [base_result]
    if remaining_pending:
        nxt = remaining_pending[0]
        parts.append("")
        parts.append(
            f"Pending queue: {len(remaining_pending)} remaining. "
            f"NEXT: execute_code → '{nxt['placeholder']}' "
            f"(section '{nxt.get('section_title', nxt.get('section_id', ''))}')."
        )
    else:
        parts.append("")
        parts.append(
            "✓ All figure placeholders filled. You may now continue with the "
            "next section."
        )
    return "\n".join(parts)


# ── Metadata helpers ─────────────────────────────────────

def merge_pending_placeholders(
    existing: list[dict],
    new_placeholders: list[str],
    section_id: str,
    section_title: str,
) -> list[dict]:
    """Append new placeholders to the pending queue, deduped by (name, section).

    Dedup is important when write_section is called multiple times on the
    same section (user edits): old pending entries for that section should
    be replaced with the new ones, not stacked.
    """
    # Remove any prior pending entries for this section (they're stale now)
    kept = [p for p in existing if p.get("section_id") != section_id]
    for name in new_placeholders:
        kept.append({
            "placeholder": name,
            "section_id": section_id,
            "section_title": section_title,
        })
    return kept


def pop_pending_placeholder(
    existing: list[dict],
    placeholder: str,
    section_id: str,
) -> list[dict]:
    """Remove one `(placeholder, section_id)` pair from the queue."""
    return [
        p
        for p in existing
        if not (p.get("placeholder") == placeholder and p.get("section_id") == section_id)
    ]
