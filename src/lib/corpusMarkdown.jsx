/** Lightweight corpus markdown → React (GFM tables, headings, fenced pre). */

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableSeparator(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim())
}

function parseBlocks(markdown) {
  const lines = String(markdown ?? '').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i += 1
      }
      const rows = tableLines.filter((row) => !isTableSeparator(row)).map(parseTableRow)
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }

    if (line.trim().startsWith('```')) {
      const fence = line.trim()
      const lang = fence.slice(3).trim()
      i += 1
      const codeLines = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      i += 1
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    const para = []
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('```') && !/^#{1,4}\s/.test(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    if (para.length) blocks.push({ type: 'paragraph', text: para.join(' ') })
  }

  return blocks
}

export function CorpusMarkdownBody({ markdown }) {
  const blocks = parseBlocks(markdown)

  return (
    <div className="corpus-markdown-body">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = `h${Math.min(block.level + 2, 6)}`
          return (
            <Tag key={index} className={`corpus-md-h corpus-md-h${block.level}`}>
              {block.text}
            </Tag>
          )
        }
        if (block.type === 'paragraph') {
          return (
            <p key={index} className="corpus-md-p">
              {block.text}
            </p>
          )
        }
        if (block.type === 'code') {
          return (
            <pre key={index} className="corpus-md-pre">
              <code>{block.text}</code>
            </pre>
          )
        }
        if (block.type === 'table') {
          const [head, ...body] = block.rows
          return (
            <div key={index} className="corpus-md-table-wrap">
              <table className="corpus-md-table">
                {head ? (
                  <thead>
                    <tr>
                      {head.map((cell, ci) => (
                        <th key={ci}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
