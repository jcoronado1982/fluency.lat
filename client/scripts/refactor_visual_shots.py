#!/usr/bin/env python3
"""Deterministic visual-regression captures for the CSS refactor."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
VIEWPORTS = {
    "desktop": {"width": 1920, "height": 1080},
    "laptop": {"width": 1366, "height": 768},
    "mobile": {"width": 390, "height": 844},
}

DETERMINISTIC_CSS = """
*, *::before, *::after {
  caret-color: transparent !important;
  animation-delay: -100s !important;
  animation-play-state: paused !important;
  scroll-behavior: auto !important;
}
.lp-reviews-scroll-track { animation: none !important; }
.dash-course-card, .dash-category-card, .dash-side-stack,
.admin-table-wrap, .admin-subtitle { visibility: hidden !important; }
"""


def wait_until_stable(page: Page) -> None:
    page.wait_for_load_state("domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=8_000)
    except PlaywrightTimeoutError:
        pass
    page.add_style_tag(content=DETERMINISTIC_CSS)
    page.evaluate(
        """async () => {
          await document.fonts.ready;
          const images = [...document.images];
          await Promise.all(images.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 5000);
            });
          }));
        }"""
    )
    page.evaluate(
        """async () => {
          const step = Math.max(window.innerHeight * 0.8, 400);
          for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
            window.scrollTo(0, top);
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          }
          window.scrollTo(0, 0);
        }"""
    )
    page.wait_for_timeout(500)


def authenticate(page: Page) -> None:
    page.goto(f"{BASE_URL}/login")
    response = page.request.post(f"{BASE_URL}/api/auth/dev-guest")
    if not response.ok:
        raise RuntimeError(f"dev-guest failed: HTTP {response.status}")
    payload = response.json()
    onboarding = page.request.post(
        f"{BASE_URL}/api/auth/onboarding",
        headers={"Authorization": f"Bearer {payload['token']}"},
        data={"completed": True},
    )
    if not onboarding.ok:
        raise RuntimeError(f"onboarding setup failed: HTTP {onboarding.status}")
    payload["user"] = {**payload["user"], "onboarding_completed": True}
    page.evaluate(
        """(auth) => {
          localStorage.setItem('auth_token', auth.token);
          localStorage.setItem('auth_user', JSON.stringify(auth.user));
        }""",
        payload,
    )


def optional_click(page: Page, selector: str) -> None:
    locator = page.locator(selector).first
    try:
        locator.wait_for(state="visible", timeout=5_000)
        locator.click()
        page.wait_for_timeout(350)
    except PlaywrightTimeoutError:
        print(f"optional state unavailable: {selector}")


def wait_for_flashcard(page: Page) -> None:
    page.locator("[data-tour='flashcard-contenedor']").wait_for(
        state="visible",
        timeout=90_000,
    )


def capture(page: Page, output: Path, viewport_name: str, state: str) -> None:
    wait_until_stable(page)
    page.screenshot(path=output / f"{state}__{viewport_name}.png", full_page=True)


def capture_viewport(
    browser,
    output: Path,
    viewport_name: str,
    viewport: dict[str, int],
    public_only: bool = False,
) -> None:
    anonymous = browser.new_context(viewport=viewport, reduced_motion="no-preference")
    public_page = anonymous.new_page()
    for state, path in (("landing", "/"), ("login", "/login")):
        public_page.goto(f"{BASE_URL}{path}")
        capture(public_page, output, viewport_name, state)
    anonymous.close()

    if public_only:
        return

    authenticated = browser.new_context(viewport=viewport, reduced_motion="no-preference")
    page = authenticated.new_page()
    authenticate(page)

    page.goto(f"{BASE_URL}/dashboard")
    capture(page, output, viewport_name, "dashboard")

    page.goto(f"{BASE_URL}/flashcard")
    wait_for_flashcard(page)
    capture(page, output, viewport_name, "flashcard-front")

    optional_click(page, "[data-tour='boton-voltear-tarjeta']")
    capture(page, output, viewport_name, "flashcard-back")

    page.goto(f"{BASE_URL}/flashcard")
    wait_for_flashcard(page)
    optional_click(page, ".floatingMainButton")
    optional_click(page, "[data-tour='catalogo-categorias']")
    capture(page, output, viewport_name, "catalog")

    page.goto(f"{BASE_URL}/flashcard")
    wait_for_flashcard(page)
    optional_click(page, "[class*='ipaChartBtn']")
    capture(page, output, viewport_name, "ipa")

    page.goto(f"{BASE_URL}/dashboard")
    optional_click(page, ".hamburger-btn")
    capture(page, output, viewport_name, "sidebar")

    page.goto(f"{BASE_URL}/dashboard")
    optional_click(page, ".floatingMainButton")
    capture(page, output, viewport_name, "floating-menu")
    authenticated.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--viewport", choices=tuple(VIEWPORTS), action="append")
    parser.add_argument("--public-only", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        selected = args.viewport or list(VIEWPORTS)
        for viewport_name in selected:
            viewport = VIEWPORTS[viewport_name]
            capture_viewport(
                browser,
                args.output,
                viewport_name,
                viewport,
                public_only=args.public_only,
            )
        browser.close()

    manifest = {"base_url": BASE_URL, "viewports": VIEWPORTS}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
