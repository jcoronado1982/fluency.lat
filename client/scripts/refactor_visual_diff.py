#!/usr/bin/env python3
"""Pixel-diff two capture directories using the refactor thresholds."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


CHANNEL_DELTA_THRESHOLD = 7
NOISE_PIXEL_BUDGET = 200


def changed_pixels(before: Image.Image, after: Image.Image) -> int:
    if before.size != after.size:
        return before.width * before.height + after.width * after.height
    diff = ImageChops.difference(before.convert("RGB"), after.convert("RGB"))
    return sum(
        1
        for red, green, blue in diff.getdata()
        if max(red, green, blue) > CHANNEL_DELTA_THRESHOLD
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    args = parser.parse_args()

    failed = False
    before_files = {path.name: path for path in args.before.glob("*.png")}
    after_files = {path.name: path for path in args.after.glob("*.png")}
    for name in sorted(before_files.keys() | after_files.keys()):
        if name not in before_files or name not in after_files:
            failed = True
            print(f"MISSING {name}")
            continue
        with Image.open(before_files[name]) as before, Image.open(after_files[name]) as after:
            count = changed_pixels(before, after)
        status = "PASS" if count <= NOISE_PIXEL_BUDGET else "FAIL"
        failed |= status == "FAIL"
        print(f"{status:4} {count:9d}px {name}")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
