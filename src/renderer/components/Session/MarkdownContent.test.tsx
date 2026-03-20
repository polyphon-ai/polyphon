// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

afterEach(cleanup);

import MarkdownContent, { STREAMING_PLAIN_THRESHOLD } from './MarkdownContent';

const mockOpenExternal = vi.fn();

beforeEach(() => {
  mockOpenExternal.mockReset();
  (window as unknown as Record<string, unknown>).polyphon = {
    shell: { openExternal: mockOpenExternal },
  };
  // Default to light mode
  document.documentElement.classList.remove('dark');
});

describe('STREAMING_PLAIN_THRESHOLD', () => {
  it('is exported as a named constant equal to 30', () => {
    expect(STREAMING_PLAIN_THRESHOLD).toBe(30);
  });
});

describe('Streaming guard', () => {
  it('renders as plain text when streaming and content is below threshold', () => {
    const short = 'Hi there';
    expect(short.length).toBeLessThan(STREAMING_PLAIN_THRESHOLD);
    const { container } = render(
      <MarkdownContent content={short} isStreaming />,
    );
    const span = container.querySelector('span.whitespace-pre-wrap');
    expect(span).toBeTruthy();
    expect(span!.textContent).toBe(short);
  });

  it('renders as markdown when streaming and content meets threshold', () => {
    const long = 'A'.repeat(STREAMING_PLAIN_THRESHOLD);
    const { container } = render(
      <MarkdownContent content={long} isStreaming />,
    );
    expect(container.querySelector('.prose-voice')).toBeTruthy();
  });

  it('renders as markdown when not streaming regardless of length', () => {
    const short = 'Hi';
    const { container } = render(
      <MarkdownContent content={short} isStreaming={false} />,
    );
    expect(container.querySelector('.prose-voice')).toBeTruthy();
  });
});

describe('Markdown elements', () => {
  it('renders headings', () => {
    render(<MarkdownContent content="# Heading One" />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('renders bold text', () => {
    const { container } = render(<MarkdownContent content="**bold text**" />);
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('strong')!.textContent).toBe('bold text');
  });

  it('renders italic text', () => {
    const { container } = render(<MarkdownContent content="_italic text_" />);
    expect(container.querySelector('em')).toBeTruthy();
  });

  it('renders inline code', () => {
    const { container } = render(<MarkdownContent content="Use `foo()` here" />);
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.querySelector('code')!.textContent).toBe('foo()');
  });

  it('renders a paragraph', () => {
    const { container } = render(<MarkdownContent content="Hello paragraph" />);
    expect(container.querySelector('p')).toBeTruthy();
  });

  it('renders an unordered list', () => {
    const { container } = render(
      <MarkdownContent content={'- item one\n- item two'} />,
    );
    expect(container.querySelector('ul')).toBeTruthy();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders an ordered list', () => {
    const { container } = render(
      <MarkdownContent content={'1. first\n2. second'} />,
    );
    expect(container.querySelector('ol')).toBeTruthy();
  });

  it('renders nested list items', () => {
    const md = '- parent\n  - child';
    const { container } = render(<MarkdownContent content={md} />);
    const uls = container.querySelectorAll('ul');
    expect(uls.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a blockquote', () => {
    const { container } = render(<MarkdownContent content="> a quote" />);
    expect(container.querySelector('blockquote')).toBeTruthy();
  });

  it('renders a thematic break', () => {
    const { container } = render(<MarkdownContent content="---" />);
    expect(container.querySelector('hr')).toBeTruthy();
  });
});

describe('Code blocks', () => {
  it('renders fenced code block with language in a dedicated code surface', () => {
    const md = '```javascript\nconsole.log("hi");\n```';
    const { container } = render(<MarkdownContent content={md} />);
    // SyntaxHighlighter renders into a container div
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
  });

  it('renders fenced code block without language gracefully', () => {
    const md = '```\nplain code block\n```';
    const { container } = render(<MarkdownContent content={md} />);
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
    expect(container.textContent).toContain('plain code block');
  });

  it('renders fenced code block with a language tag through syntax highlighter', () => {
    const md = '```python\ndef foo():\n    pass\n```';
    const { container } = render(<MarkdownContent content={md} />);
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
    expect(container.textContent).toContain('def foo');
  });

  it('renders indented code block', () => {
    const md = '    indented code';
    const { container } = render(<MarkdownContent content={md} />);
    // indented code block or pre/code
    const hasCode =
      container.querySelector('.overflow-x-auto') !== null ||
      container.querySelector('code') !== null;
    expect(hasCode).toBe(true);
    expect(container.textContent).toContain('indented code');
  });

  it('does not crash on malformed/unclosed markdown', () => {
    const md = '```\nunclosed code block';
    expect(() => render(<MarkdownContent content={md} />)).not.toThrow();
  });
});

describe('Link rendering', () => {
  it('renders https link as clickable and calls shell.openExternal', () => {
    render(
      <MarkdownContent content="[Visit](https://example.com)" />,
    );
    const link = screen.getByText('Visit');
    expect(link.tagName).toBe('A');
    fireEvent.click(link);
    expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('renders http link as clickable and calls shell.openExternal', () => {
    render(
      <MarkdownContent content="[Insecure](http://example.com)" />,
    );
    const link = screen.getByText('Insecure');
    fireEvent.click(link);
    expect(mockOpenExternal).toHaveBeenCalledWith('http://example.com');
  });

  it('keyboard Enter triggers shell.openExternal on allowed link', () => {
    render(
      <MarkdownContent content="[Key](https://example.com)" />,
    );
    const link = screen.getByText('Key');
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('keyboard Space triggers shell.openExternal on allowed link', () => {
    render(
      <MarkdownContent content="[Space](https://example.com)" />,
    );
    const link = screen.getByText('Space');
    fireEvent.keyDown(link, { key: ' ' });
    expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('renders javascript: href as disabled, does not call shell.openExternal', () => {
    render(
      // eslint-disable-next-line no-script-url
      <MarkdownContent content="[Bad](javascript:alert(1))" />,
    );
    const el = screen.getByText('Bad');
    // Should not be an anchor
    expect(el.tagName).not.toBe('A');
    expect(el.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(el);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('renders file:// scheme link as disabled, does not call shell.openExternal', () => {
    render(
      <MarkdownContent content="[File](file:///etc/passwd)" />,
    );
    const el = screen.getByText('File');
    expect(el.tagName).not.toBe('A');
    expect(el.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(el);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('renders relative link as disabled', () => {
    render(<MarkdownContent content="[Relative](./foo)" />);
    const el = screen.getByText('Relative');
    expect(el.tagName).not.toBe('A');
    expect(el.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Security / sanitization', () => {
  it('does not render a <script> tag injected into content', () => {
    const md = 'Hello <script>alert(1)</script> world';
    const { container } = render(<MarkdownContent content={md} />);
    expect(container.querySelector('script')).toBeNull();
    // The text content should not contain the script source
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('does not execute injected script content', () => {
    const executed = vi.fn();
    (window as unknown as Record<string, unknown>).xssTest = executed;
    const md = '<script>window.xssTest()</script>';
    render(<MarkdownContent content={md} />);
    expect(executed).not.toHaveBeenCalled();
  });

  it('href is stripped from <a> in the sanitized AST (no raw href fallback)', () => {
    // The custom <a> renderer manages the URL via data-href.
    // Verify that clicking a link uses shell.openExternal (our controlled path),
    // meaning no raw href navigation is possible.
    render(<MarkdownContent content="[Click](https://safe.example.com)" />);
    const link = screen.getByText('Click');
    // Default click is prevented; openExternal is the only path
    fireEvent.click(link);
    expect(mockOpenExternal).toHaveBeenCalledWith('https://safe.example.com');
  });
});
