import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import PrototypeSection from "@/components/landing/PrototypeSection";
import StatsSection from "@/components/landing/StatsSection";
import FooterSection from "@/components/landing/FooterSection";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <HowItWorksSection />
      <PrototypeSection />
      <StatsSection />
      <FooterSection />
    </main>
  );
}
