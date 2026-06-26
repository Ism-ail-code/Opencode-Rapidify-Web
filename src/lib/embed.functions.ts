import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    event_type: z.enum(["product_view", "ar_launch", "buy_click", "qr_open", "embed_open", "variant_switch", "session_start"]),
    session_id: z.string().nullable().optional(),
    product_id: z.string().uuid().nullable().optional(),
    merchant_id: z.string().uuid().nullable().optional(),
    variant_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    device_type: z.enum(["desktop", "mobile"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event_type: data.event_type,
      session_id: data.session_id ?? null,
      product_id: data.product_id ?? null,
      merchant_id: data.merchant_id ?? null,
      variant_id: data.variant_id ?? null,
      metadata: data.metadata ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const getPublicAssetMeta = createServerFn({ method: "GET" })
  .inputValidator((d: { merchant_slug: string; external_product_id: string }) => z.object({
    merchant_slug: z.string().min(1).max(120),
    external_product_id: z.string().min(1).max(120),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, description, price_cents, currency, thumbnail_url, model_glb_url, model_usdz_url, buy_url, status, merchant_id")
      .eq("slug", data.merchant_slug)
      .eq("status", "active")
      .maybeSingle();
    
    if (productError) throw productError;
    if (!product) return null;
    
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, name, color_hex, model_glb_url, model_usdz_url, thumbnail_url, sort_order")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true });
    
    if (variantsError) throw variantsError;
    
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("processing_jobs")
      .select("status, provider, result")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (jobsError) throw jobsError;
    
    const latestJob = jobs?.[0];
    const isReady = latestJob?.status === "ready" && latestJob?.provider === "meshy";
    
    return {
      ready: isReady,
      glb_url: product.model_glb_url,
      usdz_url: product.model_usdz_url,
      product_title: product.title,
      price_cents: product.price_cents,
      currency: product.currency,
      thumbnail_url: product.thumbnail_url,
      buy_url: product.buy_url,
      variants: variants ?? [],
    };
  });

export const getEmbedScript = createServerFn({ method: "GET" })
  .inputValidator((d: { merchant_slug: string; external_product_id: string; mount_selector: string }) => z.object({
    merchant_slug: z.string().min(1).max(120),
    external_product_id: z.string().min(1).max(120),
    mount_selector: z.string().min(1).max(120).default(".product-buy-button"),
  }).parse(d))
  .handler(async ({ data }) => {
    const assetMeta = await getPublicAssetMeta({ data });
    
    if (!assetMeta) {
      return `// Product not found or not ready
console.warn('[Rapidify Embed] Product not found or not ready');`;
    }
    
    const script = `
(function() {
  const SCRIPT_TAG = document.currentScript;
  const MERCHANT = SCRIPT_TAG.getAttribute('data-merchant') || '${data.merchant_slug}';
  const PRODUCT = SCRIPT_TAG.getAttribute('data-product') || '${data.external_product_id}';
  const MOUNT_SELECTOR = SCRIPT_TAG.getAttribute('data-mount') || '${data.mount_selector}';
  
  async function checkAvailability() {
    try {
      const response = await fetch('/api/public/asset-meta?merchant_slug=' + encodeURIComponent(MERCHANT) + '&external_product_id=' + encodeURIComponent(PRODUCT));
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[Rapidify Embed] Failed to fetch asset metadata:', error);
      return null;
    }
  }
  
  function injectButton(productData) {
    const target = document.querySelector(MOUNT_SELECTOR);
    if (!target) {
      console.warn('[Rapidify Embed] Target element not found:', MOUNT_SELECTOR);
      return;
    }
    
    const button = document.createElement('button');
    button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg> View in 3D';
    button.className = 'rapidify-ar-button';
    button.style.cssText = '
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #a78bfa, #7c5cfc);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(124, 92, 252, 0.3);
      margin-top: 12px;
    ';
    button.onmouseover = () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 4px 16px rgba(124, 92, 252, 0.4)';
    };
    button.onmouseout = () => {
      button.style.transform = 'none';
      button.style.boxShadow = '0 2px 8px rgba(124, 92, 252, 0.3)';
    };
    button.onclick = () => handleARLaunch(productData);
    
    const existing = target.querySelector('.rapidify-ar-button');
    if (existing) existing.remove();
    
    target.appendChild(button);
  }
  
  async function handleARLaunch(productData) {
    const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    
    try {
      await fetch('/api/public/trackEvent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'ar_launch',
          product_id: productData.id,
          merchant_id: productData.merchant_id,
          device_type: deviceType,
          metadata: { source: 'embed_script' }
        })
      });
    } catch (error) {
      console.error('[Rapidify Embed] Failed to track AR launch:', error);
    }
    
    if (deviceType === 'mobile') {
      const appUrl = 'https://rapidify.app/arview?product_id=' + productData.id;
      window.location.href = appUrl;
    } else {
      showQRModal(productData.id);
    }
  }
  
  function showQRModal(productId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = '
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s;
    ';
    
    const modal = document.createElement('div');
    modal.style.cssText = '
      background: white;
      padding: 32px;
      border-radius: 16px;
      max-width: 90vw;
      width: 400px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      transform: scale(0.9);
      opacity: 0;
      transition: all 0.3s;
    ';
    
    modal.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #1a1a1a;">Place in AR</h2>
      <p style="margin: 0 0 24px 0; color: #666; line-height: 1.5;">Scan with your phone camera to place this item in your room!</p>
      <div id="qr-container" style="display: flex; justify-content: center; margin: 24px 0;"></div>
      <button id="close-modal" style="width: 100%; padding: 12px; background: #f5f5f5; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; color: #333;">Close</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1)';
      modal.style.opacity = '1';
    }, 10);
    
    generateQRCode(productId, document.getElementById('qr-container'));
    
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.9)';
      modal.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      }, 300);
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeBtn.click();
      }
    };
  }
  
  function generateQRCode(text, container) {
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text);
    const img = document.createElement('img');
    img.src = qrUrl;
    img.style.cssText = 'width: 200px; height: 200px; border: 1px solid #e0e0e0; border-radius: 8px;';
    img.alt = 'Scan to view in AR';
    container.appendChild(img);
  }
  
  async function init() {
    const productData = await checkAvailability();
    if (productData && productData.ready) {
      injectButton(productData);
    } else {
      console.warn('[Rapidify Embed] Product not available:', productData);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
    
    return script;
  });
