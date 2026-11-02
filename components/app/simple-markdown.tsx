import * as React from "react";

/**
 * Markdown minimal rendu en éléments React (jamais de HTML injecté) : titres « # »,
 * listes « - » ou « 1. », paragraphes, **gras**, *italique*, `code` et liens
 * [texte](https://…). Tout le reste reste du texte. Sert au brief de la Mission.
 */
export function SimpleMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? "text-h3 font-semibold" : "text-body font-semibold";
      blocks.push(<p key={key++} className={`${cls} mt-4 first:mt-0`}>{inline(heading[2])}</p>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key++} className={`mt-2 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </List>
      );
      continue;
    }
    if (/^\|/.test(line.trim())) {
      // Tableau : rendu en lignes simples, cellules séparées.
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        const cells = lines[i++].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      blocks.push(
        <div key={key++} className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-small">
            <tbody className="divide-y divide-border">
              {rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={`py-1.5 pr-3 align-top ${j === 0 ? "font-semibold" : ""}`}>{inline(c)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+\.)\s+|\|)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(<p key={key++} className="mt-2 first:mt-0">{inline(para.join(" "))}</p>);
  }
  return <div className={className}>{blocks}</div>;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={n++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={n++} className="rounded bg-surface px-1">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(<a key={n++} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">{label}</a>);
    } else out.push(<em key={n++}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
