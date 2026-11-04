import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { ButtonLink, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="A TRIP THAT FEELS LIKE YOU"
        title="Your corner of TravelRelay."
        description="Your preferences and account will live here."
      />
      <div className="panel">
        <EmptyState
          icon={<UserRound size={30} aria-hidden="true" />}
          title="Sign-in isn’t connected yet."
          description="This is a public foundation preview. No account has been created, and personal data is not being saved. Secure authentication will be added before private trip storage."
          action={
            <ButtonLink href="/explore">Explore destination ideas</ButtonLink>
          }
        />
      </div>
    </div>
  );
}
