# Font source notes

Font: Plus Jakarta Sans, normal style, variable weights 200–800, Latin subset.

- Website file: `plus-jakarta-sans.woff2` (27,348 bytes).
- Provider: Google Fonts / Google-hosted font files.
- Family stylesheet requested: <https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap>.
- Exact downloaded font: <https://fonts.gstatic.com/s/plusjakartasans/v12/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko20yw.woff2>.
- Project: <https://github.com/tokotype/PlusJakartaSans>.
- Licence copied from: <https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt>.
- Licence file included here: `LICENSE.txt` — SIL Open Font License, Version 1.1.
- Downloaded on 3 November 2026 for this website refresh.

The font is hosted inside the project. Visitors do not need a connection to Google Fonts after the website loads from its own host. Keep `LICENSE.txt` with the font when copying or publishing the website. Other scripts or special characters outside the Latin subset can use the normal system-font fallback.

Suggested rule for the main `style.css` file:

```css
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 200 800;
  font-display: swap;
  src: url('fonts/plus-jakarta-sans.woff2') format('woff2');
}
```
