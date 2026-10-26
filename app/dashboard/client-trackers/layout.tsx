import "@/components/client-trackers/email-delivery-review.css";
import "@/components/client-trackers/email-delivery-security.css";
import "@/components/client-trackers/tracker-navigation-transition.css";
import "@/components/client-trackers/tracker-responsive.css";
import { TrackerNavigationTransitionProvider } from "@/components/client-trackers/TrackerNavigationTransition";

export default function ClientTrackersLayout({ children }: { children: React.ReactNode }) {
  return <TrackerNavigationTransitionProvider>{children}</TrackerNavigationTransitionProvider>;
}
