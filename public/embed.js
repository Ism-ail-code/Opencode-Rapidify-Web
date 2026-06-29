(function(){
  var S=document.currentScript;
  var MERCHANT=S.getAttribute("data-merchant-slug")||"";
  var SKU=S.getAttribute("data-external-sku")||"";
  var MOUNT=S.getAttribute("data-mount")||".product-buy-button";

  function btnHTML(){
    return '<button class="rapidify-ar-btn" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#111;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.2);margin-top:12px" onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.3)\'" onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.2)\'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> View in 3D</button>';
  }

  function qrModal(url){
    var o=document.createElement("div");
    o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999";
    var m=document.createElement("div");
    m.style.cssText="background:#fff;padding:32px;border-radius:16px;max-width:90vw;width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center";
    var qr="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(url);
    m.innerHTML='<h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111">Place in AR</h2><p style="margin:0 0 20px;color:#666;font-size:13px">Scan with your phone camera</p><img src="'+qr+'" style="width:200px;height:200px;border:1px solid #e0e0e0;border-radius:8px" alt="QR"/><br><button onclick="this.closest(\'div\').parentElement.remove()" style="margin-top:20px;width:100%;padding:12px;background:#f5f5f5;border:none;border-radius:8px;cursor:pointer;font-size:14px">Close</button>';
    o.appendChild(m);
    o.onclick=function(e){if(e.target===o)o.remove()};
    document.body.appendChild(o);
  }

  function init(){
    var target=document.querySelector(MOUNT);
    if(!target)return;

    var href="/p/"+encodeURIComponent(MERCHANT);
    if(SKU)href+="?sku="+encodeURIComponent(SKU);

    var b=document.createElement("span");
    b.innerHTML=btnHTML();
    var btn=b.firstElementChild;
    btn.onclick=function(){
      if(/Mobi|Android/i.test(navigator.userAgent)){
        window.location.href=href;
      }else{
        qrModal(window.location.origin+href);
      }
    };

    var old=target.querySelector(".rapidify-ar-btn");
    if(old)old.remove();
    target.appendChild(btn);
  }

  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init)}else{init()}
})();
