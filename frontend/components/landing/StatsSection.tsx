"use client";

import { useEffect, useState, useRef } from "react";
import { fetchStats } from "@/lib/api";

function AnimatedCounter({ target, label, color = "text-[#1a6b4a]" }: { target: number; label: string; color?: string }) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 1500;
          const start = Date.now();
          const animate = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <div ref={ref} className="text-center">
      <div className={`font-mono text-5xl md:text-6xl font-bold ${color} mb-2`}>
        {count.toLocaleString()}
      </div>
      <div className="text-sm text-[#1a1a1a]/50 font-medium tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

export default function StatsSection() {
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0, verified_nodes: 0 });

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <section className="py-24 md:py-32 bg-[#f5f3eb] border-t border-[#1a1a1a]/5">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#1a6b4a] tracking-widest uppercase mb-3">
            Real-Time Impact
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-[#1a1a1a] tracking-tight">
            Growing Autonomously
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <AnimatedCounter
            target={stats.total_nodes}
            label="Actors Discovered"
          />
          <AnimatedCounter
            target={stats.total_edges}
            label="Connections Mapped"
          />
          <AnimatedCounter
            target={stats.verified_nodes}
            label="Verified On-Chain"
          />
        </div>
      </div>
    </section>
  );
}
