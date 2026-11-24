# Snowfall Overlay

Dependency-free Canvas 2D snowfall for websites. Snow accumulates on selected HTML elements and the bottom of the overlay. Moving a mouse or pen through a drift scatters it. The overlay is decorative and lets clicks pass through.

## Install

```sh
npm install snowfall-overlay
```

To install from a local checkout, run `npm pack` here and install the resulting archive in your website project.

```js
import { createSnowfall } from 'snowfall-overlay';

const snow = createSnowfall({
  target: document.querySelector('#hero'),
  intensity: 0.7,
});

// Call when the component unmounts.
snow.destroy();
```

Mark the elements that should collect snow with `data-snowfall-surface`. Omit `target` to cover the viewport. Initialize after the document body exists, or in the client-side mount hook of your framework.

Calling `createSnowfall()` also adds a **Snow settings** button. Visitors can toggle snowfall, adjust intensity and opacity, configure accumulation and pointer interaction, or clear snow. Settings are stored in the current browser for this site. Use `settings: false` to hide the panel and disable preference loading, or `storageKey: false` to keep the panel without saving choices. Set `enabled: false` to start off for visitors who have no saved choice.

## Plain HTML

Copy `browser.js` from the package into your site and load it after your markup.

```html
<section id="hero">
  <h1 data-snowfall-surface>Winter collection</h1>
</section>
<script src="./browser.js"></script>
<script>
  const snow = SnowfallOverlay.createSnowfall({
    target: document.querySelector('#hero'),
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
| `santa` | Off | Set `{ surface: '#site-nav' }` to let Mini Santa clear snow from the nav and hop between its links and buttons. Set `destinations: 'main button, .card'` to jump to visible elements elsewhere on the page. |

Mini Santa waits until snow collects and is controlled by its own checkbox in the settings panel. The first visit can happen after 35 seconds by default, with later visits spaced out by a randomized delay. Override the minimum delay via `santa.interval` (seconds).

Set `santa.crew: { footer: 'footer' }` to add a rope cleaner and a tractor. The rope cleaner descends vertically and stops only at snowy ledges along the same line. The tractor crosses the entire bottom snowbank at any scroll position and sometimes pauses to wave. The first Santa sweeps the navigation and its landings above the footer. Use the **Santa speed** slider to change all three animations from 20% to 100%. The default is 40% and can be changed through `santa.speed`. These animations follow reduced-motion and snowfall settings.

The effect starts automatically. Use `stop()` to freeze it, `start()` to resume, `clear()` to empty it, `setIntensity(value)` to adjust it, and `destroy()` to dispose of it. Call `refresh()` after geometry changes driven by CSS animation or an external layout that the observers do not see. The overlay uses rectangular bounds and horizontal ledges. It hides for reduced motion and pauses in background tabs.

Run `npm run build` and open `demo/index.html` for a standalone preview.
