"use client";

import { useEffect } from "react";

const PLAYER_SCRIPT_ID = "haus-dotlottie-player-script";
const PLAYER_SCRIPT_SRC = "https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs";
const LOADING_SRC = "/Loading%20screen.lottie";

function ensurePlayerScript() {
  if (document.getElementById(PLAYER_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = PLAYER_SCRIPT_ID;
  script.type = "module";
  script.src = PLAYER_SCRIPT_SRC;
  document.head.appendChild(script);
}

function mountLoadingAnimations(root: ParentNode = document) {
  const nodes = root.querySelectorAll<HTMLElement>(".auth-loading-spinner");

  nodes.forEach((node) => {
    if (node.dataset.lottieMounted === "true") {
      return;
    }

    node.dataset.lottieMounted = "true";
    node.replaceChildren();

    const player = document.createElement("dotlottie-player");
    player.setAttribute("src", LOADING_SRC);
    player.setAttribute("background", "transparent");
    player.setAttribute("speed", "1");
    player.setAttribute("loop", "");
    player.setAttribute("autoplay", "");
    player.style.width = "100%";
    player.style.height = "100%";
    node.appendChild(player);
  });
}

export function LoadingAnimationBootstrap() {
  useEffect(() => {
    ensurePlayerScript();
    mountLoadingAnimations();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((addedNode) => {
          if (!(addedNode instanceof HTMLElement)) {
            return;
          }

          if (addedNode.matches?.(".auth-loading-spinner")) {
            mountLoadingAnimations(addedNode.parentNode ?? document);
            return;
          }

          if (addedNode.querySelector?.(".auth-loading-spinner")) {
            mountLoadingAnimations(addedNode);
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
