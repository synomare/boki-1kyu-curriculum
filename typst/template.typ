// Typst 0.15+ Publication-Quality Template for Boki 3->1 Curriculum

#let indigo-dark = rgb("#1E1B4B")
#let indigo = rgb("#3730A3")
#let indigo-soft = rgb("#EEF2FF")
#let emerald = rgb("#0F766E")
#let emerald-soft = rgb("#ECFDF5")
#let amber = rgb("#B45309")
#let amber-soft = rgb("#FEF3C7")
#let slate-dark = rgb("#1E293B")
#let slate-muted = rgb("#64748B")
#let slate-bg = rgb("#F8FAFC")
#let slate-line = rgb("#CBD5E1")

#let book-doc(
  title: "日商簿記 3級→1級 貫通カリキュラム",
  subtitle: "2027年4月改定・新リース会計基準（第34号）完全準拠",
  generated-at: "",
  is-full-book: true,
  doc
) = {
  set document(title: title, author: "Boki 1-Kyu Curriculum Studio")

  set page(
    paper: "a4",
    margin: (top: 22mm, bottom: 22mm, left: 18mm, right: 18mm),
    header: context {
      if counter(page).get().first() > 1 or not is-full-book {
        set text(size: 8pt, fill: slate-muted, font: ("Yu Gothic", "BIZ UDPGothic", "Meiryo"))
        grid(
          columns: (1fr, auto),
          align: (left, right),
          [日商簿記 3級→1級 貫通カリキュラム（2027年新区分対応）],
          [#title],
        )
        v(-4pt)
        line(length: 100%, stroke: 0.4pt + slate-line)
      }
    },
    footer: context {
      if counter(page).get().first() > 1 or not is-full-book {
        set text(size: 8.5pt, fill: slate-muted, font: ("Yu Gothic", "BIZ UDPGothic", "Meiryo"))
        align(center)[#counter(page).display("1 / 1", both: true)]
      }
    }
  )

  set text(
    font: ("Yu Gothic", "BIZ UDPGothic", "Meiryo"),
    size: 9.5pt,
    fill: slate-dark,
    lang: "ja",
    region: "jp"
  )
  set par(leading: 0.78em, spacing: 0.85em)

  show heading: set block(sticky: true)

  show heading.where(level: 1): it => {
    v(4pt)
    block(
      width: 100%,
      below: 12pt,
      stroke: (bottom: 1.5pt + indigo),
      inset: (bottom: 6pt),
      text(size: 16pt, weight: "bold", fill: indigo-dark, it.body)
    )
  }

  show heading.where(level: 2): it => {
    v(10pt)
    block(
      width: 100%,
      fill: rgb("#F1F5F9"),
      stroke: (left: 4pt + indigo),
      inset: (x: 10pt, y: 6.5pt),
      radius: (right: 4pt),
      below: 8pt,
      text(size: 11.5pt, weight: "bold", fill: indigo-dark, it.body)
    )
  }

  show heading.where(level: 3): it => {
    v(7pt)
    block(
      below: 5pt,
      text(size: 10.2pt, weight: "bold", fill: indigo, it.body)
    )
  }

  show heading.where(level: 4): it => {
    v(5pt)
    block(
      below: 4pt,
      text(size: 9.5pt, weight: "bold", fill: slate-dark, it.body)
    )
  }

  if is-full-book {
    // Cover Page
    v(1fr)
    block(
      width: 100%,
      stroke: (left: 6pt + indigo),
      inset: (left: 18pt, y: 12pt),
      [
        #box(
          fill: amber-soft,
          inset: (x: 8pt, y: 3pt),
          radius: 99pt,
          text(size: 8.5pt, weight: "bold", fill: amber, "2027年4月改定・新基準完全準拠")
        )
        #v(10pt)
        #text(size: 24pt, weight: "bold", fill: indigo-dark, title)
        #v(6pt)
        #text(size: 12pt, fill: slate-muted, subtitle)
        #v(14pt)
        #text(size: 9.5pt, fill: slate-dark)[
          丸暗記・語呂合わせを一切排し、経済的実態・5要素・会計理論から論理導出する\
          「アンラーン・ゼロ」の3級→2級→1級 縦貫オリジナルテキスト
        ]
      ]
    )
    v(1.2fr)
    line(length: 100%, stroke: 0.6pt + slate-line)
    grid(
      columns: (1fr, auto),
      align: (left, right),
      text(size: 8.5pt, fill: slate-muted, "発行：Boki 1-Kyu Curriculum Studio（128-bit Decimal 検算済）"),
      text(size: 8.5pt, fill: slate-muted, if generated-at != "" { "生成日時: " + generated-at } else { "" })
    )
    pagebreak()

    // Table of Contents
    outline(
      title: text(size: 15pt, weight: "bold", fill: indigo-dark, "目次"),
      depth: 2,
      indent: 1.2em
    )
    pagebreak()
  }

  doc
}

#let ascii-box(code) = {
  block(
    width: 100%,
    breakable: false,
    fill: slate-bg,
    stroke: 0.7pt + rgb("#94A3B8"),
    radius: 4pt,
    inset: (x: 9pt, y: 8pt),
    {
      set text(font: ("BIZ UDGothic", "Consolas", "MS Gothic"), size: 7.4pt, fill: slate-dark)
      set par(leading: 0.48em, spacing: 0.48em)
      code
    }
  )
}

#let callout-box(kind: "note", body) = {
  let stroke-col = indigo
  let bg-col = indigo-soft
  if kind == "trap" {
    stroke-col = amber
    bg-col = amber-soft
  } else if kind == "example" or kind == "core" {
    stroke-col = emerald
    bg-col = emerald-soft
  }
  block(
    width: 100%,
    fill: bg-col,
    stroke: (left: 3.5pt + stroke-col),
    radius: (right: 4pt),
    inset: (x: 10pt, y: 8pt),
    body
  )
}

#let check-item(body) = {
  block(
    below: 4.5pt,
    grid(
      columns: (12pt, 1fr),
      gutter: 4pt,
      align: (center + horizon, left),
      box(width: 7.5pt, height: 7.5pt, stroke: 0.75pt + indigo, radius: 1.2pt),
      body
    )
  )
}

#let styled-table(columns: auto, aligns: (), is-journal: false, ..cells) = {
  let all-cells = cells.pos()
  let col-count = aligns.len()
  if col-count == 0 { col-count = 1 }
  let header-cells = all-cells.slice(0, col-count)
  let body-cells = all-cells.slice(col-count)

  let tbl-align = (col, row) => {
    if col < aligns.len() { aligns.at(col) } else { left }
  }

  block(
    width: 100%,
    {
      set text(size: if is-journal { 8.8pt } else { 8.4pt })
      show raw: it => {
        let s = it.text.replace("_", "_\u{200B}")
        text(font: ("BIZ UDGothic", "Consolas", "Yu Gothic"), size: 7.5pt, s)
      }
      table(
        columns: columns,
        align: tbl-align,
        inset: (x: 6pt, y: 4.5pt),
        stroke: 0.45pt + slate-line,
        fill: (col, row) => if row == 0 { indigo-soft } else if calc.odd(row) { white } else { rgb("#FAFBFD") },
        table.header(
          ..header-cells.map(c => text(weight: "bold", fill: indigo-dark, c))
        ),
        ..body-cells.enumerate().map(((i, c)) => {
          let col-idx = calc.rem(i, col-count)
          if is-journal and col-idx < aligns.len() and aligns.at(col-idx) == right {
            text(font: ("BIZ UDGothic", "Consolas", "Yu Gothic"), c)
          } else {
            c
          }
        })
      )
    }
  )
}

#let curriculum-flow-diagram() = {
  let stage-box(title, sub, col, bg) = block(
    width: 100%,
    fill: bg,
    stroke: 0.8pt + col,
    radius: 5pt,
    inset: 7pt,
    [
      #text(size: 8.5pt, weight: "bold", fill: col, title)
      #v(2pt)
      #text(size: 7.5pt, fill: slate-dark, sub)
    ]
  )
  block(
    width: 100%,
    breakable: false,
    fill: slate-bg,
    stroke: 0.6pt + slate-line,
    radius: 6pt,
    inset: 10pt,
    [
      #align(center, text(size: 9pt, weight: "bold", fill: indigo-dark, "3級 → 2級 → 1級 貫通カリキュラム・アーキテクチャ"))
      #v(6pt)
      #grid(
        columns: (1fr, auto, 1fr, auto, 1fr, auto, 1fr),
        gutter: 4pt,
        align: horizon,
        stage-box("00_guide 基盤 (4巻)", "設計思想 / 全体マップ\n下書き10型 / 会計理論OS", slate-dark, white),
        text(weight: "bold", fill: indigo, "→"),
        stage-box("Part I: 3級 (10単元)", "5要素・複式簿記\n三分法＆売上原価対立法\n定額/定率・除却/廃棄", emerald, emerald-soft),
        text(weight: "bold", fill: indigo, "→"),
        stage-box("Part II/III: 2級 (20単元)", "商簿: 収益認識/新リース基礎/連結\n工簿: シュラッター図/総合/CVP", indigo, indigo-soft),
        text(weight: "bold", fill: indigo, "→"),
        stage-box("Part IV/V: 1級 (25単元)", "商会: 利息法/減損/ARO/新リース完全/企業結合\n工原: 非度外視/配合歩留/ABC/NPV", amber, amber-soft),
      )
    ]
  )
}
