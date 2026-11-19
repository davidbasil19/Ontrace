/* OnTrace boot script: runs before the app. */
(function () {
  // Frame protection: OnTrace must never run inside another site's frame (prevents clickjacking).
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) {}
    document.documentElement.style.display = "none";
    return;
  }
  // If the app's libraries fail to load (very slow or blocked connection), say so instead of sitting on "Loading…".
  window.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      var b = document.getElementById("connectBtn");
      if (b && b.disabled) {
        var s = document.getElementById("status");
        if (s) { s.className = "status err"; s.textContent = "OnTrace is taking a long time to load. Check your connection and refresh the page."; }
      }
    }, 25000);
  });
})();
