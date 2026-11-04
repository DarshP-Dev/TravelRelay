import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { requireUser } from "@/server/session";
import { SignOut } from "@/components/sign-out";
export const metadata: Metadata = { title: "Profile" };
export default async function ProfilePage() {
  const user = await requireUser("/profile");
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="YOUR CORNER OF TRAVELRELAY"
        title={`Welcome, ${user.name}.`}
        description="Your trips and drafts are private to your account."
      />
      <div className="panel profile-panel">
        <h2>Account details</h2>
        <dl className="review-list">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd>
              {user.emailVerified
                ? "Verified"
                : "Not verified — email delivery isn’t connected yet"}
            </dd>
          </div>
        </dl>
        <SignOut userId={user.id} />
      </div>
    </div>
  );
}
