import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/shop/auth";
import { signOutCustomer } from "@/app/actions/shop";
import { AccountForms } from "./account-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account — Election print, Holm Graphics" };

export default async function AccountPage() {
  const customer = await requireCustomer("/election/account");
  const account = await db.shopCustomer.findUnique({ where: { id: customer.id } });
  if (!account) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
            Your account
          </h1>
          <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
          <p className="mt-2 text-sm text-muted">
            Signed in as {account.email}. These details fill themselves in on your next order.
          </p>
        </div>
        <form action={signOutCustomer}>
          <button type="submit" className="btn-secondary">
            Sign out
          </button>
        </form>
      </header>

      <AccountForms
        account={{
          contactName: account.contactName,
          phone: account.phone,
          candidateName: account.candidateName,
          office: account.office,
          municipality: account.municipality,
          ward: account.ward,
          addressLine: account.addressLine,
          city: account.city,
          postalCode: account.postalCode,
        }}
      />
    </div>
  );
}
