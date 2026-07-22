#!/usr/bin/env python3
"""One-command entry point for deterministic StyleSlice cards and full analysis."""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path


SUPPORTED_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-_").lower()
    return slug or "styleslice"


def request_json(request: urllib.request.Request, timeout: int) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"StyleSlice API returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            "Cannot reach the StyleSlice API. Start the repository app with `cd app && npm run dev`."
        ) from error
    try:
        data = json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError("StyleSlice API returned invalid JSON") from error
    if not isinstance(data, dict):
        raise RuntimeError("StyleSlice API returned a non-object response")
    return data


def upload_images(api_url: str, images: list[Path]) -> list[str]:
    boundary = "styleslice-" + uuid.uuid4().hex
    chunks: list[bytes] = []
    for image in images:
        mime = SUPPORTED_MIME[image.suffix.lower()]
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="files"; filename="{image.name}"\r\n'.encode(),
                f"Content-Type: {mime}\r\n\r\n".encode(),
                image.read_bytes(),
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/upload",
        data=b"".join(chunks),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    response = request_json(request, timeout=60)
    ids = [item.get("imageId") for item in response.get("images", []) if isinstance(item, dict)]
    if not ids or not all(isinstance(item, str) for item in ids):
        raise RuntimeError(f"Image upload failed: {json.dumps(response, ensure_ascii=False)[:800]}")
    return ids


def analyze_images(api_url: str, image_ids: list[str]) -> dict:
    payload = json.dumps(
        {"imageIds": image_ids, "primaryImageIds": image_ids[:1]}, ensure_ascii=False
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/analyze",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    response = request_json(request, timeout=190)
    if response.get("error"):
        raise RuntimeError(f"Visual analysis failed: {response['error']}")
    if response.get("fallback") is True:
        raise RuntimeError(
            f"Visual analysis returned fallback data: {response.get('fallbackReason', 'unknown')}"
        )
    required = {
        "name", "summary", "keywords", "colors", "layout", "shapes", "imagery",
        "effects", "components", "mustKeep", "avoid", "uncertainties", "markdown",
    }
    missing = sorted(required - response.keys())
    if missing:
        raise RuntimeError(f"Visual analysis is missing fields: {', '.join(missing)}")
    if "typography" in response:
        raise RuntimeError("Visual analysis unexpectedly contains prohibited typography data")
    return response


def render_card(
    image: Path,
    output_dir: Path,
    slug: str,
    analysis_path: Path | None,
    name: str | None,
    source: str | None,
) -> dict:
    renderer = Path(__file__).with_name("render_style_card.py")
    command = [
        sys.executable,
        str(renderer),
        str(image),
        "--output-dir",
        str(output_dir),
        "--slug",
        slug,
    ]
    if analysis_path:
        command += ["--analysis", str(analysis_path)]
    if name:
        command += ["--name", name]
    if source:
        command += ["--source", source]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "Style Card rendering failed")
    try:
        result = json.loads(completed.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError) as error:
        raise RuntimeError("Style Card renderer returned invalid output") from error
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", type=Path, help="One or more JPG, PNG, or WebP files")
    parser.add_argument(
        "--mode",
        choices=("card", "analyze", "full"),
        default="card",
        help="card: deterministic card; analyze: JSON+Markdown; full: both (default: card)",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--analysis", type=Path, help="Existing analysis JSON for card mode")
    parser.add_argument("--name", help="Style name override")
    parser.add_argument("--source", help="Source label override")
    parser.add_argument("--slug", help="Output filename stem")
    args = parser.parse_args()

    for image in args.images:
        if not image.is_file():
            parser.error(f"image does not exist: {image}")
        if image.suffix.lower() not in SUPPORTED_MIME:
            parser.error(f"unsupported image format: {image.suffix}")
        if image.stat().st_size > 20 * 1024 * 1024:
            parser.error(f"image exceeds 20 MB: {image}")
    if len(args.images) > 10:
        parser.error("at most 10 images are supported")
    if args.mode == "card" and len(args.images) != 1:
        parser.error("card mode accepts exactly one image; use full mode for multi-image analysis")
    if args.analysis and not args.analysis.is_file():
        parser.error(f"analysis JSON does not exist: {args.analysis}")
    if args.analysis and args.mode != "card":
        parser.error("--analysis is only valid in card mode")

    slug = safe_slug(args.slug or args.images[0].stem)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    analysis_path: Path | None = args.analysis
    result: dict = {"mode": args.mode}

    if args.mode in {"analyze", "full"}:
        ids = upload_images(args.api_url, args.images)
        analysis = analyze_images(args.api_url, ids)
        analysis_path = args.output_dir / f"{slug}-analysis.json"
        markdown_path = args.output_dir / f"{slug}-style.md"
        analysis_path.write_text(
            json.dumps(analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        markdown_path.write_text(str(analysis["markdown"]), encoding="utf-8")
        result.update({"analysis": str(analysis_path), "markdown": str(markdown_path)})

    if args.mode in {"card", "full"}:
        result.update(
            render_card(
                args.images[0],
                args.output_dir,
                slug,
                analysis_path,
                args.name,
                args.source or args.images[0].name,
            )
        )

    result["validation"] = "passed"
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"StyleSlice failed: {error}", file=sys.stderr)
        raise SystemExit(1)
