"use client";

import { useEffect, useState, useRef } from "react";
import { fetchStats } from "@/lib/api";

function AnimatedCounter({ target, label, color = "text-[#1a6b4a]" }: { target: number; label: string; color?: string }) {
  const [count, setCount] = useState(0);
  const hasAnimatedRef = useRef(false);
  const prevTargetRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  // Reset animation when target changes from 0 to real value
  if (target > 0 && prevTargetRef.current === 0) {
    hasAnimatedRef.current = false;
  }
  prevTargetRef.current = target;

  useEffect(() => {
    const el = ref.current;
    if (!el || target === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimatedRef.current) {
          hasAnimatedRef.current = true;
          const duration = 1500;
          const start = Date.now();
          const animate = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

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

const st = {
  es: { badge: "Impacto en Tiempo Real", title: "Creciendo Autonomamente", actors: "Actores Descubiertos", connections: "Conexiones Mapeadas", verified: "Verificados On-Chain" },
  en: { badge: "Real-Time Impact", title: "Growing Autonomously", actors: "Actors Discovered", connections: "Connections Mapped", verified: "Verified On-Chain" },
};

export default function StatsSection({ lang = "en" }: { lang?: "es" | "en" }) {
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0, verified_nodes: 0 });
  const labels = st[lang];

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
            {labels.badge}
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-[#1a1a1a] tracking-tight">
            {labels.title}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <AnimatedCounter target={stats.total_nodes} label={labels.actors} />
          <AnimatedCounter target={stats.total_edges} label={labels.connections} />
          <AnimatedCounter target={stats.verified_nodes} label={labels.verified} />
        </div>
      </div>
    </section>
  );
}
