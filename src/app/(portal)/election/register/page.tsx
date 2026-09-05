import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/shop/auth";
import { pendingPrefill } from "@/lib/shop/handoff";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account — Election print, Holm Graphics" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentCustomer()) redirect("/election/orders");
  const { next } = await searchParams;
  const prefill = await pendingPrefill();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-muted">
        So your details are already filled in the next time — campaigns reorder signs more than
        they expect to.
      </p>
      <RegisterForm next={next ?? "/election/cart"} prefill={prefill} />
      <p className="mt-6 text-sm text-muted">
        Already have one?{" "}
        <Link href="/election/sign-in" className="font-medium text-brand-ink underline">
          Sign in
        </Link>
        .
      </p>
      <p className="mt-4 text-xs text-muted">
        This account is for ordering print. It is separate from any campaign software login you may
        have, and reaches nothing but your own orders.
      </p>
    </div>
  );
}
