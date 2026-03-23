import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'hast-util-sanitize';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import darkTheme from 'react-syntax-highlighter/dist/esm/styles/prism/tomorrow';
import lightTheme from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { visit, SKIP } from 'unist-util-visit';
import type { Root } from 'mdast';

SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('go', go);

export const STREAMING_PLAIN_THRESHOLD = 30;

// Remark plugin: copies link URL to data-href before rehype-sanitize strips href
// from the hast. This ensures our custom <a> renderer receives the original URL
// even though the sanitize schema strips the href attribute.
function remarkLinkDataHref() {
  return (tree: Root) => {
    visit(tree, 'link', (node) => {
      node.data = node.data ?? {};
      (node.data as Record<string, unknown>).hProperties = {
        ...((node.data as Record<string, unknown>).hProperties as object ?? {}),
        'data-href': node.url,
      };
    });
  };
}

// Custom sanitize schema: strips href from <a> elements so the sanitizer never
// passes it through as a fallback. Our custom <a> renderer manages the URL
// via data-href set by remarkLinkDataHref. Also allows <mark> for search highlights.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
  attributes: {
    ...defaultSchema.attributes,
    mark: ['className'],
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter(
        (attr) => attr !== 'href' && !(Array.isArray(attr) && attr[0] === 'href'),
      ),
      'data-href',
    ],
  },
};

// Rehype plugin: wraps occurrences of `query` in text nodes with <mark class="search-highlight">.
// Skips text nodes inside <code> or <pre> to avoid breaking syntax highlighting.
function makeRehypeHighlight(query: string) {
  return function rehypeHighlight() {
    return (tree: Parameters<typeof visit>[0]) => {
      if (!query.trim()) return;
      const lowerQuery = query.toLowerCase();
      const queryLen = query.length;
      visit(tree, 'text', (node, index, parent) => {
        if (!parent || index == null) return;
        const p = parent as { tagName?: string; children: unknown[] };
        if (p.tagName === 'code' || p.tagName === 'pre') return;
        const text = (node as { value: string }).value;
        const lowerText = text.toLowerCase();
        if (!lowerText.includes(lowerQuery)) return;
        const newNodes: unknown[] = [];
        let pos = 0;
        let matchIdx = lowerText.indexOf(lowerQuery, pos);
        while (matchIdx !== -1) {
          if (matchIdx > pos) {
            newNodes.push({ type: 'text', value: text.slice(pos, matchIdx) });
          }
          newNodes.push({
            type: 'element',
            tagName: 'mark',
            properties: { className: ['search-highlight'] },
            children: [{ type: 'text', value: text.slice(matchIdx, matchIdx + queryLen) }],
          });
          pos = matchIdx + queryLen;
          matchIdx = lowerText.indexOf(lowerQuery, pos);
        }
        if (pos < text.length) {
          newNodes.push({ type: 'text', value: text.slice(pos) });
        }
        (p.children as unknown[]).splice(index, 1, ...newNodes);
        return [SKIP, index + newNodes.length];
      });
    };
  };
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function CustomLink({
  children,
  'data-href': dataHref,
}: React.PropsWithChildren<{ 'data-href'?: string }>) {
  const href = dataHref ?? '';
  let scheme = '';
  try {
    scheme = new URL(href).protocol;
  } catch {
    // not a valid absolute URL — treat as disabled
  }
  const isAllowed = scheme === 'https:' || scheme === 'http:';

  const handleActivate = () => {
    if (isAllowed) {
      window.polyphon.shell.openExternal(href);
    }
  };

  if (!isAllowed) {
    return (
      <span
        className="cursor-not-allowed opacity-50 line-through"
        aria-disabled="true"
        tabIndex={-1}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      rel="noreferrer noopener"
      onClick={(e) => {
        e.preventDefault();
        handleActivate();
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {children}
    </a>
  );
}

export interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  searchQuery?: string;
}

export default function MarkdownContent({
  content,
  isStreaming = false,
  searchQuery,
}: MarkdownContentProps): React.JSX.Element {
  const isDark = useIsDark();

  if (isStreaming && content.length < STREAMING_PLAIN_THRESHOLD) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }

  const rehypePlugins: Parameters<typeof ReactMarkdown>[0]['rehypePlugins'] = searchQuery
    ? [makeRehypeHighlight(searchQuery), [rehypeSanitize, sanitizeSchema]]
    : [[rehypeSanitize, sanitizeSchema]];

  return (
    <div className="prose-voice">
      <ReactMarkdown
        remarkPlugins={[remarkLinkDataHref]}
        rehypePlugins={rehypePlugins}
        components={{
          a: ({ children, ...props }) => {
            const dataHref = (props as Record<string, unknown>)['data-href'] as
              | string
              | undefined;
            return <CustomLink data-href={dataHref}>{children}</CustomLink>;
          },
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className ?? '');
            const isBlock =
              match !== null || String(children).includes('\n');

            if (isBlock) {
              const lang = match?.[1];
              const code = String(children).replace(/\n$/, '');
              return (
                <div className="overflow-x-auto my-2">
                  <SyntaxHighlighter
                    language={lang ?? 'text'}
                    style={isDark ? darkTheme : lightTheme}
                    PreTag="div"
                    customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.85em' }}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return (
              <code className="px-1 py-0.5 rounded text-[0.85em] font-mono bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
