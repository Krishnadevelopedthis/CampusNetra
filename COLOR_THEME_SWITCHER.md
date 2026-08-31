# Color Theme Switcher Feature

## Overview

Added a color theme switcher to CampusNetra that allows users to select from 4 different color palettes while maintaining full light/dark mode support.

## Features

- **4 Color Themes**: Indigo (default), Green, Purple, and Orange
- **Light & Dark Mode Support**: Each color theme works seamlessly with both light and dark modes
- **Persistent Preference**: User's color theme choice is saved to localStorage
- **Smooth Transitions**: Color changes animate smoothly with the existing theme transition system
- **Visual Preview**: Each theme option shows color swatches for both light and dark modes

## Implementation Details

### New Files Created

1. **`frontend/src/lib/colorTheme.js`**
   - Color theme state management using Zustand
   - 4 predefined color palettes (indigo, green, purple, orange)
   - Each palette defines colors for both light and dark modes
   - Applies theme by updating CSS custom properties dynamically
   - Syncs with localStorage for persistence

2. **`frontend/src/components/ColorThemeSwitcher.jsx`**
   - UI component for selecting color themes
   - Grid layout with visual color swatches
   - Shows both light and dark color previews
   - Active state indicator with checkmark
   - Responsive design (2 columns on mobile, 4 on desktop)

### Modified Files

1. **`frontend/src/lib/theme.js`**
   - Integrated color theme refresh when light/dark mode changes
   - Calls `refreshColorTheme()` when theme switches
   - Initializes color theme system on startup

2. **`frontend/src/pages/Settings.jsx`**
   - Added ColorThemeSwitcher component to Appearance section
   - Positioned between light/dark toggle and table density options
   - Imported ColorThemeSwitcher component

## Color Palettes

### Indigo (Default)
- Primary: Deep indigo (#1e1b4b)
- Secondary: Blue (#3b82f6)
- Professional and corporate look

### Green
- Primary: Forest green (#145327)
- Secondary: Emerald (#10b981)
- Natural and eco-friendly feel

### Purple
- Primary: Deep purple (#581c87)
- Secondary: Purple (#a855f7)
- Creative and modern aesthetic

### Orange
- Primary: Deep orange (#9a3412)
- Secondary: Orange (#f97316)
- Energetic and warm vibe

## Usage

1. Navigate to **Settings** page
2. Find the **Appearance** section
3. Under **Color Theme**, click on any of the 4 color swatches
4. The theme applies immediately across the entire application
5. The choice persists across browser sessions

## Technical Architecture

- **CSS Custom Properties**: Dynamic theme switching via `--c-primary`, `--c-secondary`, etc.
- **Zustand Store**: Lightweight state management for color theme preference
- **Integration**: Works alongside existing light/dark theme system without conflicts
- **Performance**: Minimal overhead, only updates necessary CSS variables

## Browser Compatibility

- Modern browsers with CSS custom properties support
- localStorage for persistence
- Fallback to default indigo theme if localStorage unavailable

## Testing

The frontend development server is running at: **http://localhost:5173**

To test:
1. Open the application
2. Login with any demo account (e.g., `admin@campus.edu` / `Campus@2026`)
3. Navigate to Settings
4. Try switching between different color themes
5. Toggle between light and dark modes to see each theme's variants
6. Refresh the page to verify persistence

## Notes

- Color themes only affect primary/secondary brand colors
- Semantic colors (success, warning, danger) remain consistent across themes
- Status colors for Digital Twin assets are unchanged for consistency
- Font colors automatically adjust based on background contrast
- Mobile browser chrome (address bar) color updates to match selected theme
