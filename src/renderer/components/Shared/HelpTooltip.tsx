import React from 'react';
import { HelpCircle } from 'lucide-react';

export function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1 align-middle">
      <HelpCircle
        size={12}
        strokeWidth={1.75}
        className="text-gray-400 dark:text-gray-500 cursor-help"
      />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 px-2.5 py-1.5 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 text-center leading-snug">
        {text}
      </span>
    </span>
  );
}
