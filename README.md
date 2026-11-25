# Snowfall Overlay

Dependency-free Canvas 2D snowfall for websites. Snow accumulates on selected HTML elements and the bottom of the overlay. Moving a mouse or pen through a drift scatters it. The overlay is decorative and lets clicks pass through.

## Install

```sh
npm install snowfall-overlay@0.9.0
```

To install from a local checkout, run `npm pack` here and install the resulting archive in your website project.

```js
import { createSnowfall } from 'snowfall-overlay';

const snow = createSnowfall({
  intensity: 0.7,
});
```

Mark the elements that should collect snow with `data-snowfall-surface`. Omit `target` to cover the viewport. Initialize after the document body exists, or in the client-side mount hook of your framework.

Calling `createSnowfall()` also adds a **Snow settings** button. Visitors can toggle snowfall, adjust intensity and opacity, configure accumulation and pointer interaction, or clear snow. Settings are stored in the current browser for this site. Use `settings: false` to hide the panel and disable preference loading, or `storageKey: false` to keep the panel without saving choices. Set `enabled: false` to start off for visitors who have no saved choice.

## Continuous Santa patrols in 0.9.0

```js
import { createSnowfall } from 'snowfall-overlay';

const snow = createSnowfall({
  santa: {
    surface: '#site-nav',
    patrols: {
      buttons: 'main button',
      cards: 'main .snow-card',
    },
    crew: { footer: 'footer' },
    speed: 0.4,
  },
});
```

Use CSS selectors that match your site's markup. `surface` identifies the visible navigation bar. `patrols.buttons` and `patrols.cards` identify the page elements where the other two Santas land and sweep. The package adds these destinations as accumulation surfaces.

- The navbar, buttons, and cards each get a dedicated Santa. They repeat their routes while their surfaces are visible.
- `crew` adds the rope Santa and the tractor. In patrol mode they repeat too. The tractor clears the bottom edge at any scroll position when ground accumulation is enabled.
- **Snow settings → Mini Santa** controls the characters. **Santa speed** changes their speed from 20% to 100%. A saved preference takes precedence over `santa.speed`. Enable **Collect on elements** for the navbar, button, card, and rope routes.

If you pass just `santa.surface`, the original occasional visits apply. In that mode `santa.interval` sets the minimum time between visits, and `santa.destinations` can send the same Santa from the nav to visible page elements.

## Plain HTML

Load the browser build after your markup. You can also copy `browser.js` from the package and serve it from your own site.

```html
<nav id="site-nav"><a href="#work">Work</a></nav>
<main id="work">
  <button type="button">View projects</button>
  <article class="snow-card"><h2>Winter collection</h2></article>
</main>
<footer>Portfolio</footer>
<script src="https://cdn.jsdelivr.net/npm/snowfall-overlay@0.9.0/browser.js"></script>
<script>
  SnowfallOverlay.createSnowfall({
    santa: {
      surface: '#site-nav',
      patrols: { buttons: 'main button', cards: 'main .snow-card' },
      crew: { footer: 'footer' },
    },
  });
</script>
```

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `target` | Viewport | Constrain drawing to the visible bounds of an element |
| `surfaces` | `'[data-snowfall-surface]'` | CSS selector scoped to the target, or an iterable of elements |
| `intensity` | `0.55` | Particle spawn intensity from 0 to 1 |
| `color` | `'#fff'` | CSS color for flakes and accumulation |
| `enabled` | `true` | Start with snowfall enabled |
| `opacity` | `1` | Layer opacity from 0 to 1 |
| `accumulate` | `true` | Collect snow on selected elements |
| `accumulation` | `1` | Rate and maximum depth multiplier from 0 to 2, adjustable independently of snowfall intensity |
| `ground` | `true` | Collect snow at the bottom of the overlay |
| `interactive` | `true` | Deflect falling flakes around a mouse or pen and scatter accumulated snow |
| `melt` | `true` | Slowly melt accumulated snow |
| `zIndex` | `10` | Stacking level of the overlay |
| `settings` | `true` | Show the visitor settings button |
| `storageKey` | `'snowfall-overlay:preferences'` | Use distinct keys for multiple panels on the same site, or pass `false` to disable saving |
| `santa` | Off | Configure [continuous patrols](#continuous-santa-patrols-in-090) or occasional Santa visits |

The effect starts automatically. Use `stop()` to freeze it, `start()` to resume, `clear()` to empty it, `setIntensity(value)` to adjust it, and `destroy()` to dispose of it. Call `refresh()` after geometry changes driven by CSS animation or an external layout that the observers do not see. The overlay uses rectangular bounds and horizontal ledges. It hides for reduced motion and pauses in background tabs.

Run `npm run build` and open `demo/index.html` for a standalone preview.
