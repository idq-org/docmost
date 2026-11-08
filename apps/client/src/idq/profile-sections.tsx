// IDQ sections of the profile page (Settings › My profile).
// account-settings.tsx renders this component with a single hook line, so
// new IDQ sections are added here.
import { Divider } from "@mantine/core";
import { MemberLocationSettings } from "@/idq/member-map/components/member-location-settings";

export function IdqProfileSections() {
  return (
    <>
      <Divider my="lg" />
      {/* Province on the members map (issue #4) */}
      <MemberLocationSettings />
    </>
  );
}
