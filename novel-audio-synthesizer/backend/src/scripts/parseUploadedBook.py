#!/usr/bin/env python3
"""
Novel File Parser (EPUB, PDF, TXT, MD, HTML) for SyncTone
Parses an uploaded novel file and outputs JSON containing title, synopsis, and chapters.
"""

import sys
import os
import re
import json
import zlib
import html
import zipfile
import xml.etree.ElementTree as ET


def strip_html_tags(raw_html: str) -> str:
    """Removes HTML markup while preserving paragraph structure."""
    if not raw_html:
        return ""
    # Strip scripts and styles
    clean = re.sub(r'(?is)<script.*?>.*?</script>', ' ', raw_html)
    clean = re.sub(r'(?is)<style.*?>.*?</style>', ' ', clean)
    # Convert block level elements to newlines
    clean = re.sub(r'(?i)<(br|p|div|h[1-6]|li|tr)[^>]*>', '\n', clean)
    # Remove remaining tags
    clean = re.sub(r'<[^>]+>', ' ', clean)
    # Unescape HTML entities
    clean = html.unescape(clean)
    # Normalize whitespaces
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in clean.splitlines()]
    # Collapse multiple blank lines
    collapsed = []
    prev_blank = False
    for l in lines:
        if not l:
            if not prev_blank:
                collapsed.append("")
                prev_blank = True
        else:
            collapsed.append(l)
            prev_blank = False
    return "\n".join(collapsed).strip()


def split_by_chapter_headings(text: str):
    """
    Looks for chapter headings such as 'Chapter 1', 'CHAPTER II', 'Chapter 1: The Boy Who Lived', etc.
    Returns list of dicts: [{'title': ..., 'raw_text': ...}]
    """
    heading_pattern = re.compile(
        r'(?:^|\n)[ \t]*(?:#+\s*)?(?:CHAPTER|Chapter|ACT|Act|PART|Part|BOOK|Book)\s+([IVXLCDM\d]+|[A-Za-z]+|[0-9]+)(?:[:.\-—\s]+([^\n]*))?',
        re.IGNORECASE
    )

    matches = list(heading_pattern.finditer(text))
    if len(matches) < 2:
        return None

    chapters = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()

        # Build chapter title
        num_part = m.group(1).strip()
        name_part = (m.group(2) or "").strip()
        if name_part:
            ch_title = f"Chapter {num_part}: {name_part}"
        else:
            ch_title = f"Chapter {num_part}"

        # Clean title line from raw_text or keep full
        chapters.append({
            "title": ch_title,
            "raw_text": chunk
        })

    return chapters


def split_into_word_chunks(text: str, words_per_chunk: int = 3000):
    """Fallback: splits long text into chunks of ~words_per_chunk words."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [p.strip() for p in text.splitlines() if p.strip()]

    chunks = []
    current_chunk = []
    current_words = 0
    chapter_num = 1

    for p in paragraphs:
        w_count = len(p.split())
        if current_words + w_count > words_per_chunk and current_chunk:
            chunks.append({
                "title": f"Section {chapter_num}",
                "raw_text": "\n\n".join(current_chunk)
            })
            chapter_num += 1
            current_chunk = [p]
            current_words = w_count
        else:
            current_chunk.append(p)
            current_words += w_count

    if current_chunk:
        chunks.append({
            "title": f"Section {chapter_num}" if chapter_num > 1 else "Chapter 1",
            "raw_text": "\n\n".join(current_chunk)
        })

    return chunks


def parse_epub(file_path: str):
    """Parses .epub archive using zipfile and ElementTree."""
    with zipfile.ZipFile(file_path, 'r') as zf:
        # Find rootfile from container.xml
        container_xml = zf.read('META-INF/container.xml')
        root = ET.fromstring(container_xml)
        rootfile = root.find('.//{*}rootfile')
        if rootfile is None or 'full-path' not in rootfile.attrib:
            raise ValueError("Invalid EPUB: META-INF/container.xml missing rootfile full-path")
        
        opf_path = rootfile.attrib['full-path']
        opf_dir = os.path.dirname(opf_path)
        opf_xml = zf.read(opf_path)
        opf = ET.fromstring(opf_xml)

        # Metadata
        title_el = opf.find('.//{*}title')
        title = title_el.text.strip() if title_el is not None and title_el.text else ""
        desc_el = opf.find('.//{*}description')
        synopsis = desc_el.text.strip() if desc_el is not None and desc_el.text else ""

        # Manifest: id -> href
        manifest_items = {}
        for item in opf.findall('.//{*}manifest/{*}item'):
            item_id = item.attrib.get('id')
            item_href = item.attrib.get('href')
            if item_id and item_href:
                # Normalize relative path
                if opf_dir:
                    full_href = f"{opf_dir}/{item_href}".replace('\\', '/')
                else:
                    full_href = item_href.replace('\\', '/')
                manifest_items[item_id] = full_href

        # Spine: ordered itemrefs
        spine_items = []
        for itemref in opf.findall('.//{*}spine/{*}itemref'):
            idref = itemref.attrib.get('idref')
            if idref in manifest_items:
                spine_items.append(manifest_items[idref])

        chapters = []
        combined_text = []

        for href in spine_items:
            try:
                # Handle possible URL encoding in href
                possible_keys = [href, href.replace('%20', ' ')]
                content_bytes = None
                for k in possible_keys:
                    if k in zf.namelist():
                        content_bytes = zf.read(k)
                        break

                if not content_bytes:
                    continue

                content_str = content_bytes.decode('utf-8', errors='replace')
                clean_text = strip_html_tags(content_str)
                if not clean_text or len(clean_text.strip()) < 5:
                    # Skip empty pages
                    continue

                # Extract title from <h1> or <title> in raw content
                h1_match = re.search(r'<h[1-3][^>]*>(.*?)</h[1-3]>', content_str, re.IGNORECASE | re.DOTALL)
                title_match = re.search(r'<title[^>]*>(.*?)</title>', content_str, re.IGNORECASE | re.DOTALL)
                
                if h1_match:
                    item_title = strip_html_tags(h1_match.group(1)).strip()
                elif title_match:
                    item_title = strip_html_tags(title_match.group(1)).strip()
                else:
                    item_title = f"Chapter {len(chapters) + 1}"

                chapters.append({
                    "title": item_title or f"Chapter {len(chapters) + 1}",
                    "raw_text": clean_text
                })
                combined_text.append(clean_text)
            except Exception:
                continue

        # If spine items produced only 1 single document containing the whole book,
        # check if it contains multiple chapter headings to split into individual chapters
        if len(chapters) == 1 and combined_text:
            split_chapters = split_by_chapter_headings(combined_text[0])
            if split_chapters and len(split_chapters) > 1:
                chapters = split_chapters
        elif not chapters and combined_text:
            full_text = "\n\n".join(combined_text)
            split_chapters = split_by_chapter_headings(full_text)
            if split_chapters and len(split_chapters) > 1:
                chapters = split_chapters
            else:
                chapters = split_into_word_chunks(full_text)

        if not synopsis and combined_text:
            # First paragraph as synopsis
            first_p = combined_text[0].split("\n\n")[0]
            synopsis = first_p[:500]

        return {
            "title": title or os.path.splitext(os.path.basename(file_path))[0],
            "synopsis": synopsis,
            "chapters": [
                {
                    "chapter_number": i + 1,
                    "title": ch["title"],
                    "raw_text": ch["raw_text"]
                }
                for i, ch in enumerate(chapters)
            ]
        }


def parse_pdf(file_path: str):
    """Extracts text from PDF files using pypdf/fitz or zlib stream parsing."""
    full_text = ""

    # Strategy 1: pypdf if installed
    try:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        pages_text = [page.extract_text() or "" for page in reader.pages]
        full_text = "\n\n".join(pages_text).strip()
    except Exception:
        pass

    # Strategy 2: fitz (PyMuPDF) if installed
    if not full_text:
        try:
            import fitz
            doc = fitz.open(file_path)
            pages_text = [page.get_text() or "" for page in doc]
            full_text = "\n\n".join(pages_text).strip()
        except Exception:
            pass

    # Strategy 3: Pure Python zlib stream decompression & BT..ET operator extraction
    if not full_text:
        try:
            with open(file_path, 'rb') as f:
                pdf_data = f.read()

            streams = re.findall(rb'stream[\r\n]+(.*?)(?:[\r\n]+endstream|\r?\nendstream)', pdf_data, flags=re.DOTALL)
            extracted_chunks = []

            for s in streams:
                raw_chunk = s.strip()
                decompressed = None
                try:
                    decompressed = zlib.decompress(raw_chunk)
                except Exception:
                    try:
                        decompressed = zlib.decompress(raw_chunk, -15)
                    except Exception:
                        decompressed = raw_chunk

                # Find BT ... ET text blocks
                bt_blocks = re.findall(rb'BT\s+(.*?)\s+ET', decompressed, flags=re.DOTALL)
                for block in bt_blocks:
                    # Find parenthesized string literals: \((?:[^()\\]|\\.)*\)
                    paren_strings = re.findall(rb'\(((?:[^()\\]|\\.)*)\)', block)
                    for ps in paren_strings:
                        # Decode escape sequences
                        decoded = ps.replace(b'\\(', b'(').replace(b'\\)', b')').replace(b'\\\\', b'\\')
                        try:
                            extracted_chunks.append(decoded.decode('utf-8'))
                        except UnicodeDecodeError:
                            extracted_chunks.append(decoded.decode('latin-1', errors='replace'))

                    # Find hex string literals: <[0-9a-fA-F]+>
                    hex_strings = re.findall(rb'<([0-9a-fA-F\s]{2,})>', block)
                    for hs in hex_strings:
                        clean_hex = re.sub(rb'\s+', b'', hs)
                        if len(clean_hex) % 2 == 0:
                            try:
                                h_bytes = bytes.fromhex(clean_hex.decode('ascii'))
                                extracted_chunks.append(h_bytes.decode('utf-8', errors='replace'))
                            except Exception:
                                pass

            full_text = " ".join(extracted_chunks).strip()
            # Clean up spacing
            full_text = re.sub(r'[ \t]+', ' ', full_text)
            full_text = re.sub(r'(\r?\n\s*){2,}', '\n\n', full_text)
        except Exception as e:
            sys.stderr.write(f"PDF raw parsing warning: {e}\n")

    base_name = os.path.splitext(os.path.basename(file_path))[0]
    title = base_name.replace('_', ' ').replace('-', ' ').title()

    chapters = split_by_chapter_headings(full_text)
    if not chapters:
        chapters = split_into_word_chunks(full_text, words_per_chunk=3000)

    first_p = full_text.split("\n\n")[0] if full_text else ""
    synopsis = first_p[:500] if first_p else f"Imported document: {title}"

    return {
        "title": title,
        "synopsis": synopsis,
        "chapters": [
            {
                "chapter_number": i + 1,
                "title": ch["title"],
                "raw_text": ch["raw_text"]
            }
            for i, ch in enumerate(chapters)
        ]
    }


def parse_text_like(file_path: str, ext: str):
    """Parses .txt, .md, or .html documents."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            raw = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='latin-1', errors='replace') as f:
            raw = f.read()

    base_name = os.path.splitext(os.path.basename(file_path))[0]
    title = base_name.replace('_', ' ').replace('-', ' ').title()

    if ext in ('.html', '.htm'):
        # Extract title tag if present
        title_match = re.search(r'<title[^>]*>(.*?)</title>', raw, re.IGNORECASE | re.DOTALL)
        if title_match:
            cand = strip_html_tags(title_match.group(1)).strip()
            if cand:
                title = cand
        text = strip_html_tags(raw)
    else:
        # Check first # heading for md or txt
        h1_match = re.search(r'^\s*#\s+([^\n]+)', raw, re.MULTILINE)
        if h1_match:
            title = h1_match.group(1).strip()
        text = raw

    chapters = split_by_chapter_headings(text)
    if not chapters:
        chapters = split_into_word_chunks(text, words_per_chunk=3000)

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    synopsis = paragraphs[0][:500] if paragraphs else ""

    return {
        "title": title,
        "synopsis": synopsis,
        "chapters": [
            {
                "chapter_number": i + 1,
                "title": ch["title"],
                "raw_text": ch["raw_text"]
            }
            for i, ch in enumerate(chapters)
        ]
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing input file path argument"}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.isfile(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == '.epub':
            result = parse_epub(file_path)
        elif ext == '.pdf':
            result = parse_pdf(file_path)
        elif ext in ('.txt', '.md', '.html', '.htm'):
            result = parse_text_like(file_path, ext)
        else:
            # Try text-like fallback
            result = parse_text_like(file_path, ext)

        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "title": "", "synopsis": "", "chapters": []}))
        sys.exit(1)


if __name__ == '__main__':
    main()
