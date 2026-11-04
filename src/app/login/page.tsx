import { AuthForm } from "@/components/auth-form";
import { PageHeading } from "@/components/ui";
export const metadata = { title: "Sign in" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="container page-content auth-page">
      <PageHeading
        eyebrow="WELCOME BACK"
        title="Your next chapter is waiting."
        description="Sign in to return to your saved trips and drafts."
      />
      <div className="panel auth-panel">
        <AuthForm mode="login" next={next} />
      </div>
    </div>
  );
}
