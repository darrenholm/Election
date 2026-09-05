import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/shop/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Election print, Holm Graphics" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentCustomer()) redirect("/election/orders");
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Your orders, your proofs and your receipts.</p>
      <SignInForm next={next ?? "/election/orders"} />
      <p className="mt-6 text-sm text-muted">
        No account yet?{" "}
        <Link
          href={next ? `/election/register?next=${encodeURIComponent(next)}` : "/election/register"}
          className="font-medium text-brand-ink underline"
        >
          Create one
        </Link>
        .
      </p>
    </div>
  );
}
