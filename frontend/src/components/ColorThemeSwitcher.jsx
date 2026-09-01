import clsx from 'clsx'
import { useRef, useState, useEffect } from 'react'

import { useColorTheme } from '@/lib/colorTheme'

/**
 * Professional color picker for per-user accent customization.
 * Color is persisted in localStorage and restored on next login.
 * Users only need to set it once.
 */
export function ColorThemeSwitcher() {
  const colorTheme = useColorTheme((s) => s.colorTheme)
  const setColorTheme = useColorTheme((s) => s.setColorTheme)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hue, setHue] = useState(235) // 0-360
  const [saturation, setSaturation] = useState(65) // 0-100
  const [lightness, setLightness] = useState(30) // 0-100
  const [hexInput, setHexInput] = useState(colorTheme)

  const inputRef = useRef(null)

  // Convert HSL to hex
  const hslToHex = (h, s, l) => {
    h /= 360
    s /= 100
    l /= 100
    const k = (n) => (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n) => {
      const k2 = k(n)
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k2 - 3, Math.min(9 - k2, 1)))))
    }
    return `#${f(0).toString(16).padStart(2, '0')}${f(8).toString(16).padStart(2, '0')}${f(4).toString(16).padStart(2, '0')}`
  }

  // Convert hex to HSL
  const hexToHsl = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return { h: 235, s: 65, l: 30 }
    let r = parseInt(result[1], 16) / 255
    let g = parseInt(result[2], 16) / 255
    let b = parseInt(result[3], 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h, s, l = (max + min) / 2
    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break
        case g: h = (b - r) / d + 2; break
        case b: h = (r - g) / d + 4; break
      }
      h /= 6
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
  }

  // Sync HSL with current color on mount
  useEffect(() => {
    const { h, s, l } = hexToHsl(colorTheme)
    setHue(h)
    setSaturation(s)
    setLightness(l)
    setHexInput(colorTheme)
  }, [colorTheme])

  const handleColorChange = (hex) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return
    setHexInput(hex)
    setColorTheme(hex)
    const { h, s, l } = hexToHsl(hex)
    setHue(h)
    setSaturation(s)
    setLightness(l)
  }

  const handleHexInput = (e) => {
    const value = e.target.value
    setHexInput(value)
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      handleColorChange(value)
    }
  }

  const handleHueChange = (e) => {
    const h = parseInt(e.target.value, 10)
    setHue(h)
    handleColorChange(hslToHex(h, saturation, lightness))
  }

  const handleSaturationChange = (e) => {
    const s = parseInt(e.target.value, 10)
    setSaturation(s)
    handleColorChange(hslToHex(hue, s, lightness))
  }

  const handleLightnessChange = (e) => {
    const l = parseInt(e.target.value, 10)
    setLightness(l)
    handleColorChange(hslToHex(hue, saturation, l))
  }

  const handlePickerChange = (e) => {
    handleColorChange(e.target.value)
  }

  const handleReset = () => {
    handleColorChange('#1e1b4b') // Default indigo
  }

  // Curated best color combinations (3 boxes) - each with background + optimal text color
  const curatedCombinations = [
    {
      id: 'maroon-white',
      name: 'Maroon & White',
      description: 'Deep, authoritative red',
      bgColor: '#7d100b',
      textColor: '#ffffff',
      textColorDark: '#f2f5fc'
    },
    {
      id: 'navy-white',
      name: 'Navy Blue & White',
      description: 'Classic professional blue',
      bgColor: '#0f172a',
      textColor: '#ffffff',
      textColorDark: '#f2f5fc'
    },
    {
      id: 'emerald-white',
      name: 'Emerald & White',
      description: 'Rich, confident green',
      bgColor: '#065f46',
      textColor: '#ffffff',
      textColorDark: '#f2f5fc'
    }
  ]

  const currentHex = hslToHex(hue, saturation, lightness)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-body-lg font-medium text-ink">Accent Color</p>
        <p className="text-body-md text-ink-muted mt-0.5">
          Choose your accent color for buttons, links, and highlights. Your choice is saved and restored on next login.
        </p>
      </div>

      {/* Main color preview & native picker */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-shrink-0">
          <div
            className="w-16 h-16 rounded-xl border-2 border-border shadow-md cursor-pointer hover:shadow-level2 transition-all duration-200"
            style={{ backgroundColor: currentHex }}
            title="Click to open native color picker"
            onClick={() => inputRef.current?.click()}
          />
          <input
            ref={inputRef}
            type="color"
            value={currentHex}
            onChange={handlePickerChange}
            className="absolute inset-0 opacity-0 cursor-pointer rounded-xl"
            aria-label="Pick accent color"
          />
          {/* Color indicator dot */}
          <div className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-3 border-surface shadow-md"
            style={{ backgroundColor: currentHex }} />
        </div>

        <div className="flex-1 min-w-0">
          <label className="block text-body-sm font-medium text-ink-muted mb-1.5">
            Hex Code
          </label>
          <div className="relative">
            <input
              type="text"
              value={hexInput}
              onChange={handleHexInput}
              placeholder="#1e1b4b"
              maxLength="7"
              className="input w-full font-mono text-body-md pr-20"
              aria-label="Enter hex color code"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-ink-faint font-mono">
              {currentHex.toUpperCase()}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="btn-ghost text-body-sm text-ink-muted hover:text-ink"
          title="Reset to default (Indigo)"
        >
          Reset to default
        </button>
      </div>

      {/* Advanced HSL sliders */}
      <details className={clsx('group')}>
        <summary className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-surface-sunken transition-colors">
          <span className="text-body-md font-medium text-ink">Advanced color controls</span>
          <span className="text-body-sm text-ink-faint group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>

        <div className="space-y-4 pt-2 border-t border-border-subtle">
          {/* Hue slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-body-sm font-medium text-ink">Hue</label>
              <span className="text-body-sm text-ink-muted font-mono">{hue}°</span>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-0 h-full rounded-full"
                style={{
                  background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                }} />
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={handleHueChange}
                className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                aria-label="Hue"
              />
            </div>
          </div>

          {/* Saturation slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-body-sm font-medium text-ink">Saturation</label>
              <span className="text-body-sm text-ink-muted font-mono">{saturation}%</span>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-0 h-full rounded-full"
                style={{
                  background: `linear-gradient(to right, hsl(${hue}, 0%, ${lightness}%), hsl(${hue}, 100%, ${lightness}%))`
                }} />
              <input
                type="range"
                min="0"
                max="100"
                value={saturation}
                onChange={handleSaturationChange}
                className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                aria-label="Saturation"
              />
            </div>
          </div>

          {/* Lightness slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-body-sm font-medium text-ink">Lightness</label>
              <span className="text-body-sm text-ink-muted font-mono">{lightness}%</span>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-0 h-full rounded-full"
                style={{
                  background: `linear-gradient(to right, hsl(${hue}, ${saturation}%, 0%), hsl(${hue}, ${saturation}%, 100%))`
                }} />
              <input
                type="range"
                min="0"
                max="100"
                value={lightness}
                onChange={handleLightnessChange}
                className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                aria-label="Lightness"
              />
            </div>
          </div>
        </div>
      </details>

      {/* Curated best color combinations - 3 boxes with responsive design */}
      <div>
        <p className="text-body-sm font-medium text-ink-muted mb-2.5">Recommended combinations</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          {curatedCombinations.map((combo) => (
            <button
              key={combo.id}
              type="button"
              onClick={() => handleColorChange(combo.bgColor)}
              className={clsx(
                'relative rounded-lg sm:rounded-xl border-2 p-3 sm:p-4 lg:p-5 transition-all duration-200 hover:shadow-level3',
                'flex flex-col justify-between min-h-[90px] sm:min-h-[100px] lg:min-h-[120px]',
                currentHex === combo.bgColor
                  ? 'border-secondary shadow-level3 ring-2 ring-secondary/30 scale-[1.01] sm:scale-[1.02]'
                  : 'border-border-subtle hover:border-border-strong',
              )}
              style={{ backgroundColor: combo.bgColor }}
              title={`${combo.name}: ${combo.bgColor} with ${combo.textColor} text`}
              aria-label={`${combo.name} - ${combo.description}`}
              aria-pressed={currentHex === combo.bgColor}
            >
              <div className="relative z-10 flex flex-col items-start">
                <span className="text-xs sm:text-sm lg:text-base font-semibold leading-tight" style={{ color: combo.textColor }}>
                  {combo.name}
                </span>
                <span className="text-xs sm:text-xs lg:text-sm mt-1 sm:mt-1.5 opacity-90 line-clamp-2" style={{ color: combo.textColor }}>
                  {combo.description}
                </span>
              </div>

              <div className="mt-2.5 sm:mt-3 lg:mt-3 flex items-center gap-1.5 sm:gap-2 lg:gap-3">
                <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded border border-[1.5px]" style={{
                  backgroundColor: combo.bgColor,
                  borderColor: combo.textColor
                }} />
                <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded border border-[1.5px] bg-white" style={{ borderColor: combo.textColor }} />
              </div>

              {currentHex === combo.bgColor && (
                <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 lg:top-3 lg:right-3 w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" style={{ color: combo.bgColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Session notice */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-info-bg border border-info-border">
        <svg className="w-5 h-5 text-info shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-body-sm text-info-text flex-1">
          Your color choice is saved and will be restored on your next login.
        </p>
      </div>
    </div>
  )
}