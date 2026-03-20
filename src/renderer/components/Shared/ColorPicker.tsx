import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { PRESET_COLORS, PRESET_COLOR_NAMES } from '../../../shared/constants';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Colors to disable (already in use by other voices). */
  excludedColors?: Set<string>;
  /** Show a gray "no color" swatch as the first option. */
  includeGray?: boolean;
}

const GRAY = '#6b7280';

export function ColorPicker({ value, onChange, excludedColors, includeGray }: ColorPickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  // Track the last preset/gray value so X can revert to it when custom is active
  const lastPresetRef = useRef<string>(value);

  const isPreset = PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number]);
  const isGray = value === GRAY;
  const isCustom = !isPreset && !isGray;

  if (!isCustom) {
    lastPresetRef.current = value;
  }

  function swatchClass(selected: boolean, disabled = false): string {
    if (disabled) return 'opacity-25 cursor-not-allowed';
    return `transition-transform ${selected ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-110'}`;
  }

  function handleCancelCustom() {
    onChange(lastPresetRef.current);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {includeGray && (
        <button
          type="button"
          onClick={() => onChange(GRAY)}
          title="No color"
          aria-label="No color"
          aria-pressed={isGray}
          className={`w-6 h-6 rounded-full ${swatchClass(isGray)}`}
          style={{ backgroundColor: GRAY }}
        />
      )}

      {PRESET_COLORS.map((c) => {
        const disabled = excludedColors?.has(c) ?? false;
        return (
          <button
            key={c}
            type="button"
            onClick={() => !disabled && onChange(c)}
            disabled={disabled}
            title={disabled ? 'Already in use' : (PRESET_COLOR_NAMES[c] ?? c)}
            aria-label={`Color: ${PRESET_COLOR_NAMES[c] ?? c}${disabled ? ' (already in use)' : ''}`}
            aria-pressed={value === c}
            className={`w-6 h-6 rounded-full ${swatchClass(value === c, disabled)}`}
            style={{ backgroundColor: c }}
          />
        );
      })}

      {/* Custom color swatch — clicking opens the native color picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={isCustom ? value : 'Custom color…'}
        aria-label={isCustom ? `Custom color: ${value}` : 'Choose a custom color'}
        aria-pressed={isCustom}
        className={`w-6 h-6 rounded-full ${swatchClass(isCustom)} overflow-hidden relative`}
        style={isCustom ? { backgroundColor: value } : undefined}
      >
        {!isCustom && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
              opacity: 0.85,
            }}
          />
        )}
      </button>
      <input
        ref={inputRef}
        type="color"
        value={isCustom ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      {/* Cancel custom — only shown when a custom colour is active */}
      {isCustom && (
        <button
          type="button"
          onClick={handleCancelCustom}
          title="Cancel custom color"
          aria-label="Cancel custom color"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
