"use client";

import { useEffect } from "react";

interface EmbedBridgeOptions {
  slug: string;
  autoResize?: boolean;
  onConfig?: (config: { theme?: string; primary?: string; locale?: string }) => void;
}

export function useEmbedBridge({ slug, autoResize = false, onConfig }: EmbedBridgeOptions) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    const parentOrigin = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : "*";
      } catch {
        return "*";
      }
    })();

    const post = (payload: Record<string, unknown>) => {
      window.parent.postMessage({ version: 1, slug, ...payload }, parentOrigin);
    };

    post({ type: "gp:ready" });

    let observer: ResizeObserver | undefined;
    if (autoResize && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const height = Math.ceil(entries[0]?.contentRect.height ?? document.documentElement.scrollHeight);
        post({ type: "gp:resize", height });
      });
      observer.observe(document.documentElement);
    }

    const onMessage = (e: MessageEvent) => {
      if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "gp:config" && onConfig) {
        onConfig({ theme: e.data.theme, primary: e.data.primary, locale: e.data.locale });
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      observer?.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [slug, autoResize, onConfig]);
}
