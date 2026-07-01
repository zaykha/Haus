"use client";

import { useEffect, useRef } from "react";
import styled from "styled-components";

declare global {
  interface Window {
    lottie?: {
      loadAnimation: (config: {
        container: HTMLElement;
        renderer: "svg" | "canvas" | "html";
        loop: boolean;
        autoplay: boolean;
        path: string;
      }) => {
        totalFrames: number;
        addEventListener: (name: string, callback: () => void) => void;
        playSegments: (segments: [number, number], forceFlag?: boolean) => void;
        destroy: () => void;
      };
    };
  }
}

const LOADING_JSON_PATH = "/animations/loading-screen.json";

export function AuthLoadingAnimation() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) {
      return;
    }

    let destroyed = false;
    let animation: ReturnType<NonNullable<typeof window.lottie>["loadAnimation"]> | null = null;
    let timeoutId: number | null = null;

    const startAnimation = () => {
      if (destroyed || !mountNode || !window.lottie) {
        return false;
      }

      mountNode.replaceChildren();
      animation = window.lottie.loadAnimation({
        container: mountNode,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: LOADING_JSON_PATH,
      });

      animation.addEventListener("DOMLoaded", () => {
        const startFrame = Math.round(animation!.totalFrames * 0.4);
        const endFrame = Math.max(startFrame + 1, Math.round(animation!.totalFrames));
        animation?.playSegments([startFrame, endFrame], true);
      });

      return true;
    };

    if (!startAnimation()) {
      const waitForLottie = () => {
        if (destroyed) {
          return;
        }

        if (startAnimation()) {
          return;
        }

        timeoutId = window.setTimeout(waitForLottie, 50);
      };

      waitForLottie();
    }

    return () => {
      destroyed = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      animation?.destroy();
      mountNode.replaceChildren();
    };
  }, []);

  return (
    <Wrap aria-hidden="true">
      <Mount ref={mountRef} />
    </Wrap>
  );
}

const Wrap = styled.div`

  display: grid;
  place-items: center;
  margin: 10px 0 22px;
`;

const Mount = styled.div`
  width: 100%;
  height: 100%;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`;
