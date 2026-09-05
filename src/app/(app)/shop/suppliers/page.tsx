import Link from "next/link";
import { requireShopStaff } from "@/lib/shop/auth";
import { garmentStyles } from "@/lib/shop/garments";
import { catalogueStyles } from "@/lib/shop/sanmar-sync";
import { sanmarConfig } from "@/lib/shop/sanmar";
import { formatDate } from "@/lib/dates";
import { Card, Note, PageHeader, Table, Td, Th } from "@/components/ui";
import { SuppliersPanel } from "./suppliers-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers — Holm Graphics" };

/**
 * Where the garment prices come from, and the button that fetches them.
 *
 * This page exists because the command-line version of the same job needs a
 * clone of the repository, node_modules, the Railway CLI and a linked project.
 * The shop does not have those and should not need them: pressing a button in
 * the deployed app runs the fetch inside the deployment, which is also the only
 * place with a network route to SanMar.
 */
export default async function SuppliersPage() {
  await requireShopStaff();

  const config = sanmarConfig();
  const [styles, wanted] = await Promise.all([garmentStyles(), catalogueStyles()]);
  const loaded = new Set(styles.map((s) => s.styleCode));
  const missing = wanted.filter((code) => !loaded.has(code));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Garment costs come from SanMar. Everything else on the price list is set by hand in the catalogue."
        actions={
          <Link href="/shop" className="btn-secondary">
            Back to the queue
          </Link>
        }
      />

      <Card
        title="SanMar"
        description={`Account ${config.username || "not set"} · ${config.environment}`}
      >
        {!config.configured ? (
          <div className="space-y-3">
            <Note tone="warn">
              This service has no SanMar credentials, so the apparel cannot price itself
              and the storefront says &ldquo;priced on request&rdquo;.
            </Note>
            <p className="text-xs leading-relaxed text-muted">
              The same credentials are already set on the{" "}
              <span className="font-semibold">holmgraphics-shop-api</span> service in
              Railway. Copy <code>SANMAR_USERNAME</code>, <code>SANMAR_PASSWORD</code>,{" "}
              <code>SANMAR_MEDIA_PASSWORD</code> and <code>SANMAR_ENV</code> onto this
              service, then come back and press the button.
            </p>
          </div>
        ) : null}
        <div className={config.configured ? "" : "mt-4"}>
          <SuppliersPanel styles={wanted} />
        </div>
      </Card>

      <Card
        title="What is loaded"
        description="A style with no rows here is a style the storefront cannot sell."
      >
        {styles.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Press <span className="font-semibold">Load prices</span> above, or
            import a CSV export with{" "}
            <code className="text-xs">npm run garments:import</code>.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th>
                <Th>Name</Th>
                <Th>Sizes</Th>
                <Th>Source</Th>
                <Th>Loaded</Th>
              </tr>
            </thead>
            <tbody>
              {styles.map((style) => (
                <tr key={style.styleCode}>
                  <Td>
                    <span className="font-semibold">{style.styleCode}</span>
                  </Td>
                  <Td>{style.name}</Td>
                  <Td>{style.skuCount}</Td>
                  <Td>{style.source === "SANMAR_API" ? "SanMar" : "CSV"}</Td>
                  <Td>{style.syncedAt ? formatDate(style.syncedAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {missing.length > 0 ? (
          <div className="mt-4">
            <Note tone="warn">
              The catalogue lists {missing.join(", ")} and there are no prices for{" "}
              {missing.length === 1 ? "it" : "them"} yet, so{" "}
              {missing.length === 1 ? "that style is" : "those styles are"} showing as
              priced on request.
            </Note>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
