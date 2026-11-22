import argparse
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter


def escape_typst_str(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def run_typst(cmd: list[str], env: dict[str, str]) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout or "")
        sys.stderr.write(proc.stderr or "")
        raise RuntimeError(f"Typst command failed ({proc.returncode}): {' '.join(cmd)}")
    return proc


def build_part_typ(
    part_name: str,
    subtitle: str,
    generated_at: str,
    unit_ids: list[str],
    start_page: int = 1,
    total_pages: int | None = None,
) -> str:
    total_arg = str(total_pages) if total_pages is not None else "none"
    lines = [
        '#import "../template.typ": *',
        "#show: book-doc.with(",
        f'  title: "{escape_typst_str(part_name)}",',
        f'  subtitle: "{escape_typst_str(subtitle)}",',
        f'  generated-at: "{escape_typst_str(generated_at)}",',
        "  is-full-book: false,",
        f"  start-page: {start_page},",
        f"  total-pages: {total_arg},",
        ")",
    ]
    for idx, uid in enumerate(unit_ids):
        if idx > 0:
            lines.append("#pagebreak(weak: true)")
        lines.append(
            f'#context metadata((unit_id: "{escape_typst_str(uid)}", page: counter(page).get().first()))'
        )
        lines.append(f'#include "{escape_typst_str(uid)}.typ"')
    return "\n".join(lines) + "\n"


def build_cover_toc_typ(
    book_title: str,
    book_subtitle: str,
    generated_at: str,
    total_book_pages: int,
    part_entries: list[dict],
) -> str:
    toc_lines = [
        "#block(below: 10pt, text(size: 15pt, weight: \"bold\", fill: indigo-dark, \"目次\"))",
        "#set text(size: 8.4pt, fill: slate-dark)",
        "#set par(leading: 0.42em, spacing: 0.35em)",
    ]
    for p_idx, p in enumerate(part_entries):
        top_pad = "2pt" if p_idx == 0 else "7pt"
        toc_lines.append(
            f'#block(above: {top_pad}, below: 3pt, sticky: true, text(size: 9.4pt, weight: "bold", fill: indigo, "{escape_typst_str(p["part_name"])}"))'
        )
        for u in p["units"]:
            label = f'{u["id"]}: {u["title"]}'
            pg = u["global_page"]
            toc_lines.append(
                "#block(above: 0pt, below: 2.2pt, grid(columns: (auto, 1fr, auto), gutter: 5pt, align: (left, bottom, right), "
                f'text(size: 8.2pt, "{escape_typst_str(label)}"), '
                'box(width: 1fr, repeat[#text(fill: slate-muted, size: 7.5pt, ".")]), '
                f'text(size: 8.2pt, weight: "bold", fill: indigo-dark, "{pg}")))'
            )

    custom_toc_block = "[\n  " + "\n  ".join(toc_lines) + "\n]"

    return "\n".join(
        [
            '#import "../template.typ": *',
            "#show: book-doc.with(",
            f'  title: "{escape_typst_str(book_title)}",',
            f'  subtitle: "{escape_typst_str(book_subtitle)}",',
            f'  generated-at: "{escape_typst_str(generated_at)}",',
            "  is-full-book: true,",
            f"  total-pages: {total_book_pages},",
            f"  custom-toc: {custom_toc_block},",
            ")",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Full Book PDF by compiling per-Part Typst PDFs and merging with pypdf."
    )
    parser.add_argument("--root", required=True, help="Repository root directory")
    parser.add_argument("--typst", required=True, help="Path to typst.exe")
    parser.add_argument(
        "--generated-at",
        default=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        help="Timestamp string for cover/footer",
    )
    args = parser.parse_args()

    root_dir = Path(args.root).resolve()
    typst_exe = str(Path(args.typst))
    scripts_dir = root_dir / "scripts"
    gen_dir = root_dir / "typst" / "generated"
    dist_pdf_dir = root_dir / "dist" / "pdf"
    dist_pdf_dir.mkdir(parents=True, exist_ok=True)
    full_pdf_path = dist_pdf_dir / "boki-1kyu-curriculum.pdf"
    tmp_pdf_path = dist_pdf_dir / "boki-1kyu-curriculum.pdf.tmp"

    manifest = json.loads((scripts_dir / "curriculum_manifest.json").read_text(encoding="utf-8"))
    cfg = json.loads((scripts_dir / "typst_config.json").read_text(encoding="utf-8"))

    book_title = cfg["book_title"]
    book_subtitle = cfg["book_subtitle"]

    part_names = {p["id"]: p["name"] for p in manifest["parts"]}
    part_order = [p["id"] for p in manifest["parts"]]

    grouped: dict[str, list[dict]] = {pid: [] for pid in part_order}
    for item in manifest["items"]:
        unit_typ = gen_dir / f"{item['id']}.typ"
        if unit_typ.exists() and item["part"] in grouped:
            grouped[item["part"]].append(item)

    active_parts = [(pid, part_names[pid], grouped[pid]) for pid in part_order if grouped[pid]]
    if not active_parts:
        raise RuntimeError("No generated unit .typ files found to build Full Book PDF.")

    env = os.environ.copy()
    env["RAYON_NUM_THREADS"] = "1"

    # Pass 1: Measure each Part's page count and unit relative start pages
    part_measurements = []
    temp_files_to_clean: list[Path] = []

    for pid, pname, items in active_parts:
        unit_ids = [it["id"] for it in items]
        part_typ = gen_dir / f"book_part_{pid}.typ"
        part_pdf = gen_dir / f"book_part_{pid}.pdf"
        temp_files_to_clean.append(part_pdf)

        part_typ.write_text(
            build_part_typ(pname, book_subtitle, args.generated_at, unit_ids),
            encoding="utf-8",
        )
        run_typst(
            [typst_exe, "compile", "--jobs", "1", "--no-pdf-tags", "--root", str(root_dir), str(part_typ), str(part_pdf)],
            env,
        )
        q_proc = run_typst(
            [typst_exe, "query", "--jobs", "1", "--root", str(root_dir), str(part_typ), "metadata", "--field", "value"],
            env,
        )
        meta_list = json.loads(q_proc.stdout)
        rel_pages = {m["unit_id"]: int(m["page"]) for m in meta_list if isinstance(m, dict) and "unit_id" in m}
        page_count = len(PdfReader(str(part_pdf)).pages)

        part_measurements.append(
            {
                "part_id": pid,
                "part_name": pname,
                "items": items,
                "unit_ids": unit_ids,
                "rel_pages": rel_pages,
                "page_count": page_count,
                "part_typ": part_typ,
                "part_pdf": part_pdf,
            }
        )

    total_content_pages = sum(pm["page_count"] for pm in part_measurements)

    # Pass 2: Compile Cover + Custom TOC until TOC page count converges
    cover_typ = gen_dir / "book_cover_toc.typ"
    cover_pdf = gen_dir / "book_cover_toc.pdf"
    temp_files_to_clean.append(cover_pdf)

    def compile_cover(toc_guess: int):
        total_pages = toc_guess + total_content_pages
        cursor = toc_guess + 1
        toc_parts = []
        for pm in part_measurements:
            p_start = cursor
            units_info = []
            for it in pm["items"]:
                uid = it["id"]
                rel = pm["rel_pages"].get(uid, 1)
                units_info.append(
                    {
                        "id": uid,
                        "title": it["title"],
                        "global_page": p_start + rel - 1,
                    }
                )
            toc_parts.append(
                {
                    "part_id": pm["part_id"],
                    "part_name": pm["part_name"],
                    "start_page": p_start,
                    "units": units_info,
                }
            )
            cursor += pm["page_count"]

        cover_typ.write_text(
            build_cover_toc_typ(book_title, book_subtitle, args.generated_at, total_pages, toc_parts),
            encoding="utf-8",
        )
        run_typst(
            [typst_exe, "compile", "--jobs", "1", "--no-pdf-tags", "--root", str(root_dir), str(cover_typ), str(cover_pdf)],
            env,
        )
        actual_cover_pages = len(PdfReader(str(cover_pdf)).pages)
        return actual_cover_pages, total_pages, toc_parts

    toc_guess = 3
    for _ in range(3):
        actual_toc_pages, total_book_pages, toc_parts = compile_cover(toc_guess)
        if actual_toc_pages == toc_guess:
            break
        toc_guess = actual_toc_pages
    else:
        actual_toc_pages, total_book_pages, toc_parts = compile_cover(toc_guess)

    # Pass 3: Recompile each Part with continuous global page numbering
    for pm, tp in zip(part_measurements, toc_parts):
        pm["part_typ"].write_text(
            build_part_typ(
                pm["part_name"],
                book_subtitle,
                args.generated_at,
                pm["unit_ids"],
                start_page=tp["start_page"],
                total_pages=total_book_pages,
            ),
            encoding="utf-8",
        )
        run_typst(
            [typst_exe, "compile", "--jobs", "1", "--no-pdf-tags", "--root", str(root_dir), str(pm["part_typ"]), str(pm["part_pdf"])],
            env,
        )
        new_count = len(PdfReader(str(pm["part_pdf"])).pages)
        if new_count != pm["page_count"]:
            raise RuntimeError(
                f"Page count drift in Part {pm['part_id']}: measured {pm['page_count']}, recompiled {new_count}"
            )

    # Pass 4: Merge Cover+TOC and all Parts + clickable Outline bookmarks
    writer = PdfWriter()
    writer.append(str(cover_pdf))
    for pm, tp in zip(part_measurements, toc_parts):
        writer.append(str(pm["part_pdf"]))
        parent_bm = writer.add_outline_item(tp["part_name"], tp["start_page"] - 1)
        for u in tp["units"]:
            writer.add_outline_item(
                f"{u['id']}: {u['title']}",
                u["global_page"] - 1,
                parent=parent_bm,
            )

    try:
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    except Exception:
        pass

    with open(tmp_pdf_path, "wb") as f:
        writer.write(f)

    merged_pages = len(PdfReader(str(tmp_pdf_path)).pages)
    if merged_pages != total_book_pages:
        raise RuntimeError(f"Merged PDF page mismatch: expected {total_book_pages}, got {merged_pages}")

    os.replace(tmp_pdf_path, full_pdf_path)

    for tf in temp_files_to_clean:
        try:
            if tf.exists():
                tf.unlink()
        except Exception:
            pass

    size_mb = full_pdf_path.stat().st_size / (1024 * 1024)
    total_units = sum(len(tp["units"]) for tp in toc_parts)
    print(f"[FULL BOOK PARTS MERGE PASS] Pages: {merged_pages}, Units: {total_units}, Size: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
