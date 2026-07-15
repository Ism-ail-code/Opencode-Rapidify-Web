(function () {
  var script = document.currentScript;
  if (!script) return;

  // ── Configuration ────────────────────────────────────────────────────
  // data-merchant is the NEW recommended attribute for the merchant's
  // human-readable slug. It scopes the SKU lookup so that products are
  // resolved within the correct merchant catalog.
  var merchantSlug = script.getAttribute("data-merchant") || "";

  // Legacy fallback attributes (kept for backward compatibility):
  //   data-merchant-slug  →  treated as alias for data-merchant
  //   data-external-sku   →  explicit SKU override when auto-detection fails
  //   data-sku            →  shorter alias for data-external-sku
  //   data-product-slug   →  explicit product slug override (niche)
  if (!merchantSlug) merchantSlug = script.getAttribute("data-merchant-slug") || "";
  var explicitSku = script.getAttribute("data-external-sku") || script.getAttribute("data-sku") || "";
  var productSlugOverride = script.getAttribute("data-product-slug") || "";

  var mountSelector = script.getAttribute("data-mount") || ".product-buy-button";
  var apiBase = (script.getAttribute("data-api-base") || new URL(script.src, window.location.href).origin).replace(/\/$/, "");

  // ── Helpers ──────────────────────────────────────────────────────────
  function textOf(selector) {
    var element = document.querySelector(selector);
    if (!element) return "";
    return element.getAttribute("content") || element.getAttribute("value") || element.textContent || "";
  }

  /** Auto-detect the product SKU from the page HTML. Runs FIRST so that
   *  the global script (no data attributes) works out of the box. */
  function scrapeIdentifier() {
    var candidates = [
      textOf('[itemprop="sku"]'),
      textOf('meta[name="sku"]'),
      textOf('meta[property="product:retailer_item_id"]'),
      textOf('[data-sku]'),
      textOf('[data-product-sku]'),
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      if (candidates[index] && candidates[index].trim()) return candidates[index].trim();
    }

    // Amazon product pages expose an ASIN in several markup variants.
    var asinElement = document.querySelector('[data-asin]');
    if (asinElement && asinElement.getAttribute("data-asin")) return asinElement.getAttribute("data-asin").trim();
    var asinMatch = window.location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
      || document.documentElement.innerHTML.match(/\bASIN\s*[:=]\s*["']?([A-Z0-9]{10})/i);
    return asinMatch ? asinMatch[1] : "";
  }

  function buttonHtml() {
    return '<button type="button" class="rapidify-ar-btn" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#111;color:#fff;border:0;border-radius:8px;font:500 14px system-ui,sans-serif;cursor:pointer;margin-top:12px">View in 3D / AR</button>';
  }

  function showDesktopHandoff(url) {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.68);padding:16px";
    var panel = document.createElement("div");
    panel.style.cssText = "max-width:360px;border-radius:14px;background:#fff;padding:24px;color:#111;font:14px system-ui,sans-serif;text-align:center";
    panel.innerHTML = '<strong style="display:block;font-size:17px;margin-bottom:8px">Open on mobile for AR</strong><p style="color:#555;line-height:1.45;margin:0 0 16px">Send this Rapidify product link to your phone to launch AR.</p><a style="display:block;overflow-wrap:anywhere;color:#2563eb;margin-bottom:16px" href="' + url.replace(/"/g, "&quot;") + '">' + url + '</a><button type="button" style="border:0;border-radius:8px;padding:10px 16px;cursor:pointer">Close</button>';
    panel.querySelector("button").onclick = function () { overlay.remove(); };
    overlay.onclick = function (event) { if (event.target === overlay) overlay.remove(); };
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function mount(meta) {
    if (!meta || !meta.ready) return;
    var target = document.querySelector(mountSelector);
    if (!target || target.querySelector(".rapidify-ar-btn")) return;
    var holder = document.createElement("span");
    holder.innerHTML = buttonHtml();
    var button = holder.firstChild;
    var url = apiBase + "/p/" + encodeURIComponent(meta.slug || productSlugOverride);
    button.onclick = function () {
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) window.location.assign(url);
      else showDesktopHandoff(url);
    };
    target.appendChild(button);
  }

  function buildQuery() {
    // 1. Auto-detect SKU from page content (works for most storefronts)
    var sku = scrapeIdentifier();
    
    // 2. Fallback: explicit SKU from data attribute (backward compat / override)
    if (!sku && explicitSku) sku = explicitSku;
    
    // 3. Build query string
    if (sku) {
      var query = "sku=" + encodeURIComponent(sku);
      if (merchantSlug) query += "&merchant_slug=" + encodeURIComponent(merchantSlug);
      return query;
    }
    
    // 4. Last resort: explicit product slug override
    if (productSlugOverride) return "slug=" + encodeURIComponent(productSlugOverride);
    
    return "";
  }

  function init() {
    var query = buildQuery();
    if (!query) return;
    fetch(apiBase + "/api/public/asset-meta?" + query, { credentials: "omit" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(mount)
      .catch(function () { /* Widgets fail closed and remain invisible. */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
