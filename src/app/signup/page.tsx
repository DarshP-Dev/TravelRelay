import { AuthForm } from "@/components/auth-form";
import { PageHeading } from "@/components/ui";
export const metadata = { title: "Create account" };
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="container page-content auth-page">
      <PageHeading
        eyebrow="A WORLD OF POSSIBILITIES"
        title="Make room for your next adventure."
        description="Create an account to keep your trip ideas and drafts together."
      />
      <div className="panel auth-panel">
        <AuthForm mode="signup" next={next} />
      </div>
    </div>
  );
}
