/* OnTrace boot script: runs before the app. */
(function () {
  // Frame protection: OnTrace must never run inside another site's frame (prevents clickjacking).
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) {}
    document.documentElement.style.display = "none";
    return;
  }
  // Show the right screen straight away, before the (larger) app script has downloaded.
  window.addEventListener("DOMContentLoaded", function () {
    var tabs = ["dashboard","scan","check","inspect","dev","graph","watch","trending","swap","send","create","settings"];
    var h = location.hash.slice(1), land = document.getElementById("landing"), app = document.getElementById("app");
    if (!land || !app) return;
    if (tabs.indexOf(h) >= 0) {
      land.classList.add("hidden"); app.classList.remove("hidden");
      tabs.forEach(function (t) { var el = document.getElementById("tab-" + t); if (el) el.classList.toggle("hidden", t !== h); });
    } else { land.classList.remove("hidden"); app.classList.add("hidden"); }
  });
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
