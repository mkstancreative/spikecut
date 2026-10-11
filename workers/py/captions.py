"""
Render word-by-word captions as transparent PNG frames plus an ffconcat playlist that times them.
ffmpeg overlays the playlist on the clip in a single pass (no libass required).

Usage:  python captions.py <words.json> <out_dir> <clip_duration> <font_path>
words.json: [[start, end, "word"], ...] with times relative to the clip start.
Writes <out_dir>/captions.ffconcat and prints its path.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1080, 420  # caption band, overlaid near the lower third of a 1080x1920 frame
MAX_WORDS, MAX_CHARS = 3, 18  # short groups read better on phones
FONT_SIZE = 92
STROKE = 9
WHITE = (255, 255, 255, 255)
ACCENT = (200, 255, 46, 255)  # SpikeCut lime
SHADOW = (0, 0, 0, 160)


def group_words(words):
    groups, current = [], []
    for w in words:
        text = " ".join(x[2] for x in current + [w])
        gap = w[0] - current[-1][1] if current else 0
        if current and (len(current) >= MAX_WORDS or len(text) > MAX_CHARS or gap > 0.6):
            groups.append(current)
            current = []
        current.append(w)
    if current:
        groups.append(current)
    return groups


def draw_group(group, active, font, path):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    tokens = [w[2].upper() for w in group]
    space = draw.textlength(" ", font=font)
    widths = [draw.textlength(t, font=font) for t in tokens]
    total = sum(widths) + space * (len(tokens) - 1)

    # Shrink to fit if a long word overflows the frame.
    if total > WIDTH - 80:
        font = font.font_variant(size=int(FONT_SIZE * (WIDTH - 80) / total))
        space = draw.textlength(" ", font=font)
        widths = [draw.textlength(t, font=font) for t in tokens]
        total = sum(widths) + space * (len(tokens) - 1)

    x = (WIDTH - total) / 2
    y = HEIGHT / 2
    for i, (token, w) in enumerate(zip(tokens, widths)):
        colour = ACCENT if i == active else WHITE
        draw.text((x + 4, y + 6), token, font=font, fill=SHADOW, anchor="lm")
        draw.text((x, y), token, font=font, fill=colour, anchor="lm", stroke_width=STROKE, stroke_fill=(0, 0, 0, 255))
        x += w + space
    img.save(path, optimize=True)


def main() -> None:
    words_path, out_dir, duration, font_path = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
    os.makedirs(out_dir, exist_ok=True)
    words = [w for w in json.load(open(words_path)) if w[2].strip()]
    font = ImageFont.truetype(font_path, FONT_SIZE)

    blank = os.path.join(out_dir, "blank.png")
    Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0)).save(blank)

    # Build a timeline of (image, duration). Gaps between words show the blank frame.
    timeline, cursor, n = [], 0.0, 0
    for group in group_words(words):
        for i, w in enumerate(group):
            start = max(w[0], cursor)
            if start - cursor > 0.01:
                timeline.append((blank, start - cursor))
            # Hold each highlight until the next word starts so captions don't flicker.
            nxt = group[i + 1][0] if i + 1 < len(group) else w[1]
            end = min(max(nxt, w[1], start + 0.08), duration)
            if end <= start:
                continue
            frame = os.path.join(out_dir, f"c{n:04d}.png")
            draw_group(group, i, font, frame)
            timeline.append((frame, end - start))
            cursor, n = end, n + 1
    if duration - cursor > 0.01:
        timeline.append((blank, duration - cursor))

    playlist = os.path.join(out_dir, "captions.ffconcat")
    with open(playlist, "w") as f:
        f.write("ffconcat version 1.0\n")
        for image, length in timeline:
            f.write(f"file '{os.path.basename(image)}'\nduration {length:.3f}\n")
        # The concat demuxer needs the final file repeated for its duration to apply.
        f.write(f"file '{os.path.basename(timeline[-1][0] if timeline else blank)}'\n")
    print(playlist)


if __name__ == "__main__":
    main()
