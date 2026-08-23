import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

/**
 * Renders the rack card to a print-ready PDF.
 *
 * 4in x 9in trim with 0.125in bleed on every edge, so the page is
 * 4.25in x 9.25in. Run from the project root: node marketing/build.mjs
 */

const b = await chromium.launch();
const page = await b.newPage();
await page.goto(pathToFileURL("marketing/rack-card.html").href, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: "marketing/election-manager-rack-card.pdf",
  width: "4.25in",
  height: "9.25in",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await b.close();
console.log("done");
