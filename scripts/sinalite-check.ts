/**
 * Do the catalogue and the vendor map still agree?
 *
 * Run after adding or changing a trade-printed product. Needs no credentials
 * and makes no network calls — it reads the two files and reports what does not
 * line up, which is the check worth having before an account exists.
 */

import { checkVendorMap } from "../src/lib/shop/vendor-check";

const problems = checkVendorMap();

if (problems.length === 0) {
  console.log("The catalogue and the vendor map agree.");
  process.exit(0);
}

for (const problem of problems) {
  console.log(`${problem.where}\n    ${problem.problem}`);
}
console.log(`\n${problems.length} to sort out.`);
process.exit(1);
