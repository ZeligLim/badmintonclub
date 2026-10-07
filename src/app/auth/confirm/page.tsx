import { SessionsAuthConfirm } from "@/features/sessions";

type AuthConfirmSearchParams = Record<
  string,
  string | string[] | undefined
>;

type AuthConfirmPageProps = {
  searchParams: Promise<AuthConfirmSearchParams>;
};

export const instant = false;

export default async function AuthConfirmPage({
  searchParams,
}: AuthConfirmPageProps) {
  const { token_hash: tokenHash, type } = await searchParams;

  return (
    <main className="min-h-screen px-5 pb-12 pt-3 sm:px-8 sm:pt-5">
      <div className="mx-auto w-full max-w-md">
        <SessionsAuthConfirm
          tokenHash={typeof tokenHash === "string" ? tokenHash : undefined}
          type={typeof type === "string" ? type : undefined}
        />
      </div>
    </main>
  );
}
