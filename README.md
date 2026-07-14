# 💸 ExpenseFlow — Daily Expense Tracker

A fast, mobile-first daily expense tracking app. Zero dependencies at runtime, powered by vanilla JS + Vite.

## Features

- **Add/Edit/Delete** expenses with amount, category, date, and description
- **Daily/Weekly/Monthly** summaries with period navigation
- **Category breakdown** with visual progress bars
- **8 built-in categories**: Food, Transport, Shopping, Bills, Fun, Health, Learn, Other
- **localStorage persistence** — works offline, no account needed
- **CSV export** for spreadsheet analysis
- **Multi-currency** support (USD, EUR, GBP, JPY, INR, MYR, SGD, AUD, CAD)
- **Keyboard shortcut**: press `N` to add expense, `Esc` to close modals

## Mobile Design Specs

| Spec | Value |
|------|-------|
| Base viewport | 320px (scales from here) |
| Primary breakpoint | 375px (iPhone SE/13 mini) |
| Tablet breakpoint | 768px |
| Desktop breakpoint | 1024px |
| Min touch target | 44×44px (all buttons) |
| FAB size | 60×60px |
| Form inputs | min-height 48px |
| Safe area | `env(safe-area-inset-bottom)` for notch phones |
| Font stack | System fonts (-apple-system, etc.) |
| Animations | 200-300ms, reduced motion respected |

## Tech Stack

- **Vanilla JavaScript** — zero runtime dependencies
- **Vite** — dev server + build tool (~150ms HMR)
- **CSS** — custom mobile-first framework, no library
- **localStorage** — client-side persistence

## Quick Start

```bash
# Install
cd expense-tracker
npm install

# Development (hot reload)
npm run dev
# → http://localhost:3000

# Production build
npm run build

# Preview production build
npm run preview
```

## Deployment

### Static hosting (Netlify, Vercel, GitHub Pages, etc.)

```bash
npm run build
# Upload the `dist/` folder to any static host
```

### Netlify (one-click)
1. Push to GitHub
2. Connect repo in Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`

### Vercel
```bash
npx vercel --prod
```

### GitHub Pages
```bash
npm run build
# Copy dist/ contents to your gh-pages branch
```

### Docker (optional)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

## Project Structure

```
expense-tracker/
├── index.html          # Single page app shell
├── favicon.svg         # App icon
├── vite.config.js      # Vite configuration
├── package.json        # Dependencies
├── src/
│   ├── main.js         # All app logic (~400 lines)
│   └── styles.css      # Mobile-first CSS (~500 lines)
└── dist/               # Production build output
```

## Bundle Size

Production build: **~15KB** gzipped (HTML + CSS + JS combined). No frameworks, no bloat.

## License

MIT
