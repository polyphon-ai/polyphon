import React from 'react';

interface SearchSnippetProps {
  snippet: string;
}

export function SearchSnippet({ snippet }: SearchSnippetProps) {
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const nodes: React.ReactNode[] = [];
  let inMark = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '<mark>') {
      inMark = true;
    } else if (part === '</mark>') {
      inMark = false;
    } else if (part) {
      if (inMark) {
        nodes.push(
          <mark key={i} className="search-highlight rounded-sm px-0.5">
            {part}
          </mark>,
        );
      } else {
        nodes.push(part);
      }
    }
  }

  return <span>{nodes}</span>;
}
