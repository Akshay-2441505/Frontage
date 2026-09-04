import { useMemo } from 'react'

/* Minimal JSON syntax colouring. The raw manifest is still worth showing — it is
   the actual artifact an agent fetches — but it belongs behind a disclosure and
   readable, not as the headline view. */

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

function highlight(json) {
  const out = []
  let last = 0
  let match

  while ((match = TOKEN.exec(json)) !== null) {
    if (match.index > last) out.push(json.slice(last, match.index))
    const [full, str, colon, bool, num] = match

    if (str !== undefined) {
      out.push(
        <span key={match.index} className={colon ? 'tok-key' : 'tok-str'}>
          {str}
        </span>,
      )
      if (colon) out.push(colon)
    } else if (bool !== undefined) {
      out.push(
        <span key={match.index} className="tok-bool">
          {bool}
        </span>,
      )
    } else if (num !== undefined) {
      out.push(
        <span key={match.index} className="tok-num">
          {num}
        </span>,
      )
    } else {
      out.push(full)
    }
    last = match.index + full.length
  }

  if (last < json.length) out.push(json.slice(last))
  return out
}

export default function JsonBlock({ value, maxChars = 60000 }) {
  const parts = useMemo(() => {
    let text
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      return ['Could not render this response as JSON.']
    }
    if (text.length > maxChars) {
      text = `${text.slice(0, maxChars)}\n\n… truncated for display (${text.length} characters total).`
    }
    return highlight(text)
  }, [value, maxChars])

  return <pre className="code-block">{parts}</pre>
}
