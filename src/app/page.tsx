import { Hero } from "@/components/hero/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TheData } from "@/components/landing/TheData";
import { TheBill } from "@/components/landing/TheBill";
import { Tiers } from "@/components/landing/Tiers";
import { WhoWeAre } from "@/components/landing/WhoWeAre";
import { Workspaces } from "@/components/landing/Workspaces";

/**
 * One page, six arguments, each a nav destination. The order is the pitch:
 * what this is, what the data is and why one roof, where the money goes, how
 * a team uses it without repeating itself, how you can buy it, who is saying
 * so. The workspace sits after the bill because it is the answer to a second
 * kind of waste — the same dashboard built four times — and reads as that
 * only once the first kind has been named.
 */
export default function LandingPage() {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <TheData />
      <TheBill />
      <Workspaces />
      <Tiers />
      <WhoWeAre />
    </div>
  );
}
