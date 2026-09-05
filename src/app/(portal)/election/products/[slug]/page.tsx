import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, productBySlug } from "@/lib/shop/catalog";
import { getCurrentCustomer } from "@/lib/shop/auth";
import { Configurator } from "./configurator";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) return {};
  return {
    title: `${product.name} — Election print, Holm Graphics`,
    description: product.tagline,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) notFound();

  const customer = await getCurrentCustomer();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-muted">
        <Link href="/election" className="hover:text-ink hover:underline">
          Catalogue
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <header>
        <span aria-hidden className="text-3xl leading-none text-brand">
          {product.icon}
        </span>
        <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-[-0.02em]">
          {product.name}
        </h1>
        <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{product.description}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          {product.comingSoon ? (
            <div>
              <p className="text-sm font-bold">Not open for orders yet</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We are still setting this line up, so there is no price on it here
                and nothing to add to a cart. Ring the shop and we will quote it by
                hand in the meantime — it is the same press either way.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/election/products/signs" className="btn-primary">
                  Order signs instead
                </Link>
                <Link href="/election" className="btn-secondary">
                  Back to the catalogue
                </Link>
              </div>
            </div>
          ) : (
            <>
          {product.pricingProvisional ? (
            <p className="mb-4 rounded-lg border border-line bg-raise px-3 py-2 text-xs leading-relaxed text-muted">
              Prices on this one are indicative while we finish setting the line
              up. Order it as normal — we confirm the figure when we quote it
              back, before anything is paid or printed.
            </p>
          ) : null}
          <Configurator product={product} signedIn={customer !== null} />
            </>
          )}
        </section>

        <aside className="space-y-4 text-sm">
          <div className={`rounded-xl border border-line bg-raise/60 p-4 ${product.comingSoon ? "hidden" : ""}`}>
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Turnaround</h2>
            <p className="mt-1.5 leading-relaxed">
              About {product.leadTimeDays} working days from an approved proof. Tell us your date at
              checkout and we will say straight away whether it is on.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-raise/60 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              If you are supplying artwork
            </h2>
            <p className="mt-1.5 leading-relaxed text-muted">{product.artworkHint}</p>
          </div>

          <div className="rounded-xl border border-line bg-raise/60 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              If you are not
            </h2>
            <p className="mt-1.5 leading-relaxed text-muted">
              Tick the design service at checkout. One flat fee covers the whole order — signs,
              cards and shirts that look like the same campaign rather than three campaigns.
            </p>
          </div>
        </aside>
      </div>

      <section>
        <h2 className="text-sm font-bold tracking-tight">The rest of the catalogue</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRODUCTS.filter((p) => p.slug !== product.slug).map((p) => (
            <Link
              key={p.slug}
              href={`/election/products/${p.slug}`}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:bg-raise hover:text-ink"
            >
              <span aria-hidden className="mr-1.5">
                {p.icon}
              </span>
              {p.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
