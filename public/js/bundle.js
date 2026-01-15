(() => {
  // <stdin>
  (function() {
    "use strict";
    window.addEventListener("DOMContentLoaded", () => {
      let menu = document.getElementById("nav-dropdown-menu");
      const menu_btn = document.getElementById("nav-dropdown-button");
      menu_btn.addEventListener("click", (e) => {
        e.preventDefault();
        menu.classList.toggle("hidden");
        window.addEventListener("click", () => {
        });
        window.addEventListener("scroll", () => {
        });
      });
    });
  })();
  (function() {
    "use strict";
    const getCachedTheme = () => {
      const cachedTheme = localStorage.getItem("color-scheme");
      const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return cachedTheme || (preferDark ? "dark" : "light");
    };
    document.documentElement.setAttribute("color-scheme", getCachedTheme());
    window.addEventListener("DOMContentLoaded", () => {
      requestAnimationFrame(() => document.body.classList.remove("notransition"));
      document.getElementById("theme-switcher").addEventListener("click", (e) => {
        e.preventDefault();
        const state = getCachedTheme() === "light" ? "dark" : "light";
        document.documentElement.setAttribute("color-scheme", state);
        localStorage.setItem("color-scheme", state);
      });
    });
  })();
})();
