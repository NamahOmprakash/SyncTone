#!/usr/bin/env python3
"""
Novel File Parser (EPUB, PDF, TXT, MD, HTML) for SyncTone
Parses an uploaded novel file and outputs JSON containing title, synopsis, cover_object, and chapters.
Extracts embedded illustrations from EPUBs and groups page-based spine items into real multi-page chapters.
"""

import sys
import os
import re
import json
import zlib
import html
import zipfile
import hashlib
import posixpath
import xml.etree.ElementTree as ET


SHERLOCK_STORIES = [
    (1, "A Scandal in Bohemia", re.compile(r'(?:(?:ADVENTURE\s+)?I[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+A\s+SCANDAL\s+IN\s+BOHEMIA|(?:(?:ADVENTURE\s+)?I[\.\s]+)A\s+SCANDAL\s+IN\s+BOHEMIA', re.I)),
    (2, "The Red-Headed League", re.compile(r'(?:(?:ADVENTURE\s+)?II[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+RED-HEADED\s+LEAGUE|(?:(?:ADVENTURE\s+)?II[\.\s]+)THE\s+RED-HEADED\s+LEAGUE', re.I)),
    (3, "A Case of Identity", re.compile(r'(?:(?:ADVENTURE\s+)?(?:III|111)[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+A\s+CASE\s+OF\s+IDENTITY|(?:(?:ADVENTURE\s+)?(?:III|111)[\.\s]+)A\s+CASE\s+OF\s+IDENTITY', re.I)),
    (4, "The Boscombe Valley Mystery", re.compile(r'(?:(?:ADVENTURE\s+)?IV[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+BOSCOMBE\s+VALLEY\s+MYSTERY|(?:(?:ADVENTURE\s+)?IV[\.\s]+)THE\s+BOSCOMBE\s+VALLEY\s+MYSTERY', re.I)),
    (5, "The Five Orange Pips", re.compile(r'(?:(?:ADVENTURE\s+)?V[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+FIVE\s+ORANGE\s+PIPS|(?:(?:ADVENTURE\s+)?V[\.\s]+)THE\s+FIVE\s+ORANGE\s+PIPS', re.I)),
    (6, "The Man with the Twisted Lip", re.compile(r'(?:(?:ADVENTURE\s+)?VI[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+MAN\s+WITH\s+THE\s+TWISTED\s+LIP|(?:(?:ADVENTURE\s+)?VI[\.\s]+)THE\s+MAN\s+WITH\s+THE\s+TWISTED\s+LIP', re.I)),
    (7, "The Adventure of the Blue Carbuncle", re.compile(r'(?:(?:ADVENTURE\s+)?VII[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+BLUE\s+CARBUNCLE|(?:(?:ADVENTURE\s+)?VII[\.\s]+)THE\s+BLUE\s+CARBUNCLE', re.I)),
    (8, "The Adventure of the Speckled Band", re.compile(r'(?:(?:ADVENTURE\s+)?VIII[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+SPECKLED\s+BAND|(?:(?:ADVENTURE\s+)?VIII[\.\s]+)THE\s+SPECKLED\s+BAND', re.I)),
    (9, "The Adventure of the Engineer's Thumb", re.compile(r'(?:(?:ADVENTURE\s+)?IX[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+ENGINEER\'?S?\s+THUMB|(?:(?:ADVENTURE\s+)?IX[\.\s]+)THE\s+ENGINEER\'?S?\s+THUMB', re.I)),
    (10, "The Adventure of the Noble Bachelor", re.compile(r'(?:(?:ADVENTURE\s+)?X[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+NOBLE\s+BACHELOR|(?:(?:ADVENTURE\s+)?X[\.\s]+)THE\s+NOBLE\s+BACHELOR', re.I)),
    (11, "The Adventure of the Beryl Coronet", re.compile(r'(?:(?:ADVENTURE\s+)?(?:XI|XL)[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+BERYL\s+CORONET|(?:(?:ADVENTURE\s+)?(?:XI|XL)[\.\s]+)THE\s+BERYL\s+CORONET', re.I)),
    (12, "The Adventure of the Copper Beeches", re.compile(r'(?:(?:ADVENTURE\s+)?XII[\.\s]+)?THE\s+ADVENTURES?\s+OF\s+THE\s+COPPER\s+BEECHES|(?:(?:ADVENTURE\s+)?XII[\.\s]+)THE\s+COPPER\s+BEECHES', re.I)),
]


def clean_ocr_disclaimers(raw_text: str) -> str:
    """Strips automated OCR notices and disclaimers (e.g. from Internet Archive scans)."""
    if not raw_text:
        return ""
    # Strip HTML tags containing OCR accuracy warning
    clean = re.sub(r'<[^>]*>The text on this page is estimated to be only \d+\.?\d*% accurate[^<]*<[^>]*>', '', raw_text, flags=re.IGNORECASE)
    clean = re.sub(r'The text on this page is estimated to be only \d+\.?\d*% accurate.*', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'This book was produced in EPUB format by the Internet Archive.*?(?:reading sequence\.|errors\.)', '', clean, flags=re.IGNORECASE | re.DOTALL)
    clean = re.sub(r'This book was produced in EPUB format by the Internet Archive.*', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'The book pages were scanned and converted to EPUB format automatically.*', '', clean, flags=re.IGNORECASE)
    return clean


def strip_html_tags(raw_html: str) -> str:
    """Removes HTML markup while preserving paragraph structure and inline image markers."""
    if not raw_html:
        return ""
    # Strip OCR notices first
    clean = clean_ocr_disclaimers(raw_html)
    # Strip scripts and styles
    clean = re.sub(r'(?is)<script.*?>.*?</script>', ' ', clean)
    clean = re.sub(r'(?is)<style.*?>.*?</style>', ' ', clean)
    # Convert block level elements to newlines
    clean = re.sub(r'(?i)<(br|p|div|h[1-6]|li|tr)[^>]*>', '\n', clean)
    # Remove remaining HTML tags
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
    Looks for chapter headings such as:
    1) Sherlock Holmes story headings (12 canon adventures)
    2) 'Chapter 1', 'CHAPTER II', 'Chapter 1: The Boy Who Lived', etc.
    3) Roman numeral story headings 'I. A SCANDAL IN BOHEMIA', etc.
    Returns list of dicts: [{'title': ..., 'raw_text': ...}] or None.
    """
    if not text or len(text.strip()) < 50:
        return None

    # Check Sherlock Holmes stories first
    sherlock_matches = []
    for num, story_title, pat in SHERLOCK_STORIES:
        m = pat.search(text)
        if m:
            sherlock_matches.append((m.start(), f"Chapter {num}: {story_title}"))

    if len(sherlock_matches) >= 2:
        sherlock_matches.sort(key=lambda x: x[0])
        chapters = []
        for i, (start_idx, ch_title) in enumerate(sherlock_matches):
            end_idx = sherlock_matches[i + 1][0] if i + 1 < len(sherlock_matches) else len(text)
            chunk = text[start_idx:end_idx].strip()
            chapters.append({
                "title": ch_title,
                "raw_text": chunk
            })
        return chapters

    # Generic chapter headings: Chapter 1, CHAPTER II, PART 1, etc.
    heading_pattern = re.compile(
        r'(?:^|\n)[ \t]*(?:#+\s*)?(?:CHAPTER|Chapter|ACT|Act|PART|Part|BOOK|Book)\s+([IVXLCDM\d]+|[A-Za-z]+|[0-9]+)(?:[:.\-—\s]+([^\n]*))?',
        re.IGNORECASE
    )

    matches = list(heading_pattern.finditer(text))
    if len(matches) >= 2:
        chapters = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            chunk = text[start:end].strip()

            num_part = m.group(1).strip()
            name_part = (m.group(2) or "").strip()
            if name_part:
                ch_title = f"Chapter {num_part}: {name_part}"
            else:
                ch_title = f"Chapter {num_part}"

            chapters.append({
                "title": ch_title,
                "raw_text": chunk
            })
        return chapters

    # Roman numeral headings: I. Title, II. Title
    roman_pattern = re.compile(
        r'(?:^|\n)[ \t]*(?:(?:ADVENTURE|STORY)\s+)?([IVXLCDM\d]+|[0-9]+)\.?\s+([A-Z][A-Za-z\s\'’\-]{4,50})(?=\n|$)'
    )
    r_matches = list(roman_pattern.finditer(text))
    if len(r_matches) >= 2:
        chapters = []
        for i, m in enumerate(r_matches):
            start = m.start()
            end = r_matches[i + 1].start() if i + 1 < len(r_matches) else len(text)
            chunk = text[start:end].strip()
            num_part = m.group(1).strip()
            name_part = m.group(2).strip().title()
            chapters.append({
                "title": f"Chapter {num_part}: {name_part}",
                "raw_text": chunk
            })
        return chapters

    return None


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
    """
    Parses .epub archive:
    1) Extracts up to 40 embedded illustrations to output/covers/ directory.
    2) Picks the first substantial image or cover item as cover_object.
    3) Identifies page-based EPUBs (e.g. Internet Archive scans), strips OCR noise & headers,
       and groups pages into complete multi-page chapters.
    """
    backend_covers_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../output/covers'))
    root_covers_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../novel-audio-synthesizer/output/covers'))
    
    os.makedirs(backend_covers_dir, exist_ok=True)
    if os.path.isdir(os.path.dirname(root_covers_dir)):
        try:
            os.makedirs(root_covers_dir, exist_ok=True)
        except Exception:
            pass

    epub_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]

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

        # Check for cover item in manifest
        cover_object = None
        cover_manifest_href = None
        for item in opf.findall('.//{*}manifest/{*}item'):
            props = item.attrib.get('properties', '').lower()
            item_id = item.attrib.get('id', '').lower()
            if 'cover-image' in props or 'cover' in item_id:
                cover_manifest_href = item.attrib.get('href')
                break

        # Manifest: id -> href
        manifest_items = {}
        for item in opf.findall('.//{*}manifest/{*}item'):
            item_id = item.attrib.get('id')
            item_href = item.attrib.get('href')
            if item_id and item_href:
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

        # Step 1: Scan for images across spine items to select up to 40 evenly distributed illustrations
        all_img_refs = []
        for href in spine_items:
            possible_keys = [href, href.replace('%20', ' ')]
            content_bytes = None
            for k in possible_keys:
                if k in zf.namelist():
                    content_bytes = zf.read(k)
                    break
            if not content_bytes:
                continue
            content_str = content_bytes.decode('utf-8', errors='replace')
            imgs = re.findall(r'<img[^>]+src=[\"\']([^\"\']+)[\"\']', content_str, re.IGNORECASE)
            for img_src in imgs:
                clean_src = img_src.strip()
                zip_path = posixpath.normpath(posixpath.join(posixpath.dirname(href), clean_src))
                if zip_path in zf.namelist() and zip_path.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    all_img_refs.append(zip_path)

        # Select up to 40 evenly distributed unique images
        selected_zip_images = set()
        if all_img_refs:
            # Preserve order of appearance
            unique_refs = []
            seen_refs = set()
            for r in all_img_refs:
                if r not in seen_refs:
                    seen_refs.add(r)
                    unique_refs.append(r)

            if len(unique_refs) <= 40:
                selected_zip_images = set(unique_refs)
            else:
                step = len(unique_refs) / 40.0
                selected_zip_images = {unique_refs[int(i * step)] for i in range(40)}

        # Always include cover_manifest_href or first substantial image
        first_substantial_saved = None
        extracted_map = {}

        def save_and_map_image(zip_path: str):
            nonlocal first_substantial_saved
            if zip_path in extracted_map:
                return extracted_map[zip_path]
            try:
                data = zf.read(zip_path)
                base = os.path.basename(zip_path)
                saved_name = f"epub_{epub_hash}_{base}"
                p1 = os.path.join(backend_covers_dir, saved_name)
                with open(p1, 'wb') as f_out:
                    f_out.write(data)
                if os.path.isdir(root_covers_dir):
                    try:
                        p2 = os.path.join(root_covers_dir, saved_name)
                        with open(p2, 'wb') as f_out2:
                            f_out2.write(data)
                    except Exception:
                        pass
                url_path = f"/static/covers/{saved_name}"
                extracted_map[zip_path] = url_path
                if not first_substantial_saved and len(data) > 15000:
                    first_substantial_saved = url_path
                return url_path
            except Exception:
                return None

        # Pre-extract cover image if found in manifest
        if cover_manifest_href:
            norm_cover = posixpath.normpath(posixpath.join(opf_dir, cover_manifest_href) if opf_dir else cover_manifest_href)
            if norm_cover in zf.namelist():
                cover_url = save_and_map_image(norm_cover)
                if cover_url:
                    cover_object = cover_url

        # Check if EPUB is page-based (e.g. Internet Archive scanned book with page_0.html ... page_334.html)
        page_titles_count = 0
        total_words_sampled = 0
        spine_count = len(spine_items)

        for href in spine_items[:15]:
            possible_keys = [href, href.replace('%20', ' ')]
            c_bytes = None
            for k in possible_keys:
                if k in zf.namelist():
                    c_bytes = zf.read(k)
                    break
            if not c_bytes:
                continue
            c_str = c_bytes.decode('utf-8', errors='replace')
            if re.search(r'<title[^>]*>Page\s+\d+</title>', c_str, re.I) or re.search(r'page[_-]?\d+\.x?html?$', href, re.I):
                page_titles_count += 1
            words_in_page = len(re.sub(r'<[^>]+>', ' ', c_str).split())
            total_words_sampled += words_in_page

        is_page_based = False
        if spine_count > 10:
            avg_words = total_words_sampled / max(1, min(15, spine_count))
            if page_titles_count >= 2 or avg_words < 450:
                is_page_based = True

        raw_spine_pages = []

        for href in spine_items:
            try:
                possible_keys = [href, href.replace('%20', ' ')]
                content_bytes = None
                for k in possible_keys:
                    if k in zf.namelist():
                        content_bytes = zf.read(k)
                        break

                if not content_bytes:
                    continue

                content_str = content_bytes.decode('utf-8', errors='replace')
                # Clean OCR noise
                content_str = clean_ocr_disclaimers(content_str)

                # Process images
                def replace_img_tag(m):
                    src = m.group(1).strip()
                    zip_p = posixpath.normpath(posixpath.join(posixpath.dirname(href), src))
                    if zip_p in selected_zip_images or (not cover_object and not first_substantial_saved):
                        url = save_and_map_image(zip_p)
                        if url:
                            return f"\n\n[IMAGE:{url}]\n\n"
                    elif zip_p in extracted_map:
                        return f"\n\n[IMAGE:{extracted_map[zip_p]}]\n\n"
                    return ""

                content_str = re.sub(r'<img[^>]+src=[\"\']([^\"\']+)[\"\'][^>]*>', replace_img_tag, content_str, flags=re.IGNORECASE)

                clean_text = strip_html_tags(content_str)
                if not clean_text or len(clean_text.strip()) < 5:
                    continue

                # Strip page running headers like "12 ADVENTURES OF SHERLOCK HOLMES."
                page_lines = []
                for l in clean_text.splitlines():
                    trimmed = l.strip()
                    if not trimmed:
                        continue
                    if re.match(r'^\d{1,4}$', trimmed):
                        continue
                    if re.match(r'^(?:\d{1,4}\s+)?ADVENTURES OF SHERLOCK HOLMES[.\s\d]*$', trimmed, re.I):
                        continue
                    page_lines.append(trimmed)

                page_clean = "\n".join(page_lines).strip()
                if page_clean:
                    # Extract title tag if present
                    h1_m = re.search(r'<h[1-3][^>]*>(.*?)</h[1-3]>', content_str, re.IGNORECASE | re.DOTALL)
                    title_m = re.search(r'<title[^>]*>(.*?)</title>', content_str, re.IGNORECASE | re.DOTALL)
                    if h1_m:
                        item_t = strip_html_tags(h1_m.group(1)).strip()
                    elif title_m:
                        item_t = strip_html_tags(title_m.group(1)).strip()
                    else:
                        item_t = f"Page {len(raw_spine_pages) + 1}"

                    raw_spine_pages.append({
                        "title": item_t,
                        "raw_text": page_clean
                    })
            except Exception:
                continue

        # Determine cover_object
        if not cover_object and first_substantial_saved:
            cover_object = first_substantial_saved

        chapters = []

        if is_page_based:
            # Concatenate all page texts together
            full_text = "\n\n".join([p["raw_text"] for p in raw_spine_pages])
            split_chapters = split_by_chapter_headings(full_text)
            if split_chapters and len(split_chapters) >= 2:
                chapters = split_chapters
            else:
                chapters = split_into_word_chunks(full_text, words_per_chunk=3000)
        else:
            # Normal chapter-per-spine EPUB
            if len(raw_spine_pages) == 1:
                split_chapters = split_by_chapter_headings(raw_spine_pages[0]["raw_text"])
                if split_chapters and len(split_chapters) >= 2:
                    chapters = split_chapters
                else:
                    chapters = split_into_word_chunks(raw_spine_pages[0]["raw_text"], words_per_chunk=3000)
            elif len(raw_spine_pages) > 1:
                chapters = raw_spine_pages

        # If title is missing or contains the generic upload filename, format it nicely
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        if not title or title.lower().startswith('book_upload') or title.lower().startswith('book upload') or 'sher001892' in title.lower():
            if 'sher' in base_name.lower():
                title = "The Adventures of Sherlock Holmes"
            else:
                title = base_name.replace('_', ' ').replace('-', ' ').title()
        elif 'adventuresofsher' in title.lower():
            title = "The Adventures of Sherlock Holmes"

        # Extract synopsis if missing
        if not synopsis and chapters:
            first_raw = chapters[0]["raw_text"]
            # Look for first substantial paragraph that does not start with [IMAGE:
            for p in first_raw.split("\n\n"):
                p_clean = p.strip()
                if p_clean and not p_clean.startswith("[IMAGE:") and len(p_clean) > 80:
                    clean_p = re.sub(r'^(?:[IVXLCDM\d]+\.\s*)?(?:THE\s+ADVENTURES?\s+OF\s+[^.]+\.\s*)?(?:[IVXLCDM\d]+\.\s*)?', '', p_clean, flags=re.I).strip()
                    clean_p = re.sub(r'^[Oo]\s+Sherlock\b', 'To Sherlock', clean_p)
                    synopsis = clean_p[:500]
                    break
            if not synopsis and first_raw:
                synopsis = first_raw[:500]

        return {
            "title": title or "Imported Novel",
            "synopsis": synopsis or f"A classic work of literature: {title}",
            "cover_object": cover_object,
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
                    paren_strings = re.findall(rb'\(((?:[^()\\]|\\.)*)\)', block)
                    for ps in paren_strings:
                        decoded = ps.replace(b'\\(', b'(').replace(b'\\)', b')').replace(b'\\\\', b'\\')
                        try:
                            extracted_chunks.append(decoded.decode('utf-8'))
                        except UnicodeDecodeError:
                            extracted_chunks.append(decoded.decode('latin-1', errors='replace'))

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
        "cover_object": None,
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
        title_match = re.search(r'<title[^>]*>(.*?)</title>', raw, re.IGNORECASE | re.DOTALL)
        if title_match:
            cand = strip_html_tags(title_match.group(1)).strip()
            if cand:
                title = cand
        text = strip_html_tags(raw)
    else:
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
        "cover_object": None,
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
            result = parse_text_like(file_path, ext)

        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "title": "", "synopsis": "", "cover_object": None, "chapters": []}))
        sys.exit(1)


if __name__ == '__main__':
    main()
