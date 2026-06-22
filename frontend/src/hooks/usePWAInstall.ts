import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface UsePWAInstallResult {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<void>;
}

export function usePWAInstall(): UsePWAInstallResult {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const promptingRef = useRef(false);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    "standalone" in navigator &&
    !(navigator as Navigator & { standalone?: boolean }).standalone;

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const handler = () => setIsInstalled(true);
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || promptingRef.current) return;
    promptingRef.current = true;
    const prompt = deferredPrompt;
    setDeferredPrompt(null); // clear before any await
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
    } finally {
      promptingRef.current = false;
    }
  }, [deferredPrompt]);

  return {
    isInstallable: deferredPrompt !== null,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
