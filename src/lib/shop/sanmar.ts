/**
 * SanMar Canada — where the garment data comes from.
 *
 * NOT WIRED YET, and deliberately not guessed at. SanMar's services are SOAP
 * (the PromoStandards suite: product data, pricing and configuration, inventory,
 * media content), and a SOAP envelope invented from memory is far likelier to
 * be wrong than a REST body was — so this file holds the configuration seam and
 * says plainly what it needs, rather than shipping a call that cannot work.
 *
 * WHAT IS NEEDED TO FINISH IT
 *   - The endpoint URLs for the account, per service. SanMar Canada's differ
 *     from SanMar US.
 *   - Which services the account is entitled to. Product data alone gives
 *     colours and sizes; net cost needs the pricing service.
 *   - The customer number, and the web-services user id and password, which are
 *     not the portal sign-in.
 *   - One sample request and response per service, as the SinaLite examples
 *     were. That is what turns this from a guess into an adapter.
 *
 * Until then garment data comes in through the CSV importer, which takes an
 * export from the dealer portal and needs no credentials — see
 * scripts/garments-import.ts. Both write the same rows, so nothing downstream
 * changes when this is finished.
 */

export type SanmarConfig = {
  configured: boolean;
  customerNumber: string;
  username: string;
  password: string;
  /** Their environment: SanMar publish separate test and production endpoints. */
  environment: "sandbox" | "live";
};

export function sanmarConfig(): SanmarConfig {
  const username = process.env.SANMAR_USERNAME || "";
  const password = process.env.SANMAR_PASSWORD || "";

  return {
    configured: Boolean(username && password),
    customerNumber: process.env.SANMAR_CUSTOMER_NUMBER || "",
    username,
    password,
    environment: process.env.SANMAR_ENV === "live" ? "live" : "sandbox",
  };
}

/** What the adapter is still missing, for the queue and the import script. */
export function sanmarReadiness(): { ready: boolean; missing: string[] } {
  const config = sanmarConfig();
  const missing: string[] = [];

  if (!config.username || !config.password) missing.push("SANMAR_USERNAME and SANMAR_PASSWORD");
  if (!config.customerNumber) missing.push("SANMAR_CUSTOMER_NUMBER");
  missing.push("the service endpoint URLs and one sample request/response each");

  return { ready: false, missing };
}
