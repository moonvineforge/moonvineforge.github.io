# Moonvine Forge

Moonvine Forge is the public website for a small open-source roguelike deckbuilding project.

The site introduces the project, links to the card forge, and gives visitors a simple way to submit card, relic, enemy, status, and resource ideas for future development.

## Pages

- `index.html` - main landing page
- `card-forge.html` - community card forge and submission page
- `impressum.html` - legal notice
- `datenschutz.html` - privacy policy
- `style.css` - shared styling
- `assets/` - images and visual assets

## Goals

Moonvine Forge is meant to be:

- lightweight
- readable
- easy to host with GitHub Pages
- friendly to community submissions
- visually fitting for a dark fantasy deckbuilder project

## Contributing

Small, focused improvements are welcome. Good contributions include:

- clearer wording
- accessibility improvements
- responsive layout fixes
- new example cards or relics
- visual polish that does not break the existing static site

Please keep pull requests small and easy to review.

## Local preview

This is a static website. To preview changes locally, open `index.html` in a browser.

For a closer GitHub Pages-style preview, run a small local server from the repository root:

    python -m http.server 8000

Then open `http://localhost:8000`.
