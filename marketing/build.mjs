import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

/**
 * Renders the rack card twice.
 *
 *   election-manager-rack-card.pdf — for the printer. 4in x 9in trim with
 *   0.125in bleed on every edge, so the page is 4.25in x 9.25in.
 *
 *   election-manager-overview.pdf — for emailing to a candidate. Same card at
 *   its 4in x 9in trim size with no bleed, because a bleed edge on screen just
 *   looks like a mistake.
 *
 * The screen build shifts the safe margin and the hero down by the 0.125in of
 * bleed it drops, which leaves the live area identical in both.
 *
 * Run from the project root: node marketing/build.mjs
 */

const SCREEN_OVERRIDES = `
  @page { size: 4in 9in; }
  :root { --safe: 0.25in; }
  .page { width: 4in; height: 9in; }
  .hero { height: 3.325in; }
  .body { top: 3.325in; }
`;

const browser = await chromium.launch();
const url = pathToFileURL("marketing/rack-card.html").href;

for (const build of [
  { path: "marketing/election-manager-rack-card.pdf", width: "4.25in", height: "9.25in" },
  { path: "marketing/election-manager-overview.pdf", width: "4in", height: "9in", css: SCREEN_OVERRIDES },
]) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load" });
  if (build.css) await page.addStyleTag({ content: build.css });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: build.path,
    width: build.width,
    height: build.height,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await page.close();
  console.log(`wrote ${build.path}`);
}

await browser.close();
