import clsx from 'clsx'
import { useRef, useState } from 'react'

import { useColorTheme } from '@/lib/colorTheme'

/**
 * Professional color picker for per-user theme customization.
 * Users can pick any color using a visual picker or enter hex codes.
 * Color preference persists per user/browser via localStorage.
 */
export function ColorThemeSwitcher() {
  const colorTheme = useColorTheme((s) => s.colorTheme)
  const setColorTheme = useColorTheme((s) => s.setColorTheme)

  const [showPicker, setShowPicker] = useState(false)
  const [hexInput, setHexInput] = useState(colorTheme)
  const pickerRef = useRef(null)
  const inputRef = useRef(null)

  // Preset colors for quick access
  const presets = [
    { name: 'Indigo', hex: '#1e1b4b' },
    { name: 'Blue', hex: '#2563eb' },
    { name: 'Purple', hex: '#7c3aed' },
    { name: 'Pink', hex: '#db2777' },
    { name: 'Red', hex: '#dc2626' },
    { name: 'Orange', hex: '#ea580c' },
    { name: 'Amber', hex: '#d97706' },
    { name: 'Green', hex: '#059669' },
    { name: 'Teal', hex: '#0d9488' },
    { name: 'Cyan', hex: '#0891b2' },
    { name: 'Slate', hex: '#475569' },
    { name: 'Gray', hex: '#6b7280' },
  ]

  const handleColorChange = (hex) => {
    setHexInput(hex)
    setColorTheme(hex)
  }

  const handleHexInput = (e) => {
    const value = e.target.value
    setHexInput(value)
    // Apply if valid hex
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setColorTheme(value)
    }
  }

  const handlePickerChange = (e) => {
    const hex = e.target.value
    handleColorChange(hex)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-body-lg font-medium text-ink">Accent Color</p>
        <p className="text-body-md text-ink-muted mt-0.5">
          Choose your preferred accent color for buttons, links, and highlights.
        </p>
      </div>

      {/* Current color display and native picker */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <div
            className="w-14 h-14 rounded-lg border-2 border-border shadow-sm cursor-pointer hover:shadow-level2 transition-shadow"
            style={{ backgroundColor: colorTheme }}
            title="Click to open color picker"
            onClick={() => inputRef.current?.click()}
          />
          <input
            ref={inputRef}
            type="color"
            value={colorTheme}
            onChange={handlePickerChange}
            className="hidden"
            aria-label="Pick accent color"
          />
        </div>

        <div className="flex-1 min-w-0">
          <label className="block text-body-sm font-medium text-ink-muted mb-1.5">
            Hex Code
          </label>
          <input
            type="text"
            value={hexInput}
            onChange={handleHexInput}
            placeholder="#1e1b4b"
            maxLength="7"
            className="input w-full font-mono text-body-md"
            aria-label="Enter hex color code"
          />
        </div>
      </div>

      {/* Preset colors */}
      <div>
        <p className="text-body-sm font-medium text-ink-muted mb-2.5">Quick presets</p>
        <div className="grid grid-cols-6 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => handleColorChange(preset.hex)}
              className={clsx(
                'relative w-full aspect-square rounded-lg border-2 transition-all hover:shadow-level2',
                colorTheme === preset.hex
                  ? 'border-secondary shadow-level2 ring-2 ring-secondary/30'
                  : 'border-border-subtle hover:border-border-strong',
              )}
              style={{ backgroundColor: preset.hex }}
              title={preset.name}
              aria-label={`${preset.name} - ${preset.hex}`}
              aria-pressed={colorTheme === preset.hex}
            >
              {colorTheme === preset.hex && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white shadow-md" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Info message */}
      <p className="text-body-sm text-ink-faint bg-surface-sunken p-3 rounded-lg">
        Your color choice is saved to this browser and will persist when you return.
      </p>
    </div>
  )
}
