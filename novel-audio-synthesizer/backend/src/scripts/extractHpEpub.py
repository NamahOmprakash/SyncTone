#!/usr/bin/env python3
"""
HP1 Multi-Chapter EPUB Asset & Dialogue Extraction Pipeline
Extracts cover art, cleans scanned OCR pages, attributes speakers,
and generates structured JSON for Novel Audio Synthesizer.
"""

import os
import sys
import re
import json
import zipfile
import shutil
import subprocess
from bs4 import BeautifulSoup
from collections import Counter

DEFAULT_EPUB_PATH = "/Users/namahomprakash/Downloads/J. K. Rowling - 1. Harry Potter and the Philosopher's Stone - 2020.epub"

CHAPTERS_DEF = [
    (1, 8, 27, "The Boy Who Lived", "M"),
    (2, 28, 47, "The Vanishing Glass", "N"),
    (3, 48, 65, "The Letters from No One", "T"),
    (4, 66, 83, "The Keeper of the Keys", "B"),
    (5, 84, 113, "Diagon Alley", "H"),
    (6, 114, 143, "The Journey from Platform Nine and Three-Quarters", "H"),
    (7, 144, 165, "The Sorting Hat", "T"),
    (8, 166, 179, "The Potions Master", "T"),
    (9, 180, 201, "The Midnight Duel", "H"),
    (10, 202, 219, "Hallowe'en", "M"),
    (11, 220, 235, "Quidditch", "A"),
    (12, 236, 259, "The Mirror of Erised", "C"),
    (13, 260, 275, "Nicolas Flamel", "D"),
    (14, 276, 291, "Norbert the Norwegian Ridgeback", "Q"),
    (15, 292, 313, "The Forbidden Forest", "T"),
    (16, 314, 343, "Through the Trapdoor", "I"),
    (17, 344, 366, "The Man with Two Faces", "I"),
]

CORE_CAST = [
    {"name": "Narrator", "voice_id": "en-GB-RyanNeural", "gender": "male", "role": "narrator"},
    {"name": "Harry Potter", "voice_id": "en-GB-ThomasNeural", "gender": "male", "role": "protagonist"},
    {"name": "Ron Weasley", "voice_id": "en-GB-AlfieNeural", "gender": "male", "role": "supporting"},
    {"name": "Hermione Granger", "voice_id": "en-GB-LibbyNeural", "gender": "female", "role": "supporting"},
    {"name": "Albus Dumbledore", "voice_id": "en-GB-ArthurNeural", "gender": "male", "role": "supporting"},
    {"name": "Minerva McGonagall", "voice_id": "en-GB-SoniaNeural", "gender": "female", "role": "supporting"},
    {"name": "Rubeus Hagrid", "voice_id": "en-GB-RyanNeural", "gender": "male", "role": "supporting"},
    {"name": "Severus Snape", "voice_id": "en-GB-NoahNeural", "gender": "male", "role": "supporting"},
    {"name": "Draco Malfoy", "voice_id": "en-GB-OliverNeural", "gender": "male", "role": "supporting"},
    {"name": "Vernon Dursley", "voice_id": "en-GB-ArthurNeural", "gender": "male", "role": "supporting"},
    {"name": "Petunia Dursley", "voice_id": "en-GB-SoniaNeural", "gender": "female", "role": "supporting"},
]

VOICE_MAP = {
    "Narrator": "en-GB-RyanNeural",
    "Harry Potter": "en-GB-ThomasNeural",
    "Ron Weasley": "en-GB-AlfieNeural",
    "Hermione Granger": "en-GB-LibbyNeural",
    "Albus Dumbledore": "en-GB-ArthurNeural",
    "Minerva McGonagall": "en-GB-SoniaNeural",
    "Rubeus Hagrid": "en-GB-RyanNeural",
    "Severus Snape": "en-GB-NoahNeural",
    "Draco Malfoy": "en-GB-OliverNeural",
    "Vernon Dursley": "en-GB-ArthurNeural",
    "Petunia Dursley": "en-GB-SoniaNeural",
    "Dudley Dursley": "en-GB-AlfieNeural",
    "Professor Quirrell": "en-GB-NoahNeural",
    "Neville Longbottom": "en-GB-AlfieNeural",
    "Garrick Ollivander": "en-GB-ArthurNeural",
    "Percy Weasley": "en-GB-ThomasNeural",
    "Fred Weasley": "en-GB-AlfieNeural",
    "George Weasley": "en-GB-AlfieNeural",
    "Oliver Wood": "en-GB-ThomasNeural",
    "Professor Flitwick": "en-GB-ArthurNeural",
    "Lord Voldemort": "en-GB-NoahNeural",
    "Sorting Hat": "en-GB-ArthurNeural",
    "Molly Weasley": "en-GB-SoniaNeural",
    "Seamus Finnigan": "en-GB-AlfieNeural",
    "Dean Thomas": "en-GB-ThomasNeural",
    "Argus Filch": "en-GB-ArthurNeural",
    "Madam Hooch": "en-GB-SoniaNeural",
    "Madam Pomfrey": "en-GB-SoniaNeural",
    "Lee Jordan": "en-GB-AlfieNeural",
    "Firenze": "en-GB-ArthurNeural",
    "Bane": "en-GB-NoahNeural",
    "Ronan": "en-GB-ArthurNeural",
    "Peeves": "en-GB-RyanNeural",
}

CHARACTER_ALIASES = [
    ("Harry Potter", ["harry potter", "harry"]),
    ("Ron Weasley", ["ron weasley", "ron"]),
    ("Hermione Granger", ["hermione granger", "hermione"]),
    ("Albus Dumbledore", ["professor dumbledore", "albus dumbledore", "dumbledore", "albus"]),
    ("Minerva McGonagall", ["professor mcgonagall", "minerva mcgonagall", "mcgonagall", "minerva"]),
    ("Rubeus Hagrid", ["rubeus hagrid", "hagrid"]),
    ("Severus Snape", ["professor snape", "severus snape", "snape", "severus"]),
    ("Draco Malfoy", ["draco malfoy", "malfoy", "draco"]),
    ("Vernon Dursley", ["uncle vernon", "mr dursley", "mr. dursley", "vernon dursley", "vernon"]),
    ("Petunia Dursley", ["aunt petunia", "mrs dursley", "mrs. dursley", "petunia dursley", "petunia"]),
    ("Dudley Dursley", ["dudley dursley", "dudley"]),
    ("Professor Quirrell", ["professor quirrell", "quirrell"]),
    ("Neville Longbottom", ["neville longbottom", "neville"]),
    ("Garrick Ollivander", ["mr ollivander", "ollivander"]),
    ("Percy Weasley", ["percy weasley", "percy"]),
    ("Fred Weasley", ["fred weasley", "fred"]),
    ("George Weasley", ["george weasley", "george"]),
    ("Oliver Wood", ["oliver wood", "wood"]),
    ("Professor Flitwick", ["professor flitwick", "flitwick"]),
    ("Lord Voldemort", ["lord voldemort", "voldemort", "you-know-who"]),
    ("Sorting Hat", ["sorting hat"]),
    ("Molly Weasley", ["mrs weasley", "molly weasley"]),
    ("Seamus Finnigan", ["seamus finnigan", "seamus"]),
    ("Dean Thomas", ["dean thomas", "dean"]),
    ("Argus Filch", ["argus filch", "filch"]),
    ("Madam Hooch", ["madam hooch"]),
    ("Madam Pomfrey", ["madam pomfrey"]),
    ("Lee Jordan", ["lee jordan"]),
    ("Firenze", ["firenze"]),
    ("Bane", ["bane"]),
    ("Ronan", ["ronan"]),
    ("Peeves", ["peeves"]),
]

CHARACTER_GENDER = {
    "Harry Potter": "male",
    "Ron Weasley": "male",
    "Hermione Granger": "female",
    "Albus Dumbledore": "male",
    "Minerva McGonagall": "female",
    "Rubeus Hagrid": "male",
    "Severus Snape": "male",
    "Draco Malfoy": "male",
    "Vernon Dursley": "male",
    "Petunia Dursley": "female",
    "Dudley Dursley": "male",
    "Professor Quirrell": "male",
    "Neville Longbottom": "male",
    "Garrick Ollivander": "male",
    "Percy Weasley": "male",
    "Fred Weasley": "male",
    "George Weasley": "male",
    "Oliver Wood": "male",
    "Professor Flitwick": "male",
    "Lord Voldemort": "male",
    "Sorting Hat": "male",
    "Molly Weasley": "female",
    "Seamus Finnigan": "male",
    "Dean Thomas": "male",
    "Argus Filch": "male",
    "Madam Hooch": "female",
    "Madam Pomfrey": "female",
    "Lee Jordan": "male",
    "Firenze": "male",
    "Bane": "male",
    "Ronan": "male",
    "Peeves": "male",
}

SPEECH_VERBS = (
    "said|replied|shouted|whispered|muttered|exclaimed|asked|cried|called|growled|"
    "hissed|stammered|yelled|snapped|sighed|murmured|remarked|answered|demanded|"
    "insisted|pleaded|declared|suggested|added|continued|began|interrupted|warned|"
    "promised|gasped|roared|screamed|breathed|groaned|chuckled|laughed|repeated|"
    "snorted|urged|demanded|squeaked|barked|whimpered|told|shrieked|wailed|howled|"
    "sneered|jeered|chanted|commanded|urged|admitted|agreed|boasted|commented|"
    "confessed|echoed|giggled|nagged|noted|objected|observed|ordered|panted"
)

RE_SPEECH_AFTER_INV = re.compile(
    r'^\s*[,.]?\s+(?:' + SPEECH_VERBS + r')\s+([A-Za-z\s]{1,40}?)(?:[.,!?;:\n]|\s+[a-z]+ly|\s+that|\s+with|\s+to|\s+and|\s*$)',
    re.I
)
RE_SPEECH_AFTER_NORM = re.compile(
    r'^\s*[,.]?\s+([A-Za-z\s]{1,40}?)\s+(?:' + SPEECH_VERBS + r')\b',
    re.I
)
RE_SPEECH_BEFORE = re.compile(
    r'([A-Za-z\s]{1,40}?)\s+(?:' + SPEECH_VERBS + r')\s*[,:]?\s*$',
    re.I
)

COMMON_ENGLISH_WORDS = set("""
the of and a to in is you that it he was for on are as with his they i at be this have from or one had by
but not what all were we when your can said there an each which she do how their if will up other about out
many then them these so some her would make like him into time has look two more go see no way could my than
been who its now find down day did get come just over see know back little only
""".split())


def clean_page_text(raw_html, chapter_title):
    soup = BeautifulSoup(raw_html, "html.parser")
    # Remove OCR disclaimer blocks
    for b in soup.find_all("b"):
        b.decompose()

    p_tag = soup.find("p")
    if not p_tag:
        return ""

    txt = p_tag.get_text()

    # Strip non-Latin OCR noise (Arabic, Urdu, RTL/LTR marks, formatting noise)
    txt = re.sub(
        r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u200e\u200f\u200b\u200c\u200d]+",
        " ",
        txt,
    ).strip()

    # Normalize whitespace
    txt = re.sub(r"[ \t]+", " ", txt)

    # Check if this is an illustration/noise page
    words = re.findall(r"[a-zA-Z]+", txt.lower())
    hits = sum(1 for w in words if w in COMMON_ENGLISH_WORDS)
    if hits < 5 or len(words) < 15:
        return ""

    # Strip running header at start of page (GHAPTER X, CHAPTER X, or chapter title in uppercase)
    escaped_title = re.escape(chapter_title.upper())
    header_pat = r"^(?:.{0,80}?)\b(?:[GgHh]?HAPTER\s+[A-Z]+|" + escaped_title + r")\b\s*"
    txt = re.sub(header_pat, "", txt, flags=re.I)

    # Strip stray leading/trailing page numbers and OCR punctuation
    txt = re.sub(r"^\s*[\d\s`^~._-]+\s*", "", txt)
    txt = re.sub(r"\s+[\d\s`^~._-]+$", "", txt)

    return txt.strip()


def resolve_character_name(text):
    if not text:
        return None
    # Strip prepositional phrases like "at Dumbledore", "to Harry"
    text_clean = re.sub(r"\b(?:at|to|with|towards?)\s+[A-Za-z\s]+", "", text, flags=re.I).lower()
    for canonical, aliases in CHARACTER_ALIASES:
        for alias in aliases:
            if re.search(r"\b" + re.escape(alias) + r"\b", text_clean):
                return canonical
    return None


def resolve_pronoun(text, recent_male, recent_female):
    if not text:
        return None
    words = text.lower().split()
    if "he" in words or "him" in words or "his" in words:
        return recent_male
    if "she" in words or "her" in words:
        return recent_female
    return None


def extract_segments(raw_text):
    # Protect contractions & possessives (e.g. don’t, Harry’s, couldn’t)
    protected = re.sub(r"(?<=[a-zA-Z])[\u2019\u2018\'](?=[a-zA-Z])", "__APOS__", raw_text)

    # Match dialogue within British single quotes, straight double quotes, or curly double quotes
    dialogue_pat = re.compile(
        r'[\"\u201c\u2018]([^\u201c\u2018\u201d\u2019\"\r\n]{2,}?)[\"\u201d\u2019]'
    )

    matches = []
    for m in dialogue_pat.finditer(protected):
        d_text = m.group(1).replace("__APOS__", "'")
        # Ignore standalone short quotes like 'everyone' or 'You-Know-Who' without punctuation
        if len(d_text) < 15 and not any(p in d_text for p in ".,!?;:"):
            continue
        matches.append((m.start(), m.end(), d_text))

    segments = []
    seg_id = 1
    last_idx = 0

    recent_male = "Harry Potter"
    recent_female = "Hermione Granger"
    recent_dialogue_speakers = []

    for start, end, d_text in matches:
        # Preceding narration
        if start > last_idx:
            narration_text = protected[last_idx:start].replace("__APOS__", "'").strip()
            if narration_text:
                segments.append({
                    "segment_id": seg_id,
                    "type": "narration",
                    "speaker_name": "Narrator",
                    "speaker_id": "narrator",
                    "character_id": "narrator",
                    "voice_id": VOICE_MAP["Narrator"],
                    "assigned_voice_id": VOICE_MAP["Narrator"],
                    "text": narration_text,
                    "attribution_confidence": 1.0,
                    "attribution_source": "narrator_default",
                })
                seg_id += 1

                # Update recent scene characters mentioned in narration
                for canonical, aliases in CHARACTER_ALIASES:
                    for alias in aliases:
                        if re.search(r"\b" + re.escape(alias) + r"\b", narration_text.lower()):
                            if CHARACTER_GENDER.get(canonical) == "male":
                                recent_male = canonical
                            elif CHARACTER_GENDER.get(canonical) == "female":
                                recent_female = canonical
                            break

        # Attribution for current dialogue
        after_context = protected[end:end + 90].replace("__APOS__", "'")
        before_context = protected[max(0, start - 90):start].replace("__APOS__", "'")

        speaker = None
        source = "unresolved"
        confidence = 0.4

        # 1. Check inverted speech tag after: '...', said Professor McGonagall
        m_inv = RE_SPEECH_AFTER_INV.search(after_context)
        if m_inv:
            char = resolve_character_name(m_inv.group(1))
            if char:
                speaker = char
                source = "tag_after_inverted"
                confidence = 0.95

        # 2. Check normal speech tag after: '...', Harry said
        if not speaker:
            m_norm = RE_SPEECH_AFTER_NORM.search(after_context)
            if m_norm:
                char = resolve_character_name(m_norm.group(1))
                if char:
                    speaker = char
                    source = "tag_after"
                    confidence = 0.92

        # 3. Check speech tag before: Hagrid growled, '...'
        if not speaker:
            m_bef = RE_SPEECH_BEFORE.search(before_context)
            if m_bef:
                char = resolve_character_name(m_bef.group(1))
                if char:
                    speaker = char
                    source = "tag_before"
                    confidence = 0.90

        # 4. Check pronoun speech tags: '...', he said / she whispered
        if not speaker:
            if m_inv:
                pronoun_char = resolve_pronoun(m_inv.group(1), recent_male, recent_female)
                if pronoun_char:
                    speaker = pronoun_char
                    source = "pronoun_after_inverted"
                    confidence = 0.85
            elif m_norm:
                pronoun_char = resolve_pronoun(m_norm.group(1), recent_male, recent_female)
                if pronoun_char:
                    speaker = pronoun_char
                    source = "pronoun_after"
                    confidence = 0.85

        # 5. Immediate surrounding character mentions with speech verbs
        if not speaker:
            after_short = after_context[:50]
            before_short = before_context[-50:]
            char_after = resolve_character_name(after_short)
            char_before = resolve_character_name(before_short)
            if char_after and any(v in after_short.lower() for v in ["said", "asked", "replied", "gasped", "whispered"]):
                speaker = char_after
                source = "context_after"
                confidence = 0.80
            elif char_before and any(v in before_short.lower() for v in ["said", "asked", "replied", "gasped", "whispered"]):
                speaker = char_before
                source = "context_before"
                confidence = 0.80

        # 6. Conversational alternation between active dialogue partners
        if not speaker:
            if len(recent_dialogue_speakers) >= 2:
                # Alternate with last speaker's counterpart
                s1, s2 = recent_dialogue_speakers[-2], recent_dialogue_speakers[-1]
                speaker = s1 if s1 != s2 else (recent_dialogue_speakers[0] if s1 != recent_dialogue_speakers[0] else "Unknown Speaker")
                source = "dialogue_alternation"
                confidence = 0.70
            elif len(recent_dialogue_speakers) == 1:
                # Alternate with scene counterpart
                last = recent_dialogue_speakers[0]
                if last == "Harry Potter":
                    speaker = recent_male if recent_male != "Harry Potter" else "Ron Weasley"
                elif last == "Albus Dumbledore":
                    speaker = "Minerva McGonagall"
                elif last == "Minerva McGonagall":
                    speaker = "Albus Dumbledore"
                elif last == "Vernon Dursley":
                    speaker = "Petunia Dursley"
                else:
                    speaker = recent_male if recent_male != last else "Harry Potter"
                source = "partner_inference"
                confidence = 0.65
            else:
                speaker = "Unknown Speaker"
                source = "unresolved"
                confidence = 0.40

        # Maintain speaker history
        if speaker and speaker != "Unknown Speaker":
            if CHARACTER_GENDER.get(speaker) == "male":
                recent_male = speaker
            elif CHARACTER_GENDER.get(speaker) == "female":
                recent_female = speaker

            if not recent_dialogue_speakers or recent_dialogue_speakers[-1] != speaker:
                recent_dialogue_speakers.append(speaker)
                if len(recent_dialogue_speakers) > 3:
                    recent_dialogue_speakers.pop(0)

        speaker_slug = re.sub(r"[^a-zA-Z0-9]+", "_", speaker.lower()).strip("_")
        voice_id = VOICE_MAP.get(speaker, VOICE_MAP["Narrator"])

        segments.append({
            "segment_id": seg_id,
            "type": "dialogue",
            "speaker_name": speaker,
            "speaker_id": speaker_slug,
            "character_id": speaker_slug,
            "voice_id": voice_id,
            "assigned_voice_id": voice_id,
            "text": d_text,
            "attribution_confidence": confidence,
            "attribution_source": source,
        })
        seg_id += 1
        last_idx = end

    # Trailing narration
    if last_idx < len(protected):
        trailing_text = protected[last_idx:].replace("__APOS__", "'").strip()
        if trailing_text:
            segments.append({
                "segment_id": seg_id,
                "type": "narration",
                "speaker_name": "Narrator",
                "speaker_id": "narrator",
                "character_id": "narrator",
                "voice_id": VOICE_MAP["Narrator"],
                "assigned_voice_id": VOICE_MAP["Narrator"],
                "text": trailing_text,
                "attribution_confidence": 1.0,
                "attribution_source": "narrator_default",
            })

    return segments


def extract_cover_image(epub_zip, repo_root):
    cover_entry = "EPUB/image_0000_00.jpeg"
    if cover_entry not in epub_zip.namelist():
        return None

    raw_tmp = "/tmp/hp1_raw_cover.jpg"
    with open(raw_tmp, "wb") as f:
        f.write(epub_zip.read(cover_entry))

    resampled_tmp = "/tmp/hp1_cover_600.jpg"
    try:
        subprocess.run(["sips", "--resampleWidth", "600", raw_tmp, "--out", resampled_tmp], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        src_cover = resampled_tmp
    except Exception:
        src_cover = raw_tmp

    target_paths = [
        os.path.join(repo_root, "novel-audio-synthesizer/backend/output/covers/hp1_cover.jpg"),
        os.path.join(repo_root, "novel-audio-synthesizer/output/covers/hp1_cover.jpg"),
        os.path.join(repo_root, "novel-audio-synthesizer/frontend/public/covers/hp1_cover.jpg"),
    ]

    for p in target_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        shutil.copyfile(src_cover, p)

    return "/static/covers/hp1_cover.jpg"


def main():
    epub_path = os.getenv("HP_EPUB_PATH", DEFAULT_EPUB_PATH)
    if not os.path.exists(epub_path):
        print(f"Error: EPUB not found at {epub_path}", file=sys.stderr)
        sys.exit(1)

    # Determine repo root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, "../../../../"))

    with zipfile.ZipFile(epub_path, "r") as z:
        cover_url = extract_cover_image(z, repo_root) or "/static/covers/hp1_cover.jpg"

        all_entries = set(z.namelist())
        chapters_data = []
        speaker_stats = Counter()
        total_segments = 0

        for ch_num, start_p, end_p, title, drop_char in CHAPTERS_DEF:
            page_texts = []
            for p in range(start_p, end_p + 1):
                name = f"EPUB/page_{p}.html"
                if name not in all_entries:
                    continue
                raw_html = z.read(name).decode("utf-8")
                clean = clean_page_text(raw_html, title)
                if clean:
                    page_texts.append(clean)

            combined_text = " ".join(page_texts)

            # Restore dropped initial letter
            if combined_text:
                if combined_text[0].islower() and ch_num != 8:
                    combined_text = drop_char + combined_text
                elif combined_text.startswith("OOM"):
                    combined_text = drop_char + combined_text

                # Trim trailing noise symbols at end of chapter if any
                combined_text = re.sub(r'[\s~_|^+=*<>—«/\x7f[\]:.-]+$', '', combined_text).strip()
                if not combined_text.endswith(('.', '!', '?', "'", '"', '’', '”')):
                    combined_text += '.'

            segments = extract_segments(combined_text)
            total_segments += len(segments)

            for seg in segments:
                speaker_stats[seg["speaker_name"]] += 1

            chapters_data.append({
                "chapter_number": ch_num,
                "title": title,
                "raw_text": combined_text,
                "segments": segments,
            })

    output_payload = {
        "title": "Harry Potter and the Philosopher's Stone",
        "author": "J. K. Rowling",
        "cover_url": cover_url,
        "description": "The first volume of the Harry Potter series, following Harry Potter in his first year at Hogwarts School of Witchcraft and Wizardry.",
        "cast": CORE_CAST,
        "chapters": chapters_data,
    }

    # Write output to both backend/output and output
    target_json_paths = [
        os.path.join(repo_root, "novel-audio-synthesizer/backend/output/hp1_extracted.json"),
        os.path.join(repo_root, "novel-audio-synthesizer/output/hp1_extracted.json"),
    ]

    for p in target_json_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(output_payload, f, ensure_ascii=False, indent=2)

    # Report statistical summary
    print("=================================================================")
    print("EPUB Extraction & Processing Completed Successfully")
    print("=================================================================")
    print(f"Total Chapters Extracted: {len(chapters_data)}")
    print(f"Total Audio Segments: {total_segments}")
    print("\nChapter Breakdown:")
    for ch in chapters_data:
        dialogues = sum(1 for s in ch["segments"] if s["type"] == "dialogue")
        narrations = sum(1 for s in ch["segments"] if s["type"] == "narration")
        print(f"  Chapter {ch['chapter_number']:02d}: {ch['title'][:32]:32s} | Segments: {len(ch['segments']):3d} (Narration: {narrations:3d}, Dialogue: {dialogues:3d})")

    print("\nTop Attributed Characters (Segment Counts):")
    for name, count in speaker_stats.most_common(12):
        print(f"  {name:22s}: {count:4d} segments")

    print("\nOutput File Paths:")
    for p in target_json_paths:
        print(f"  JSON: {p} ({os.path.getsize(p) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
