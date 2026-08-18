# Customizing Widget Colors

Every next-gen widget (`<next-my-invoices>`, `<next-profile>`, `<next-space-availability>`, and the rest) supports a `customcss` attribute — the exact same name and idea as the `customcss` attribute on MinistryPlatform's own classic widgets (`mpp-checkout`, `mpp-user-login`, etc). If your site already has a customcss file for those, this page shows how to reuse the same colors here.

## What it does

`customcss` points at a CSS file you host. The widget loads it and applies it on top of its own built-in look, so you can override colors without waiting on a developer or forking the widget's code.

```html
<next-my-invoices customcss="https://your-site.com/path/to/your-file.css"></next-my-invoices>
```

Leave it off and every widget looks exactly as it does out of the box — `customcss` is entirely optional.

## Quick start

1. Download [`next-widgets-sample.css`](https://your-app-address/embed-sdk/next-widgets-sample.css) *(replace `your-app-address` with the address from the root setup guide)* — a small starter file with the 7 colors below, already set to each widget's own defaults.
2. Change the color values to your brand.
3. Upload the file somewhere on your own website that gives it a public URL — the same place you already host a customcss file for the classic MP widgets, if you have one.
4. Add `customcss="https://your-site.com/.../your-file.css"` to any `<next-*>` widget tag.

The same file works for every widget — you don't need a separate file per widget unless you want one. See "More than one look" below if you do.

## The colors

| Variable | Controls | Default |
|---|---|---|
| `--primary` | Main brand color — buttons, links, section headers | `#004C97` |
| `--secondary` | Hover states, secondary headers | `#002855` |
| `--accent` | Highlight color — borders, underlines, badges (used sparingly) | `#F1BE48` |
| `--card-bgcolor` | Card / panel background | `#ffffff` |
| `--root-text-color` | Default body text color | `#2D2926` |
| `--form-valid` | Success state (a paid invoice, a confirmed booking) | `#86AD3F` |
| `--form-invalid` | Error / warning state (a form validation message) | `#FF6D6A` |

A minimal file only needs the ones you're actually changing:

```css
:host {
  --primary: #7A1F2B;
  --secondary: #4A0E14;
}
```

Everything else keeps its default. `:host` here refers to the widget tag itself — this is standard CSS, not something specific to these widgets.

## Never written CSS before?

You don't need any software installed — a web browser is enough. [CodePen](https://codepen.io) is a free, widely-used site for writing and previewing CSS with nothing to install or sign up for: paste the starter file's contents into the CSS panel, tweak a color, and see it update instantly. If that feels like more than you need, [W3Schools' "Try It" editor](https://www.w3schools.com/css/trycss_default.asp) is an even simpler side-by-side editor built for total beginners.

Either way, once you're happy with the colors, save the plain text as a `.css` file and upload it to your site (step 3 above) — these tools are for writing and previewing, not for hosting the file `customcss` points at.

## More than one look

`customcss` takes one file per widget tag, but nothing stops you from maintaining a few different files — a main brand file, a seasonal one, a different look for one specific widget — and choosing which to use per tag:

```html
<next-full-calendar customcss="https://your-site.com/css/brand.css"></next-full-calendar>
<next-my-invoices customcss="https://your-site.com/css/brand-invoices.css"></next-my-invoices>
```

## Going further than colors

Every rule in your customcss file applies after the widget's own styles. If you want to change more than the 7 colors above — spacing, borders, hiding an element — each widget's own page on this list documents its internal class names (search that page for "customcss" or "class names"). A rule like this in your file would round a button's corners on the My Invoices widget, for example:

```css
.pay-btn { border-radius: 999px; }
```

**Use that exact class name, not a generic tag selector.** A rule like `h1 { color: red; }` will usually lose to the widget's own more specific `.some-heading-class { color: ...; }` rule, even though your file loads after it — in CSS, a class selector always beats a plain tag selector regardless of load order. Match the class name shown in the widget's own doc page (or add `!important` as a shortcut, though matching the class is the more durable fix).

## Notes

- `customcss` only affects the next-gen widget's own visual area. If a widget embeds a classic MinistryPlatform element inside it (for example, My Invoices' Pay Now checkout), that piece keeps using whatever customcss/style setup you already have for classic widgets — it's a separate, unrelated setting.
- The file needs to be reachable by every visitor's browser without signing in — the same requirement as any other image or CSS file on your site. It can be hosted anywhere, including a domain different from your website (your MinistryPlatform host, for instance, if you're reusing a file you already made for the classic widgets) — no special cross-origin setup is needed on your end.
- Changing the file's contents takes effect the next time a visitor's browser loads it — if you don't see a change right away, it's likely your browser (or a CDN in front of your site) showing a cached copy of the old file.
