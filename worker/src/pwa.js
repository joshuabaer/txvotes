// PWA — Full web app served as a single HTML page
// All CSS and JS inline — no build step

export function handlePWA() {
  return new Response(APP_HTML, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export function handlePWA_SW() {
  return new Response(SERVICE_WORKER, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache",
    },
  });
}

export function handlePWA_Clear(redirectUrl = '/', title = 'Texas Votes', description = 'Get a personalized, nonpartisan voting guide for Texas elections in 5 minutes.', image = 'https://txvotes.app/og-image.png') {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title>' +
    '<meta name="description" content="' + description + '">' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">' +
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
    '<link rel="icon" type="image/x-icon" href="/favicon.ico">' +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
    '<meta property="og:title" content="' + title + '">' +
    '<meta property="og:description" content="' + description + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="Texas Votes">' +
    '<meta property="og:image" content="' + image + '">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta property="og:image:type" content="image/png">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + title + '">' +
    '<meta name="twitter:description" content="' + description + '">' +
    '<meta name="twitter:image" content="' + image + '">' +
    '<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;' +
    'align-items:center;justify-content:center;min-height:100vh;margin:0;' +
    'background:#f5f5f5;color:#333;text-align:center}' +
    '@media(prefers-color-scheme:dark){body{background:#1a1a1a;color:#e5e5e5}}' +
    '.box{padding:2rem;max-width:400px}h2{margin:0 0 1rem}p{color:#666;line-height:1.5}' +
    '.done{color:#22c55e;font-weight:600}</style></head><body><div class="box">' +
    '<h2>Updating Texas Votes...</h2><p id="status">Clearing old cache...</p></div>' +
    '<script>' +
    '(async function(){' +
      'var s=document.getElementById("status");' +
      'try{' +
        'try{localStorage.clear()}catch(e){}' +
        'var swCount=0;' +
        'if("serviceWorker" in navigator){' +
          'var regs=await navigator.serviceWorker.getRegistrations();' +
          'for(var r of regs){await r.unregister();swCount++}' +
        '}' +
        'var keys=await caches.keys();' +
        'for(var k of keys) await caches.delete(k);' +
        's.innerHTML="<span class=done>Updated!</span><br><br>Redirecting...";' +
        'setTimeout(function(){location.replace("' + redirectUrl + '")},1000);' +
      '}catch(e){' +
        's.textContent="Error: "+e.message+". Try manually clearing browser data.";' +
      '}' +
    '})();' +
    '</script></body></html>';
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store, no-cache",
    },
  });
}

export function handlePWA_Manifest() {
  return new Response(MANIFEST, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// MARK: - Service Worker

var SERVICE_WORKER = [
  "var CACHE='usvotes-v2';",
  "self.addEventListener('install',function(e){",
  "  self.skipWaiting();",
  "});",
  "self.addEventListener('activate',function(e){",
  "  e.waitUntil(caches.keys().then(function(ks){",
  "    return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));",
  "  }));",
  "  self.clients.claim();",
  "});",
  "self.addEventListener('fetch',function(e){",
  "  if(e.request.url.indexOf('/app/api/')!==-1){",
  "    e.respondWith(fetch(e.request).catch(function(){",
  "      return new Response('{\"error\":\"offline\"}',{status:503,headers:{'Content-Type':'application/json'}});",
  "    }));",
  "    return;",
  "  }",
  // Network-first for app shell: always fetch latest, cache for offline fallback
  // Cached responses older than 1 hour are discarded
  "  e.respondWith(fetch(e.request).then(function(res){",
  "    var clone=res.clone();",
  "    caches.open(CACHE).then(function(c){c.put(e.request,clone)});",
  "    return res;",
  "  }).catch(function(){return caches.match(e.request).then(function(cached){",
  "    if(!cached)return cached;",
  "    var d=cached.headers.get('date');",
  "    if(d&&(Date.now()-new Date(d).getTime())>3600000)return undefined;",
  "    return cached;",
  "  })}));",
  "});",
].join("\n");

// MARK: - Manifest

var MANIFEST = JSON.stringify({
  name: "Texas Votes",
  short_name: "TX Votes",
  description:
    "Your personalized voting guide for Texas elections",
  start_url: "/app",
  display: "standalone",
  background_color: "#faf8f0",
  theme_color: "#21598e",
  icons: [
    {
      src:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
            '<defs><clipPath id="s"><path d="M56 48h400c10 0 16 6 16 16v256c0 108-200 148-216 156C240 468 40 428 40 320V64c0-10 6-16 16-16Z"/></clipPath></defs>' +
            '<g clip-path="url(#s)"><rect x="40" y="48" width="432" height="440" fill="#21598F"/>' +
            '<rect x="210" y="48" width="270" height="86" fill="#FFF"/>' +
            '<rect x="210" y="134" width="270" height="86" fill="#BF2626"/>' +
            '<rect x="210" y="220" width="270" height="86" fill="#FFF"/>' +
            '<rect x="210" y="306" width="270" height="86" fill="#BF2626"/>' +
            '<rect x="210" y="392" width="270" height="86" fill="#FFF"/></g>' +
            '<path d="M125 166 L140 209 L186 210 L150 238 L163 282 L125 256 L87 282 L100 238 L64 210 L110 209Z" fill="#FFF"/>' +
            "</svg>"
        ),
      sizes: "512x512",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
            '<defs><clipPath id="s"><path d="M21 18h150c4 0 6 2 6 6v96c0 40-75 56-81 59-6-3-81-19-81-59V24c0-4 2-6 6-6Z"/></clipPath></defs>' +
            '<g clip-path="url(#s)"><rect x="15" y="18" width="162" height="165" fill="#21598F"/>' +
            '<rect x="79" y="18" width="102" height="33" fill="#FFF"/>' +
            '<rect x="79" y="51" width="102" height="33" fill="#BF2626"/>' +
            '<rect x="79" y="84" width="102" height="33" fill="#FFF"/>' +
            '<rect x="79" y="117" width="102" height="33" fill="#BF2626"/>' +
            '<rect x="79" y="150" width="102" height="33" fill="#FFF"/></g>' +
            '<path d="M47 62 L53 78 L70 78 L56 89 L61 105 L47 96 L33 105 L38 89 L24 78 L41 78Z" fill="#FFF"/>' +
            "</svg>"
        ),
      sizes: "192x192",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
            '<rect width="512" height="512" fill="#21598F"/>' +
            '<defs><clipPath id="m"><path d="M107 99h298c7 0 12 5 12 12v191c0 81-149 111-161 117-12-6-161-36-161-117V111c0-7 5-12 12-12Z"/></clipPath></defs>' +
            '<g clip-path="url(#m)"><rect x="95" y="99" width="322" height="328" fill="#21598F"/>' +
            '<rect x="258" y="99" width="163" height="65" fill="#FFF"/>' +
            '<rect x="258" y="164" width="163" height="65" fill="#BF2626"/>' +
            '<rect x="258" y="229" width="163" height="65" fill="#FFF"/>' +
            '<rect x="258" y="294" width="163" height="65" fill="#BF2626"/>' +
            '<rect x="258" y="359" width="163" height="65" fill="#FFF"/></g>' +
            '<path d="M176 205 L187 243 L228 244 L195 265 L205 303 L176 283 L147 303 L157 265 L124 244 L165 243Z" fill="#FFF"/>' +
            "</svg>"
        ),
      sizes: "512x512",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
});

// MARK: - CSS

var CSS = [
  "*{margin:0;padding:0;box-sizing:border-box}",
  ":root{" +
    "--blue:rgb(33,89,143);--red:rgb(191,38,38);--gold:rgb(217,166,33);--bg:#faf8f0;--card:#fff;" +
    "--text:rgb(31,31,36);--text2:rgb(115,115,128);" +
    "--ok:rgb(51,166,82);--warn:rgb(230,140,26);--bad:rgb(209,51,51);" +
    "--rep:rgb(217,38,38);--dem:rgb(38,77,191);" +
    "--border:rgba(128,128,128,.15);--border2:rgba(128,128,128,.25);" +
    "--fill3:rgba(128,128,128,.08);--shadow:rgba(0,0,0,.06);" +
    "--r:16px;--rs:10px;--ps:8px;--pm:16px;--pl:24px" +
    "}",
  "@media(prefers-color-scheme:dark){:root{" +
    "--blue:rgb(102,153,217);--red:rgb(235,88,88);--gold:rgb(242,191,64);--bg:rgb(28,28,31);--card:rgb(43,43,46);" +
    "--text:rgb(237,237,240);--text2:rgb(153,153,166);" +
    "--ok:rgb(77,199,107);--warn:rgb(255,166,51);--bad:rgb(255,89,89);" +
    "--rep:rgb(255,77,77);--dem:rgb(89,128,242);" +
    "--border:rgba(255,255,255,.15);--border2:rgba(255,255,255,.2);" +
    "--fill3:rgba(255,255,255,.08);--shadow:rgba(0,0,0,.3)" +
    "}}",
  "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;border-top:3px solid var(--red)}",
  "#app{max-width:480px;margin:0 auto;padding:var(--pm)}",
  "@media(min-width:600px){#app{max-width:680px}}",
  ".card{background:var(--card);border-radius:var(--r);padding:var(--pm);box-shadow:0 2px 8px var(--shadow);margin-bottom:12px;overflow:hidden;word-break:break-word}",
  ".card-touch{cursor:pointer;transition:transform .15s}",
  ".card-touch:active{transform:scale(.98)}",

  // Buttons
  ".btn{display:block;width:100%;padding:14px;border:none;border-radius:var(--rs);font-size:17px;font-weight:700;cursor:pointer;text-align:center;transition:opacity .15s;font-family:inherit;text-decoration:none}",
  ".btn:active{opacity:.85}",
  ".btn-primary{background:var(--blue);color:#fff}",
  ".btn-secondary{background:rgba(33,89,143,.1);color:var(--blue)}",
  "@media(prefers-color-scheme:dark){.btn-secondary{background:rgba(102,153,217,.15)}}",
  ".btn-danger{background:rgba(209,51,51,.1);color:var(--bad)}",
  ".btn:disabled{opacity:.4;cursor:default}",

  // Chips
  ".chip{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:99px;border:1.5px solid var(--border2);background:var(--fill3);font-size:15px;cursor:pointer;transition:all .15s;user-select:none}",
  ".chip-on{background:var(--blue);color:#fff;border-color:var(--blue)}",
  ".chip svg{flex-shrink:0}",
  ".chip-grid{display:flex;flex-wrap:wrap;gap:10px}",

  // Sortable priority list
  ".sort-list{list-style:none;padding:0;margin:0}",
  ".sort-item{display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:4px;border-radius:var(--rs);border:1.5px solid var(--border2);background:var(--fill3);font-size:15px;user-select:none;touch-action:pan-y;position:relative;transition:transform .15s ease,box-shadow .15s ease}",
  ".sort-item.dragging{box-shadow:0 4px 16px rgba(0,0,0,.18);z-index:10;opacity:.95;transition:none;touch-action:none}",
  ".sort-item .rank{min-width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
  ".sort-item .rank-low{background:var(--border2);color:var(--text2)}",
  ".sort-item .drag-handle{cursor:grab;padding:4px;color:var(--text2);flex-shrink:0;font-size:18px;line-height:1;touch-action:none}",
  ".sort-item .sort-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".sort-item .sort-arrows{margin-left:auto;display:flex;gap:2px;flex-shrink:0}",
  ".sort-item .sort-arrows button{width:36px;height:36px;border:none;background:none;color:var(--text2);font-size:16px;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:0}",
  ".sort-item .sort-arrows button:active{background:var(--border)}",
  ".sort-item .sort-arrows button:disabled{opacity:.25;cursor:default}",
  ".sort-divider{text-align:center;font-size:12px;color:var(--text2);padding:6px 0;margin:4px 0;border-top:1.5px dashed var(--border2);letter-spacing:.3px}",
  ".sort-item-low{opacity:.55}",
  "@media(prefers-color-scheme:dark){.sort-item .rank-low{background:var(--fill3);color:var(--text2)}}",
  ".slot-empty{display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:4px;border-radius:var(--rs);border:2px dashed var(--border2);background:transparent;font-size:14px;color:var(--text2);min-height:48px;cursor:default;transition:background .15s}",
  ".slot-empty .rank{min-width:24px;height:24px;border-radius:50%;background:var(--border2);color:var(--text2);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
  ".slot-filled{cursor:pointer}",
  ".slot-filled:active{opacity:.8}",
  ".slot-filled .slot-remove{color:var(--text2);font-size:18px;font-weight:700;flex-shrink:0;margin-left:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s,color .15s}",
  ".slot-filled:hover .slot-remove,.slot-filled .slot-remove:active{color:#e74c3c;background:rgba(231,76,60,.1)}",
  ".pool-zone{margin-top:4px}",
  ".pool-item{display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:4px;border-radius:var(--rs);border:1.5px solid var(--border2);background:var(--fill3);font-size:15px;cursor:pointer;user-select:none;transition:transform .1s,opacity .15s}",
  ".pool-item:active{transform:scale(.97);opacity:.85}",
  ".pool-item .pool-icon{font-size:16px;flex-shrink:0}",
  ".pool-item .pool-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".pool-item .pool-add{color:var(--blue);font-size:18px;font-weight:700;flex-shrink:0;margin-left:auto}",
  ".zone-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin:12px 0 6px;padding:0 4px}",
  ".zone-label:first-child{margin-top:0}",
  ".pick-hint{text-align:center;font-size:13px;color:var(--text2);padding:8px 0}",

  // Radio options
  ".radio{padding:14px 16px;border-radius:var(--rs);border:1.5px solid var(--border2);background:var(--fill3);cursor:pointer;transition:all .15s;margin-bottom:10px}",
  ".radio-on{border-color:var(--blue);background:rgba(33,89,143,.1)}",
  "@media(prefers-color-scheme:dark){.radio-on{background:rgba(102,153,217,.15)}}",
  ".radio b{display:block;font-size:16px;margin-bottom:2px}",
  ".radio .desc{font-size:13px;color:var(--text2);line-height:1.4}",


  // Header
  ".phase-header{margin-bottom:var(--pl)}",
  ".phase-header h2{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px}",
  ".phase-header p{font-size:15px;color:var(--text2);line-height:1.5}",
  ".back-btn{display:inline-flex;align-items:center;gap:4px;font-size:15px;color:var(--blue);background:none;border:none;cursor:pointer;padding:8px 0;margin-bottom:8px;font-family:inherit;font-weight:600}",

  // Layout: body is flex column, #app scrolls, #tabs sticks to bottom
  "html,body{height:100%;margin:0;overflow-x:hidden;width:100%;max-width:100vw}",
  "body{display:flex;flex-direction:column;overflow-wrap:break-word;word-wrap:break-word}",
  "#app{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;width:100%}",

  // Top nav (desktop)
  "#topnav{display:none}",
  "@media(min-width:600px){" +
    "#topnav{display:block;background:var(--card);border-bottom:1px solid var(--border2);box-shadow:0 1px 4px var(--shadow)}" +
    ".topnav-inner{max-width:680px;margin:0 auto;display:flex;align-items:center;padding:0 var(--pm)}" +
    ".topnav-brand{font-size:18px;font-weight:800;color:var(--blue);margin-right:auto;padding:12px 0;letter-spacing:-.3px}" +
    ".topnav-link{display:flex;align-items:center;gap:6px;padding:12px 16px;font-size:14px;font-weight:600;color:var(--text2);text-decoration:none;cursor:pointer;border:none;background:none;font-family:inherit;transition:color .15s;border-bottom:2px solid transparent;margin-bottom:-1px}" +
    ".topnav-link:hover{color:var(--blue)}" +
    ".topnav-link.on{color:var(--blue);border-bottom-color:var(--red)}" +
    ".topnav-link svg{width:18px;height:18px}" +
    "#tabs{display:none}" +
  "}",

  // Bottom tab bar (mobile)
  ".tab-bar{background:var(--card);border-top:2px solid var(--border2);display:flex;max-width:680px;margin:0 auto;width:100%;padding:8px 0;padding-bottom:calc(8px + env(safe-area-inset-bottom,8px));box-shadow:0 -2px 8px var(--shadow)}",
  "#tabs{background:var(--card);box-shadow:0 -2px 8px var(--shadow)}",
  ".tab{flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 0 6px;font-size:13px;font-weight:700;color:var(--text2);text-decoration:none;gap:4px;cursor:pointer;border:none;background:none;font-family:inherit;transition:color .15s;white-space:nowrap}",
  ".tab:hover{color:var(--blue)}",
  ".tab-active{color:var(--blue)}",
  ".tab-icon{display:flex;align-items:center;justify-content:center;height:28px}",
  ".tab-icon svg{width:26px;height:26px}",

  // Party switcher
  ".party-row{display:flex;gap:10px;margin-bottom:16px}",
  ".party-btn{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;border-radius:var(--rs);font-size:16px;font-weight:700;cursor:pointer;border:1.5px solid;transition:all .2s;font-family:inherit;background:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}",
  ".party-rep{color:var(--rep);border-color:rgba(217,38,38,.3)}",
  ".party-rep.on{background:var(--rep);color:#fff;border-color:var(--rep)}",
  ".party-dem{color:var(--dem);border-color:rgba(38,77,191,.3)}",
  ".party-dem.on{background:var(--dem);color:#fff;border-color:var(--dem)}",
  ".lang-on{background:var(--blue);color:#fff;border-color:var(--blue)}",
  ".lang-off{background:var(--fill3);border-color:var(--border2);color:var(--text)}",

  // Badges
  ".badge{display:inline-block;font-size:14px;font-weight:600;padding:3px 10px;border-radius:99px;white-space:nowrap}",
  ".badge-ok{color:var(--ok);background:rgba(51,166,82,.12)}",
  ".badge-warn{color:var(--warn);background:rgba(230,140,26,.12)}",
  ".badge-bad{color:var(--bad);background:rgba(209,51,51,.12)}",
  ".badge-blue{color:var(--blue);background:rgba(33,89,143,.12)}",
  "@media(prefers-color-scheme:dark){.badge-ok{background:rgba(77,199,107,.15)}.badge-warn{background:rgba(255,166,51,.15)}.badge-bad{background:rgba(255,89,89,.15)}.badge-blue{background:rgba(102,153,217,.15)}}",
  ".star{color:var(--gold);font-size:12px;margin-left:6px}",

  // Disclaimer
  ".disclaimer{display:flex;gap:10px;align-items:flex-start;padding:12px;background:rgba(230,140,26,.08);border:1px solid rgba(230,140,26,.3);border-radius:var(--rs);margin-bottom:16px;font-size:13px;line-height:1.5;color:var(--text2);overflow:hidden}",
  ".disclaimer>div{min-width:0}",
  ".disclaimer b{color:var(--text);font-size:15px;display:block;margin-bottom:2px}",

  // Recommendation box
  ".rec-box{padding:14px;border-radius:var(--rs);border:1.5px solid var(--ok);background:rgba(51,166,82,.06);margin-bottom:16px;overflow:hidden;word-break:break-word}",
  "@media(prefers-color-scheme:dark){.rec-box{background:rgba(77,199,107,.08)}}",
  ".rec-box h4{font-size:17px;margin-bottom:4px}",
  ".rec-box p{font-size:14px;color:var(--text2);line-height:1.5}",

  // Candidate card
  ".cand-card{border:1.5px solid var(--border);border-radius:var(--rs);padding:14px;margin-bottom:10px;overflow:hidden;word-break:break-word}",
  ".cand-card.recommended{border-color:var(--ok)}",
  ".cand-avatar{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden}",
  ".cand-name{font-size:17px;font-weight:700;overflow-wrap:break-word;word-break:break-word;min-width:0}",
  ".cand-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}",
  ".cand-summary{font-size:14px;color:var(--text2);line-height:1.5;margin-top:8px}",
  ".cand-details{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}",
  ".cand-section{margin-bottom:10px}",
  ".cand-section h5{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}",
  ".cand-section.pros h5{color:var(--ok)}",
  ".cand-section.cons h5{color:var(--bad)}",
  ".cand-section li{font-size:14px;line-height:1.5;margin-left:16px;margin-bottom:2px}",
  ".pos-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
  ".pos-chip{font-size:13px;padding:4px 10px;border-radius:12px;background:rgba(33,89,143,.08);color:var(--blue)}",
  "@media(prefers-color-scheme:dark){.pos-chip{background:rgba(102,153,217,.12)}}",

  // Expand toggle
  ".expand-toggle{font-size:14px;color:var(--blue);cursor:pointer;background:none;border:none;padding:8px 0;font-weight:600;font-family:inherit}",

  // Proposition card
  ".prop-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;min-width:0}",
  ".prop-title{font-size:16px;font-weight:700;min-width:0;flex:1}",
  ".prop-desc{font-size:14px;color:var(--text2);line-height:1.5;margin-top:6px}",
  ".prop-trans{font-size:13px;color:var(--text2);line-height:1.5;margin-top:4px;font-style:italic}",
  ".prop-details{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}",
  ".prop-section{margin-bottom:10px}",
  ".prop-section h5{font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}",
  ".prop-section p{font-size:14px;line-height:1.5}",
  ".prop-cols{display:flex;gap:12px;margin-bottom:10px}",
  ".prop-col{flex:1;min-width:0}",
  ".prop-col h5{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}",
  ".prop-col.for h5{color:var(--ok)}",
  ".prop-col.against h5{color:var(--bad)}",
  ".prop-col ul{margin:0;padding-left:16px}",
  ".prop-col li{font-size:13px;line-height:1.5;margin-bottom:2px}",
  ".prop-outcome{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:var(--rs);margin-bottom:6px;font-size:13px;line-height:1.5;overflow:hidden}",
  ".prop-outcome>div{min-width:0}",
  ".prop-outcome.pass{background:rgba(51,166,82,.06);border:1px solid rgba(51,166,82,.2)}",
  ".prop-outcome.fail{background:rgba(209,51,51,.06);border:1px solid rgba(209,51,51,.2)}",
  "@media(prefers-color-scheme:dark){.prop-outcome.pass{background:rgba(77,199,107,.08)}.prop-outcome.fail{background:rgba(255,89,89,.08)}}",
  ".prop-reasoning{display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:var(--rs);background:rgba(33,89,143,.04);margin-top:8px;font-size:13px;line-height:1.5;font-style:italic;color:var(--text2);overflow:hidden}",
  ".prop-reasoning>div{min-width:0}",
  "@media(prefers-color-scheme:dark){.prop-reasoning{background:rgba(102,153,217,.06)}}",

  // Section headers
  ".section-head{font-size:18px;font-weight:800;margin:24px 0 12px;display:flex;align-items:center;gap:8px}",
  ".section-head:first-child{margin-top:0}",
  ".section-head::before{content:'\\2605';color:var(--red);font-size:14px}",

  // Loading
  ".loading{text-align:center;padding:60px 20px}",
  ".loading h2{font-size:22px;font-weight:800;margin-bottom:8px}",
  ".loading p{font-size:15px;color:var(--text2);margin-bottom:24px}",
  ".spinner{width:48px;height:48px;border:4px solid var(--border);border-top-color:var(--blue);border-bottom-color:var(--red);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 24px}",
  "@keyframes spin{to{transform:rotate(360deg)}}",
  ".loading-icon{font-size:56px;margin-bottom:16px}",
  "@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}",
  "@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
  ".stream-card-in{animation:cardIn .3s ease-out}",
  ".stream-bar{background:linear-gradient(90deg,var(--blue),var(--red),var(--blue));background-size:200% 100%;animation:streamShimmer 2s linear infinite;color:#fff;text-align:center;padding:10px 16px;border-radius:12px;margin-bottom:12px;font-size:14px;font-weight:600}",
".stream-progress{font-size:20px;font-weight:700;margin-top:4px;letter-spacing:1px}",
  "@keyframes streamShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}",
  ".stream-pending{opacity:.5;border:1px dashed var(--border2)}",
  ".dots{display:flex;gap:6px;justify-content:center;margin-top:16px}",
  ".dot{font-size:14px;color:var(--border);line-height:1}",
  ".dot-done-red{color:#c62626}",
  ".dot-done-white{color:#ffffff;text-shadow:0 0 1px rgba(0,0,0,.3)}",
  ".dot-done-blue{color:#2563eb}",
  ".dot-active-red{color:#c62626;animation:pulse 1s ease-in-out infinite}",
  ".dot-active-white{color:#ffffff;text-shadow:0 0 1px rgba(0,0,0,.3);animation:pulse 1s ease-in-out infinite}",
  ".dot-active-blue{color:#2563eb;animation:pulse 1s ease-in-out infinite}",
  "@keyframes pulse{50%{transform:scale(1.3)}}",
  "@keyframes fwLaunch{0%{transform:translateY(0);opacity:1}100%{transform:translateY(var(--fw-rise));opacity:1}}",
  "@keyframes fwBurst{0%{transform:translate(0,0) scale(1);opacity:1}60%{opacity:1}100%{transform:translate(var(--fw-dx),var(--fw-dy)) scale(0);opacity:0}}",
  "@keyframes fwTrail{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(.3)}}",
  "@keyframes fwGlow{0%{transform:scale(0);opacity:1}20%{transform:scale(2);opacity:.9}100%{transform:scale(4);opacity:0}}",
  ".fw-shell{position:fixed;width:5px;height:20px;border-radius:2px;z-index:9999;pointer-events:none;animation:fwLaunch var(--fw-dur) ease-out forwards}",
  ".fw-spark{position:fixed;width:var(--fw-size);height:var(--fw-size);border-radius:50%;z-index:9999;pointer-events:none;animation:fwBurst var(--fw-burst-dur) ease-out forwards;box-shadow:0 0 6px var(--fw-color)}",
  ".fw-trail{position:fixed;width:3px;height:3px;border-radius:50%;z-index:9998;pointer-events:none;animation:fwTrail .6s ease-out forwards}",
  ".fw-glow{position:fixed;width:40px;height:40px;border-radius:50%;z-index:9997;pointer-events:none;animation:fwGlow 1s ease-out forwards}",
  ".fw-emoji{position:fixed;z-index:9999;pointer-events:none;font-size:28px;animation:fwBurst var(--fw-burst-dur) ease-out forwards}",
  ".fw-canvas{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none}",
  "@keyframes emojiFall{0%{transform:translateY(0) scale(0);opacity:1}20%{transform:translateY(-40vh) scale(1.2);opacity:1}100%{transform:translateY(-120vh) scale(0.6) rotate(360deg);opacity:0}}",
  ".share-prompt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn .3s ease}",
  ".share-prompt-card{background:var(--card);border-radius:16px;padding:28px 24px;max-width:340px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2)}",
  ".share-prompt-card h3{font-size:22px;margin:0 0 8px}",
  ".share-prompt-card p{font-size:15px;color:var(--text2);margin:0 0 20px;line-height:1.5}",
  ".share-prompt-dismiss{background:none;border:none;font-size:14px;color:var(--text2);cursor:pointer;margin-top:12px;padding:8px}",
  ".share-cta{background:linear-gradient(135deg,rgba(33,89,143,.08),rgba(191,38,38,.08));border:2px dashed var(--border2);border-radius:var(--r);padding:20px;text-align:center;margin-bottom:16px;overflow:hidden;word-break:break-word}",
  ".share-cta-icon{font-size:32px;margin-bottom:8px}",
  ".share-cta-title{font-size:18px;font-weight:800;margin-bottom:6px}",
  ".share-cta-body{font-size:14px;color:var(--text2);line-height:1.5;margin-bottom:14px}",
  ".share-cta-btn{display:inline-block;width:auto;padding:12px 28px;font-size:16px}",

  // Report issue modal
  ".report-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn .3s ease}",
  ".report-card{background:var(--card);border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto}",
  ".report-card h3{font-size:18px;font-weight:800;margin:0 0 4px}",
  ".report-card .report-subtext{font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.4}",
  ".report-card .report-radio{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}",
  ".report-card .report-radio label{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;padding:8px 10px;border-radius:var(--rs);border:1.5px solid var(--border2);transition:border-color .2s}",
  ".report-card .report-radio label:has(input:checked){border-color:var(--blue);background:rgba(33,89,143,.06)}",
  ".report-card .report-radio input[type=radio]{margin:0;accent-color:var(--blue)}",
  ".report-card textarea{width:100%;min-height:80px;padding:10px;border:1.5px solid var(--border2);border-radius:var(--rs);font-size:14px;font-family:inherit;background:var(--bg);color:var(--text);resize:vertical;line-height:1.4;box-sizing:border-box}",
  ".report-card textarea:focus{outline:none;border-color:var(--blue)}",
  ".report-card .report-actions{display:flex;gap:10px;margin-top:16px}",
  ".report-card .report-actions button{flex:1;padding:10px;border-radius:var(--rs);font-size:14px;font-weight:600;cursor:pointer;border:none;font-family:inherit}",
  ".report-link{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text2);cursor:pointer;border:none;background:none;padding:4px 0;font-family:inherit;transition:color .2s}",
  ".report-link:hover{color:var(--blue)}",

  // Toast notification
  ".toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;z-index:10001;max-width:90%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:toastIn .3s ease,toastOut .3s ease 4.7s forwards}",
  "@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}",
  "@keyframes toastOut{from{opacity:1}to{opacity:0}}",

  // Form
  ".form-group{margin-bottom:16px}",
  ".form-group label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}",
  ".form-group input{width:100%;padding:12px;border:1.5px solid var(--border2);border-radius:var(--rs);font-size:16px;background:var(--card);color:var(--text);font-family:inherit}",
  ".form-group input:focus{outline:none;border-color:var(--blue)}",
  ".form-row{display:flex;gap:12px}",
  ".form-row .form-group{flex:1;min-width:0}",

  // Info page
  ".countdown{font-size:36px;font-weight:900;color:var(--blue);text-align:center;margin-bottom:4px}",
  ".countdown-label{font-size:14px;color:var(--text2);text-align:center;margin-bottom:24px}",
  ".info-item{padding:12px 0;border-bottom:1px solid var(--border)}",
  ".info-item:last-child{border-bottom:none}",
  ".info-label{font-size:13px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px}",
  ".info-value{font-size:16px;font-weight:600;margin-top:2px}",
  // Accordion sections
  ".acc{border-radius:var(--rs);overflow:hidden;margin-bottom:10px;border:1px solid var(--border);background:var(--card)}",
  ".acc-head{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;font-size:16px;font-weight:700;color:var(--text);user-select:none}",
  ".acc-head:hover{background:rgba(0,0,0,.03)}",
  "@media(prefers-color-scheme:dark){.acc-head:hover{background:rgba(255,255,255,.05)}}",
  ".acc-icon{font-size:20px;flex-shrink:0}",
  ".acc-chev{margin-left:auto;color:var(--text2);font-size:14px;transition:transform .2s}",
  ".acc-chev.open{transform:rotate(180deg)}",
  ".acc-body{padding:0 16px 14px;font-size:14px;line-height:1.6;color:var(--text)}",
  ".vi-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px}",
  ".vi-row>*{min-width:0}",
  ".vi-row:last-child{border-bottom:none}",
  ".vi-strike{text-decoration:line-through;color:var(--text2)}",
  ".vi-highlight{color:var(--blue);font-weight:600}",
  ".vi-warn{display:flex;gap:10px;align-items:flex-start;padding:12px;background:rgba(230,140,26,.08);border:1px solid rgba(230,140,26,.3);border-radius:var(--rs);margin-top:10px;font-size:13px;line-height:1.5;overflow:hidden}",
  ".vi-check{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:15px}",
  ".vi-check-icon{color:var(--ok);font-size:16px;flex-shrink:0}",
  ".vi-link{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:15px;font-weight:600}",
  ".vi-link:last-child{border-bottom:none}",
  ".vi-link a{color:var(--blue);text-decoration:none}",
  ".vi-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px}",
  ".vi-badge-req{color:#d13333;background:rgba(209,51,51,.1)}",
  ".vi-badge-opt{color:var(--text2);background:rgba(128,128,128,.1)}",

  // Welcome
  ".hero{text-align:center;padding:40px 0 20px}",
  ".hero-icon{font-size:64px;margin-bottom:12px}",
  ".hero h1{font-size:28px;font-weight:900;color:var(--blue);letter-spacing:-.5px;position:relative;display:inline-block;padding-bottom:10px}",
  ".hero h1::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:40px;height:3px;background:var(--red);border-radius:2px}",
  ".hero p{font-size:16px;color:var(--text2);margin-top:8px;line-height:1.5}",
  ".features{margin:24px 0;text-align:left}",
  ".features div{padding:8px 0;font-size:15px;display:flex;align-items:center;gap:10px}",
  ".features span{font-size:18px}",

  // Profile
  ".profile-section{margin-bottom:20px}",
  ".profile-section h3{font-size:14px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}",
  ".profile-summary{font-size:16px;line-height:1.6;font-style:italic;color:var(--text2);margin-bottom:20px}",

  // I Voted sticker (oval, matching iOS)
  ".voted-sticker{width:220px;height:165px;border-radius:50%;border:3px solid #0D2738;outline:3px solid #CC1919;outline-offset:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 16px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:12px;gap:2px}",
  ".voted-text{font-size:42px;font-weight:700;font-style:italic;font-family:Georgia,'Times New Roman',serif;color:#0D2738;line-height:1}",
  ".voted-early{font-size:24px;font-weight:700;font-style:italic;font-family:Georgia,'Times New Roman',serif;color:#CC1919;line-height:1}",

  // Actions row
  ".actions{display:flex;flex-direction:column;gap:8px;margin:16px 0}",
  "@media(min-width:600px){.actions{flex-direction:row}.actions .btn{flex:1}}",
  ".actions .btn{min-width:0;padding:10px 8px;font-size:14px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",

  // Cheat sheet
  ".cs-header{text-align:center;padding:12px 0 8px}",
  ".cs-header h2{font-size:20px;font-weight:800;color:var(--blue)}",
  ".cs-meta{font-size:12px;color:var(--text2);margin-top:2px}",
  ".cs-party{display:inline-block;color:#fff;font-size:13px;font-weight:700;padding:2px 10px;border-radius:99px;margin:4px 0}",
  ".cs-party-rep{background:var(--rep)}",
  ".cs-party-dem{background:var(--dem)}",
  ".cs-table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}",
  ".cs-table th{background:var(--blue);color:#fff;text-align:left;padding:5px 10px;font-size:12px;font-weight:700;letter-spacing:.5px;font-family:monospace}",
  ".cs-table td{padding:5px 10px;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:break-word;word-break:break-word}",
  ".cs-table tr:nth-child(even) td{background:var(--fill3)}",
  ".cs-table .cs-vote{font-weight:700;text-align:right;white-space:nowrap}",
  ".cs-table .cs-star{color:var(--gold);margin-right:2px}",
  ".cs-table .cs-yes{color:var(--ok)}",
  ".cs-table .cs-no{color:var(--bad)}",
  ".cs-table .cs-yourcall{color:var(--warn)}",
  ".cs-table .cs-uncontested{color:var(--text2)}",
  ".cs-footer{text-align:center;padding:8px 0;font-size:11px;color:var(--text2)}",
  ".cs-legend{display:flex;justify-content:center;gap:16px;font-size:11px;color:var(--text2);padding:4px 0}",
  ".cs-actions{display:flex;gap:10px;justify-content:center;margin:12px 0}",
  ".cs-actions .btn{padding:10px 20px;font-size:14px;width:auto}",

  // Print styles — large and readable for the polling booth
  "@media print{" +
    "#topnav,#tabs,.cs-actions,.back-btn,.party-row{display:none!important}" +
    "html,body{height:auto;display:block;font-size:18px}" +
    "#app{max-width:100%;padding:0;overflow:visible;flex:none}" +
    ".cs-header{padding:8px 0 12px}" +
    ".cs-header h2{font-size:28px}" +
    ".cs-meta{font-size:16px}" +
    ".cs-party{font-size:16px;padding:4px 14px}" +
    ".cs-table{font-size:18px}" +
    ".cs-table th{padding:8px 14px;font-size:15px}" +
    ".cs-table td{padding:7px 14px}" +
    ".cs-table tr:nth-child(even) td{background:#f5f5f5}" +
    ".cs-legend{font-size:14px;padding:8px 0}" +
    ".cs-footer{font-size:14px;padding:12px 0}" +
    "@page{margin:0.5in;size:letter}" +
  "}",

  // Misc
  ".text-center{text-align:center}",
  ".mt-sm{margin-top:8px}",
  ".mt-md{margin-top:16px}",
  ".mb-md{margin-bottom:16px}",
  ".hidden{display:none}",
  "a{color:var(--blue)}",
  ".error-box{padding:16px;background:rgba(209,51,51,.08);border:1px solid rgba(209,51,51,.3);border-radius:var(--rs);margin-bottom:16px;text-align:center}",
  ".error-box p{font-size:14px;color:var(--bad);line-height:1.5}",

  // Accessibility: reduce motion
  "@media(prefers-reduced-motion:reduce){" +
    ".loading-icon{animation:none}" +
    ".dot-active-red,.dot-active-white,.dot-active-blue{animation:none}" +
    ".spinner{animation:none}" +
    ".card-touch{transition:none}" +
    ".chip,.radio,.btn,.tab,.topnav-link,.party-btn,.acc-chev,.sort-item{transition:none}" +
    ".fw-shell,.fw-spark,.fw-trail,.fw-glow,.fw-emoji,.fw-canvas{animation:none!important;display:none!important}" +
  "}",

  // Accessibility: focus visible
  "[data-action]:focus-visible,.btn:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:var(--rs)}",
  ".chip:focus-visible{outline:2px solid var(--blue);outline-offset:2px}",
  ".radio:focus-visible{outline:2px solid var(--blue);outline-offset:2px}",

  // Skip link
  ".skip-link{position:absolute;top:-40px;left:0;background:var(--blue);color:#fff;padding:8px 16px;z-index:100;font-size:14px;font-weight:600;text-decoration:none;border-radius:0 0 var(--rs) 0}",
  ".skip-link:focus{top:0}",

  // LLM Compare debug view
  ".llm-compare-header{text-align:center;margin-bottom:20px}",
  ".llm-compare-header h2{font-size:22px;font-weight:800;margin-bottom:4px}",
  ".llm-compare-header p{font-size:13px;color:var(--text2)}",
  ".llm-btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}",
  ".llm-btn{padding:12px 8px;border:2px solid var(--border2);border-radius:var(--rs);background:var(--card);cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;color:var(--text);text-align:center;transition:border-color .15s,opacity .15s}",
  ".llm-btn:active{opacity:.85}",
  ".llm-btn.llm-loading{opacity:.6;pointer-events:none}",
  ".llm-btn.llm-done{border-color:var(--ok)}",
  ".llm-btn.llm-error{border-color:var(--bad)}",
  ".llm-btn .llm-icon{font-size:24px;display:block;margin-bottom:4px}",
  ".llm-btn .llm-status{font-size:11px;color:var(--text2);margin-top:2px}",
  ".llm-tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;overflow-x:auto}",
  ".llm-tab{flex:1;padding:10px 6px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;color:var(--text2);white-space:nowrap;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit}",
  ".llm-tab.llm-tab-on{color:var(--blue);border-bottom-color:var(--blue)}",
  ".llm-race-row{background:var(--card);border-radius:var(--rs);padding:12px;margin-bottom:8px;box-shadow:0 1px 4px var(--shadow)}",
  ".llm-race-office{font-size:13px;color:var(--text2);margin-bottom:6px;font-weight:600}",
  ".llm-rec-grid{display:grid;gap:8px}",
  ".llm-rec-grid.cols-2{grid-template-columns:1fr 1fr}",
  ".llm-rec-grid.cols-3{grid-template-columns:1fr 1fr 1fr}",
  ".llm-rec-grid.cols-4{grid-template-columns:1fr 1fr 1fr 1fr}",
  "@media(max-width:500px){.llm-rec-grid.cols-3,.llm-rec-grid.cols-4{grid-template-columns:1fr 1fr}}",
  ".llm-rec-cell{padding:8px;border-radius:6px;border:1px solid var(--border);font-size:12px;line-height:1.4}",
  ".llm-rec-cell.llm-disagree{border-color:var(--warn);background:rgba(230,140,26,.06)}",
  ".llm-rec-cell .llm-cell-label{font-size:10px;text-transform:uppercase;font-weight:700;color:var(--text2);margin-bottom:3px;letter-spacing:.5px}",
  ".llm-rec-cell .llm-cell-name{font-size:14px;font-weight:700;margin-bottom:2px}",
  ".llm-rec-cell .llm-cell-reason{font-size:11px;color:var(--text2);line-height:1.35}",
  ".llm-rec-cell .llm-cell-conf{margin-top:3px}",
  ".llm-legend{display:flex;gap:16px;justify-content:center;font-size:12px;color:var(--text2);margin-bottom:16px;flex-wrap:wrap}",
  ".llm-legend-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px}",
  ".llm-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border2);border-top-color:var(--blue);border-radius:50%;animation:spin .6s linear infinite}",
  ".exp-header{text-align:center;margin-bottom:20px}",
  ".exp-header h2{font-size:22px;font-weight:800;margin-bottom:4px}",
  ".exp-header p{font-size:13px;color:var(--text2)}",
  ".exp-controls{display:flex;gap:10px;align-items:center;justify-content:center;margin-bottom:20px;flex-wrap:wrap}",
  ".exp-select{padding:10px 14px;border-radius:var(--rs);border:2px solid var(--border2);background:var(--card);color:var(--text);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23666' stroke-width='2' fill='none'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px}",
  ".exp-verdict{text-align:center;padding:20px;margin-bottom:16px}",
  ".exp-verdict-pct{font-size:52px;font-weight:800;line-height:1}",
  ".exp-verdict-label{font-size:15px;color:var(--text2);margin-top:4px}",
  ".exp-verdict-detail{font-size:13px;color:var(--text2);margin-top:8px;line-height:1.5}",
  ".exp-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}",
  ".exp-stat-card{background:var(--card);border-radius:var(--rs);padding:14px;box-shadow:0 1px 4px var(--shadow)}",
  ".exp-stat-card h4{font-size:14px;font-weight:700;margin-bottom:10px}",
  ".exp-stat-row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--text)}",
  ".exp-stat-row .exp-stat-label{color:var(--text2)}",
  ".exp-race-item{background:var(--card);border-radius:var(--rs);padding:12px;margin-bottom:8px;box-shadow:0 1px 4px var(--shadow);cursor:pointer}",
  ".exp-race-item.exp-agree{border-left:3px solid var(--ok)}",
  ".exp-race-item.exp-disagree{border-left:3px solid var(--warn)}",
  ".exp-race-top{display:flex;align-items:center;gap:8px}",
  ".exp-race-icon{font-size:16px;flex-shrink:0}",
  ".exp-race-office{font-size:13px;color:var(--text2);font-weight:600;flex:1;min-width:0}",
  ".exp-race-name{font-size:14px;font-weight:700}",
  ".exp-detail{margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}",
  ".exp-side{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".exp-side-col{font-size:12px;line-height:1.45}",
  ".exp-side-col h5{font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:.5px;margin-bottom:4px}",
  ".exp-side-col .exp-pick{font-size:14px;font-weight:700;margin-bottom:4px}",
  ".exp-side-col .exp-reason{color:var(--text2)}",
  ".exp-loading{display:flex;align-items:center;gap:10px;padding:16px;font-size:14px}",
  ".exp-loading .llm-spinner{width:18px;height:18px}",
  ".exp-perf{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}",
  ".exp-perf-card{background:var(--card);border-radius:var(--rs);padding:14px;box-shadow:0 1px 4px var(--shadow);text-align:center}",
  ".exp-perf-card h4{font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:6px}",
  ".exp-perf-card .exp-perf-val{font-size:28px;font-weight:800;line-height:1.2}",
  ".exp-perf-card .exp-perf-sub{font-size:11px;color:var(--text2);margin-top:4px}",
  ".exp-perf-bar{height:8px;border-radius:4px;background:var(--border);margin-top:8px;overflow:hidden;position:relative}",
  ".exp-perf-bar-fill{height:100%;border-radius:4px;transition:width .4s ease}",
  ".exp-perf-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}",
  ".exp-perf-row .exp-perf-name{font-size:12px;font-weight:600;width:70px;text-align:right;flex-shrink:0}",
  ".exp-perf-row .exp-perf-bar{flex:1;margin-top:0}",
  ".exp-perf-row .exp-perf-time{font-size:12px;font-weight:700;width:50px;flex-shrink:0}",
  "@media(max-width:500px){.exp-stats{grid-template-columns:1fr}.exp-side{grid-template-columns:1fr}.exp-perf{grid-template-columns:1fr}}",
  "@keyframes spin{to{transform:rotate(360deg)}}",
].join("\n");

// MARK: - App JavaScript

var APP_JS = [
  // ============ VERSION CHECK ============
  "var APP_VERSION=25;",

  // ============ i18n ============
  "var LANG=localStorage.getItem('tx_votes_lang')||localStorage.getItem('atx_votes_lang')||((navigator.language||'').slice(0,2)==='es'?'es':'en');",
  "var _lastLangSwitch=0;",
  "function setLang(l){" +
    "var now=Date.now();if(now-_lastLangSwitch<500)return;_lastLangSwitch=now;" +
    "LANG=l;localStorage.setItem('tx_votes_lang',l);shuffledSpectrum=null;shuffledDD={};render();" +
    "if(S.summary&&S.guideComplete){regenerateSummary()}" +
  "}",

  // ============ ANALYTICS ============
  // Fire-and-forget event tracking — never throws, respects DNT
  // Admin mode: ?admin_key=SECRET excludes activity from public stats
  "var _trkSent={};",
  "var _adminKey=(function(){try{var m=location.search.match(/[?&]admin_key=([^&]+)/);if(m)return decodeURIComponent(m[1]);return sessionStorage.getItem('_admin_key')||''}catch(x){return ''}}());",
  "if(_adminKey)try{sessionStorage.setItem('_admin_key',_adminKey)}catch(x){}",
  "function trk(e,p){" +
    "try{" +
      "if(navigator.doNotTrack==='1')return;" +
      "var key=e+JSON.stringify(p||{});" +
      "var now=Date.now();" +
      "if(_trkSent[key]&&now-_trkSent[key]<1000)return;" +
      "_trkSent[key]=now;" +
      "var obj={event:e,props:Object.assign({lang:LANG},p||{})};" +
      "if(_adminKey)obj._admin_key=_adminKey;" +
      "var body=JSON.stringify(obj);" +
      "if(navigator.sendBeacon){navigator.sendBeacon('/app/api/ev',body)}" +
      "else{fetch('/app/api/ev',{method:'POST',body:body,keepalive:true}).catch(function(){})}" +
    "}catch(x){}" +
  "}",

  "var TR={" +
    // Welcome & General
    "'Your personalized voting guide for Texas elections.':'Tu gu\\u00EDa personalizada de votaci\\u00F3n para las elecciones de Texas.'," +
    "'Texas Primary \\u2014 March 3, 2026':'Primaria de Texas \\u2014 3 de marzo, 2026'," +
    "'5-minute interview learns your values':'Entrevista r\\u00E1pida sobre tus valores'," +
    "'Personalized ballot with recommendations':'Boleta personalizada con recomendaciones'," +
    "'Print your cheat sheet for the booth':'Imprime tu gu\\u00EDa r\\u00E1pida para la casilla'," +
    "'Find your polling location':'Encuentra tu lugar de votaci\\u00F3n'," +
    "'Nonpartisan by design':'Apartidista por dise\\u00F1o'," +
    "'Build My Guide':'Crear mi gu\\u00EDa'," +
    // Interview
    "'What issues matter most to you?':'\\u00BFQu\\u00E9 temas te importan m\\u00E1s?'," +
    "'Pick your top 3-7. We\\u2019ll dig deeper on these.':'Elige los 3 a 7 m\\u00E1s importantes. Profundizaremos en estos.'," +
    "'of 3-7 selected':'de 3-7 seleccionados'," +
    "'Rank your issues by priority':'Ordena los temas por prioridad'," +
    "'Drag to reorder or use arrows. #1 = most important.':'Arrastra para reordenar o usa las flechas. #1 = m\\u00E1s importante.'," +
    "'your top priorities are above this line':'tus principales prioridades est\\u00E1n arriba de esta l\\u00EDnea'," +
    "'Rank the qualities you value in a candidate':'Ordena las cualidades que valoras en un candidato'," +
    "'Pick your top 5 issues':'Elige tus 5 temas principales'," +
    "'Tap an issue below to add it to your priorities.':'Toca un tema abajo para a\\u00F1adirlo a tus prioridades.'," +
    "'Your Top Priorities':'Tus Principales Prioridades'," +
    "'All Issues':'Todos los Temas'," +
    "'Tap to add':'Toca para a\\u00F1adir'," +
    "'Select your top 5 to continue':'Selecciona tus 5 principales para continuar'," +
    "'Pick your top 3 qualities':'Elige tus 3 cualidades principales'," +
    "'Tap a quality below to add it.':'Toca una cualidad abajo para a\\u00F1adirla.'," +
    "'Your Top Qualities':'Tus Principales Cualidades'," +
    "'All Qualities':'Todas las Cualidades'," +
    "'Select your top 3 to continue':'Selecciona tus 3 principales para continuar'," +
    "'Remaining issues below':'Temas restantes abajo'," +
    "'Remaining qualities below':'Cualidades restantes abajo'," +
    "'Top Issues (ranked)':'Temas principales (por prioridad)'," +
    "'Candidate Qualities (ranked)':'Cualidades del candidato (por prioridad)'," +
    "'Continue':'Continuar'," +
    "'Back':'Atr\\u00E1s'," +
    "'How would you describe your political approach?':'\\u00BFC\\u00F3mo describir\\u00EDas tu enfoque pol\\u00EDtico?'," +
    "'There\\u2019s no wrong answer. This helps us understand your lens.':'No hay respuesta incorrecta. Esto nos ayuda a entender tu perspectiva.'," +
    "'What do you value most in a candidate?':'\\u00BFQu\\u00E9 es lo que m\\u00E1s valoras en un candidato?'," +
    "'Pick 2-3 that matter most.':'Elige 2 o 3 que m\\u00E1s te importen.'," +
    "'of 2-3 selected':'de 2-3 seleccionados'," +
    "'Question':'Pregunta'," +
    "'of':'de'," +
    // Freeform
    "'Anything else we should know?':'\\u00BFAlgo m\\u00E1s que debamos saber?'," +
    "'Optional \\u2014 share anything that might help us understand your priorities.':'Opcional \\u2014 comparte cualquier cosa que nos ayude a entender tus prioridades.'," +
    "'e.g. I care deeply about water policy, I\\u2019m a veteran, I own a small business...':'Ej. Me importa mucho la pol\\u00EDtica del agua, soy veterano, tengo un peque\\u00F1o negocio...'," +
    "'Skip':'Omitir'," +
    "'Additional Context':'Contexto adicional'," +
    // Address
    "'Where do you vote?':'\\u00BFD\\u00F3nde votas?'," +
    "'We\\u2019ll look up your districts to show the right races.':'Buscaremos tus distritos para mostrar las contiendas correctas.'," +
    "'Street Address':'Direcci\\u00F3n'," +
    "'City':'Ciudad'," +
    "'ZIP':'C\\u00F3digo postal'," +
    "'State':'Estado'," +
    "'Your address stays on your device. It\\u2019s only used to look up your ballot districts \\u2014 we never store or share it.':'Tu direcci\\u00F3n se queda en tu dispositivo. Solo se usa para buscar tus distritos electorales \\u2014 nunca la almacenamos ni compartimos.'," +
    "'You can skip the address \\u2014 we\\u2019ll show all races.':'Puedes omitir la direcci\\u00F3n \\u2014 mostraremos todas las contiendas.'," +
    "'Skip & Build Guide':'Omitir y crear gu\\u00EDa'," +
    // Building
    "'Loading your ballot...':'Cargando tu boleta...'," +
    "'Failed to generate recommendations. Please try again.':'No se pudieron generar recomendaciones. Intenta de nuevo.'," +
    "'Try Again':'Intentar de nuevo'," +
    // Tab bar & nav
    "'My Ballot':'Boleta'," +
    "'Vote Info':'Info'," +
    "'Profile':'Perfil'," +
    // Ballot
    "'Republican':'Republicano'," +
    "'Democratic':'Dem\\u00F3crata'," +
    "'Democrat':'Dem\\u00F3crata'," +
    "'Tuesday, March 3, 2026':'Martes, 3 de marzo, 2026'," +
    "'Analyzing your ballot...':'Analizando tu boleta...'," +
    "'Showing all races':'Mostrando todas las contiendas'," +
    "'Data last verified':'Datos verificados por \\u00FAltima vez'," +
    "'No ballot available for this party.':'No hay boleta disponible para este partido.'," +
    "'AI-Generated Recommendations':'Recomendaciones generadas por IA'," +
    "'These recommendations are generated by AI based on your stated values. They may contain errors. Always do your own research before voting.':'Estas recomendaciones son generadas por IA bas\\u00E1ndose en tus valores. Pueden contener errores. Siempre haz tu propia investigaci\\u00F3n antes de votar.'," +
    "'Recommendations are AI-generated from web sources and may contain errors or outdated information. Always verify candidate positions through official sources before voting.':'Las recomendaciones son generadas por IA a partir de fuentes web y pueden contener errores o informaci\\u00F3n desactualizada. Siempre verifica las posiciones de los candidatos a trav\\u00E9s de fuentes oficiales antes de votar.'," +
    "'AI Limitations':'Limitaciones de la IA'," +
    "'Entertainment tone active. The analysis and recommendations are identical to the standard tone \\u2014 only the language style is different.':'Tono de entretenimiento activo. El an\\u00E1lisis y las recomendaciones son id\\u00E9nticos al tono est\\u00E1ndar \\u2014 solo cambia el estilo del lenguaje.'," +
    "'Viewing in Cowboy mode. Switch to Standard for neutral presentation.':'Viendo en modo Vaquero. Cambia a Est\\u00E1ndar para una presentaci\\u00F3n neutral.'," +
    "'Novelty tone active':'Tono novelty activo'," +
    "'Tone may affect how pros, cons, and recommendations are worded. For a neutral presentation, switch to standard mode.':'El tono puede afectar c\\u00F3mo se expresan los pros, contras y recomendaciones. Para una presentaci\\u00F3n neutral, cambia al modo est\\u00E1ndar.'," +
    "'Switch to Standard':'Cambiar a Est\\u00E1ndar'," +
    "'Texas Cowboy':'Vaquero Tejano'," +
    "'Cheat Sheet':'Gu\\u00EDa r\\u00E1pida'," +
    "'Print Cheat Sheet':'Imprimir gu\\u00EDa r\\u00E1pida'," +
    "'Share':'Compartir'," +
    "'Share this race':'Compartir esta contienda'," +
    "'Know someone who needs help deciding?':'\\u00BFConoces a alguien que necesita ayuda para decidir?'," +
    "'The Texas primary is March 3. Share Texas Votes so your friends and family can get a personalized voting guide too.':'La primaria de Texas es el 3 de marzo. Comparte Texas Votes para que tus amigos y familia tambi\\u00E9n obtengan una gu\\u00EDa personalizada.'," +
    "'Share Texas Votes':'Compartir Texas Votes'," +
    "'Spread the word':'Pasa la voz'," +
    "'Key Races':'Contiendas clave'," +
    "'Other Contested Races':'Otras contiendas competidas'," +
    "'Propositions':'Proposiciones'," +
    "'Uncontested Races':'Contiendas sin oposici\\u00F3n'," +
    "'candidate':'candidato'," +
    "'candidates':'candidatos'," +
    // Race detail
    "'Back to My Ballot':'Volver a mi boleta'," +
    "'All Candidates':'Todos los candidatos'," +
    "'Incumbent':'Titular'," +
    "'Recommended':'Recomendado'," +
    "'Limited public info':'Info p\\u00FAblica limitada'," +
    "'Strategy:':'Estrategia:'," +
    "'Note:':'Nota:'," +
    "'Key Positions':'Posiciones clave'," +
    "'Strengths':'Fortalezas'," +
    "'Concerns':'Preocupaciones'," +
    "'Endorsements':'Respaldos'," +
    "'Fundraising':'Recaudaci\\u00F3n de fondos'," +
    "'Polling':'Encuestas'," +
    "'Sources':'Fuentes'," +
    "'Show Less':'Ver menos'," +
    "'Show Details':'Ver detalles'," +
    "'Learn More':'Saber m\\u00E1s'," +
    // Confidence badges
    "'Our Pick':'Nuestra recomendaci\\u00F3n'," +
    "'Strong Match':'Altamente compatible'," +
    "'Good Match':'Buena opci\\u00F3n'," +
    "'Lean':'Inclinaci\\u00F3n'," +
    "'Lean Yes':'A favor'," +
    "'Lean No':'En contra'," +
    "'Your Call':'Tu decisi\\u00F3n'," +
    "'Clear Call':'Decisi\\u00F3n clara'," +
    "'Best Available':'Mejor opci\\u00F3n disponible'," +
    "'Symbolic Race':'Contienda simb\\u00F3lica'," +
    "'Genuinely Contested':'Verdaderamente competida'," +
    "'Not Sure Yet':'A\\u00FAn no estoy seguro'," +
    // Propositions
    "'If it passes:':'Si se aprueba:'," +
    "'If it fails:':'Si no se aprueba:'," +
    "'Background':'Antecedentes'," +
    "'Fiscal Impact':'Impacto fiscal'," +
    "'Supporters':'Partidarios'," +
    "'Opponents':'Opositores'," +
    "'Caveats':'Advertencias'," +
    // Proposition titles (Democrat)
    "'Expand Medicaid':'Expandir Medicaid'," +
    "'Humane immigration reform':'Reforma migratoria humanitaria'," +
    "'Reproductive rights':'Derechos reproductivos'," +
    "'Housing affordability':'Vivienda asequible'," +
    "'Public school funding':'Financiamiento de escuelas p\\u00FAblicas'," +
    "'Online voter registration':'Registro de votantes en l\\u00EDnea'," +
    "'Environmental standards':'Est\\u00E1ndares ambientales'," +
    "'Cannabis legalization':'Legalizaci\\u00F3n del cannabis'," +
    "'Raise state employee wages':'Aumento de salarios de empleados estatales'," +
    "'Redistricting reform':'Reforma de redistribuci\\u00F3n de distritos'," +
    "'Fair taxation':'Tributaci\\u00F3n justa'," +
    "'Expand public transit':'Expandir transporte p\\u00FAblico'," +
    "'Red flag gun safety laws':'Leyes de alerta de seguridad de armas'," +
    // Proposition titles (Republican)
    "'Phase out property taxes':'Eliminar gradualmente impuestos a la propiedad'," +
    "'Voter approval for local tax hikes':'Aprobaci\\u00F3n de votantes para aumentos de impuestos locales'," +
    "'Healthcare & vaccination status':'Atenci\\u00F3n m\\u00E9dica y estado de vacunaci\\u00F3n'," +
    "'Life at fertilization in schools':'Vida desde la fertilizaci\\u00F3n en escuelas'," +
    "'Ban school health clinics':'Prohibir cl\\u00EDnicas de salud en escuelas'," +
    "'Term limits':'L\\u00EDmites de mandato'," +
    "'Protect Texas water':'Proteger el agua de Texas'," +
    "'End services for undocumented immigrants':'Terminar servicios para inmigrantes indocumentados'," +
    "'No Democratic committee chairs':'Sin presidentes de comit\\u00E9 dem\\u00F3cratas'," +
    "'Prohibit Sharia Law':'Prohibir la ley Sharia'," +
    // Proposition descriptions (Democrat)
    "'Texas should expand Medicaid to ensure access to affordable healthcare for all residents.':'Texas deber\\u00EDa expandir Medicaid para asegurar acceso a atenci\\u00F3n m\\u00E9dica asequible para todos los residentes.'," +
    "'Texas should adopt humane and dignified immigration policies and clear pathways to citizenship.':'Texas deber\\u00EDa adoptar pol\\u00EDticas migratorias humanas y dignas con caminos claros a la ciudadan\\u00EDa.'," +
    "'Texans should have the right to make their own healthcare decisions, including reproductive rights, with removal of insurance barriers to treatment.':'Los texanos deber\\u00EDan tener el derecho a tomar sus propias decisiones de salud, incluyendo derechos reproductivos, eliminando barreras de seguro para el tratamiento.'," +
    "'The state should use funding and regulation to address the housing crisis in urban and rural communities.':'El estado deber\\u00EDa usar financiamiento y regulaci\\u00F3n para abordar la crisis de vivienda en comunidades urbanas y rurales.'," +
    "'Texas should equalize per-pupil spending to the national average. Texas currently ranks 42nd.':'Texas deber\\u00EDa igualar el gasto por alumno al promedio nacional. Texas actualmente ocupa el puesto 42.'," +
    "'Texas should implement secure online voter registration, already used by 42 other states.':'Texas deber\\u00EDa implementar el registro seguro de votantes en l\\u00EDnea, ya utilizado por otros 42 estados.'," +
    "'Texas should enforce stricter environmental standards for air, water, and biodiversity.':'Texas deber\\u00EDa aplicar est\\u00E1ndares ambientales m\\u00E1s estrictos para aire, agua y biodiversidad.'," +
    "'Texas should legalize adult cannabis use and automatically expunge past cannabis-related convictions.':'Texas deber\\u00EDa legalizar el uso de cannabis para adultos y borrar autom\\u00E1ticamente condenas previas relacionadas con cannabis.'," +
    "'State and school employee salaries should be raised to national averages with biennial cost-of-living adjustments.':'Los salarios de empleados estatales y escolares deber\\u00EDan aumentarse al promedio nacional con ajustes bienales por costo de vida.'," +
    "'Texas should ban racially motivated and mid-decade redistricting.':'Texas deber\\u00EDa prohibir la redistribuci\\u00F3n de distritos motivada racialmente y a mitad de d\\u00E9cada.'," +
    "'The federal tax burden should shift to the wealthiest individuals with working-class income tax relief.':'La carga tributaria federal deber\\u00EDa trasladarse a los individuos m\\u00E1s ricos con alivio de impuestos sobre la renta para la clase trabajadora.'," +
    "'Texas should expand accessible transit in rural and urban areas.':'Texas deber\\u00EDa expandir el transporte accesible en \\u00E1reas rurales y urbanas.'," +
    "'Texas should enact Extreme Risk Protection Orders to prevent individuals with a history of domestic abuse from purchasing firearms.':'Texas deber\\u00EDa promulgar \\u00D3rdenes de Protecci\\u00F3n por Riesgo Extremo para prevenir que personas con historial de abuso dom\\u00E9stico compren armas de fuego.'," +
    // Proposition descriptions (Republican)
    "'Texas property taxes should be assessed at the purchase price and phased out entirely over the next six years through spending reductions.':'Los impuestos a la propiedad de Texas deber\\u00EDan evaluarse al precio de compra y eliminarse por completo en los pr\\u00F3ximos seis a\\u00F1os mediante reducciones de gasto.'," +
    "'Texas should require any local government budget that raises property taxes to be approved by voters at a November general election.':'Texas deber\\u00EDa requerir que cualquier presupuesto de gobierno local que aumente impuestos a la propiedad sea aprobado por los votantes en una elecci\\u00F3n general de noviembre.'," +
    "'Texas should prohibit denial of healthcare or any medical service based solely on the patient\\'s vaccination status.':'Texas deber\\u00EDa prohibir la denegaci\\u00F3n de atenci\\u00F3n m\\u00E9dica basada \\u00FAnicamente en el estado de vacunaci\\u00F3n del paciente.'," +
    "'Texas should require its public schools to teach that life begins at fertilization.':'Texas deber\\u00EDa requerir que sus escuelas p\\u00FAblicas ense\\u00F1en que la vida comienza en la fertilizaci\\u00F3n.'," +
    "'Texas should ban gender, sexuality, and reproductive clinics and services in K-12 schools.':'Texas deber\\u00EDa prohibir cl\\u00EDnicas y servicios de g\\u00E9nero, sexualidad y reproducci\\u00F3n en escuelas K-12.'," +
    "'Texas should enact term limits on all elected officials.':'Texas deber\\u00EDa establecer l\\u00EDmites de mandato para todos los funcionarios electos.'," +
    "'Texas should ban the large-scale export, or sale, of our groundwater and surface water to any single private or public entity.':'Texas deber\\u00EDa prohibir la exportaci\\u00F3n o venta a gran escala de nuestras aguas subterr\\u00E1neas y superficiales a cualquier entidad privada o p\\u00FAblica individual.'," +
    "'The Texas Legislature should reduce the burden of illegal immigration on taxpayers by ending public services for illegal immigrants.':'La Legislatura de Texas deber\\u00EDa reducir la carga de la inmigraci\\u00F3n ilegal sobre los contribuyentes al terminar los servicios p\\u00FAblicos para inmigrantes ilegales.'," +
    "'The Republican-controlled Texas Legislature should stop awarding leadership positions, including committee chairmanships, to Democrats.':'La Legislatura de Texas controlada por los republicanos deber\\u00EDa dejar de otorgar posiciones de liderazgo, incluyendo presidencias de comit\\u00E9, a los dem\\u00F3cratas.'," +
    "'Texas should prohibit Sharia Law.':'Texas deber\\u00EDa prohibir la ley Sharia.'," +
    // Proposition ifPasses/ifFails translations (Democrat)
    "'Signals strong Democratic voter support for Medicaid expansion. Strengthens the case for Democratic candidates to make expansion a central 2026 general election issue. Could pressure moderate Republicans, given that 73% of Texas voters (including 63% of strong Republicans) support expansion in polling.':'Indica un fuerte apoyo de los votantes dem\\u00F3cratas a la expansi\\u00F3n de Medicaid. Fortalece el caso para que los candidatos dem\\u00F3cratas hagan de la expansi\\u00F3n un tema central en las elecciones generales de 2026. Podr\\u00EDa presionar a republicanos moderados, dado que el 73% de los votantes de Texas apoyan la expansi\\u00F3n en encuestas.'," +
    "'Unlikely to fail among Democratic primary voters. A weak showing would suggest healthcare is not the top motivating issue for Democratic base voters, reducing its prominence as a campaign centerpiece.':'Poco probable que falle entre votantes de la primaria dem\\u00F3crata. Un resultado d\\u00E9bil sugerir\\u00EDa que la salud no es el tema m\\u00E1s motivador para los votantes de base, reduciendo su prominencia como tema central de campa\\u00F1a.'," +
    "'Signals Democratic voter support for humane immigration reform and pathways to citizenship. Provides a clear contrast with Republican enforcement-first messaging in the 2026 general election. Could shape Democratic candidates\\' immigration platforms statewide.':'Indica apoyo de los votantes dem\\u00F3cratas a una reforma migratoria humanitaria y caminos a la ciudadan\\u00EDa. Proporciona un claro contraste con el mensaje republicano de aplicaci\\u00F3n de la ley en las elecciones generales de 2026.'," +
    "'Unlikely to fail among Democratic primary voters. A weak showing would suggest the Democratic base is conflicted on immigration messaging, potentially encouraging more moderate or enforcement-inclusive positions.':'Poco probable que falle entre votantes dem\\u00F3cratas. Un resultado d\\u00E9bil sugerir\\u00EDa que la base est\\u00E1 dividida sobre el mensaje migratorio, posiblemente fomentando posiciones m\\u00E1s moderadas.'," +
    "'Signals overwhelming Democratic voter support for reproductive autonomy. Strengthens the issue as a major motivator for Democratic turnout in the November general election. Could fuel efforts to put a reproductive rights constitutional amendment before Texas voters.':'Indica un apoyo abrumador de los votantes dem\\u00F3cratas a la autonom\\u00EDa reproductiva. Fortalece el tema como un gran motivador para la participaci\\u00F3n dem\\u00F3crata en las elecciones generales de noviembre.'," +
    "'Extremely unlikely to fail among Democratic primary voters. Any weakness would suggest the party base is divided on the scope of healthcare autonomy, which would be a significant surprise.':'Extremadamente improbable que falle entre votantes dem\\u00F3cratas. Cualquier debilidad sugerir\\u00EDa que la base est\\u00E1 dividida sobre el alcance de la autonom\\u00EDa en salud, lo cual ser\\u00EDa una gran sorpresa.'," +
    "'Signals strong Democratic voter demand for state action on housing. Provides a mandate for Democratic candidates to make housing affordability a central platform issue. Could pressure the legislature to increase housing funds and strengthen renter protections.':'Indica una fuerte demanda de los votantes dem\\u00F3cratas por acci\\u00F3n estatal en vivienda. Proporciona un mandato para que los candidatos hagan de la vivienda asequible un tema central. Podr\\u00EDa presionar a la legislatura para aumentar fondos de vivienda.'," +
    "'Unlikely to fail. A weak showing would suggest Democratic voters prioritize other economic issues over housing, reducing its visibility as a campaign issue.':'Poco probable que falle. Un resultado d\\u00E9bil sugerir\\u00EDa que los votantes priorizan otros temas econ\\u00F3micos sobre la vivienda.'," +
    "'Signals strong Democratic voter support for substantially increased public school funding. Strengthens the argument against school vouchers by emphasizing the underfunding of existing public schools. Could become a key general election contrast with Republicans.':'Indica un fuerte apoyo a un aumento sustancial del financiamiento escolar p\\u00FAblico. Fortalece el argumento contra los vales escolares al enfatizar el bajo financiamiento de las escuelas p\\u00FAblicas existentes.'," +
    "'Unlikely to fail. A weak result would suggest Democratic voters are ambivalent about the specific target of reaching the national average, though support for schools generally would remain strong.':'Poco probable que falle. Un resultado d\\u00E9bil sugerir\\u00EDa ambivalencia sobre la meta espec\\u00EDfica de alcanzar el promedio nacional, aunque el apoyo a las escuelas seguir\\u00EDa siendo fuerte.'," +
    "'Signals broad Democratic voter demand for modernized voter registration. Provides ammunition for continued legislative efforts \\u2014 especially given bipartisan support from county election officials. Could be paired with other voting access measures in future sessions.':'Indica una amplia demanda de los votantes dem\\u00F3cratas por modernizar el registro de votantes. Proporciona impulso para esfuerzos legislativos continuos, especialmente dado el apoyo bipartidista de funcionarios electorales del condado.'," +
    "'Extremely unlikely to fail. Online voter registration is among the least controversial modernization proposals. A failure would be a major surprise.':'Extremadamente improbable que falle. El registro de votantes en l\\u00EDnea es una de las propuestas de modernizaci\\u00F3n menos controversiales. Un fracaso ser\\u00EDa una gran sorpresa.'," +
    "'Signals Democratic voter demand for stronger environmental protections, particularly as federal standards are rolled back. Provides a mandate for Democratic candidates to campaign on clean air and water. Could influence TCEQ\\u2019s ongoing water quality standards revision.':'Indica demanda de los votantes dem\\u00F3cratas por protecciones ambientales m\\u00E1s fuertes, particularmente mientras se revierten los est\\u00E1ndares federales. Proporciona un mandato para campa\\u00F1as sobre aire y agua limpios.'," +
    "'Unlikely to fail among Democratic primary voters. A weak showing would suggest the environment is not a top-tier motivating issue for the Democratic base in 2026.':'Poco probable que falle entre votantes dem\\u00F3cratas. Un resultado d\\u00E9bil sugerir\\u00EDa que el medio ambiente no es un tema motivador de primer nivel para la base dem\\u00F3crata en 2026.'," +
    "'Signals strong Democratic voter support for full legalization and criminal justice reform. Strengthens the issue as a general election differentiator. Could pressure moderate Republicans given that legalization polls above 50% statewide.':'Indica un fuerte apoyo a la legalizaci\\u00F3n total y la reforma de justicia penal. Fortalece el tema como diferenciador en elecciones generales. Podr\\u00EDa presionar a republicanos moderados dado que la legalizaci\\u00F3n supera el 50% en encuestas estatales.'," +
    "'Unlikely to fail, but a close vote would suggest the Democratic base has reservations about full legalization, particularly the automatic expungement component. Could lead candidates to adopt a more incremental approach (decriminalization first).':'Poco probable que falle, pero una votaci\\u00F3n cerrada sugerir\\u00EDa reservas sobre la legalizaci\\u00F3n total, particularmente la eliminaci\\u00F3n autom\\u00E1tica de antecedentes. Podr\\u00EDa llevar a candidatos a adoptar un enfoque m\\u00E1s gradual.'," +
    "'Signals strong Democratic voter support for raising public employee wages to competitive levels. Strengthens labor-backed candidates and provides a clear general election message on valuing public servants. Could influence future legislative budget priorities.':'Indica un fuerte apoyo a elevar los salarios de empleados p\\u00FAblicos a niveles competitivos. Fortalece a candidatos respaldados por sindicatos y proporciona un mensaje claro sobre valorar a los servidores p\\u00FAblicos.'," +
    "'Unlikely to fail. A weak showing would suggest Democratic voters see the recent $4.3 billion investment as adequate, reducing pressure for additional raises.':'Poco probable que falle. Un resultado d\\u00E9bil sugerir\\u00EDa que los votantes consideran la reciente inversi\\u00F3n de $4.3 mil millones como adecuada, reduciendo la presi\\u00F3n por aumentos adicionales.'," +
    "'Signals strong Democratic voter demand for fair redistricting. Strengthens the case for Democratic candidates to campaign on democracy reform. Could support federal legislation requiring independent commissions. Highlights the 2025 mid-decade redistricting as a general election issue.':'Indica una fuerte demanda por redistribuci\\u00F3n justa de distritos. Fortalece el caso para campa\\u00F1as sobre reforma democr\\u00E1tica. Podr\\u00EDa apoyar legislaci\\u00F3n federal que requiera comisiones independientes.'," +
    "'Unlikely to fail. A weak showing would suggest Democratic voters do not prioritize process reforms over policy issues, reducing its prominence as a campaign theme.':'Poco probable que falle. Un resultado d\\u00E9bil sugerir\\u00EDa que los votantes no priorizan reformas de proceso sobre temas de pol\\u00EDtica p\\u00FAblica.'," +
    "'Signals Democratic voter support for progressive federal tax reform. Provides a platform position for Texas Democrats heading into the 2026 midterms. Could influence the federal debate over expiring Trump-era tax cuts.':'Indica apoyo a una reforma tributaria federal progresiva. Proporciona una posici\\u00F3n de plataforma para los dem\\u00F3cratas de Texas de cara a las elecciones intermedias de 2026.'," +
    "'Would suggest Democratic primary voters are skeptical of tax-the-wealthy messaging or view it as outside the scope of state politics. Could indicate a preference for addressing Texas\\u2019s regressive state tax structure instead.':'Sugerir\\u00EDa que los votantes dem\\u00F3cratas son esc\\u00E9pticos del mensaje de gravar a los ricos o lo ven fuera del \\u00E1mbito de la pol\\u00EDtica estatal. Podr\\u00EDa indicar preferencia por abordar la estructura tributaria regresiva de Texas.'," +
    "'Signals strong Democratic voter support for public transit investment. Strengthens the case for state transit funding and bolsters local transit initiatives. Could influence TxDOT\\u2019s multimodal transit plan.':'Indica un fuerte apoyo a la inversi\\u00F3n en transporte p\\u00FAblico. Fortalece el caso para financiamiento estatal de transporte y refuerza iniciativas locales de transporte.'," +
    "'Unlikely to fail. A weak showing would suggest even Democratic voters prioritize other spending over transit, reducing momentum for state-level transit funding.':'Poco probable que falle. Un resultado d\\u00E9bil sugerir\\u00EDa que incluso los votantes dem\\u00F3cratas priorizan otros gastos sobre el transporte, reduciendo el impulso para financiamiento estatal.'," +
    "'Signals Democratic voter support for red flag laws focused on domestic violence, directly contradicting the 2025 Anti-Red Flag Act. Provides a sharp general election contrast on gun safety. Could motivate suburban voters, particularly women, who support common-sense gun measures.':'Indica apoyo a leyes de alerta roja enfocadas en violencia dom\\u00E9stica, contradiciendo directamente la Ley Anti-Alerta Roja de 2025. Proporciona un fuerte contraste en seguridad de armas. Podr\\u00EDa motivar a votantes suburbanos, particularmente mujeres.'," +
    "'Would suggest the Democratic base is divided on gun policy, perhaps due to concerns about government overreach or Second Amendment protections. Could lead candidates to soften gun safety messaging.':'Sugerir\\u00EDa que la base dem\\u00F3crata est\\u00E1 dividida sobre pol\\u00EDtica de armas, quiz\\u00E1s por preocupaciones sobre el exceso gubernamental o las protecciones de la Segunda Enmienda. Podr\\u00EDa llevar a candidatos a suavizar el mensaje sobre seguridad de armas.'," +
    // Proposition ifPasses/ifFails translations (Republican)
    "'Signals overwhelming Republican voter support for aggressive property tax elimination. Strengthens Governor Abbott\\u2019s hand to push school property tax elimination in the 2027 legislative session. Could become a GOP platform plank at the June 2026 convention.':'Indica un apoyo abrumador de los votantes republicanos a la eliminaci\\u00F3n agresiva del impuesto a la propiedad. Fortalece la posici\\u00F3n del gobernador Abbott para impulsar la eliminaci\\u00F3n en la sesi\\u00F3n legislativa de 2027.'," +
    "'Weakens the case for full property tax elimination. Legislators would likely pursue incremental relief (higher homestead exemptions, lower caps) rather than wholesale phase-out.':'Debilita el caso para la eliminaci\\u00F3n total del impuesto a la propiedad. Los legisladores probablemente buscar\\u00EDan alivio gradual (mayores exenciones de hogar, topes m\\u00E1s bajos) en lugar de una eliminaci\\u00F3n total.'," +
    "'Signals strong voter demand for direct control over local tax increases. Strengthens legislative efforts to tighten the 3.5% revenue cap or require elections for any increase. Could shape 2027 legislation.':'Indica una fuerte demanda de control directo sobre aumentos de impuestos locales. Fortalece los esfuerzos legislativos para endurecer el tope de ingresos del 3.5% o requerir elecciones para cualquier aumento.'," +
    "'Suggests Republican voters are satisfied with the current 3.5% cap and automatic election trigger from SB 2. Reduces pressure for further restrictions on local government taxing authority.':'Sugiere que los votantes republicanos est\\u00E1n satisfechos con el tope actual del 3.5% y la elecci\\u00F3n autom\\u00E1tica de SB 2. Reduce la presi\\u00F3n por m\\u00E1s restricciones a la autoridad tributaria local.'," +
    "'Signals Republican voter support for medical freedom legislation. Could lead to bills in the 2027 session prohibiting healthcare providers from denying services based on vaccination status. Becomes a platform priority.':'Indica apoyo de los votantes republicanos a legislaci\\u00F3n de libertad m\\u00E9dica. Podr\\u00EDa llevar a proyectos de ley en la sesi\\u00F3n de 2027 que proh\\u00EDban negar servicios seg\\u00FAn el estado de vacunaci\\u00F3n.'," +
    "'Unlikely to fail among Republican primary voters. A weak showing would suggest the COVID-era medical freedom movement has lost momentum within the GOP base.':'Poco probable que falle entre votantes republicanos. Un resultado d\\u00E9bil sugerir\\u00EDa que el movimiento de libertad m\\u00E9dica de la era COVID ha perdido impulso dentro de la base republicana.'," +
    "'Signals strong GOP voter support for incorporating pro-life principles into school curriculum. Could lead to 2027 legislation mandating life-begins-at-fertilization instruction in sex education classes. Reinforces the post-Roe legislative agenda.':'Indica un fuerte apoyo a incorporar principios pro-vida en el curr\\u00EDculo escolar. Podr\\u00EDa llevar a legislaci\\u00F3n en 2027 que obligue la instrucci\\u00F3n de que la vida comienza en la fertilizaci\\u00F3n en clases de educaci\\u00F3n sexual.'," +
    "'Would suggest even Republican primary voters have reservations about mandating this specific curriculum content. Could indicate nuanced views on abortion policy, as polling shows many Texans hold complex positions on the issue.':'Sugerir\\u00EDa que incluso los votantes republicanos tienen reservas sobre obligar este contenido curricular espec\\u00EDfico. Podr\\u00EDa indicar opiniones matizadas sobre la pol\\u00EDtica de aborto.'," +
    "'Signals strong voter support for removing all gender, sexuality, and reproductive health services from public schools. Could lead to 2027 legislation banning school-based health clinics that provide these services, building on existing restrictions in SB 12.':'Indica un fuerte apoyo a eliminar todos los servicios de salud de g\\u00E9nero, sexualidad y reproducci\\u00F3n de las escuelas p\\u00FAblicas. Podr\\u00EDa llevar a legislaci\\u00F3n en 2027 que proh\\u00EDba cl\\u00EDnicas escolares que ofrezcan estos servicios.'," +
    "'Would suggest GOP voters see value in some school-based health services, or that existing restrictions (SB 12, gender-affirming care ban) are sufficient. Reduces pressure for additional legislation.':'Sugerir\\u00EDa que los votantes republicanos ven valor en algunos servicios de salud escolares, o que las restricciones existentes son suficientes. Reduce la presi\\u00F3n por legislaci\\u00F3n adicional.'," +
    "'Signals overwhelming voter demand for term limits. Adds pressure on the legislature to pass a constitutional amendment, though incumbents historically resist limiting their own tenure. Could become a litmus-test issue in future primaries.':'Indica una demanda abrumadora de l\\u00EDmites de mandato. A\\u00F1ade presi\\u00F3n sobre la legislatura para aprobar una enmienda constitucional, aunque los titulares hist\\u00F3ricamente se resisten a limitar su propio mandato.'," +
    "'Extremely unlikely to fail. Term limits consistently poll as one of the most popular reform proposals. A failure here would be a major surprise and would effectively kill the issue for years.':'Extremadamente improbable que falle. Los l\\u00EDmites de mandato consistentemente aparecen como una de las propuestas de reforma m\\u00E1s populares. Un fracaso aqu\\u00ED ser\\u00EDa una gran sorpresa.'," +
    "'Strong signal to the legislature to pass water export restrictions in 2027. Strengthens the case for legislation similar to HB 27 that failed in the Senate. Protects rural water sources from large-scale commercial extraction.':'Fuerte se\\u00F1al a la legislatura para aprobar restricciones de exportaci\\u00F3n de agua en 2027. Fortalece el caso para legislaci\\u00F3n similar a HB 27. Protege las fuentes de agua rurales de la extracci\\u00F3n comercial a gran escala.'," +
    "'Would suggest Republican voters prioritize free-market water rights over rural water protection. Weakens the legislative push to restrict groundwater exports, emboldening large-scale extraction projects.':'Sugerir\\u00EDa que los votantes republicanos priorizan los derechos de agua de libre mercado sobre la protecci\\u00F3n del agua rural. Debilita el impulso legislativo para restringir exportaciones de agua subterr\\u00E1nea.'," +
    "'Signals strong GOP voter demand for restricting services to undocumented immigrants. Could push the 2027 legislature to pass bills cutting in-state tuition eligibility, restricting county-funded legal services, or tightening benefits verification. Many proposals would face federal legal challenges.':'Indica una fuerte demanda de restringir servicios a inmigrantes indocumentados. Podr\\u00EDa impulsar a la legislatura de 2027 a aprobar proyectos que recorten la elegibilidad de matr\\u00EDcula estatal y restrinjan servicios legales del condado.'," +
    "'Unlikely to fail among Republican primary voters. A weak showing would suggest even the GOP base recognizes the complexity of completely ending services, particularly emergency healthcare and K-12 education.':'Poco probable que falle entre votantes republicanos. Un resultado d\\u00E9bil sugerir\\u00EDa que incluso la base reconoce la complejidad de terminar completamente los servicios, particularmente atenci\\u00F3n m\\u00E9dica de emergencia y educaci\\u00F3n K-12.'," +
    "'Pressures House leadership to end the tradition of bipartisan committee appointments. Could become a litmus test for future speaker races. Signals the GOP base wants fully partisan governance in the legislature.':'Presiona al liderazgo de la C\\u00E1mara para terminar la tradici\\u00F3n de nombramientos bipartidistas de comit\\u00E9s. Podr\\u00EDa convertirse en una prueba decisiva para futuras elecciones de presidente de la C\\u00E1mara.'," +
    "'Vindicates the bipartisan tradition. Signals that Republican primary voters value pragmatic governance over pure partisanship. Reduces pressure on House leadership to strip Democrats of all committee roles.':'Vindica la tradici\\u00F3n bipartidista. Indica que los votantes republicanos valoran la gobernanza pragm\\u00E1tica sobre el partidismo puro. Reduce la presi\\u00F3n para eliminar a los dem\\u00F3cratas de todos los roles en comit\\u00E9s.'," +
    "'Signals GOP voter support for explicit anti-Sharia legislation. Could lead to a Texas foreign law ban in 2027, though legal scholars warn it would face immediate constitutional challenges if it singles out Islamic law specifically rather than all foreign legal systems.':'Indica apoyo a legislaci\\u00F3n expl\\u00EDcita anti-Sharia. Podr\\u00EDa llevar a una prohibici\\u00F3n de leyes extranjeras en Texas en 2027, aunque los expertos legales advierten que enfrentar\\u00EDa desaf\\u00EDos constitucionales inmediatos.'," +
    "'Would suggest Republican voters view the issue as already addressed by existing constitutional protections and recent legislation (HB 4211). Reduces pressure for additional anti-Sharia legislation.':'Sugerir\\u00EDa que los votantes republicanos ven el tema como ya abordado por las protecciones constitucionales existentes y la legislaci\\u00F3n reciente (HB 4211). Reduce la presi\\u00F3n por legislaci\\u00F3n anti-Sharia adicional.'," +
    // Cheat sheet
    "'Your Ballot Cheat Sheet':'Tu gu\\u00EDa r\\u00E1pida de boleta'," +
    "'Primary':'Primaria'," +
    "'March 3, 2026':'3 de marzo, 2026'," +
    "'Print Cheat Sheet':'Imprimir gu\\u00EDa r\\u00E1pida'," +
    "'CONTESTED RACES':'CONTIENDAS COMPETIDAS'," +
    "'YOUR VOTE':'TU VOTO'," +
    "'PROPOSITIONS':'PROPOSICIONES'," +
    "'UNCONTESTED':'SIN OPOSICI\\u00D3N'," +
    "'CANDIDATE':'CANDIDATO'," +
    "'= Key race':'= Contienda clave'," +
    "'AI-generated \\u2014 do your own research':'Generado por IA \\u2014 haz tu propia investigaci\\u00F3n'," +
    "'Built with Texas Votes':'Hecho con Texas Votes'," +
    "'Back to My Ballot':'Volver a mi boleta'," +
    // Profile
    "'Your Profile':'Tu perfil'," +
    "'Top Issues':'Temas principales'," +
    "'Political Approach':'Perspectiva pol\\u00EDtica'," +
    "'Policy Stances':'Posturas pol\\u00EDticas'," +
    "'Candidate Qualities':'Cualidades del candidato'," +
    "'Address':'Direcci\\u00F3n'," +
    "'Send Feedback':'Enviar comentarios'," +
    "'Powered by Claude (Anthropic)':'Desarrollado con Claude (Anthropic)'," +
    "'Start Over':'Empezar de nuevo'," +
    "'Regenerate Summary':'Regenerar resumen'," +
    "'My Texas Votes Profile':'Mi perfil de Texas Votes'," +
    "'Copied to clipboard!':'\\u00A1Copiado al portapapeles!'," +
    "'Regenerating...':'Regenerando...'," +
    "'Please enter your street address.':'Por favor, ingresa tu direcci\\u00F3n.'," +
    "'Please enter a valid 5-digit ZIP code.':'Por favor, ingresa un c\\u00F3digo postal v\\u00E1lido de 5 d\\u00EDgitos.'," +
    "'We couldn\\u2019t find that address. Please check your street and ZIP, or skip to see all races.':'No pudimos encontrar esa direcci\\u00F3n. Verifica tu calle y c\\u00F3digo postal, o salta para ver todas las contiendas.'," +
    "'Verifying address...':'Verificando direcci\\u00F3n...'," +
    "'Use My Location':'Usar mi ubicaci\\u00F3n'," +
    "'Locating...':'Localizando...'," +
    "'Location not available':'Ubicaci\\u00F3n no disponible'," +
    "'Location not available. Check that Location Services is enabled in Settings.':'Ubicaci\\u00F3n no disponible. Verifica que los Servicios de ubicaci\\u00F3n est\\u00E9n activados en Configuraci\\u00F3n.'," +
    "'Location permission denied. Please allow location access and try again.':'Permiso de ubicaci\\u00F3n denegado. Por favor, permite el acceso a la ubicaci\\u00F3n e int\\u00E9ntalo de nuevo.'," +
    "'Location timed out. Please try again.':'La ubicaci\\u00F3n tard\\u00F3 demasiado. Por favor, int\\u00E9ntalo de nuevo.'," +
    "'Could not look up address. Try entering it manually.':'No se pudo buscar la direcci\\u00F3n. Intenta ingresarla manualmente.'," +
    "'Could not regenerate summary. Please try again.':'No se pudo regenerar el resumen. Por favor, int\\u00E9ntalo de nuevo.'," +
    "'Reading Level':'Nivel de lectura'," +
    "'Simple':'Simple'," +
    "'Casual':'Casual'," +
    "'Standard':'Est\\u00E1ndar'," +
    "'Detailed':'Detallado'," +
    "'Expert':'Experto'," +
    "'High School':'Preparatoria'," +
    "'Professor':'Profesor'," +
    "'Reprocess Guide':'Reprocesar gu\\u00EDa'," +
    "'Talk to me like...':'H\\u00E1blame como...'," +
    "'How should we explain things?':'\\u00BFC\\u00F3mo deber\\u00EDamos explicarte las cosas?'," +
    "'Keep it simple':'Hazlo simple'," +
    "'Simple, everyday language \\u2014 like a high school class':'Lenguaje simple y cotidiano \\u2014 como en una clase de preparatoria'," +
    "'Just the facts':'Solo los hechos'," +
    "'Clear and balanced \\u2014 standard news level':'Claro y equilibrado \\u2014 nivel de noticias est\\u00E1ndar'," +
    "'I follow politics':'Sigo la pol\\u00EDtica'," +
    "'More depth, nuance, and political terminology':'M\\u00E1s profundidad, matices y terminolog\\u00EDa pol\\u00EDtica'," +
    "'This will erase your profile and recommendations.':'Esto borrar\\u00E1 tu perfil y recomendaciones.'," +
    "'Start over? This will erase your profile and recommendations.':'\\u00BFEmpezar de nuevo? Esto borrar\\u00E1 tu perfil y recomendaciones.'," +
    "'Storage full. Some data may not be saved. Visit Profile to clear old data.':'Almacenamiento lleno. Algunos datos podr\\u00EDan no guardarse. Visita Perfil para borrar datos antiguos.'," +
    // Vote Info
    "'Voting Info':'Info de votaci\\u00F3n'," +
    "'days until Election Day':'d\\u00EDas para el d\\u00EDa de elecciones'," +
    "'Today is Election Day!':'\\u00A1Es d\\u00EDa de elecciones!'," +
    "'Election Day has passed':'El d\\u00EDa de elecciones ha pasado'," +
    "'I Voted!':'\\u00A1Yo vot\\u00E9!'," +
    "'I Voted':'Yo vot\\u00E9'," +
    "'Early!':'\\u00A1Anticipadamente!'," +
    "'You voted! Thank you for participating in democracy.':'\\u00A1Ya votaste! Gracias por participar en la democracia.'," +
    "'Actually, I didn\\u2019t vote yet.':'En realidad, a\\u00FAn no he votado.'," +
    "'You did it!':'\\u00A1Lo lograste!'," +
    "'Now help 3 friends do the same. Share Texas Votes with someone who needs help deciding.':'Ahora ayuda a 3 amigos a hacer lo mismo. Comparte Texas Votes con alguien que necesite ayuda para decidir.'," +
    "'Share Texas Votes':'Compartir Texas Votes'," +
    "'Maybe later':'Quiz\\u00E1s despu\\u00E9s'," +
    "'Find Your Polling Location':'Encuentra tu lugar de votaci\\u00F3n'," +
    "'Your county uses Vote Centers \\u2014 you can vote at any location.':'Tu condado usa centros de votaci\\u00F3n \\u2014 puedes votar en cualquier ubicaci\\u00F3n.'," +
    "'Find Locations':'Encontrar ubicaciones'," +
    "'Key Dates':'Fechas clave'," +
    "'Registration deadline':'Fecha l\\u00EDmite de registro'," +
    "'Mail ballot application deadline':'Fecha l\\u00EDmite para solicitud de boleta por correo'," +
    "'Early voting':'Votaci\\u00F3n anticipada'," +
    "'Election Day':'D\\u00EDa de elecciones'," +
    "'Early Voting':'Votaci\\u00F3n anticipada'," +
    "'Vote at any early voting location in your county.':'Vota en cualquier lugar de votaci\\u00F3n anticipada en tu condado.'," +
    "'Early voting hours vary by county. Contact your county elections office for specific hours and locations.':'Los horarios de votaci\\u00F3n anticipada var\\u00EDan por condado. Contacta la oficina de elecciones de tu condado para horarios y ubicaciones espec\\u00EDficas.'," +
    "'Hours':'Horario'," +
    "'Open Primary:':'Primaria abierta:'," +
    "'Texas has open primaries \\u2014 tell the poll worker which party\\u2019s primary you want. You can only vote in one.':'Texas tiene primarias abiertas \\u2014 dile al trabajador electoral en cu\\u00E1l primaria quieres votar. Solo puedes votar en una.'," +
    "'Find Election Day locations':'Encuentra lugares para el d\\u00EDa de elecciones'," +
    "'Voter ID':'Identificaci\\u00F3n de votante'," +
    "'Texas driver\\u2019s license or DPS ID':'Licencia de conducir de Texas o ID del DPS'," +
    "'Texas Election ID Certificate (EIC)':'Certificado de Identificaci\\u00F3n Electoral de Texas (EIC)'," +
    "'Texas concealed handgun license':'Licencia de portaci\\u00F3n oculta de armas de Texas'," +
    "'U.S. military ID with photo':'Identificaci\\u00F3n militar de EE.UU. con foto'," +
    "'U.S. citizenship certificate with photo':'Certificado de ciudadan\\u00EDa de EE.UU. con foto'," +
    "'U.S. passport (book or card)':'Pasaporte de EE.UU. (libro o tarjeta)'," +
    "'Expired IDs accepted if expired less than 4 years. No expiration limit for voters 70+.':'Se aceptan identificaciones vencidas si tienen menos de 4 a\\u00F1os de vencimiento. Sin l\\u00EDmite para votantes de 70 a\\u00F1os o m\\u00E1s.'," +
    "'What to Bring':'Qu\\u00E9 llevar'," +
    "'Photo ID':'Identificaci\\u00F3n con foto'," +
    "'Your cheat sheet (printed)':'Tu gu\\u00EDa r\\u00E1pida (impresa)'," +
    "'Voter registration card':'Tarjeta de registro de votante'," +
    "'REQUIRED':'OBLIGATORIO'," +
    "'Optional':'Opcional'," +
    "'Note:':'Nota:'," +
    "'You may NOT use your phone in the voting booth. Print your cheat sheet before you go!':'NO puedes usar tu tel\\u00E9fono en la casilla de votaci\\u00F3n. \\u00A1Imprime tu gu\\u00EDa antes de ir!'," +
    "'Resources':'Recursos'," +
    "'Volunteer Opportunities':'Oportunidades de voluntariado'," +
    "'Be an Election Worker':'S\\u00E9 trabajador electoral'," +
    "'County Elections Office':'Oficina de elecciones del condado'," +
    "'League of Women Voters TX':'Liga de Mujeres Votantes TX'," +
    "'Rock the Vote':'Rock the Vote'," +
    "'Texas Civil Rights Project':'Proyecto de Derechos Civiles de Texas'," +
    "'Help your neighbors vote! Poll workers, voter registration drives, and ride-to-polls programs need volunteers.':'\\u00A1Ayuda a tus vecinos a votar! Se necesitan voluntarios para trabajar en casillas, registrar votantes y llevar gente a votar.'," +
    "'County Elections':'Elecciones del condado'," +
    "'Find your polling location for Election Day.':'Encuentra tu lugar de votaci\\u00F3n para el d\\u00EDa de elecciones.'," +
    "'Vote at any Vote Center in your county.':'Vota en cualquier centro de votaci\\u00F3n en tu condado.'," +
    "'Check your county\\u2019s phone policy. Some counties prohibit phones in the booth. Print your cheat sheet to be safe!':'Consulta la pol\\u00EDtica de tu condado sobre tel\\u00E9fonos. Algunos condados proh\\u00EDben tel\\u00E9fonos en la casilla. \\u00A1Imprime tu gu\\u00EDa para estar seguro!'," +
    // Footer
    "'Nonpartisan by Design':'Apartidista por dise\\u00F1o'," +
    "'Privacy Policy':'Pol\\u00EDtica de privacidad'," +
    "'How It Works':'C\\u00F3mo funciona'," +
    "'Privacy':'Privacidad'," +
    "'Built in Texas':'Hecho en Texas'," +
    // Issues
    "'Economy & Cost of Living':'Econom\\u00EDa y costo de vida'," +
    "'Housing':'Vivienda'," +
    "'Public Safety':'Seguridad p\\u00FAblica'," +
    "'Education':'Educaci\\u00F3n'," +
    "'Healthcare':'Salud'," +
    "'Environment & Climate':'Medio ambiente y clima'," +
    "'Grid & Infrastructure':'Red el\\u00E9ctrica e infraestructura'," +
    "'Tech & Innovation':'Tecnolog\\u00EDa e innovaci\\u00F3n'," +
    "'Transportation':'Transporte'," +
    "'Immigration':'Inmigraci\\u00F3n'," +
    "'Taxes':'Impuestos'," +
    "'Civil Rights':'Derechos civiles'," +
    "'Gun Policy':'Pol\\u00EDtica de armas'," +
    "'Abortion & Reproductive Rights':'Aborto y derechos reproductivos'," +
    "'Water & Land':'Agua y tierras'," +
    "'Agriculture & Rural':'Agricultura y zonas rurales'," +
    "'Faith & Religious Liberty':'Fe y libertad religiosa'," +
    "'Criminal Justice':'Justicia penal'," +
    "'Energy & Oil/Gas':'Energ\\u00EDa y petr\\u00F3leo/gas'," +
    "'LGBTQ+ Rights':'Derechos LGBTQ+'," +
    "'Voting & Elections':'Votaci\\u00F3n y elecciones'," +
    // Spectrum
    "'Progressive':'Progresista'," +
    "'Bold systemic change, social justice focused':'Cambio sist\\u00E9mico audaz, enfocado en la justicia social'," +
    "'Liberal':'Liberal'," +
    "'Expand rights and services, government as a force for good':'Expandir derechos y servicios, el gobierno como fuerza para el bien'," +
    "'Moderate':'Moderado'," +
    "'Pragmatic center, best ideas from both sides':'Centro pragm\\u00E1tico, las mejores ideas de ambos lados'," +
    "'Conservative':'Conservador'," +
    "'Limited government, traditional values, fiscal discipline':'Gobierno limitado, valores tradicionales, disciplina fiscal'," +
    "'Libertarian':'Libertario'," +
    "'Maximum freedom, minimal government':'M\\u00E1xima libertad, gobierno m\\u00EDnimo'," +
    "'Independent / Issue-by-Issue':'Independiente / Tema por tema'," +
    "'I decide issue by issue, not by party':'Decido tema por tema, no por partido'," +
    // Qualities
    "'Competence & Track Record':'Competencia y trayectoria'," +
    "'Integrity & Honesty':'Integridad y honestidad'," +
    "'Independence':'Independencia'," +
    "'Experience':'Experiencia'," +
    "'Fresh Perspective':'Perspectiva nueva'," +
    "'Bipartisan / Works Across Aisle':'Bipartidista / Trabaja con ambos partidos'," +
    "'Strong Leadership':'Liderazgo fuerte'," +
    "'Community Ties':'Lazos comunitarios'," +
    "'Faith & Values':'Fe y valores'," +
    "'Business Experience':'Experiencia empresarial'," +
    // Deep dive questions
    "'On housing, where do you land?':'Sobre vivienda, \\u00BFcu\\u00E1l es tu postura?'," +
    "'Increase housing supply':'Aumentar la oferta de viviendas'," +
    "'Ease zoning, encourage density, let the market work':'Flexibilizar la zonificaci\\u00F3n, fomentar la densidad, dejar que el mercado construya'," +
    "'Managed growth':'Crecimiento gestionado'," +
    "'More housing with affordability requirements':'M\\u00E1s vivienda con requisitos de asequibilidad'," +
    "'Protect property rights':'Proteger los derechos de propiedad'," +
    "'Keep property taxes low, limit government land-use rules':'Mantener bajos los impuestos a la propiedad, limitar las reglas gubernamentales de uso de suelo'," +
    "'Case-by-case decisions':'Decisiones caso por caso'," +
    "'Evaluate each situation based on community needs':'Evaluar cada situaci\\u00F3n seg\\u00FAn las necesidades de la comunidad'," +
    "'On public safety, what\\u2019s your approach?':'Sobre seguridad p\\u00FAblica, \\u00BFcu\\u00E1l es tu enfoque?'," +
    "'Increase police funding':'Aumentar el financiamiento policial'," +
    "'Hire more officers, strengthen prosecution':'Contratar m\\u00E1s oficiales, fortalecer la fiscalizaci\\u00F3n'," +
    "'Reform and fund':'Reformar y financiar'," +
    "'Fund police and invest in alternatives':'Financiar a la polic\\u00EDa e invertir en alternativas'," +
    "'Shift to prevention':'Redirigir hacia la prevenci\\u00F3n'," +
    "'Move funding toward prevention and social services':'Destinar fondos a prevenci\\u00F3n y servicios sociales'," +
    "'Community-based safety':'Seguridad comunitaria'," +
    "'Expand community-based approaches to public safety':'Ampliar enfoques comunitarios de seguridad p\\u00FAblica'," +
    "'On taxes and government spending?':'\\u00BFSobre impuestos y gasto p\\u00FAblico?'," +
    "'Lower taxes and spending':'Reducir impuestos y gasto'," +
    "'Reduce government spending and lower tax rates':'Reducir el gasto gubernamental y bajar las tasas de impuestos'," +
    "'Reprioritize spending':'Reordenar el gasto'," +
    "'Redirect existing funds toward higher-priority programs':'Redirigir los fondos existentes hacia programas de mayor prioridad'," +
    "'Increase targeted spending':'Aumentar el gasto focalizado'," +
    "'Pay more for programs that show results':'Pagar m\\u00E1s por programas que muestren resultados'," +
    "'Progressive revenue model':'Modelo de ingresos progresivo'," +
    "'Fund expanded services through higher taxes on top earners':'Financiar servicios ampliados con impuestos m\\u00E1s altos a los que m\\u00E1s ganan'," +
    "'On tech and AI regulation?':'\\u00BFSobre regulaci\\u00F3n de tecnolog\\u00EDa e IA?'," +
    "'Minimal regulation':'Regulaci\\u00F3n m\\u00EDnima'," +
    "'Let innovation lead, regulate later if needed':'Dejar que la innovaci\\u00F3n lidere, regular despu\\u00E9s si es necesario'," +
    "'Light guardrails':'L\\u00EDmites ligeros'," +
    "'Basic rules without slowing development':'Reglas b\\u00E1sicas sin frenar el desarrollo'," +
    "'Proactive regulation':'Regulaci\\u00F3n proactiva'," +
    "'Establish rules before problems arise':'Establecer reglas antes de que surjan problemas'," +
    "'Strict oversight':'Supervisi\\u00F3n estricta'," +
    "'Strong regulatory controls on tech companies':'Controles regulatorios estrictos sobre empresas tecnol\\u00F3gicas'," +
    "'On public education, what\\u2019s your priority?':'Sobre educaci\\u00F3n p\\u00FAblica, \\u00BFcu\\u00E1l es tu prioridad?'," +
    "'Expand school choice':'Ampliar la elecci\\u00F3n escolar'," +
    "'Vouchers, charters, parent-directed options':'Vales, escuelas ch\\u00E1rter, opciones dirigidas por los padres'," +
    "'Strengthen public schools':'Fortalecer las escuelas p\\u00FAblicas'," +
    "'More funding and support for neighborhood schools':'M\\u00E1s fondos y apoyo para las escuelas del vecindario'," +
    "'Invest in teachers':'Invertir en los maestros'," +
    "'Raise pay, reduce class sizes, support educators':'Aumentar salarios, reducir el tama\\u00F1o de las clases, apoyar a los educadores'," +
    "'Core academics focus':'Enfoque en materias b\\u00E1sicas'," +
    "'Concentrate on foundational subjects and skills':'Concentrarse en materias y habilidades fundamentales'," +
    "'On healthcare, where do you stand?':'Sobre salud, \\u00BFcu\\u00E1l es tu posici\\u00F3n?'," +
    "'Market-based approach':'Enfoque de mercado'," +
    "'Less regulation, more competition to lower costs':'Menos regulaci\\u00F3n, m\\u00E1s competencia para reducir costos'," +
    "'Expand Medicaid':'Expandir Medicaid'," +
    "'Texas should accept federal Medicaid expansion':'Texas deber\\u00EDa aceptar la expansi\\u00F3n federal de Medicaid'," +
    "'Universal coverage':'Cobertura universal'," +
    "'Guarantee healthcare access regardless of income':'Garantizar acceso a la salud sin importar los ingresos'," +
    "'Community-based care':'Atenci\\u00F3n comunitaria'," +
    "'Community health centers and county programs':'Centros de salud comunitarios y programas del condado'," +
    "'On environment and climate?':'\\u00BFSobre medio ambiente y clima?'," +
    "'Maintain current approach':'Mantener el enfoque actual'," +
    "'Preserve existing energy policy, market-driven solutions':'Preservar la pol\\u00EDtica energ\\u00E9tica actual, soluciones del mercado'," +
    "'Mixed energy strategy':'Estrategia energ\\u00E9tica mixta'," +
    "'Renewables and fossil fuels, pragmatic transition':'Renovables y combustibles f\\u00F3siles, transici\\u00F3n pragm\\u00E1tica'," +
    "'Accelerate green transition':'Acelerar la transici\\u00F3n verde'," +
    "'Faster renewable energy targets and climate regulations':'Metas m\\u00E1s r\\u00E1pidas de energ\\u00EDa renovable y regulaciones clim\\u00E1ticas'," +
    "'Local environmental focus':'Enfoque ambiental local'," +
    "'Clean air and water, green spaces, urban heat':'Aire y agua limpios, espacios verdes, calor urbano'," +
    "'On the power grid and infrastructure?':'\\u00BFSobre la red el\\u00E9ctrica e infraestructura?'," +
    "'Reduce grid regulation':'Reducir la regulaci\\u00F3n de la red'," +
    "'More competition, less centralized ERCOT control':'M\\u00E1s competencia, menos control centralizado de ERCOT'," +
    "'Mandate grid upgrades':'Exigir mejoras a la red'," +
    "'Require weatherization and invest to prevent outages':'Exigir climatizaci\\u00F3n e invertir para prevenir apagones'," +
    "'Connect to national grid':'Conectar a la red nacional'," +
    "'Link Texas to national grid for backup':'Conectar Texas a la red nacional como respaldo'," +
    "'Distributed local systems':'Sistemas locales distribuidos'," +
    "'Microgrids, batteries, community-level solutions':'Microrredes, bater\\u00EDas, soluciones a nivel comunitario'," +
    "'On transportation, what\\u2019s the priority?':'Sobre transporte, \\u00BFcu\\u00E1l es la prioridad?'," +
    "'Expand road capacity':'Ampliar la capacidad vial'," +
    "'Build highways, farm-to-market roads, reduce congestion':'Construir autopistas, caminos rurales, reducir la congesti\\u00F3n'," +
    "'Invest in transit':'Invertir en transporte p\\u00FAblico'," +
    "'Rail, better buses, less car dependence in metro areas':'Tren, mejores autobuses, menos dependencia del auto en zonas metropolitanas'," +
    "'Multi-modal approach':'Enfoque multimodal'," +
    "'Roads, transit, bikes, and walkability together':'Carreteras, transporte p\\u00FAblico, bicicletas y peatonalidad juntos'," +
    "'Rural connectivity':'Conectividad rural'," +
    "'Fix rural roads, improve connections between small towns':'Reparar caminos rurales, mejorar las conexiones entre pueblos peque\\u00F1os'," +
    "'On immigration, what\\u2019s your view?':'Sobre inmigraci\\u00F3n, \\u00BFcu\\u00E1l es tu opini\\u00F3n?'," +
    "'Prioritize border enforcement':'Priorizar la aplicaci\\u00F3n fronteriza'," +
    "'Focus on enforcement first, then discuss reform':'Enfocarse primero en la aplicaci\\u00F3n, luego discutir reformas'," +
    "'Enforcement plus reform':'Aplicaci\\u00F3n m\\u00E1s reforma'," +
    "'Secure borders and create legal pathways':'Asegurar fronteras y crear v\\u00EDas legales'," +
    "'Broaden legal pathways':'Ampliar las v\u00EDas legales'," +
    "'Expand legal immigration pathways and community support':'Ampliar las v\\u00EDas legales de inmigraci\\u00F3n y el apoyo comunitario'," +
    "'Defer to federal authority':'Delegar a la autoridad federal'," +
    "'Immigration is a federal issue, not a state priority':'La inmigraci\\u00F3n es un asunto federal, no una prioridad estatal'," +
    "'On civil rights and equality?':'\\u00BFSobre derechos civiles e igualdad?'," +
    "'Uniform legal standards':'Est\\u00E1ndares legales uniformes'," +
    "'Apply the same rules to everyone equally':'Aplicar las mismas reglas a todos por igual'," +
    "'Maintain current protections':'Mantener las protecciones actuales'," +
    "'Keep existing protections, prevent rollbacks':'Mantener las protecciones existentes, prevenir retrocesos'," +
    "'Expand protections':'Ampliar protecciones'," +
    "'Strengthen anti-discrimination laws and enforcement':'Fortalecer las leyes antidiscriminaci\\u00F3n y su aplicaci\\u00F3n'," +
    "'Structural reform':'Reforma estructural'," +
    "'Change systems and institutions to reduce disparities':'Cambiar sistemas e instituciones para reducir las disparidades'," +
    // Gun Policy deep dive
    "'On gun policy, where do you stand?':'Sobre pol\\u00EDtica de armas, \\u00BFcu\\u00E1l es tu postura?'," +
    "'Expand gun rights':'Ampliar los derechos de armas'," +
    "'Broaden carry permissions, reduce permitting requirements':'Ampliar los permisos de portaci\\u00F3n, reducir los requisitos de licencia'," +
    "'Maintain current gun laws':'Mantener las leyes de armas actuales'," +
    "'Keep current firearm laws without additional restrictions':'Mantener las leyes de armas actuales sin restricciones adicionales'," +
    "'Ownership with safeguards':'Posesi\\u00F3n con medidas de seguridad'," +
    "'Support gun ownership with background checks and safety rules':'Apoyar la posesi\\u00F3n de armas con verificaci\\u00F3n de antecedentes y reglas de seguridad'," +
    "'Strengthen gun regulations':'Fortalecer las regulaciones de armas'," +
    "'Universal background checks, red flag laws, waiting periods':'Verificaci\\u00F3n universal de antecedentes, leyes de alerta, per\\u00EDodos de espera'," +
    // Abortion & Reproductive Rights deep dive
    "'On abortion and reproductive rights?':'\\u00BFSobre aborto y derechos reproductivos?'," +
    "'Maintain current law':'Mantener la ley actual'," +
    "'Keep Texas\\u2019s current abortion laws in place':'Mantener las leyes actuales de aborto en Texas'," +
    "'Prohibit with limited exceptions':'Prohibici\\u00F3n con excepciones limitadas'," +
    "'Restrict most abortions, allow for rape, incest, life of mother':'Restringir la mayor\\u00EDa de los abortos, permitir en casos de violaci\\u00F3n, incesto o vida de la madre'," +
    "'Allow early-term access':'Permitir acceso temprano'," +
    "'Permit early-term abortion, narrow current restrictions':'Permitir el aborto temprano, limitar las restricciones actuales'," +
    "'Full individual choice':'Elecci\\u00F3n individual plena'," +
    "'Leave reproductive decisions to the individual':'Dejar las decisiones reproductivas a la persona'," +
    // Water & Land deep dive
    "'On water and land use in Texas?':'\\u00BFSobre agua y uso de tierras en Texas?'," +
    "'Prioritize landowner rights':'Priorizar los derechos de los propietarios'," +
    "'Landowners should control their water and land use':'Los due\\u00F1os de tierras deben controlar el uso de su agua y su tierra'," +
    "'Protect rural water supply':'Proteger el suministro de agua rural'," +
    "'Restrict large-scale water exports, protect aquifers':'Restringir las exportaciones de agua a gran escala, proteger los acu\\u00EDferos'," +
    "'Strengthen conservation rules':'Fortalecer las reglas de conservaci\\u00F3n'," +
    "'Stricter regulations to prevent waste and pollution':'Regulaciones m\\u00E1s estrictas para prevenir el desperdicio y la contaminaci\\u00F3n'," +
    "'Major infrastructure investment':'Inversi\\u00F3n importante en infraestructura'," +
    "'Build new reservoirs, desalination, and water systems':'Construir nuevos embalses, desalinizaci\\u00F3n y sistemas de agua'," +
    // Agriculture & Rural deep dive
    "'On agriculture and rural Texas?':'\\u00BFSobre agricultura y el Texas rural?'," +
    "'Support family farms':'Apoyar a las granjas familiares'," +
    "'Protect small farms, limit large-scale corporate operations':'Proteger las granjas peque\\u00F1as, limitar las operaciones corporativas a gran escala'," +
    "'Reduce farm regulations':'Reducir las regulaciones agr\\u00EDcolas'," +
    "'Less regulation, let farmers compete globally':'Menos regulaci\\u00F3n, dejar que los agricultores compitan globalmente'," +
    "'Rural community investment':'Inversi\\u00F3n en comunidades rurales'," +
    "'Broadband, hospitals, schools for rural communities':'Internet, hospitales, escuelas para comunidades rurales'," +
    "'Sustainable farming practices':'Pr\\u00E1cticas agr\\u00EDcolas sostenibles'," +
    "'Incentivize conservation and regenerative methods':'Incentivar la conservaci\\u00F3n y m\\u00E9todos regenerativos'," +
    // Faith & Religious Liberty deep dive
    "'On faith and religious liberty?':'\\u00BFSobre fe y libertad religiosa?'," +
    "'Expand religious protections':'Ampliar las protecciones religiosas'," +
    "'Broader legal protections for faith-based beliefs and practices':'M\\u00E1s protecciones legales para creencias y pr\\u00E1cticas basadas en la fe'," +
    "'Accommodate both':'Acomodar ambos'," +
    "'Protect religious freedom while respecting others\\u2019 rights':'Proteger la libertad religiosa respetando los derechos de otros'," +
    "'Separate religion and government':'Separar religi\\u00F3n y gobierno'," +
    "'Keep religious beliefs separate from public policy decisions':'Mantener las creencias religiosas separadas de las decisiones de pol\\u00EDtica p\\u00FAblica'," +
    "'Faith-informed lawmaking':'Legislaci\\u00F3n informada por la fe'," +
    "'Moral and religious values should influence legislation':'Los valores morales y religiosos deben influir en la legislaci\\u00F3n'," +
    // Criminal Justice deep dive
    "'What\\u2019s your approach to criminal justice?':'\\u00BFCu\\u00E1l es tu enfoque sobre la justicia penal?'," +
    "'Strengthen law enforcement':'Fortalecer la aplicaci\\u00F3n de la ley'," +
    "'Increase funding for police, prosecution, and victim services':'Aumentar fondos para polic\\u00EDa, fiscal\\u00EDa y servicios a v\\u00EDctimas'," +
    "'Maintain current system':'Mantener el sistema actual'," +
    "'Keep current sentencing and enforcement policies in place':'Mantener las pol\\u00EDticas actuales de sentencias y aplicaci\\u00F3n de la ley'," +
    "'Reform sentencing laws':'Reformar las leyes de sentencia'," +
    "'Reduce mandatory minimums, review sentencing disparities':'Reducir m\\u00EDnimos obligatorios, revisar las disparidades en las sentencias'," +
    "'Focus on rehabilitation':'Enfoque en la rehabilitaci\\u00F3n'," +
    "'Invest in re-entry programs, reduce recidivism through support':'Invertir en programas de reinserci\\u00F3n, reducir la reincidencia mediante apoyo'," +
    // Energy & Oil/Gas deep dive
    "'How should Texas manage its energy industry?':'\\u00BFC\\u00F3mo deber\\u00EDa Texas manejar su industria energ\\u00E9tica?'," +
    "'Expand production':'Ampliar la producci\\u00F3n'," +
    "'Support oil and gas growth, reduce regulations on producers':'Apoyar el crecimiento de petr\\u00F3leo y gas, reducir regulaciones a los productores'," +
    "'Mixed energy strategy':'Estrategia energ\\u00E9tica mixta'," +
    "'Maintain fossil fuels while investing in renewables and grid stability':'Mantener combustibles f\\u00F3siles mientras se invierte en renovables y estabilidad de la red'," +
    "'Accelerate clean energy':'Acelerar la energ\\u00EDa limpia'," +
    "'Transition away from fossil fuels toward wind, solar, and storage':'Transici\\u00F3n de combustibles f\\u00F3siles hacia e\\u00F3lica, solar y almacenamiento'," +
    "'Let the market decide':'Dejar que el mercado decida'," +
    "'Remove subsidies for all energy sources, let competition set the course':'Eliminar subsidios para todas las fuentes de energ\\u00EDa, dejar que la competencia defina el rumbo'," +
    // LGBTQ+ Rights deep dive
    "'What\\u2019s the right approach to LGBTQ+ rights?':'\\u00BFCu\\u00E1l es el enfoque correcto sobre los derechos LGBTQ+?'," +
    "'Expand legal protections':'Ampliar las protecciones legales'," +
    "'Add sexual orientation and gender identity to anti-discrimination laws':'A\\u00F1adir orientaci\\u00F3n sexual e identidad de g\\u00E9nero a las leyes antidiscriminaci\\u00F3n'," +
    "'Accommodate both':'Acomodar ambos'," +
    "'Protect LGBTQ+ individuals while preserving faith-based exemptions':'Proteger a las personas LGBTQ+ mientras se preservan las exenciones basadas en la fe'," +
    "'Maintain current laws':'Mantener las leyes actuales'," +
    "'Current legal protections are sufficient, no new laws needed':'Las protecciones legales actuales son suficientes, no se necesitan nuevas leyes'," +
    "'Parental rights focus':'Enfoque en los derechos de los padres'," +
    "'Parents should direct decisions about children\\u2019s healthcare and education':'Los padres deben dirigir las decisiones sobre la salud y educaci\\u00F3n de sus hijos'," +
    // Voting & Elections deep dive
    "'What matters most for elections?':'\\u00BFQu\\u00E9 es lo m\\u00E1s importante para las elecciones?'," +
    "'Expand voter access':'Ampliar el acceso al voto'," +
    "'Make registration easier, extend early voting, allow mail-in ballots for all':'Facilitar el registro, extender la votaci\\u00F3n anticipada, permitir voto por correo para todos'," +
    "'Strengthen ID requirements':'Fortalecer los requisitos de identificaci\\u00F3n'," +
    "'Require photo ID, verify citizenship, secure the voter rolls':'Exigir identificaci\\u00F3n con foto, verificar ciudadan\\u00EDa, asegurar los padrones electorales'," +
    "'Combined approach':'Enfoque combinado'," +
    "'Improve access and security together with bipartisan oversight':'Mejorar el acceso y la seguridad junto con supervisi\\u00F3n bipartidista'," +
    "'Local control':'Control local'," +
    "'Let counties and cities set their own election rules and procedures':'Permitir que los condados y ciudades establezcan sus propias reglas y procedimientos electorales'," +
    // County ballot coverage
    "'Local races for':'Carreras locales para'," +
    "'County are not yet available. Your ballot shows statewide and district races only.':'no est\\u00E1n disponibles a\\u00FAn. Tu boleta muestra solo las carreras estatales y de distrito.'," +
    "'Local races not yet available for this county.':'Carreras locales a\\u00FAn no disponibles para este condado.'," +
    "'Your ballot data may be outdated. Tap to refresh.':'Tu informaci\\u00F3n de boleta puede estar desactualizada. Toca para actualizar.'," +
    "'Why this match?':'\\u00BFPor qu\\u00E9 esta recomendaci\\u00F3n?'," +
    // Data confidence badges
    "'Verified':'Verificado'," +
    "'Sourced':'Con fuentes'," +
    "'AI-inferred':'Inferido por IA'," +
    "'Data Confidence':'Confianza de Datos'," +
    "'backed by official sources (Ballotpedia, Vote Smart, .gov)':'respaldado por fuentes oficiales (Ballotpedia, Vote Smart, .gov)'," +
    "'from web sources cited below':'de fuentes web citadas abajo'," +
    "'generated by AI from available information':'generado por IA a partir de informaci\\u00F3n disponible'," +
    // Report issue
    "'Flag this info':'Reportar esta informaci\\u00F3n'," +
    "'Report an Issue':'Reportar un problema'," +
    "'Help us improve. Select the type of issue and add details if you can.':'Ay\\u00FAdanos a mejorar. Selecciona el tipo de problema y agrega detalles si puedes.'," +
    "'Incorrect info':'Informaci\\u00F3n incorrecta'," +
    "'Perceived bias':'Sesgo percibido'," +
    "'Missing info':'Informaci\\u00F3n faltante'," +
    "'Other':'Otro'," +
    "'Details (optional)':'Detalles (opcional)'," +
    "'Describe the issue...':'Describe el problema...'," +
    "'Submit Report':'Enviar reporte'," +
    "'Cancel':'Cancelar'," +
    "'Thank you! Your report has been sent.':'\\u00A1Gracias! Tu reporte ha sido enviado.'," +
    "'Please select an issue type.':'Por favor selecciona un tipo de problema.'," +
    // Election expiration banner
    "'The March 3 primary is over. Your ballot data is from the primary election.':'La primaria del 3 de marzo termin\\u00F3. Tu informaci\\u00F3n de boleta es de la elecci\\u00F3n primaria.'," +
    "'Clear & Start Fresh':'Borrar y empezar de nuevo'," +
    "'Keep for Reference':'Conservar como referencia'," +
    // LLM Experiment
    "'LLM Experiment':'Experimento de IA'," +
    "'Compare Claude against another AI model':'Comparar Claude con otro modelo de IA'," +
    "'Run Experiment':'Ejecutar Experimento'," +
    "'Agreement':'Concordancia'," +
    "'agree on':'coinciden en'," +
    "'items':'elementos'," +
    "'Disagreements':'Diferencias'," +
    "'all in lower-ballot races':'todas en contiendas menores'," +
    "'Confidence Comparison':'Comparaci\\u00F3n de Confianza'," +
    "'Reasoning Quality':'Calidad del Razonamiento'," +
    "'Avg Confidence':'Confianza Promedio'," +
    "'Strong Match':'Fuerte Coincidencia'," +
    "'Good Match':'Buena Coincidencia'," +
    "'Best Available':'Mejor Disponible'," +
    "'Avg reasoning length':'Longitud promedio del razonamiento'," +
    "'Avg match factors':'Factores de coincidencia promedio'," +
    "'Has caveats':'Tiene advertencias'," +
    "'Race-by-Race Results':'Resultados por Contienda'," +
    "'Agree':'Coinciden'," +
    "'Disagree':'Difieren'," +
    "'Disagreement Details':'Detalles de Diferencias'," +
    "'Speed & Cost':'Velocidad y Costo'," +
    "'Response Time':'Tiempo de Respuesta'," +
    "'Est. Cost':'Costo Est.'," +
    "'was':'fue'," +
    "'faster':'m\\u00E1s r\\u00E1pido'," +
    "'cheaper':'m\\u00E1s barato'," +
    "'Cost estimated from response size (~4 chars/token)':'Costo estimado del tama\\u00F1o de respuesta (~4 caracteres/token)'," +
    "'Generating with':'Generando con'," +
    "'Back to My Ballot':'Volver a mi boleta'," +
    "'Near-perfect agreement.':'Concordancia casi perfecta.'," +
    "'produces very similar recommendations to Claude.':'produce recomendaciones muy similares a Claude.'," +
    "'Strong agreement.':'Fuerte concordancia.'," +
    "'Disagreements are mostly in lower-profile races.':'Las diferencias est\\u00E1n mayormente en contiendas de menor perfil.'," +
    "'Moderate agreement.':'Concordancia moderada.'," +
    "'Significant differences \\u2014 review carefully before switching.':'Diferencias significativas \\u2014 revisa cuidadosamente antes de cambiar.'," +
    "'Low agreement.':'Baja concordancia.'," +
    "'makes substantially different recommendations.':'hace recomendaciones sustancialmente diferentes.'," +
    // Override feature translations
    "'You changed this':'Cambiaste esto'," +
    "'AI pick':'Elecci\\u00F3n de IA'," +
    "'Your Pick':'Tu elecci\\u00F3n'," +
    "'AI recommended':'La IA recomend\\u00F3'," +
    "'but you chose':'pero elegiste'," +
    "'Restore AI pick':'Restaurar elecci\\u00F3n de IA'," +
    "'Choose this candidate instead':'Elegir este candidato en su lugar'," +
    "'Why did you change this?':'\\u00BFPor qu\\u00E9 cambiaste esto?'," +
    "'What made you choose differently? (optional, anonymous)':'\\u00BFQu\\u00E9 te hizo elegir diferente? (opcional, an\\u00F3nimo)'," +
    "'Submit feedback':'Enviar comentario'," +
    "'Skip':'Omitir'," +
    "'This feedback is anonymous and helps improve recommendations for everyone.':'Este comentario es an\\u00F3nimo y ayuda a mejorar las recomendaciones para todos.'," +
    "'Feedback sent':'Comentario enviado'," +
    "'your pick':'tu elecci\\u00F3n'" +
  "};",
  "function t(s){return LANG==='es'&&TR[s]||s}",

  // ============ DATA ============
  "var ISSUES=[" +
    '{v:"Economy & Cost of Living",icon:"\u{1F4B0}"},' +
    '{v:"Housing",icon:"\u{1F3E0}"},' +
    '{v:"Public Safety",icon:"\u{1F6E1}\u{FE0F}"},' +
    '{v:"Education",icon:"\u{1F393}"},' +
    '{v:"Healthcare",icon:"\u2764\u{FE0F}"},' +
    '{v:"Environment & Climate",icon:"\u{1F33F}"},' +
    '{v:"Grid & Infrastructure",icon:"\u26A1"},' +
    '{v:"Tech & Innovation",icon:"\u{1F4BB}"},' +
    '{v:"Transportation",icon:"\u{1F697}"},' +
    '{v:"Immigration",icon:"\u{1F30E}"},' +
    '{v:"Taxes",icon:"\u{1F4B5}"},' +
    '{v:"Civil Rights",icon:"\u2696\u{FE0F}"},' +
    '{v:"Gun Policy",icon:"\u{1F3AF}"},' +
    '{v:"Abortion & Reproductive Rights",icon:"\u2695\u{FE0F}"},' +
    '{v:"Water & Land",icon:"\u{1F4A7}"},' +
    '{v:"Agriculture & Rural",icon:"\u{1F33E}"},' +
    '{v:"Faith & Religious Liberty",icon:"\u{1F54A}\u{FE0F}"},' +
    '{v:"Criminal Justice",icon:"\u2696\u{FE0F}"},' +
    '{v:"Energy & Oil/Gas",icon:"\u{1F6E2}\u{FE0F}"},' +
    '{v:"LGBTQ+ Rights",icon:"\u{1F3F3}\u{FE0F}"},' +
    '{v:"Voting & Elections",icon:"\u{1F5F3}\u{FE0F}"}' +
    "];",

  'var SPECTRUM=[' +
    '{v:"Progressive",d:"Bold systemic change, social justice focused"},' +
    '{v:"Liberal",d:"Expand rights and services, government as a force for good"},' +
    '{v:"Moderate",d:"Pragmatic center, best ideas from both sides"},' +
    '{v:"Conservative",d:"Limited government, traditional values, fiscal discipline"},' +
    '{v:"Libertarian",d:"Maximum freedom, minimal government"},' +
    '{v:"Independent / Issue-by-Issue",d:"I decide issue by issue, not by party"}' +
    "];",

  'var QUAL_ICONS={' +
    '"Competence & Track Record":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M3 20h2v-8H3v8zm4 0h2V9H7v11zm4 0h2V4h-2v16zm4 0h2v-6h-2v6zm4 0h2v-2h-2v2z\\"/></svg>",' +
    '"Integrity & Honesty":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z\\"/></svg>",' +
    '"Independence":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M12 5.5A1.5 1.5 0 1 0 12 2.5a1.5 1.5 0 0 0 0 3zM10 22V13H8l2-8h4l2 8h-2v9h-4z\\"/></svg>",' +
    '"Experience":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M20 7h-4V5l-2-2h-4L8 5v2H4c-1.1 0-2 .9-2 2v5h4v-2h2v2h8v-2h2v2h4V9c0-1.1-.9-2-2-2zm-6 0h-4V5h4v2zM4 20c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4h-4v1h-2v-1H8v1H6v-1H4v4z\\"/></svg>",' +
    '"Fresh Perspective":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z\\"/></svg>",' +
    '"Bipartisan / Works Across Aisle":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z\\"/></svg>",' +
    '"Strong Leadership":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z\\"/></svg>",' +
    '"Community Ties":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z\\"/></svg>",' +
    '"Faith & Values":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z\\"/></svg>",' +
    '"Business Experience":"<svg width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"currentColor\\"><path d=\\"M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z\\"/></svg>"' +
  '};',
  'var QUALITIES=Object.keys(QUAL_ICONS);',

  // Deep dive questions keyed by issue
  "var DEEP_DIVES={" +
    '"Housing":{q:"On housing, where do you land?",opts:[' +
      '{l:"Increase housing supply",d:"Ease zoning, encourage density, let the market work"},' +
      '{l:"Managed growth",d:"More housing with affordability requirements"},' +
      '{l:"Protect property rights",d:"Keep property taxes low, limit government land-use rules"},' +
      '{l:"Case-by-case decisions",d:"Evaluate each situation based on community needs"}' +
    "]}," +
    '"Public Safety":{q:"On public safety, what\\u2019s your approach?",opts:[' +
      '{l:"Increase police funding",d:"Hire more officers, strengthen prosecution"},' +
      '{l:"Reform and fund",d:"Fund police and invest in alternatives"},' +
      '{l:"Shift to prevention",d:"Move funding toward prevention and social services"},' +
      '{l:"Community-based safety",d:"Expand community-based approaches to public safety"}' +
    "]}," +
    '"Economy & Cost of Living":{q:"On taxes and government spending?",opts:[' +
      '{l:"Lower taxes and spending",d:"Reduce government spending and lower tax rates"},' +
      '{l:"Reprioritize spending",d:"Redirect existing funds toward higher-priority programs"},' +
      '{l:"Increase targeted spending",d:"Pay more for programs that show results"},' +
      '{l:"Progressive revenue model",d:"Fund expanded services through higher taxes on top earners"}' +
    "]}," +
    '"Tech & Innovation":{q:"On tech and AI regulation?",opts:[' +
      '{l:"Minimal regulation",d:"Let innovation lead, regulate later if needed"},' +
      '{l:"Light guardrails",d:"Basic rules without slowing development"},' +
      '{l:"Proactive regulation",d:"Establish rules before problems arise"},' +
      '{l:"Strict oversight",d:"Strong regulatory controls on tech companies"}' +
    "]}," +
    '"Education":{q:"On public education, what\\u2019s your priority?",opts:[' +
      '{l:"Expand school choice",d:"Vouchers, charters, parent-directed options"},' +
      '{l:"Strengthen public schools",d:"More funding and support for neighborhood schools"},' +
      '{l:"Invest in teachers",d:"Raise pay, reduce class sizes, support educators"},' +
      '{l:"Core academics focus",d:"Concentrate on foundational subjects and skills"}' +
    "]}," +
    '"Healthcare":{q:"On healthcare, where do you stand?",opts:[' +
      '{l:"Market-based approach",d:"Less regulation, more competition to lower costs"},' +
      '{l:"Expand Medicaid",d:"Texas should accept federal Medicaid expansion"},' +
      '{l:"Universal coverage",d:"Guarantee healthcare access regardless of income"},' +
      '{l:"Community-based care",d:"Community health centers and county programs"}' +
    "]}," +
    '"Environment & Climate":{q:"On environment and climate?",opts:[' +
      '{l:"Maintain current approach",d:"Preserve existing energy policy, market-driven solutions"},' +
      '{l:"Mixed energy strategy",d:"Renewables and fossil fuels, pragmatic transition"},' +
      '{l:"Accelerate green transition",d:"Faster renewable energy targets and climate regulations"},' +
      '{l:"Local environmental focus",d:"Clean air and water, green spaces, urban heat"}' +
    "]}," +
    '"Grid & Infrastructure":{q:"On the power grid and infrastructure?",opts:[' +
      '{l:"Reduce grid regulation",d:"More competition, less centralized ERCOT control"},' +
      '{l:"Mandate grid upgrades",d:"Require weatherization and invest to prevent outages"},' +
      '{l:"Connect to national grid",d:"Link Texas to national grid for backup"},' +
      '{l:"Distributed local systems",d:"Microgrids, batteries, community-level solutions"}' +
    "]}," +
    '"Transportation":{q:"On transportation, what\\u2019s the priority?",opts:[' +
      '{l:"Expand road capacity",d:"Build highways, farm-to-market roads, reduce congestion"},' +
      '{l:"Invest in transit",d:"Rail, better buses, less car dependence in metro areas"},' +
      '{l:"Multi-modal approach",d:"Roads, transit, bikes, and walkability together"},' +
      '{l:"Rural connectivity",d:"Fix rural roads, improve connections between small towns"}' +
    "]}," +
    '"Immigration":{q:"On immigration, what\\u2019s your view?",opts:[' +
      '{l:"Prioritize border enforcement",d:"Focus on enforcement first, then discuss reform"},' +
      '{l:"Enforcement plus reform",d:"Secure borders and create legal pathways"},' +
      '{l:"Broaden legal pathways",d:"Expand legal immigration pathways and community support"},' +
      '{l:"Defer to federal authority",d:"Immigration is a federal issue, not a state priority"}' +
    "]}," +
    '"Civil Rights":{q:"On civil rights and equality?",opts:[' +
      '{l:"Uniform legal standards",d:"Apply the same rules to everyone equally"},' +
      '{l:"Maintain current protections",d:"Keep existing protections, prevent rollbacks"},' +
      '{l:"Expand protections",d:"Strengthen anti-discrimination laws and enforcement"},' +
      '{l:"Structural reform",d:"Change systems and institutions to reduce disparities"}' +
    "]}," +
    '"Gun Policy":{q:"On gun policy, where do you stand?",opts:[' +
      '{l:"Expand gun rights",d:"Broaden carry permissions, reduce permitting requirements"},' +
      '{l:"Maintain current gun laws",d:"Keep current firearm laws without additional restrictions"},' +
      '{l:"Ownership with safeguards",d:"Support gun ownership with background checks and safety rules"},' +
      '{l:"Strengthen gun regulations",d:"Universal background checks, red flag laws, waiting periods"}' +
    "]}," +
    '"Abortion & Reproductive Rights":{q:"On abortion and reproductive rights?",opts:[' +
      '{l:"Maintain current law",d:"Keep Texas\\u2019s current abortion laws in place"},' +
      '{l:"Prohibit with limited exceptions",d:"Restrict most abortions, allow for rape, incest, life of mother"},' +
      '{l:"Allow early-term access",d:"Permit early-term abortion, narrow current restrictions"},' +
      '{l:"Full individual choice",d:"Leave reproductive decisions to the individual"}' +
    "]}," +
    '"Water & Land":{q:"On water and land use in Texas?",opts:[' +
      '{l:"Prioritize landowner rights",d:"Landowners should control their water and land use"},' +
      '{l:"Protect rural water supply",d:"Restrict large-scale water exports, protect aquifers"},' +
      '{l:"Strengthen conservation rules",d:"Stricter regulations to prevent waste and pollution"},' +
      '{l:"Major infrastructure investment",d:"Build new reservoirs, desalination, and water systems"}' +
    "]}," +
    '"Agriculture & Rural":{q:"On agriculture and rural Texas?",opts:[' +
      '{l:"Support family farms",d:"Protect small farms, limit large-scale corporate operations"},' +
      '{l:"Reduce farm regulations",d:"Less regulation, let farmers compete globally"},' +
      '{l:"Rural community investment",d:"Broadband, hospitals, schools for rural communities"},' +
      '{l:"Sustainable farming practices",d:"Incentivize conservation and regenerative methods"}' +
    "]}," +
    '"Faith & Religious Liberty":{q:"On faith and religious liberty?",opts:[' +
      '{l:"Expand religious protections",d:"Broader legal protections for faith-based beliefs and practices"},' +
      '{l:"Accommodate both",d:"Protect religious freedom while respecting others\\u2019 rights"},' +
      '{l:"Separate religion and government",d:"Keep religious beliefs separate from public policy decisions"},' +
      '{l:"Faith-informed lawmaking",d:"Moral and religious values should influence legislation"}' +
    "]}," +
    '"Criminal Justice":{q:"What\\u2019s your approach to criminal justice?",opts:[' +
      '{l:"Strengthen law enforcement",d:"Increase funding for police, prosecution, and victim services"},' +
      '{l:"Maintain current system",d:"Keep current sentencing and enforcement policies in place"},' +
      '{l:"Reform sentencing laws",d:"Reduce mandatory minimums, review sentencing disparities"},' +
      '{l:"Focus on rehabilitation",d:"Invest in re-entry programs, reduce recidivism through support"}' +
    "]}," +
    '"Energy & Oil/Gas":{q:"How should Texas manage its energy industry?",opts:[' +
      '{l:"Expand production",d:"Support oil and gas growth, reduce regulations on producers"},' +
      '{l:"Mixed energy strategy",d:"Maintain fossil fuels while investing in renewables and grid stability"},' +
      '{l:"Accelerate clean energy",d:"Transition away from fossil fuels toward wind, solar, and storage"},' +
      '{l:"Let the market decide",d:"Remove subsidies for all energy sources, let competition set the course"}' +
    "]}," +
    '"LGBTQ+ Rights":{q:"What\\u2019s the right approach to LGBTQ+ rights?",opts:[' +
      '{l:"Expand legal protections",d:"Add sexual orientation and gender identity to anti-discrimination laws"},' +
      '{l:"Accommodate both",d:"Protect LGBTQ+ individuals while preserving faith-based exemptions"},' +
      '{l:"Maintain current laws",d:"Current legal protections are sufficient, no new laws needed"},' +
      '{l:"Parental rights focus",d:"Parents should direct decisions about children\\u2019s healthcare and education"}' +
    "]}," +
    '"Voting & Elections":{q:"What matters most for elections?",opts:[' +
      '{l:"Expand voter access",d:"Make registration easier, extend early voting, allow mail-in ballots for all"},' +
      '{l:"Strengthen ID requirements",d:"Require photo ID, verify citizenship, secure the voter rolls"},' +
      '{l:"Combined approach",d:"Improve access and security together with bipartisan oversight"},' +
      '{l:"Local control",d:"Let counties and cities set their own election rules and procedures"}' +
    "]}" +
    "};",

  // ============ STATE ============
  "var S={" +
    "phase:0,issues:[],_pickedIssues:0,spectrum:null,policyViews:{},qualities:[],_pickedQuals:0,freeform:''," +
    "address:{street:'',city:'',state:'TX',zip:''}," +
    "ddIndex:0,ddQuestions:[]," +
    "countyInfo:null," +
    "countyBallotAvailable:null," +
    "repBallot:null,demBallot:null,selectedParty:'republican'," +
    "guideComplete:false,summary:null,districts:null," +
    "isLoading:false,error:null,geolocating:false," +
    "readingLevel:1," +
    "expanded:{'vi-dates':true,'vi-bring':true},disclaimerDismissed:false,hasVoted:false," +
    "staleBallot:false," +
    "electionExpired:false," +
    "overrides:{}" +
    "};",

  // Shuffled arrays (set once per question display)
  "var shuffledSpectrum=null,shuffledDD={};",

  // Easter egg unlocks (persisted in localStorage)
  "var eeCowboy=!!localStorage.getItem('tx_votes_ee_cowboy');",
  "var yeehawBuf='';var yeehawTimer=null;",
  "var secretTaps=0;var secretTapTimer=null;",

  // ============ UTILS ============
  "function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;')}",

  "function getInitials(name){" +
    "if(!name)return'?';" +
    "var s=name.replace(/[\"\\u201c\\u201d][^\"\\u201c\\u201d]*[\"\\u201c\\u201d]/g,' ').replace(/[\'\\u2018\\u2019][^\'\\u2018\\u2019]*[\'\\u2018\\u2019]/g,' ');" +
    "var parts=s.split(/\\s+/).filter(function(w){return w.length>0});" +
    "var suffixes={jr:1,sr:1,ii:1,iii:1,iv:1,v:1,vi:1,vii:1,viii:1};" +
    "parts=parts.filter(function(w){return !suffixes[w.toLowerCase().replace(/\\./g,'')]});" +
    "parts=parts.filter(function(w){return !(w.length<=2 && w.charAt(w.length-1)==='.')});" +
    "if(parts.length===0)return'?';" +
    "if(parts.length===1)return parts[0].charAt(0).toUpperCase();" +
    "return parts[0].charAt(0).toUpperCase()+parts[parts.length-1].charAt(0).toUpperCase()" +
  "}",

  "function fmtDate(iso){" +
    "if(!iso)return'';" +
    "var d=new Date(iso);" +
    "var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];" +
    "return months[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()" +
  "}",

  "function shuffle(a){var b=a.slice();for(var i=b.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=b[i];b[i]=b[j];b[j]=t}return b}",

  // Drag-to-reorder engine for sortable priority lists
  "function initSortable(containerId,stateKey){" +
    "var container=document.getElementById(containerId);" +
    "if(!container)return;" +
    "var dragEl=null,startY=0,startIdx=0,itemH=0,items=[];" +
    "function getY(e){return e.touches?e.touches[0].clientY:e.clientY}" +
    "function getEndY(e){return e.changedTouches?e.changedTouches[0].clientY:e.clientY}" +
    "function onStart(e){" +
      "var handle=e.target.closest('.drag-handle');" +
      "if(!handle)return;" +
      "e.preventDefault();" +
      "dragEl=handle.closest('.sort-item');" +
      "if(!dragEl)return;" +
      "items=Array.from(container.querySelectorAll('.sort-item'));" +
      "startIdx=items.indexOf(dragEl);" +
      "itemH=dragEl.offsetHeight+4;" +
      "startY=getY(e);" +
      "dragEl.classList.add('dragging');" +
      "document.body.style.overflow='hidden';" +
      "document.addEventListener('mousemove',onMove);" +
      "document.addEventListener('touchmove',onMove,{passive:false});" +
      "document.addEventListener('mouseup',onEnd);" +
      "document.addEventListener('touchend',onEnd);" +
      "if(navigator.vibrate)navigator.vibrate(10);" +
    "}" +
    "function onMove(e){" +
      "if(!dragEl)return;" +
      "e.preventDefault();" +
      "var y=getY(e);" +
      "var dy=y-startY;" +
      "dragEl.style.transform='translateY('+dy+'px)';" +
      "var cur=startIdx+Math.round(dy/itemH);" +
      "cur=Math.max(0,Math.min(items.length-1,cur));" +
      "items.forEach(function(item,i){" +
        "if(item===dragEl)return;" +
        "if(i>=Math.min(startIdx,cur)&&i<=Math.max(startIdx,cur)){" +
          "var shift=(cur>startIdx)?-itemH:itemH;" +
          "item.style.transform='translateY('+shift+'px)'" +
        "}else{item.style.transform=''}" +
      "})" +
    "}" +
    "function onEnd(e){" +
      "if(!dragEl)return;" +
      "var y=getEndY(e);" +
      "var dy=y-startY;" +
      "var newIdx=startIdx+Math.round(dy/itemH);" +
      "newIdx=Math.max(0,Math.min(items.length-1,newIdx));" +
      "var arr=S[stateKey];" +
      "var moved=arr.splice(startIdx,1)[0];" +
      "arr.splice(newIdx,0,moved);" +
      "dragEl.classList.remove('dragging');" +
      "dragEl.style.transform='';" +
      "items.forEach(function(item){item.style.transform=''});" +
      "document.body.style.overflow='';" +
      "document.removeEventListener('mousemove',onMove);" +
      "document.removeEventListener('touchmove',onMove);" +
      "document.removeEventListener('mouseup',onEnd);" +
      "document.removeEventListener('touchend',onEnd);" +
      "dragEl=null;" +
      "render()" +
    "}" +
    "container.addEventListener('mousedown',onStart);" +
    "container.addEventListener('touchstart',onStart,{passive:false})" +
  "}",

  "function sortOrder(r){var o=r.office;" +
    "if(o.indexOf('U.S. Senator')!==-1)return 0;" +
    "if(o.indexOf('U.S. Rep')!==-1)return 1;" +
    "if(o.indexOf('Governor')!==-1)return 10;" +
    "if(o.indexOf('Lt. Governor')!==-1||o.indexOf('Lieutenant')!==-1)return 11;" +
    "if(o.indexOf('Attorney General')!==-1)return 12;" +
    "if(o.indexOf('Comptroller')!==-1)return 13;" +
    "if(o.indexOf('Agriculture')!==-1)return 14;" +
    "if(o.indexOf('Land')!==-1)return 15;" +
    "if(o.indexOf('Railroad')!==-1)return 16;" +
    "if(o.indexOf('State Rep')!==-1)return 20;" +
    "if(o.indexOf('Supreme Court')!==-1)return 30;" +
    "if(o.indexOf('Criminal Appeals')!==-1)return 31;" +
    "if(o.indexOf('Court of Appeals')!==-1)return 32;" +
    "if(o.indexOf('Board of Education')!==-1)return 40;" +
    "return 50}",

  // ============ PERSISTENCE ============
  // One-time migration: atx_votes_* → tx_votes_*
  "(function(){try{" +
    "if(localStorage.getItem('atx_votes_profile')&&!localStorage.getItem('tx_votes_profile')){" +
      "var keys=['profile','ballot_republican','ballot_democrat','selected_party','has_voted','lang'];" +
      "for(var i=0;i<keys.length;i++){var v=localStorage.getItem('atx_votes_'+keys[i]);if(v)localStorage.setItem('tx_votes_'+keys[i],v)}" +
      "for(var i=0;i<keys.length;i++){localStorage.removeItem('atx_votes_'+keys[i])}" +
    "}" +
  "}catch(e){}}());",

  "function showToast(msg){" +
    "var old=document.querySelector('.toast');if(old)old.remove();" +
    "var d=document.createElement('div');d.className='toast';d.textContent=msg;" +
    "document.body.appendChild(d);" +
    "setTimeout(function(){if(d.parentNode)d.remove()},5000)" +
  "}",

  "function getStorageUsage(){" +
    "var total=0;" +
    "try{" +
      "for(var i=0;i<localStorage.length;i++){" +
        "var k=localStorage.key(i);" +
        "if(k&&k.indexOf('tx_votes_')===0){" +
          "var v=localStorage.getItem(k);" +
          "if(v)total+=(k.length+v.length)*2" +
        "}" +
      "}" +
    "}catch(e){}" +
    "return total" +
  "}",

  // Override helper functions
  "function getRaceKey(race){" +
    "return race.office+(race.district?' \\u2014 '+race.district:'')" +
  "}",
  "function getOverride(race){" +
    "var party=S.selectedParty;" +
    "var key=getRaceKey(race);" +
    "return S.overrides[party]&&S.overrides[party][key]||null" +
  "}",
  "function setOverride(race,candidateName){" +
    "var party=S.selectedParty;" +
    "if(!S.overrides[party])S.overrides[party]={};" +
    "var key=getRaceKey(race);" +
    "var orig=race.recommendation?race.recommendation.candidateName:null;" +
    "S.overrides[party][key]={" +
      "originalCandidate:orig," +
      "chosenCandidate:candidateName," +
      "reason:''," +
      "reasonSubmitted:false," +
      "timestamp:new Date().toISOString()" +
    "};" +
    "save()" +
  "}",
  "function clearOverride(race){" +
    "var party=S.selectedParty;" +
    "var key=getRaceKey(race);" +
    "if(S.overrides[party]){" +
      "delete S.overrides[party][key];" +
      "if(Object.keys(S.overrides[party]).length===0)delete S.overrides[party];" +
      "save()" +
    "}" +
  "}",
  "function getEffectiveChoice(race){" +
    "var ov=getOverride(race);" +
    "if(ov)return ov.chosenCandidate;" +
    "return race.recommendation?race.recommendation.candidateName:null" +
  "}",

  "function save(){" +
    "try{" +
    "localStorage.setItem('tx_votes_profile',JSON.stringify({" +
      "topIssues:S.issues,pickedIssues:S._pickedIssues,politicalSpectrum:S.spectrum,policyViews:S.policyViews," +
      "candidateQualities:S.qualities,pickedQuals:S._pickedQuals,freeform:S.freeform,address:S.address,summaryText:S.summary,districts:S.districts," +
      "readingLevel:S.readingLevel" +
    "}));" +
    "if(S.repBallot)localStorage.setItem('tx_votes_ballot_republican',JSON.stringify(S.repBallot));" +
    "if(S.demBallot)localStorage.setItem('tx_votes_ballot_democrat',JSON.stringify(S.demBallot));" +
    "if(S.repDataUpdatedAt)localStorage.setItem('tx_votes_data_updated_republican',S.repDataUpdatedAt);" +
    "if(S.demDataUpdatedAt)localStorage.setItem('tx_votes_data_updated_democrat',S.demDataUpdatedAt);" +
    "localStorage.setItem('tx_votes_selected_party',S.selectedParty);" +
    "localStorage.setItem('tx_votes_has_voted',S.hasVoted?'1':'');" +
    "if(Object.keys(S.overrides).length){localStorage.setItem('tx_votes_overrides',JSON.stringify(S.overrides))}else{localStorage.removeItem('tx_votes_overrides')}" +
    "if(!localStorage.getItem('tx_votes_election_date'))localStorage.setItem('tx_votes_election_date','2026-03-03');" +
    "}catch(e){" +
      "if(e&&e.name==='QuotaExceededError'){" +
        "showToast(t('Storage full. Some data may not be saved. Visit Profile to clear old data.'))" +
      "}" +
    "}" +
  "}",

  "function load(){" +
    "try{" +
    "var p=localStorage.getItem('tx_votes_profile');" +
    "if(p){p=JSON.parse(p);S.issues=p.topIssues||[];S.spectrum=p.politicalSpectrum||null;" +
    "S.policyViews=p.policyViews||{};S.qualities=p.candidateQualities||[];S.freeform=p.freeform||'';" +
    "if(typeof p.pickedIssues==='number')S._pickedIssues=p.pickedIssues;" +
    "else if(S.issues.length>0)S._pickedIssues=Math.min(5,S.issues.length);" +
    "var allIV=ISSUES.map(function(x){return x.v});if(S.issues.length>0&&S.issues.length<allIV.length){S.issues=S.issues.concat(allIV.filter(function(v){return S.issues.indexOf(v)===-1}))}" +
    "if(typeof p.pickedQuals==='number')S._pickedQuals=p.pickedQuals;" +
    "else if(S.qualities.length>0)S._pickedQuals=Math.min(3,S.qualities.length);" +
    "if(S.qualities.length>0&&S.qualities.length<QUALITIES.length){S.qualities=S.qualities.concat(QUALITIES.filter(function(v){return S.qualities.indexOf(v)===-1}))}" +
    "S.address=p.address||{street:'',city:'',state:'TX',zip:''};" +
    "S.summary=p.summaryText||null;S.districts=p.districts||null;" +
    "S.readingLevel=p.readingLevel||1}" +
    "var rb=localStorage.getItem('tx_votes_ballot_republican');" +
    "if(rb)S.repBallot=JSON.parse(rb);" +
    "var db=localStorage.getItem('tx_votes_ballot_democrat');" +
    "if(db)S.demBallot=JSON.parse(db);" +
    "var rdu=localStorage.getItem('tx_votes_data_updated_republican');" +
    "if(rdu)S.repDataUpdatedAt=rdu;" +
    "var ddu=localStorage.getItem('tx_votes_data_updated_democrat');" +
    "if(ddu)S.demDataUpdatedAt=ddu;" +
    // Check if ballot data is older than 48 hours
    "var _staleTs=rdu||ddu;" +
    "if(_staleTs&&(Date.now()-new Date(_staleTs).getTime())>172800000){S.staleBallot=true}" +
    "var sp=localStorage.getItem('tx_votes_selected_party');" +
    "if(sp)S.selectedParty=sp;" +
    "S.hasVoted=!!localStorage.getItem('tx_votes_has_voted');" +
    "var _ov=localStorage.getItem('tx_votes_overrides');if(_ov){try{S.overrides=JSON.parse(_ov)}catch(e){S.overrides={}}}" +
    "if(S.repBallot||S.demBallot){S.guideComplete=true}" +
    // Check if election cycle has expired (>7 days past election date)
    "var _ed=localStorage.getItem('tx_votes_election_date');" +
    "if(!_ed&&S.guideComplete){_ed='2026-03-03';localStorage.setItem('tx_votes_election_date',_ed)}" +
    "if(_ed&&!localStorage.getItem('tx_votes_post_election_dismissed')){" +
      "var _edMs=new Date(_ed+'T00:00:00').getTime();" +
      "if(Date.now()-_edMs>7*24*60*60*1000){S.electionExpired=true}" +
    "}" +
    "}catch(e){}" +
  "}",

  // ============ RENDER ============
  "function topNav(active){" +
    "return '<div class=\"topnav-inner\">" +
      "<a href=\"/\" class=\"topnav-brand\" style=\"text-decoration:none;color:var(--blue)\">'+ICON_STAR+'Texas Votes</a>" +
      "<a class=\"topnav-link'+(active==='#/ballot'?' on':'')+'\" data-action=\"nav\" data-to=\"#/ballot\">'+ICON_BALLOT+t('My Ballot')+'</a>" +
      "<a class=\"topnav-link'+(active==='#/info'?' on':'')+'\" data-action=\"nav\" data-to=\"#/info\">'+ICON_INFO+t('Vote Info')+'</a>" +
      "<a class=\"topnav-link'+(active==='#/profile'?' on':'')+'\" data-action=\"nav\" data-to=\"#/profile\">'+ICON_PROFILE+t('Profile')+'</a>" +
    "</div>';" +
  "}",
  "var _lastPage='';",
  "function render(){" +
    "var app=document.getElementById('app');" +
    "var tabs=document.getElementById('tabs');" +
    "var tnav=document.getElementById('topnav');" +
    "var _adminHash=location.hash==='#/llm-experiment'||location.hash==='#/debug/compare';" +
    "if(!S.guideComplete&&!_adminHash){app.innerHTML=renderInterview();tabs.innerHTML='';tnav.innerHTML='';" +
      "if(S.phase===2)initSortable('sort-issues','issues');" +
      "if(S.phase===5)initSortable('sort-qualities','qualities');" +
    "return}" +
    "var h=location.hash||'#/ballot';" +
    "if(h!==_lastPage){_lastPage=h;S._noveltyBannerDismissed=false;trk('page_view',{d1:h});" +
      "if(h.indexOf('#/race/')===0){var _ri=parseInt(h.split('/')[2]);var _races=(S.selectedParty==='democrat'?S.demBallot:S.repBallot);_races=_races&&_races.races||[];trk('race_view',{d1:(_races[_ri]&&_races[_ri].office)||'',d2:(_races[_ri]&&_races[_ri].district)||''})}" +
      "else if(h==='#/cheatsheet'){trk('cheatsheet_view')}" +
    "}" +
    "if(h.indexOf('#/race/')===0){app.innerHTML=renderRaceDetail(parseInt(h.split('/')[2]));tabs.innerHTML=tabBar('#/ballot');tnav.innerHTML=topNav('#/ballot')}" +
    "else if(h==='#/cheatsheet'){app.innerHTML=renderCheatSheet();tabs.innerHTML='';tnav.innerHTML=topNav('#/ballot')}" +
    "else if(h==='#/debug/compare'){app.innerHTML=renderLLMCompare();tabs.innerHTML='';tnav.innerHTML=topNav('#/ballot')}" +
    "else if(h==='#/llm-experiment'){app.innerHTML=renderExperiment();tabs.innerHTML='';tnav.innerHTML=topNav('#/ballot')}" +
    "else if(h==='#/profile'){app.innerHTML=renderProfile();tabs.innerHTML=tabBar('#/profile');tnav.innerHTML=topNav('#/profile')}" +
    "else if(h==='#/info'){app.innerHTML=renderVoteInfo();tabs.innerHTML=tabBar('#/info');tnav.innerHTML=topNav('#/info')}" +
    "else{app.innerHTML=renderBallot();tabs.innerHTML=tabBar('#/ballot');tnav.innerHTML=topNav('#/ballot')}" +
  "}",

  // ============ TAB BAR ============
  // Texas lone star icon for branding
  "var ICON_STAR='<svg width=\"20\" height=\"22\" viewBox=\"0 0 20 22\" style=\"vertical-align:-3px;margin-right:4px\"><defs><clipPath id=\"ns\"><path d=\"M2 1h16c.6 0 1 .4 1 1v10c0 5-7 7.5-9 8.5C8 19.5 1 17 1 12V2c0-.6.4-1 1-1Z\"/></clipPath></defs><g clip-path=\"url(#ns)\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"20\" fill=\"var(--blue)\"/><rect x=\"9\" y=\"1\" width=\"11\" height=\"4\" fill=\"#FFF\"/><rect x=\"9\" y=\"5\" width=\"11\" height=\"4\" fill=\"var(--red)\"/><rect x=\"9\" y=\"9\" width=\"11\" height=\"4\" fill=\"#FFF\"/><rect x=\"9\" y=\"13\" width=\"11\" height=\"4\" fill=\"var(--red)\"/><rect x=\"9\" y=\"17\" width=\"11\" height=\"4\" fill=\"#FFF\"/></g><path d=\"M5 8 L5.8 10.2 L8.2 10.2 L6.2 11.6 L7 13.8 L5 12.4 L3 13.8 L3.8 11.6 L1.8 10.2 L4.2 10.2Z\" fill=\"#FFF\"/></svg>';",
  // SVG icons matching iOS SF Symbols: checkmark.seal.fill, info.circle.fill, person.circle.fill
  "var ICON_BALLOT='<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 1C9.8 1 7.9 2.3 7.2 4.2L3.6 6.3C2.6 6.9 2 8 2 9.2V14.8C2 16 2.6 17.1 3.6 17.7L10.4 21.6C11.4 22.2 12.6 22.2 13.6 21.6L20.4 17.7C21.4 17.1 22 16 22 14.8V9.2C22 8 21.4 6.9 20.4 6.3L16.8 4.2C16.1 2.3 14.2 1 12 1ZM16.3 9.3L11 14.6L7.7 11.3C7.3 10.9 7.3 10.3 7.7 9.9C8.1 9.5 8.7 9.5 9.1 9.9L11 11.8L14.9 7.9C15.3 7.5 15.9 7.5 16.3 7.9C16.7 8.3 16.7 8.9 16.3 9.3Z\"/></svg>';",
  "var ICON_INFO='<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z\"/></svg>';",
  "var ICON_PROFILE='<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z\"/></svg>';",
  "function tabBar(active){" +
    "return '<nav class=\"tab-bar\" role=\"tablist\">" +
      "<a class=\"tab'+(active==='#/ballot'?' tab-active':'')+'\" data-action=\"nav\" data-to=\"#/ballot\" role=\"tab\" aria-selected=\"'+(active==='#/ballot')+'\"><span class=\"tab-icon\" aria-hidden=\"true\">'+ICON_BALLOT+'</span>'+t('My Ballot')+'</a>" +
      "<a class=\"tab'+(active==='#/info'?' tab-active':'')+'\" data-action=\"nav\" data-to=\"#/info\" role=\"tab\" aria-selected=\"'+(active==='#/info')+'\"><span class=\"tab-icon\" aria-hidden=\"true\">'+ICON_INFO+'</span>'+t('Vote Info')+'</a>" +
      "<a class=\"tab'+(active==='#/profile'?' tab-active':'')+'\" data-action=\"nav\" data-to=\"#/profile\" role=\"tab\" aria-selected=\"'+(active==='#/profile')+'\"><span class=\"tab-icon\" aria-hidden=\"true\">'+ICON_PROFILE+'</span>'+t('Profile')+'</a>" +
    "</nav>';" +
  "}",

  // ============ INTERVIEW VIEWS ============
  "function renderInterview(){" +
    "if(S.phase===0){location.href='/';return''}" +
    "if(S.phase===8)return renderBuilding();" +
    "var back='<button class=\"back-btn\" data-action=\"back\">&larr; Back</button>';" +
    "if(S.phase===1)return back+renderTone();" +
    "if(S.phase===2)return back+renderIssues();" +
    "if(S.phase===3)return back+renderSpectrum();" +
    "if(S.phase===4)return back+renderDeepDive();" +
    "if(S.phase===5)return back+renderQualities();" +
    "if(S.phase===6)return back+renderFreeform();" +
    "if(S.phase===7)return back+renderAddress();" +
    "return'';" +
  "}",

  // Phase 0 redirects to landing page (/) — renderWelcome removed
  "function renderWelcome(){" +
    "return '<div class=\"hero\">" +
      "<div class=\"hero-icon\"><svg width=\"64\" height=\"72\" viewBox=\"0 0 512 576\"><defs><clipPath id=\"hs\"><path d=\"M56 48h400c10 0 16 6 16 16v256c0 108-200 148-216 156C240 468 40 428 40 320V64c0-10 6-16 16-16Z\"/></clipPath></defs><g clip-path=\"url(#hs)\"><rect x=\"40\" y=\"48\" width=\"432\" height=\"440\" fill=\"var(--blue)\"/><rect x=\"210\" y=\"48\" width=\"270\" height=\"86\" fill=\"#FFF\"/><rect x=\"210\" y=\"134\" width=\"270\" height=\"86\" fill=\"var(--red)\"/><rect x=\"210\" y=\"220\" width=\"270\" height=\"86\" fill=\"#FFF\"/><rect x=\"210\" y=\"306\" width=\"270\" height=\"86\" fill=\"var(--red)\"/><rect x=\"210\" y=\"392\" width=\"270\" height=\"86\" fill=\"#FFF\"/></g><path d=\"M125 166 L140 209 L186 210 L150 238 L163 282 L125 256 L87 282 L100 238 L64 210 L110 209Z\" fill=\"#FFF\"/></svg></div>" +
      "<h1>Texas Votes</h1>" +
      "<p>'+t('Your personalized voting guide for Texas elections.')+'</p>" +
    "</div>" +
    "<div class=\"card\"><div style=\"text-align:center;margin-bottom:16px\">" +
      "<span class=\"badge badge-blue\">'+t('Texas Primary \\u2014 March 3, 2026')+'</span></div>" +
      "<div class=\"features\">" +
        "<div><span>\u2705</span> '+t('5-minute interview learns your values')+'</div>" +
        "<div><span>\u{1F4CB}</span> '+t('Personalized ballot with recommendations')+'</div>" +
        "<div><span>\u{1F5A8}\u{FE0F}</span> '+t('Print your cheat sheet for the booth')+'</div>" +
        "<div><span>\u{1F4CD}</span> '+t('Find your polling location')+'</div>" +
        "<div><span>\u2696\u{FE0F}</span> '+t('Nonpartisan by design')+'</div>" +
      "</div>" +
      "<button class=\"btn btn-primary mt-md\" data-action=\"start\">'+t('Build My Guide')+'</button>" +
    "</div>" +
    "<div style=\"text-align:center;margin-top:16px\">" +
      "<button data-action=\"set-lang\" data-value=\"'+(LANG==='es'?'en':'es')+'\" style=\"font-size:14px;color:var(--text2);background:none;border:none;cursor:pointer;font-family:inherit\">'+(LANG==='es'?'Switch to English':'Cambiar a Espa\\u00F1ol')+'</button>" +
    "</div>';" +
  "}",

  // Tone / Reading Level
  "var TONE_OPTS=[" +
    "{v:1,l:'Keep it simple',d:'Simple, everyday language \\u2014 like a high school class'}," +
    "{v:3,l:'Just the facts',d:'Clear and balanced \\u2014 standard news level'}," +
    "{v:4,l:'I follow politics',d:'More depth, nuance, and political terminology'}" +
  "];",
  "var secretToneRevealed=false;",
  "var debugTaps=0;",
  "var llmCompareResults={};",
  "var llmCompareLoading={};",
  "var llmCompareErrors={};",
  "var llmCompareTab='table';",
  "var expChallenger='gemini';",
  "var expLoading={};",
  "var expResults={};",
  "var expErrors={};",
  "var expExpandedRows={};",
  "var expTiming={};",
  "var expCosts={};",
  "var EXP_COST={claude:{input:3,output:15},'claude-haiku':{input:0.80,output:4},'claude-opus':{input:15,output:75},chatgpt:{input:2.5,output:10},'gpt-4o-mini':{input:0.15,output:0.60},gemini:{input:0.15,output:3.5},'gemini-pro':{input:1.25,output:10},grok:{input:5,output:15}};",
  "function renderTone(){" +
    "var opts=TONE_OPTS.slice();" +
    "if(secretToneRevealed||eeCowboy||S.readingLevel===7){" +
      "opts.push({v:7,l:'Howdy, partner',d:'A Texas cowboy explains your ballot, y\\u2019all'})" +
    "}" +
    "var h='<div class=\"phase-header\"><h2 data-action=\"secret-tap\">'+t('Talk to me like...')+'</h2><p>'+t('How should we explain things?')+'</p></div>';" +
    "h+='<div class=\"radio-list\">';" +
    "for(var i=0;i<opts.length;i++){" +
      "var o=opts[i];var on=S.readingLevel===o.v;" +
      "h+='<div class=\"radio'+(on?' radio-on':'')+'\" data-action=\"select-tone\" data-value=\"'+o.v+'\" role=\"option\" aria-selected=\"'+on+'\" tabindex=\"0\">';" +
      "h+='<div class=\"radio-label\">'+t(o.l)+'</div>';" +
      "h+='<div class=\"radio-desc\">'+t(o.d)+'</div>';" +
      "h+='</div>'" +
    "}" +
    "h+='</div>';" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next\"'+(S.readingLevel?'':' disabled')+'>'+t('Continue')+'</button>';" +
    "return h;" +
  "}",

  // Issues (two-zone pick-your-top-5)
  "function renderIssues(){" +
    "if(S.issues.length<ISSUES.length){" +
      "var existing=S.issues.slice();" +
      "var rest=shuffle(ISSUES.filter(function(x){return existing.indexOf(x.v)===-1})).map(function(x){return x.v});" +
      "S.issues=existing.concat(rest)" +
    "}" +
    "var n=S._pickedIssues||0;" +
    "var h='<div class=\"phase-header\"><h2>'+t('Pick your top 5 issues')+'</h2><p>'+t('Tap an issue below to add it to your priorities.')+'</p></div>';" +
    "h+='<div class=\"zone-label\">'+t('Your Top Priorities')+'</div>';" +
    "h+='<div id=\"sort-issues\" class=\"sort-list\">';" +
    "for(var i=0;i<5;i++){" +
      "if(i<n){" +
        "var issue=ISSUES.find(function(x){return x.v===S.issues[i]});" +
        "var icon=issue?issue.icon:'';" +
        "h+='<div class=\"sort-item slot-filled\" data-action=\"unpick-issue\" data-idx=\"'+i+'\" data-index=\"'+i+'\" role=\"listitem\" aria-label=\"'+(i+1)+'. '+esc(S.issues[i])+'\">'+" +
          "'<span class=\"drag-handle\" aria-hidden=\"true\">&#9776;</span>'+" +
          "'<span class=\"rank\">'+(i+1)+'</span>'+" +
          "'<span class=\"sort-label\">'+icon+' '+t(S.issues[i])+'</span>'+" +
          "'<span class=\"sort-arrows\">'+" +
          "'<button data-action=\"sort-up\" data-key=\"issues\" data-idx=\"'+i+'\" aria-label=\"Move up\"'+(i===0?' disabled':'')+'>&blacktriangle;</button>'+" +
          "'<button data-action=\"sort-down\" data-key=\"issues\" data-idx=\"'+i+'\" aria-label=\"Move down\"'+(i>=n-1?' disabled':'')+'>&blacktriangledown;</button>'+" +
          "'</span>'+" +
          "'<span class=\"slot-remove\" aria-hidden=\"true\">&minus;</span>'+" +
          "'</div>'" +
      "}else{" +
        "h+='<div class=\"slot-empty\"><span class=\"rank\">'+(i+1)+'</span><span>'+t('Tap to add')+'</span></div>'" +
      "}" +
    "}" +
    "h+='</div>';" +
    "h+='<div class=\"sort-divider\">&mdash; '+t('Remaining issues below')+' &mdash;</div>';" +
    "h+='<div class=\"pool-zone\">';" +
    "for(var i=n;i<S.issues.length;i++){" +
      "var issue=ISSUES.find(function(x){return x.v===S.issues[i]});" +
      "var icon=issue?issue.icon:'';" +
      "h+='<div class=\"pool-item\" data-action=\"pick-issue\" data-idx=\"'+i+'\">'+" +
        "'<span class=\"pool-icon\">'+icon+'</span>'+" +
        "'<span class=\"pool-label\">'+t(S.issues[i])+'</span>'+" +
        "'<span class=\"pool-add\">+</span>'+" +
        "'</div>'" +
    "}" +
    "h+='</div>';" +
    "if(n<5){h+='<p class=\"pick-hint\">'+t('Select your top 5 to continue')+'</p>'}" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next\"'+(n<5?' disabled':'')+'>'+t('Continue')+'</button>';" +
    "return h;" +
  "}",

  // Spectrum
  "function renderSpectrum(){" +
    "if(!shuffledSpectrum)shuffledSpectrum=shuffle(SPECTRUM);" +
    "var h='<div class=\"phase-header\"><h2>'+t('How would you describe your political approach?')+'</h2><p>'+t('There\\u2019s no wrong answer. This helps us understand your lens.')+'</p></div>';" +
    "for(var i=0;i<shuffledSpectrum.length;i++){" +
      "var sp=shuffledSpectrum[i];" +
      "var on=S.spectrum===sp.v;" +
      "h+='<div class=\"radio'+(on?' radio-on':'')+'\" data-action=\"select-spectrum\" data-value=\"'+esc(sp.v)+'\" role=\"radio\" aria-checked=\"'+on+'\" tabindex=\"0\"><b>'+t(sp.v)+'</b><span class=\"desc\">'+t(sp.d)+'</span></div>'" +
    "}" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next\"'+(S.spectrum?'':' disabled')+'>'+t('Continue')+'</button>';" +
    "return h;" +
  "}",

  // Deep Dives
  "function renderDeepDive(){" +
    "if(S.ddQuestions.length===0){S.phase=4;return renderInterview()}" +
    "var dd=S.ddQuestions[S.ddIndex];" +
    "var key=dd.q;" +
    "if(!shuffledDD[key])shuffledDD[key]=shuffle(dd.opts);" +
    "var opts=shuffledDD[key];" +
    "var current=S.policyViews[key]||null;" +
    "var h='<div class=\"phase-header\"><h2>'+t(dd.q)+'</h2><p>'+t('Question')+' '+(S.ddIndex+1)+' '+t('of')+' '+S.ddQuestions.length+'</p></div>';" +
    "for(var i=0;i<opts.length;i++){" +
      "var on=current===opts[i].l;" +
      "h+='<div class=\"radio'+(on?' radio-on':'')+'\" data-action=\"select-dd\" data-value=\"'+esc(opts[i].l)+'\" role=\"radio\" aria-checked=\"'+on+'\" tabindex=\"0\"><b>'+t(opts[i].l)+'</b><span class=\"desc\">'+t(opts[i].d)+'</span></div>'" +
    "}" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next-dd\"'+(current?'':' disabled')+'>'+t('Continue')+'</button>';" +
    "return h;" +
  "}",

  // Qualities (two-zone pick-your-top-3)
  "function renderQualities(){" +
    "if(S.qualities.length<QUALITIES.length){" +
      "var existing=S.qualities.slice();" +
      "var rest=shuffle(QUALITIES.filter(function(x){return existing.indexOf(x)===-1}));" +
      "S.qualities=existing.concat(rest)" +
    "}" +
    "var n=S._pickedQuals||0;" +
    "var h='<div class=\"phase-header\"><h2>'+t('Pick your top 3 qualities')+'</h2><p>'+t('Tap a quality below to add it.')+'</p></div>';" +
    "h+='<div class=\"zone-label\">'+t('Your Top Qualities')+'</div>';" +
    "h+='<div id=\"sort-qualities\" class=\"sort-list\">';" +
    "for(var i=0;i<3;i++){" +
      "if(i<n){" +
        "var q=S.qualities[i];" +
        "var icon=QUAL_ICONS[q]||'';" +
        "h+='<div class=\"sort-item slot-filled\" data-action=\"unpick-quality\" data-idx=\"'+i+'\" data-index=\"'+i+'\" role=\"listitem\" aria-label=\"'+(i+1)+'. '+esc(q)+'\">'+" +
          "'<span class=\"drag-handle\" aria-hidden=\"true\">&#9776;</span>'+" +
          "'<span class=\"rank\">'+(i+1)+'</span>'+" +
          "'<span class=\"sort-label\">'+icon+' '+t(q)+'</span>'+" +
          "'<span class=\"sort-arrows\">'+" +
          "'<button data-action=\"sort-up\" data-key=\"qualities\" data-idx=\"'+i+'\" aria-label=\"Move up\"'+(i===0?' disabled':'')+'>&blacktriangle;</button>'+" +
          "'<button data-action=\"sort-down\" data-key=\"qualities\" data-idx=\"'+i+'\" aria-label=\"Move down\"'+(i>=n-1?' disabled':'')+'>&blacktriangledown;</button>'+" +
          "'</span>'+" +
          "'<span class=\"slot-remove\" aria-hidden=\"true\">&minus;</span>'+" +
          "'</div>'" +
      "}else{" +
        "h+='<div class=\"slot-empty\"><span class=\"rank\">'+(i+1)+'</span><span>'+t('Tap to add')+'</span></div>'" +
      "}" +
    "}" +
    "h+='</div>';" +
    "h+='<div class=\"sort-divider\">&mdash; '+t('Remaining qualities below')+' &mdash;</div>';" +
    "h+='<div class=\"pool-zone\">';" +
    "for(var i=n;i<S.qualities.length;i++){" +
      "var q=S.qualities[i];" +
      "var icon=QUAL_ICONS[q]||'';" +
      "h+='<div class=\"pool-item\" data-action=\"pick-quality\" data-idx=\"'+i+'\">'+" +
        "'<span class=\"pool-icon\">'+icon+'</span>'+" +
        "'<span class=\"pool-label\">'+t(q)+'</span>'+" +
        "'<span class=\"pool-add\">+</span>'+" +
        "'</div>'" +
    "}" +
    "h+='</div>';" +
    "if(n<3){h+='<p class=\"pick-hint\">'+t('Select your top 3 to continue')+'</p>'}" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next\"'+(n<3?' disabled':'')+'>'+t('Continue')+'</button>';" +
    "return h;" +
  "}",

  // Freeform "Anything else?"
  "function renderFreeform(){" +
    "var h='<div class=\"phase-header\"><h2>'+t('Anything else we should know?')+'</h2><p>'+t('Optional \\u2014 share anything that might help us understand your priorities.')+'</p></div>';" +
    "h+='<textarea id=\"freeform-input\" style=\"width:100%;min-height:120px;padding:12px;border:1px solid var(--border);border-radius:var(--rs);font-size:15px;font-family:inherit;background:var(--bg);color:var(--text);resize:vertical;line-height:1.5\" placeholder=\"'+esc(t('e.g. I care deeply about water policy, I\\u2019m a veteran, I own a small business...'))+'\">'+esc(S.freeform)+'</textarea>';" +
    "h+='<button class=\"btn btn-primary mt-md\" data-action=\"next\">'+t('Continue')+'</button>';" +
    "h+='<button class=\"btn btn-secondary mt-sm\" data-action=\"next\" style=\"font-size:14px\">'+t('Skip')+'</button>';" +
    "return h;" +
  "}",

  // Address
  "function renderAddress(){" +
    "var h='<div class=\"phase-header\"><h2>'+t('Where do you vote?')+'</h2><p>'+t('We\\u2019ll look up your districts to show the right races.')+'</p></div>';" +
    "if(navigator.geolocation){" +
      "h+='<button type=\"button\" class=\"btn btn-secondary\" data-action=\"geolocate\" style=\"width:100%;margin-bottom:16px\"'+(S.geolocating?' disabled':'')+'>';" +
      "if(S.geolocating){h+='<span class=\"spinner\" style=\"width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:8px\"></span>'+t('Locating...')}" +
      "else{h+='\\uD83D\\uDCCD '+t('Use My Location')}" +
      "h+='</button>';" +
    "}" +
    "h+='<form id=\"addr-form\">';" +
    "h+='<div class=\"form-group\"><label>'+t('Street Address')+'</label><input name=\"street\" placeholder=\"123 Congress Ave\" value=\"'+esc(S.address.street)+'\" autofocus></div>';" +
    "h+='<div class=\"form-row\">';" +
    "h+='<div class=\"form-group\"><label>'+t('City')+'</label><input name=\"city\" value=\"'+esc(S.address.city)+'\"></div>';" +
    "h+='<div class=\"form-group\" style=\"flex:.5\"><label>'+t('ZIP')+'</label><input name=\"zip\" placeholder=\"78701\" value=\"'+esc(S.address.zip)+'\" inputmode=\"numeric\" maxlength=\"5\"></div>';" +
    "h+='</div>';" +
    "h+='<div class=\"form-group\"><label>'+t('State')+'</label><input value=\"TX\" disabled></div>';" +
    "h+='<div style=\"display:flex;align-items:flex-start;gap:10px;padding:12px;background:rgba(51,166,82,.05);border-radius:var(--rs);margin-top:8px\">';" +
    "h+='<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" style=\"flex-shrink:0;margin-top:1px\"><path d=\"M12 1C8.7 1 6 3.7 6 7v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7c0-3.3-2.7-6-6-6zm0 2c2.2 0 4 1.8 4 4v3H8V7c0-2.2 1.8-4 4-4zm0 11a2 2 0 1 1 0 4 2 2 0 0 1 0-4z\" fill=\"var(--ok)\"/></svg>';" +
    "h+='<span style=\"font-size:13px;color:var(--text2);line-height:1.4\">'+t('Your address stays on your device. It\\u2019s only used to look up your ballot districts \\u2014 we never store or share it.')+'</span>';" +
    "h+='</div>';" +
    "if(S.addressError){h+='<div class=\"error-box\" style=\"margin-top:12px\"><p>'+S.addressError+'</p></div>'}" +
    "if(S.verifyingAddress){" +
      "h+='<button type=\"button\" class=\"btn btn-primary mt-md\" disabled><span class=\"spinner\" style=\"width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:8px\"></span>'+t('Verifying address...')+'</button>'" +
    "}else{" +
      "h+='<button type=\"submit\" class=\"btn btn-primary mt-md\">'+t('Build My Guide')+'</button>'" +
    "}" +
    "h+='</form>';" +
    "h+='<p class=\"text-center mt-md\" style=\"font-size:13px;color:var(--text2)\">'+t('You can skip the address \\u2014 we\\u2019ll show all races.')+'</p>';" +
    "h+='<button class=\"btn btn-secondary mt-sm\" data-action=\"skip-address\">'+t('Skip & Build Guide')+'</button>';" +
    "return h;" +
  "}",

  // ============ GEOLOCATE ============
  "function geolocate(){" +
    "S.geolocating=true;S.addressError=null;render();" +
    "function onPos(pos){" +
      "fetch('https://nominatim.openstreetmap.org/reverse?lat='+pos.coords.latitude+'&lon='+pos.coords.longitude+'&format=json&email=howdy@txvotes.app')" +
      ".then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})" +
      ".then(function(d){" +
        "if(d.error){S.geolocating=false;S.addressError=d.error;render();return}" +
        "var a=d.address||{};" +
        "var street=(a.house_number?a.house_number+' ':'')+(a.road||'');" +
        "S.address.street=street;" +
        "S.address.city=a.city||a.town||a.village||a.hamlet||'';" +
        "S.address.zip=a.postcode?a.postcode.slice(0,5):'';" +
        "S.geolocating=false;render();" +
      "}).catch(function(e){S.geolocating=false;S.addressError=t('Could not look up address. Try entering it manually.');render()})" +
    "}" +
    "function onErr(err){" +
      "if(err.code===1){S.geolocating=false;S.addressError=t('Location permission denied. Please allow location access and try again.');render()}" +
      "else if(err.code===3){S.geolocating=false;S.addressError=t('Location timed out. Please try again.');render()}" +
      "else{" +
        // Retry once without high accuracy on POSITION_UNAVAILABLE
        "navigator.geolocation.getCurrentPosition(onPos,function(){" +
          "S.geolocating=false;S.addressError=t('Location not available. Check that Location Services is enabled in Settings.');render()" +
        "},{enableHighAccuracy:false,timeout:10000,maximumAge:300000})" +
      "}" +
    "}" +
    "navigator.geolocation.getCurrentPosition(onPos,onErr,{enableHighAccuracy:true,timeout:15000,maximumAge:60000})" +
  "}",

  "function llmLabel(){var m=window._llmOverride;if(!m)return'Claude';if(m==='chatgpt')return'ChatGPT';if(m==='gemini')return'Gemini';if(m==='grok')return'Grok';return m}",

  "function renderBuilding(){" +
    "var h='<div class=\"loading\">';" +
    "h+='<div class=\"spinner\"></div>';" +
    "h+='<h2>'+t('Loading your ballot...')+'</h2>';" +
    "if(window._llmOverride){h+='<div style=\"text-align:center;margin-bottom:8px\"><span class=\"badge\" style=\"font-size:12px\">Powered by '+esc(llmLabel())+'</span></div>'}" +
    "if(S.error){h+='<div class=\"error-box\" style=\"margin-top:16px\"><p>'+t(S.error)+'</p></div><button class=\"btn btn-primary mt-md\" data-action=\"retry\">'+t('Try Again')+'</button>'}" +
    "h+='<div class=\"dots\" style=\"margin-top:20px\">';" +
    "var _rwb=['red','white','blue'];" +
    "for(var i=0;i<3;i++){h+='<div class=\"dot dot-active-'+_rwb[i]+'\">\\u2605</div>'}" +
    "h+='</div></div>';" +
    "return h;" +
  "}",

  // ============ BALLOT VIEWS ============
  "function getBallot(){" +
    "return S.selectedParty==='democrat'?S.demBallot:S.repBallot" +
  "}",

  "function renderBallot(){" +
    "var b=getBallot();" +
    "if(!b)return '<div class=\"card\"><p>'+t('No ballot available for this party.')+'</p></div>'+renderPartySwitcher();" +
    "var races=b.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
    "races.forEach(function(r){r._active=r.candidates.filter(function(c){return !c.withdrawn})});" +
    "var contested=races.filter(function(r){return r._active.length>1});" +
    "var uncontested=races.filter(function(r){return r._active.length<=1});" +
    "var keyRaces=contested.filter(function(r){return r.isKeyRace});" +
    "var otherContested=contested.filter(function(r){return!r.isKeyRace});" +
    "var h=renderPartySwitcher();" +
    // Election info header
    "var partyLabel=S.selectedParty==='democrat'?t('Democratic'):t('Republican');" +
    "h+='<div class=\"card\" style=\"margin-bottom:16px;text-align:center\">';" +
    "h+='<div style=\"font-size:18px;font-weight:800\"><span style=\"color:#fff\">&starf;</span> Texas '+esc(partyLabel)+' '+t('Primary')+'</div>';" +
    "h+='<div style=\"font-size:14px;color:var(--text2);margin-top:2px\">'+t('Tuesday, March 3, 2026')+'</div>';" +
    "if(window._llmOverride){h+='<div style=\"margin-top:6px\"><span class=\"badge\" style=\"font-size:11px;background:var(--card);border:1px solid var(--border)\">Powered by '+esc(llmLabel())+'</span></div>'}" +
    "if(S.districts&&(S.districts.congressional||S.districts.stateSenate||S.districts.stateHouse)){" +
      "h+='<div style=\"display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px\">';" +
      "if(S.districts.congressional)h+='<span class=\"badge badge-blue\">CD-'+esc(S.districts.congressional)+'</span>';" +
      "if(S.districts.stateSenate)h+='<span class=\"badge badge-blue\">SD-'+esc(S.districts.stateSenate)+'</span>';" +
      "if(S.districts.stateHouse)h+='<span class=\"badge badge-blue\">HD-'+esc(S.districts.stateHouse)+'</span>';" +
      "h+='</div>'" +
    "}else{" +
      "h+='<div style=\"font-size:13px;color:var(--text2);margin-top:6px\">'+t('Showing all races')+'</div>'" +
    "}" +
    // Data last verified timestamp
    "var _dua=S.selectedParty==='democrat'?S.demDataUpdatedAt:S.repDataUpdatedAt;" +
    "if(_dua){h+='<div style=\"font-size:12px;color:var(--text2);margin-top:8px\">'+t('Data last verified')+': '+fmtDate(_dua)+'</div>'}" +
    "h+='</div>';" +
    // Streaming indicator (star progress bar)
    "if(S._streaming){" +
      "var _sRaces=contested.filter(function(r){return r._streamed}).length;" +
      "var _sProps=b.propositions?b.propositions.filter(function(p){return p._streamed}).length:0;" +
      "var _sTotal=_sRaces+_sProps;" +
      "var _sTotalAll=contested.length+(b.propositions?b.propositions.length:0);" +
      "h+='<div style=\"text-align:center;margin-bottom:14px\">';" +
      "h+='<div style=\"font-size:14px;font-weight:600;color:var(--text2);margin-bottom:8px\">'+t('Analyzing your ballot...')+'</div>';" +
      "if(_sTotalAll>0){" +
        "h+='<div class=\"dots\" style=\"margin-top:0;flex-wrap:wrap\">';" +
        "var _rwb=['red','white','blue'];" +
        "for(var _si=0;_si<_sTotalAll;_si++){" +
          "var _sc='dot';var _cn=_rwb[_si%3];" +
          "if(_si<_sTotal)_sc+=' dot-done-'+_cn;else if(_si===_sTotal)_sc+=' dot-active-'+_cn;" +
          "h+='<div class=\"'+_sc+'\">\\u2605</div>'" +
        "}" +
        "h+='</div>'" +
      "}" +
      "h+='</div>'" +
    "}" +
    // Stale ballot data banner (shown when data is >48 hours old)
    "if(S.staleBallot){" +
      "h+='<div style=\"background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text2);cursor:pointer\" data-action=\"refresh-ballots\">';" +
      "h+='<span style=\"font-size:18px;flex-shrink:0\">\u{1F504}</span>';" +
      "h+='<span>'+t('Your ballot data may be outdated. Tap to refresh.')+'</span>';" +
      "h+='</div>'" +
    "}" +
    // Election cycle expired banner (shown >7 days after election date)
    "if(S.electionExpired){" +
      "h+='<div style=\"background:#fff3cd;border:1px solid #ffc107;border-radius:12px;padding:14px 16px;margin-bottom:12px;font-size:14px;color:#664d03\">';" +
      "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:10px\">';" +
      "h+='<span style=\"font-size:18px;flex-shrink:0\">\u{1F4C5}</span>';" +
      "h+='<span>'+t('The March 3 primary is over. Your ballot data is from the primary election.')+'</span>';" +
      "h+='</div>';" +
      "h+='<div style=\"display:flex;gap:8px;flex-wrap:wrap\">';" +
      "h+='<button data-action=\"election-clear\" style=\"background:var(--blue);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer\">'+t('Clear & Start Fresh')+'</button>';" +
      "h+='<button data-action=\"election-keep\" style=\"background:transparent;color:#664d03;border:1px solid #b8960c;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer\">'+t('Keep for Reference')+'</button>';" +
      "h+='</div></div>'" +
    "}" +
    // County coverage info banner
    "if(S.countyBallotAvailable===false&&S.districts&&S.districts.countyFips){" +
      "var _cn=S.districts.countyName||'';" +
      "h+='<div style=\"background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px;font-size:14px;color:var(--text2)\">';" +
      "h+='<span style=\"font-size:18px;flex-shrink:0\">\u2139\uFE0F</span>';" +
      "if(_cn){h+='<span>'+t('Local races for')+' '+esc(_cn)+' '+t('County are not yet available. Your ballot shows statewide and district races only.')+'</span>'}else{h+='<span>'+t('Local races not yet available for this county.')+'</span>'}" +
      "h+='</div>'" +
    "}" +
    // Disclaimer (dismissible)
    "if(!S.disclaimerDismissed){" +
      "h+='<div class=\"disclaimer\"><span style=\"font-size:20px\">\u26A0\u{FE0F}</span><div>" +
        "<b>'+t('AI-Generated Recommendations')+'</b>" +
        "'+t('Recommendations are AI-generated from web sources and may contain errors or outdated information. Always verify candidate positions through official sources before voting.')+'" +
      "</div><button data-action=\"dismiss-disclaimer\" style=\"background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;color:var(--text2);flex-shrink:0\">&times;</button></div>'" +
    "}" +
    // (Duplicate AI limitations note removed — dismissible disclaimer above is sufficient)" +
    // Novelty tone warning banner (Cowboy)
    "if(S.readingLevel===7){" +
      "var _ntEmoji='\\uD83E\\uDD20';" +
      "var _ntLabel=t('Texas Cowboy');" +
      "if(!S._noveltyBannerDismissed){" +
        "h+='<div style=\"margin-bottom:14px;padding:12px 14px;background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;color:#92400e\">';" +
        "h+='<div style=\"display:flex;align-items:start;gap:10px\">';" +
        "h+='<span style=\"font-size:22px;flex-shrink:0;line-height:1\">'+_ntEmoji+'</span>';" +
        "h+='<div style=\"flex:1;min-width:0\">';" +
        "h+='<div style=\"font-weight:700;font-size:14px;margin-bottom:4px\">'+t('Novelty tone active')+': '+_ntLabel+'</div>';" +
        "h+='<div style=\"font-size:13px;line-height:1.4;margin-bottom:10px\">'+t('Tone may affect how pros, cons, and recommendations are worded. For a neutral presentation, switch to standard mode.')+'</div>';" +
        "h+='<div style=\"display:flex;gap:8px;flex-wrap:wrap\">';" +
        "h+='<button data-action=\"switch-to-standard\" style=\"background:#92400e;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer\">'+t('Switch to Standard')+'</button>';" +
        "h+='<button data-action=\"dismiss-novelty-warning\" style=\"background:transparent;color:#92400e;border:1px solid #d97706;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer\">&times;</button>';" +
        "h+='</div></div></div></div>'" +
      "}else{" +
        "var _ntMsg='Viewing in Cowboy mode. Switch to Standard for neutral presentation.';" +
        "h+='<div style=\"font-size:12px;color:#a16207;text-align:center;margin-bottom:12px;padding:8px 12px;background:rgba(161,98,7,.06);border-radius:8px;line-height:1.4;cursor:pointer\" data-action=\"show-novelty-warning\">'+_ntEmoji+' '+t(_ntMsg)+'</div>'" +
      "}" +
    "}" +
    // Actions
    "h+='<div class=\"actions\">';" +
    "h+='<button class=\"btn btn-secondary\" data-action=\"nav\" data-to=\"#/cheatsheet\">\u{1F4CB} '+t('Cheat Sheet')+'</button>';" +
    "h+='<button class=\"btn btn-secondary\" data-action=\"share-app\">\u{1F4E4} '+t('Share Texas Votes')+'</button>';" +
    "h+='</div>';" +
    // Key races
    "if(keyRaces.length){" +
      "h+='<div class=\"section-head\">'+t('Key Races')+'</div>';" +
      "for(var i=0;i<keyRaces.length;i++)h+=renderRaceCard(keyRaces[i],races)" +
    "}" +
    // Other contested
    "if(otherContested.length){" +
      "h+='<div class=\"section-head\">'+t('Other Contested Races')+'</div>';" +
      "for(var i=0;i<otherContested.length;i++)h+=renderRaceCard(otherContested[i],races)" +
    "}" +
    // Propositions
    "if(b.propositions&&b.propositions.length){" +
      "h+='<div class=\"section-head\">'+t('Propositions')+'</div>';" +
      "for(var i=0;i<b.propositions.length;i++)h+=renderPropCard(b.propositions[i])" +
    "}" +
    // Uncontested
    "if(uncontested.length){" +
      "h+='<div class=\"section-head\">'+t('Uncontested Races')+'</div>';" +
      "for(var i=0;i<uncontested.length;i++){" +
        "var r=uncontested[i];var c=r.candidates.length?r.candidates[0]:null;var name=c?c.name:'TBD';" +
        "h+='<div class=\"card\"><div style=\"display:flex;align-items:center;gap:12px\">';" +
        "if(c){" +
          "var slug=c.name.toLowerCase().replace(/[^a-z0-9 -]/g,'').replace(/\\s+/g,'-');" +
          "var initial=getInitials(c.name);" +
          "h+='<div style=\"width:40px;height:40px;border-radius:50%;background:#4A90D9;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;overflow:hidden;flex-shrink:0\">';" +
          "h+='<img src=\"/headshots/'+slug+'.jpg\" alt=\"\" style=\"width:100%;height:100%;object-fit:cover;border-radius:50%\" onerror=\"if(this.src.indexOf(\\'.jpg\\')>0){this.src=this.src.replace(\\'.jpg\\',\\'.png\\')}else{this.style.display=\\'none\\';this.nextSibling.style.display=\\'\\';}\">';" +
          "h+='<span style=\"display:none\">'+initial+'</span></div>'" +
        "}" +
        "h+='<div style=\"min-width:0;flex:1\"><div style=\"font-size:14px;color:var(--text2)\">'+esc(r.office)+(r.district?' \\u2014 '+esc(r.district):'')+'</div>" +
          "<div style=\"font-size:16px;font-weight:600;margin-top:2px\">'+esc(name)+'</div></div>';" +
        "h+='</div></div>'" +
      "}" +
    "}" +
    // Share CTA (after all races)
    "h+='<div class=\"share-cta\">';" +
    "h+='<div class=\"share-cta-icon\">\u{1F4E3}</div>';" +
    "h+='<div class=\"share-cta-title\">'+t('Spread the word')+'</div>';" +
    "h+='<div class=\"share-cta-body\">'+t('Know someone who needs help deciding?')+' '+t('The Texas primary is March 3. Share Texas Votes so your friends and family can get a personalized voting guide too.')+'</div>';" +
    "h+='<button class=\"btn btn-primary share-cta-btn\" data-action=\"share-app\">\u{1F4E4} '+t('Share Texas Votes')+'</button>';" +
    "h+='</div>';" +
    // IMPORTANT: Keep footer in sync with index.js generateFooter() — FOOTER_SYNC_PWA
    "h+='<div style=\"text-align:center;padding:24px 0 8px;font-size:13px;color:var(--text2)\">';" +
    "h+='<a href=\"/\" style=\"color:var(--text2)\">'+t('Texas Votes')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/how-it-works\" target=\"_blank\" style=\"color:var(--text2)\">'+t('How It Works')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/privacy\" target=\"_blank\" style=\"color:var(--text2)\">'+t('Privacy')+'</a>';" +
    "h+='<br><span style=\"margin-top:6px;display:inline-block\"><span style=\"color:#fff\">&starf;</span> '+t('Built in Texas')+' &middot; <a href=\"mailto:howdy@txvotes.app\" style=\"color:var(--text2)\">howdy@txvotes.app</a></span>';" +
    "h+='<p data-action=\"secret-tap\" style=\"font-size:12px;color:var(--text2);margin-top:8px;cursor:default;-webkit-user-select:none;user-select:none\">'+t('Powered by Claude (Anthropic)')+'</p>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // ============ CHEAT SHEET ============
  "function renderCheatSheet(){" +
    "var b=getBallot();" +
    "if(!b)return '<p>No ballot available.</p>';" +
    "var races=b.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
    "races.forEach(function(r){r._active=r.candidates.filter(function(c){return !c.withdrawn})});" +
    "var contested=races.filter(function(r){return r._active.length>1});" +
    "var uncontested=races.filter(function(r){return r._active.length<=1});" +
    "var profile=null;try{var p=localStorage.getItem('tx_votes_profile');if(p)profile=JSON.parse(p)}catch(e){}" +
    "var addr=profile&&profile.address?profile.address:null;" +
    "var partyName=S.selectedParty==='democrat'?'Democrat':'Republican';" +
    "var partyCls=S.selectedParty==='democrat'?'cs-party-dem':'cs-party-rep';" +
    // Header
    "var h='<div class=\"cs-header\">';" +
    "h+='<h2><span style=\"color:#fff\">&starf;</span> '+t('Your Ballot Cheat Sheet')+'</h2>';" +
    "if(addr&&addr.street){h+='<div class=\"cs-meta\">'+esc(addr.street)+(addr.city?', '+esc(addr.city):'')+' '+esc(addr.zip||'')+'</div>'}" +
    "h+='<span class=\"cs-party '+partyCls+'\">'+esc(partyName)+' '+t('Primary')+'</span>';" +
    "h+='<div class=\"cs-meta\">'+t('March 3, 2026')+'</div>';" +
    "h+='</div>';" +
    // Actions (hidden in print)
    "h+='<div class=\"cs-actions\">';" +
    "h+='<button class=\"btn btn-primary\" data-action=\"do-print\">'+t('Print Cheat Sheet')+'</button>';" +
    "h+='<button class=\"btn btn-secondary\" data-action=\"share\">'+t('Share')+'</button>';" +
    "h+='</div>';" +
    // County coverage note (visible in print)
    "if(S.countyBallotAvailable===false&&S.districts&&S.districts.countyFips){" +
      "var _csn=S.districts.countyName||'';" +
      "h+='<div style=\"font-size:13px;color:var(--text2);font-style:italic;text-align:center;margin-bottom:8px\">';" +
      "if(_csn){h+=t('Local races for')+' '+esc(_csn)+' '+t('County are not yet available. Your ballot shows statewide and district races only.')}else{h+=t('Local races not yet available for this county.')}" +
      "h+='</div>'" +
    "}" +
    // Contested races table
    "if(contested.length){" +
      "h+='<table class=\"cs-table\"><thead><tr><th>'+t('CONTESTED RACES')+'</th><th style=\"text-align:right\">'+t('YOUR VOTE')+'</th></tr></thead><tbody>';" +
      "for(var i=0;i<contested.length;i++){" +
        "var r=contested[i];" +
        "var star=r.isKeyRace?'<span class=\"cs-star\">\u2B50</span>':'';" +
        "var label=esc(r.office)+(r.district?' \\u2014 '+esc(r.district):'');" +
        "var _csOv=getOverride(r);" +
        "var _csOverridden=_csOv&&_csOv.chosenCandidate!==_csOv.originalCandidate;" +
        "var vote=_csOv?esc(_csOv.chosenCandidate):(r.recommendation?esc(r.recommendation.candidateName):'\\u2014');" +
        "if(_csOverridden){vote+=' <span style=\"font-size:11px;color:#92400e\" data-t=\"(your pick)\">('+t('your pick')+')</span>'}" +
        "h+='<tr><td>'+star+label+'</td><td class=\"cs-vote\">'+vote+'</td></tr>'" +
      "}" +
      "h+='</tbody></table>'" +
    "}" +
    // Propositions table
    "if(b.propositions&&b.propositions.length){" +
      "h+='<table class=\"cs-table\" style=\"margin-top:8px\"><thead><tr><th>'+t('PROPOSITIONS')+'</th><th style=\"text-align:right\">'+t('YOUR VOTE')+'</th></tr></thead><tbody>';" +
      "for(var i=0;i<b.propositions.length;i++){" +
        "var p=b.propositions[i];" +
        "var rec=p.recommendation||'';" +
        "var cls='';if(rec==='Lean Yes'||rec==='FOR')cls='cs-yes';else if(rec==='Lean No'||rec==='AGAINST')cls='cs-no';else cls='cs-yourcall';" +
        "h+='<tr><td>Prop '+esc(p.number||''+(i+1))+': '+esc(p.title)+'</td><td class=\"cs-vote '+cls+'\">'+t(rec)+'</td></tr>'" +
      "}" +
      "h+='</tbody></table>'" +
    "}" +
    // Uncontested table
    "if(uncontested.length){" +
      "h+='<table class=\"cs-table\" style=\"margin-top:8px\"><thead><tr><th>'+t('UNCONTESTED')+'</th><th style=\"text-align:right\">'+t('CANDIDATE')+'</th></tr></thead><tbody>';" +
      "for(var i=0;i<uncontested.length;i++){" +
        "var r=uncontested[i];" +
        "var name=r._active.length?esc(r._active[0].name):'TBD';" +
        "var label=esc(r.office)+(r.district?' \\u2014 '+esc(r.district):'');" +
        "h+='<tr><td>'+label+'</td><td class=\"cs-vote cs-uncontested\">'+name+'</td></tr>'" +
      "}" +
      "h+='</tbody></table>'" +
    "}" +
    // Legend & footer
    "h+='<div class=\"cs-legend\"><span>\u2B50 '+t('= Key race')+'</span><span>\u26A0\uFE0F '+t('AI-generated \\u2014 do your own research')+'</span></div>';" +
    "h+='<div class=\"cs-footer\"><span style=\"color:#fff\">&starf;</span> '+t('Built with Texas Votes')+' &middot; txvotes.app</div>';" +
    // Party switcher + back link (hidden in print)
    "h+=renderPartySwitcher();" +
    "h+='<div style=\"text-align:center;margin-top:8px\" class=\"cs-actions\"><button class=\"btn btn-secondary\" data-action=\"nav\" data-to=\"#/ballot\">&larr; '+t('Back to My Ballot')+'</button></div>';" +
    "return h;" +
  "}",

  "function renderPartySwitcher(){" +
    "var hasRep=!!S.repBallot,hasDem=!!S.demBallot;" +
    "if(!hasRep&&!hasDem)return'';" +
    "if(hasRep&&!hasDem){S.selectedParty='republican';return''}" +
    "if(!hasRep&&hasDem){S.selectedParty='democrat';return''}" +
    "return '<div class=\"party-row\">" +
      "<button class=\"party-btn party-rep'+(S.selectedParty==='republican'?' on':'')+'\" data-action=\"set-party\" data-value=\"republican\">" +
        "\u{1F418} '+t('Republican')+'</button>" +
      "<button class=\"party-btn party-dem'+(S.selectedParty==='democrat'?' on':'')+'\" data-action=\"set-party\" data-value=\"democrat\">" +
        "\u{1FACF} '+t('Democrat')+'</button>" +
    "</div>';" +
  "}",

  "function renderRaceCard(race,allRaces){" +
    "var idx=-1;for(var i=0;i<allRaces.length;i++){if(allRaces[i].office===race.office&&allRaces[i].district===race.district){idx=i;break}}" +
    "var _ov=getOverride(race);" +
    "var _ovActive=_ov&&_ov.chosenCandidate!==_ov.originalCandidate;" +
    "var _effName=_ov?_ov.chosenCandidate:(race.recommendation?race.recommendation.candidateName:null);" +
    "var label=race.office+(race.district?' \\u2014 '+race.district:'')+(_effName?' \\u2014 Recommended: '+_effName:'');" +
    "var _streamClass=race._streamed?' stream-card-in':'';" +
    "var _isPending=(!race._streamed&&S._streaming);" +
    "var _pendingClass=_isPending?' stream-pending':'';" +
    "var h='<div class=\"card card-touch'+_streamClass+_pendingClass+'\" data-action=\"nav\" data-to=\"#/race/'+idx+'\" role=\"link\" aria-label=\"'+esc(label)+'\" tabindex=\"0\">';" +
    // Row 1: office title + badge + chevron
    "h+='<div style=\"display:flex;justify-content:space-between;align-items:center;gap:6px\">';" +
    "h+='<div style=\"flex:1;min-width:0;font-size:14px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">'+(race.isKeyRace?'<span class=\"star\">\u2B50</span> ':'')+esc(race.office)+(race.district?' \\u2014 '+esc(race.district):'')+'</div>';" +
    "h+='<div style=\"display:flex;align-items:center;gap:6px;flex-shrink:0\">';" +
    "if(_ovActive){h+='<span class=\"badge\" style=\"background:#fef3c7;color:#92400e;font-size:11px\" data-t=\"You changed this\">'+t('You changed this')+'</span>'}" +
    "if(race.recommendation&&!_isPending){h+=confBadge(race.recommendation.confidence)}" +
    "h+='<span style=\"color:var(--text2);font-size:18px\">&rsaquo;</span>';" +
    "h+='</div></div>';" +
    // Full-width content below (hide during streaming for pending races)
    "if(race.recommendation&&!_isPending){" +
      "if(_ovActive){" +
        "h+='<div style=\"font-size:17px;font-weight:700;margin-top:4px;color:#92400e\">'+esc(_ov.chosenCandidate)+'</div>';" +
        "h+='<div style=\"font-size:12px;color:var(--text2);margin-top:2px\"><s>'+esc(race.recommendation.candidateName)+'</s> <span data-t=\"(AI pick)\">('+t('AI pick')+')</span></div>'" +
      "}else{" +
        "h+='<div style=\"font-size:17px;font-weight:700;margin-top:4px\">'+esc(race.recommendation.candidateName)+'</div>';" +
        "h+='<div style=\"font-size:13px;color:var(--text2);margin-top:2px;line-height:1.4\">'+esc(race.recommendation.reasoning)+'</div>'" +
      "}" +
    "}" +
    "var activeCands=race.candidates.filter(function(c){return !c.withdrawn});" +
    "h+='<div style=\"font-size:13px;color:var(--text2);margin-top:4px\">'+activeCands.length+' '+(activeCands.length!==1?t('candidates'):t('candidate'))+'</div>';" +
    "var colors=['#4A90D9','#D95B43','#5B8C5A','#8E6BBF','#D4A843','#C75B8F','#5BBFC7','#7B8D6F','#D97B43','#6B8FBF'];" +
    "h+='<div style=\"display:flex;flex-wrap:wrap;gap:4px;margin-top:6px\">';" +
    "for(var j=0;j<activeCands.length;j++){" +
      "var c=activeCands[j];" +
      "var slug=c.name.toLowerCase().replace(/[^a-z0-9 -]/g,'').replace(/\\s+/g,'-');" +
      "var initial=getInitials(c.name);" +
      "var ac=colors[j%colors.length];" +
      "var _isUserPick=_ovActive&&c.name===_ov.chosenCandidate;" +
      "var bdr=_isUserPick?'2px solid #d97706':c.isRecommended&&!_ovActive?'2px solid var(--blue)':'2px solid transparent';" +
      "h+='<div style=\"width:30px;height:30px;border-radius:50%;background:'+ac+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;overflow:hidden;border:'+bdr+';flex-shrink:0\">';" +
      "h+='<img src=\"/headshots/'+slug+'.jpg\" alt=\"\" style=\"width:100%;height:100%;object-fit:cover;border-radius:50%\" onerror=\"if(this.src.indexOf(\\'.jpg\\')>0){this.src=this.src.replace(\\'.jpg\\',\\'.png\\')}else{this.style.display=\\'none\\';this.nextSibling.style.display=\\'\\';}\">';" +
      "h+='<span style=\"display:none\">'+initial+'</span></div>'" +
    "}" +
    "h+='</div>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  "function confBadge(c){" +
    "var cls='badge-ok';" +
    "if(c==='Best Available'||c==='Symbolic Race')cls='badge-warn';" +
    "return '<span class=\"badge '+cls+'\">'+t(c)+'</span>'" +
  "}",

  // Classify data confidence for a candidate based on source quality
  "function classifySourceConf(c){" +
    "var hasSrc=c.sources&&c.sources.length>0;" +
    "var hasOfficial=hasSrc&&c.sources.some(function(s){return /ballotpedia|votesmart|sos\\.state|sos\\.texas|capitol|senate\\.gov|house\\.gov/i.test(s.url||'')});" +
    "var hasMultiple=hasSrc&&c.sources.length>=3;" +
    "return{" +
      "keyPositions:hasOfficial?'verified':hasSrc?'sourced':'ai-inferred'," +
      "endorsements:c.endorsements&&c.endorsements.length>0?(hasOfficial?'verified':'sourced'):'none'," +
      "pros:hasSrc?'sourced':'ai-inferred'," +
      "cons:hasSrc?'sourced':'ai-inferred'," +
      "polling:c.polling?(hasMultiple?'verified':'sourced'):'none'," +
      "fundraising:c.fundraising?(hasMultiple?'verified':'sourced'):'none'" +
    "}" +
  "}",
  "function sourceConfBadge(level){" +
    "if(!level||level==='none')return'';" +
    "if(level==='verified')return ' <span style=\"font-size:11px;color:#059669;background:rgba(5,150,105,.1);padding:2px 6px;border-radius:4px;margin-left:6px\">\\u2713 '+t('Verified')+'</span>';" +
    "if(level==='sourced')return ' <span style=\"font-size:11px;color:#2563eb;background:rgba(37,99,235,.1);padding:2px 6px;border-radius:4px;margin-left:6px\">'+t('Sourced')+'</span>';" +
    "return ' <span style=\"font-size:11px;color:#d97706;background:rgba(217,119,6,.1);padding:2px 6px;border-radius:4px;margin-left:6px\">'+t('AI-inferred')+'</span>'" +
  "}",

  // Pick tone-appropriate version of a prop field (object with tone keys or plain string)
  "function tp(v){if(!v)return v;if(typeof v==='object'&&!Array.isArray(v)){return v[S.readingLevel]||v['3']||v['1']||Object.values(v)[0]}return v}",

  "function renderPropCard(prop){" +
    "var eid='prop-'+prop.number;" +
    "var isOpen=S.expanded[eid];" +
    "var recClass='badge-warn';" +
    "if(prop.recommendation==='Lean Yes')recClass='badge-ok';" +
    "if(prop.recommendation==='Lean No')recClass='badge-bad';" +
    "var _pIsPending=(!prop._streamed&&S._streaming);" +
    "var _pPending=_pIsPending?' stream-pending':'';" +
    "var h='<div class=\"card'+_pPending+'\">';" +
    "h+='<div class=\"prop-header\"><div class=\"prop-title\">Prop '+prop.number+': '+esc(prop.title)+'</div>';" +
    "if(!_pIsPending){h+='<span class=\"badge '+recClass+'\">'+t(prop.recommendation)+'</span>'}" +
    "h+='</div>';" +
    "if(LANG==='es'){var tt=t(prop.title);if(tt!==prop.title)h+='<div class=\"prop-trans\">'+esc(tt)+'</div>'}" +
    "var pdesc=tp(prop.description)||prop.description;" +
    "h+='<div class=\"prop-desc\">'+esc(pdesc)+'</div>';" +
    "if(LANG==='es'){var td=t(prop.description);if(td!==prop.description)h+='<div class=\"prop-trans\">'+esc(td)+'</div>'}" +
    // If Passes / If Fails (always visible, color-coded)
    "var pPass=tp(prop.ifPasses)||prop.ifPasses;var pFail=tp(prop.ifFails)||prop.ifFails;" +
    "if(pPass||pFail){" +
      "h+='<div style=\"margin-top:10px\">';" +
      "if(pPass){h+='<div class=\"prop-outcome pass\"><span style=\"flex-shrink:0\">\u2705</span><div><b>'+t('If it passes:')+'</b> '+esc(LANG==='es'?t(prop.ifPasses):pPass)+'</div></div>'}" +
      "if(pFail){h+='<div class=\"prop-outcome fail\"><span style=\"flex-shrink:0\">\u274C</span><div><b>'+t('If it fails:')+'</b> '+esc(LANG==='es'?t(prop.ifFails):pFail)+'</div></div>'}" +
      "h+='</div>'" +
    "}" +
    // AI reasoning (always visible)
    "var pReason=tp(prop.reasoning)||prop.reasoning;" +
    "if(pReason){h+='<div class=\"prop-reasoning\"><span style=\"flex-shrink:0\">\u{1F9E0}</span><div>'+esc(pReason)+'</div></div>'}" +
    "if(isOpen){" +
      "h+='<div class=\"prop-details\">';" +
      "var pBg=tp(prop.background)||prop.background;var pFi=tp(prop.fiscalImpact)||prop.fiscalImpact;" +
      "if(pBg){h+='<div class=\"prop-section\"><h5>'+t('Background')+'</h5><p>'+esc(pBg)+'</p></div>'}" +
      "if(pFi){h+='<div class=\"prop-section\"><h5>\u{1F4B0} '+t('Fiscal Impact')+'</h5><p>'+esc(pFi)+'</p></div>'}" +
      // Side-by-side supporters vs opponents
      "if((prop.supporters&&prop.supporters.length)||(prop.opponents&&prop.opponents.length)){" +
        "h+='<div class=\"prop-cols\">';" +
        "if(prop.supporters&&prop.supporters.length){" +
          "h+='<div class=\"prop-col for\"><h5>\u{1F44D} '+t('Supporters')+'</h5><ul>';" +
          "for(var j=0;j<prop.supporters.length;j++)h+='<li>'+esc(prop.supporters[j])+'</li>';" +
          "h+='</ul></div>'" +
        "}" +
        "if(prop.opponents&&prop.opponents.length){" +
          "h+='<div class=\"prop-col against\"><h5>\u{1F44E} '+t('Opponents')+'</h5><ul>';" +
          "for(var j=0;j<prop.opponents.length;j++)h+='<li>'+esc(prop.opponents[j])+'</li>';" +
          "h+='</ul></div>'" +
        "}" +
        "h+='</div>'" +
      "}" +
      "var pCav=tp(prop.caveats)||prop.caveats;" +
      "if(pCav){h+='<div class=\"prop-section\"><h5>\u26A0\u{FE0F} '+t('Caveats')+'</h5><p>'+esc(pCav)+'</p></div>'}" +
      "h+='</div>'" +
    "}" +
    "h+='<button class=\"expand-toggle\" data-action=\"toggle-expand\" data-id=\"'+eid+'\" aria-expanded=\"'+!!isOpen+'\">'+(isOpen?t('Show Less'):t('Learn More'))+'</button>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // Race Detail
  "function renderRaceDetail(idx){" +
    "var b=getBallot();if(!b)return '<p>No ballot</p>';" +
    "var races=b.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
    "var race=races[idx];if(!race)return '<p>Race not found</p>';" +
    "var candidates=shuffle(race.candidates.filter(function(c){return !c.withdrawn}));" +
    "var _ov=getOverride(race);" +
    "var _ovActive=_ov&&_ov.chosenCandidate!==_ov.originalCandidate;" +
    "var h='<button class=\"back-btn\" data-action=\"nav\" data-to=\"#/ballot\">&larr; '+t('Back to My Ballot')+'</button>';" +
    // Novelty tone compact warning on race detail
    "if(S.readingLevel===7){" +
      "var _rdEmoji='\\uD83E\\uDD20';" +
      "var _rdMsg='Viewing in Cowboy mode. Switch to Standard for neutral presentation.';" +
      "h+='<div style=\"font-size:12px;color:#92400e;margin-bottom:12px;padding:8px 12px;background:#fef3c7;border:1.5px solid #f59e0b;border-radius:8px;line-height:1.4;display:flex;align-items:center;gap:8px;flex-wrap:wrap\">'+_rdEmoji+' '+t(_rdMsg)+' <a href=\"#\" data-action=\"switch-to-standard\" style=\"color:#92400e;font-weight:600;text-decoration:underline;white-space:nowrap\">'+t('Switch to Standard')+'</a></div>'" +
    "}" +
    "h+='<h2 style=\"font-size:22px;font-weight:800;margin-bottom:4px\">'+esc(race.office)+'</h2>';" +
    "if(race.district)h+='<div style=\"font-size:15px;color:var(--text2);margin-bottom:16px\">'+esc(race.district)+'</div>';" +
    "else h+='<div style=\"margin-bottom:16px\"></div>';" +
    // Recommendation box — modified for overrides
    "if(race.recommendation){" +
      "var rec=race.recommendation;" +
      "if(_ovActive){" +
        // Overridden: show dimmed rec box with strikethrough
        "h+='<div class=\"rec-box\" style=\"opacity:0.6;border-left:4px solid #d97706\">';" +
        "h+='<div style=\"display:flex;justify-content:space-between;align-items:center\">';" +
        "h+='<h4 style=\"text-decoration:line-through;color:var(--text2)\">\u2705 '+esc(rec.candidateName)+'</h4>';" +
        "h+=confBadge(rec.confidence);" +
        "h+='</div>';" +
        "h+='<p style=\"font-size:13px;color:#92400e\" data-t=\"AI recommended {from}, but you chose {to}\">'+t('AI recommended')+' '+esc(rec.candidateName)+', '+t('but you chose')+' '+esc(_ov.chosenCandidate)+'</p>';" +
        "h+='<button class=\"btn btn-secondary\" style=\"font-size:13px;padding:6px 14px;margin-top:8px\" data-action=\"undo-override\" data-race-idx=\"'+idx+'\" data-t=\"Restore AI pick\">'+t('Restore AI pick')+'</button>';" +
        "h+='</div>'" +
      "}else{" +
        "h+='<div class=\"rec-box\">';" +
        "h+='<div style=\"display:flex;justify-content:space-between;align-items:center\">';" +
        "h+='<h4>\u2705 '+esc(rec.candidateName)+'</h4>';" +
        "h+=confBadge(rec.confidence);" +
        "h+='</div>';" +
        "h+='<p>'+esc(rec.reasoning)+'</p>';" +
        "if(rec.matchFactors&&rec.matchFactors.length){" +
          "h+='<div style=\"margin-top:8px;padding:8px 10px;background:rgba(74,144,217,.08);border-radius:8px\">';" +
          "h+='<div style=\"font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px\">'+t('Why this match?')+'</div>';" +
          "h+='<ul style=\"margin:0;padding-left:18px;font-size:13px;color:var(--text);line-height:1.5\">';" +
          "for(var mf=0;mf<rec.matchFactors.length;mf++){h+='<li>'+esc(rec.matchFactors[mf])+'</li>'}" +
          "h+='</ul></div>'" +
        "}" +
        "var _rc=candidates.find(function(c){return c.isRecommended});" +
        "if(_rc&&_rc.pros&&_rc.pros.length){" +
          "h+='<div style=\"margin-top:8px;padding:8px 10px;background:rgba(90,180,90,.08);border-radius:8px\">';" +
          "h+='<div style=\"font-size:12px;font-weight:700;color:var(--ok);margin-bottom:4px\">\u2705 '+t('Strengths')+'</div>';" +
          "h+='<ul style=\"margin:0;padding-left:18px;font-size:13px;color:var(--text);line-height:1.5\">';" +
          "for(var si=0;si<_rc.pros.length;si++){h+='<li>'+esc(tp(_rc.pros[si]))+'</li>'}" +
          "h+='</ul></div>'" +
        "}" +
        "if(_rc&&_rc.cons&&_rc.cons.length){" +
          "h+='<div style=\"margin-top:8px;padding:8px 10px;background:rgba(220,120,60,.08);border-radius:8px\">';" +
          "h+='<div style=\"font-size:12px;font-weight:700;color:var(--bad);margin-bottom:4px\">\u26A0\uFE0F '+t('Concerns')+'</div>';" +
          "h+='<ul style=\"margin:0;padding-left:18px;font-size:13px;color:var(--text);line-height:1.5\">';" +
          "for(var ci2=0;ci2<_rc.cons.length;ci2++){h+='<li>'+esc(tp(_rc.cons[ci2]))+'</li>'}" +
          "h+='</ul></div>'" +
        "}" +
        "if(rec.strategicNotes)h+='<p style=\"margin-top:6px\"><b>'+t('Strategy:')+'</b> '+esc(rec.strategicNotes)+'</p>';" +
        "if(rec.caveats)h+='<p style=\"margin-top:6px\"><b>'+t('Note:')+'</b> '+esc(rec.caveats)+'</p>';" +
        "h+='</div>'" +
      "}" +
    "}" +
    // Candidates
    "h+='<div class=\"section-head\">'+t('All Candidates')+'</div>';" +
    "for(var i=0;i<candidates.length;i++){" +
      "var c=candidates[i];" +
      "var eid='cand-'+c.id;" +
      "var isOpen=S.expanded[eid];" +
      "var colors=['#4A90D9','#D95B43','#5B8C5A','#8E6BBF','#D4A843','#C75B8F','#5BBFC7','#7B8D6F','#D97B43','#6B8FBF'];" +
      "var avatarColor=colors[i%colors.length];" +
      "var initial=getInitials(c.name);" +
      "var slug=c.name.toLowerCase().replace(/[^a-z0-9 -]/g,'').replace(/\\s+/g,'-');" +
      "var _isUserPick=_ovActive&&c.name===_ov.chosenCandidate;" +
      "var _candCardCls='cand-card';" +
      "if(_isUserPick)_candCardCls+=' override-pick';" +
      "else if(c.isRecommended&&!_ovActive)_candCardCls+=' recommended';" +
      "h+='<div class=\"'+_candCardCls+'\"';" +
      "if(_isUserPick)h+=' style=\"border-left:4px solid #d97706\"';" +
      "h+='>';" +
      "h+='<div style=\"display:flex;gap:12px;align-items:center\">';" +
      "h+='<div class=\"cand-avatar\" style=\"background:'+avatarColor+'\">';" +
      "h+='<img src=\"/headshots/'+slug+'.jpg\" alt=\"\" style=\"width:100%;height:100%;object-fit:cover;border-radius:50%\" onerror=\"if(this.src.indexOf(\\'.jpg\\')>0){this.src=this.src.replace(\\'.jpg\\',\\'.png\\')}else{this.style.display=\\'none\\';this.nextSibling.style.display=\\'\\';}\">';" +
      "h+='<span style=\"display:none\">'+initial+'</span></div>';" +
      "h+='<div style=\"flex:1;min-width:0\">';" +
      "h+='<div style=\"display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:4px\">';" +
      "h+='<div class=\"cand-name\">'+esc(c.name)+'</div>';" +
      "h+='<div class=\"cand-tags\">';" +
      "if(c.isIncumbent)h+='<span class=\"badge badge-blue\">'+t('Incumbent')+'</span>';" +
      "if(_isUserPick)h+='<span class=\"badge\" style=\"background:#fef3c7;color:#92400e\" data-t=\"Your Pick\">'+t('Your Pick')+'</span>';" +
      "else if(c.isRecommended)h+='<span class=\"badge badge-ok\">'+t('Recommended')+'</span>';" +
      "var _fd=0;if(c.pros&&c.pros.length)_fd++;if(c.cons&&c.cons.length)_fd++;if(c.endorsements&&c.endorsements.length)_fd++;if(c.keyPositions&&c.keyPositions.length)_fd++;" +
      "if(_fd<2)h+='<span class=\"badge\" style=\"color:var(--text2);background:rgba(128,128,128,.12);font-size:12px\">'+t('Limited public info')+'</span>';" +
      "h+='</div></div>';" +
      "h+='</div></div>';" +
      "h+='<div class=\"cand-summary\">'+esc(tp(c.summary))+'</div>';" +
      "if(isOpen){" +
        "var _sc=classifySourceConf(c);" +
        "h+='<div class=\"cand-details\">';" +
        "if(c.keyPositions&&c.keyPositions.length){h+='<div class=\"cand-section\"><h5>'+t('Key Positions')+sourceConfBadge(_sc.keyPositions)+'</h5><div class=\"pos-chips\">';for(var j=0;j<c.keyPositions.length;j++)h+='<span class=\"pos-chip\">'+esc(c.keyPositions[j])+'</span>';h+='</div></div>'}" +
        "if(c.pros&&c.pros.length){h+='<div class=\"cand-section pros\"><h5>\u2705 '+t('Strengths')+sourceConfBadge(_sc.pros)+'</h5><ul>';for(var j=0;j<c.pros.length;j++)h+='<li>'+esc(tp(c.pros[j]))+'</li>';h+='</ul></div>'}" +
        "if(c.cons&&c.cons.length){h+='<div class=\"cand-section cons\"><h5>\u26A0\u{FE0F} '+t('Concerns')+sourceConfBadge(_sc.cons)+'</h5><ul>';for(var j=0;j<c.cons.length;j++)h+='<li>'+esc(tp(c.cons[j]))+'</li>';h+='</ul></div>'}" +
        "if(c.endorsements&&c.endorsements.length){h+='<div class=\"cand-section\"><h5>'+t('Endorsements')+sourceConfBadge(_sc.endorsements)+'</h5><ul>';for(var j=0;j<c.endorsements.length;j++){var en=c.endorsements[j];var eName=typeof en==='string'?en:(en.name||'');var eType=typeof en==='object'&&en.type?' <span style=\"color:var(--text2);font-size:0.85em\">('+esc(en.type)+')</span>':'';h+='<li>'+esc(eName)+eType+'</li>';}h+='</ul></div>'}" +
        "if(c.fundraising){h+='<div class=\"cand-section\"><h5>'+t('Fundraising')+sourceConfBadge(_sc.fundraising)+'</h5><p>'+esc(c.fundraising)+'</p></div>'}" +
        "if(c.polling){h+='<div class=\"cand-section\"><h5>'+t('Polling')+sourceConfBadge(_sc.polling)+'</h5><p>'+esc(c.polling)+'</p></div>'}" +
        "if(c.sources&&c.sources.length){" +
          "var srcId='src-'+c.id;" +
          "var srcOpen=S.expanded[srcId];" +
          "h+='<div class=\"cand-section\"><h5 style=\"cursor:pointer\" data-action=\"toggle-expand\" data-id=\"'+srcId+'\">'+t('Sources')+' <span style=\"font-size:0.85em;color:var(--text2)\">('+c.sources.length+')</span> <span style=\"font-size:0.75em\">'+(srcOpen?'\\u25B2':'\\u25BC')+'</span></h5>';" +
          "if(srcOpen){h+='<ul style=\"font-size:13px\">';for(var k=0;k<c.sources.length;k++){var src=c.sources[k];h+='<li style=\"margin-bottom:4px\"><a href=\"'+esc(src.url)+'\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"word-break:break-all\">'+esc(src.title||src.url)+'</a>'+(src.accessDate?' <span style=\"color:var(--text2)\">('+esc(src.accessDate)+')</span>':'')+'</li>';}h+='</ul>'}" +
          "h+='</div>'" +
        "}" +
        // Data confidence legend
        "h+='<div style=\"font-size:12px;color:var(--text2);margin-top:16px;padding:12px;border:1px solid var(--border);border-radius:8px\">';" +
        "h+='<div style=\"font-weight:600;margin-bottom:4px\">'+t('Data Confidence')+'</div>';" +
        "h+='<div>\\u2713 '+t('Verified')+' \\u2014 '+t('backed by official sources (Ballotpedia, Vote Smart, .gov)')+'</div>';" +
        "h+='<div>'+t('Sourced')+' \\u2014 '+t('from web sources cited below')+'</div>';" +
        "h+='<div>'+t('AI-inferred')+' \\u2014 '+t('generated by AI from available information')+'</div>';" +
        "h+='</div>';" +
        "h+='</div>';" +
      "}" +
      "h+='<div style=\"display:flex;justify-content:space-between;align-items:center\">';" +
      "h+='<button class=\"expand-toggle\" data-action=\"toggle-expand\" data-id=\"'+eid+'\" aria-expanded=\"'+!!isOpen+'\">'+(isOpen?t('Show Less'):t('Show Details'))+'</button>';" +
      "h+='<button class=\"report-link\" data-action=\"report-issue\" data-candidate=\"'+esc(c.name)+'\" data-race=\"'+esc(race.office+(race.district?' \\u2014 '+race.district:''))+'\">" +
        "&#9873; '+t('Flag this info')+'" +
      "</button>';" +
      "h+='</div>';" +
      // "Choose this candidate instead" button (only if multiple candidates and not already their pick)
      "if(candidates.length>1&&!_isUserPick&&!c.isRecommended){" +
        "h+='<button class=\"btn btn-secondary\" style=\"width:100%;margin-top:8px;font-size:13px;padding:8px 14px\" data-action=\"override-candidate\" data-race-idx=\"'+idx+'\" data-candidate=\"'+esc(c.name)+'\" data-t=\"Choose this candidate instead\">'+t('Choose this candidate instead')+'</button>'" +
      "}" +
      "h+='</div>'" +
    "}" +
    // Override feedback area (shown when override is active)
    "if(_ovActive&&_ov&&!_ov.reasonSubmitted){" +
      "h+='<div id=\"override-feedback-area\" style=\"margin-top:16px;padding:16px;background:var(--card);border:1.5px solid #d97706;border-radius:12px\">';" +
      "h+='<div style=\"font-size:14px;font-weight:600;margin-bottom:8px\" data-t=\"Why did you change this?\">'+t('Why did you change this?')+'</div>';" +
      "h+='<textarea id=\"override-reason\" rows=\"3\" style=\"width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;resize:vertical;background:var(--bg);color:var(--text)\" placeholder=\"'+t('What made you choose differently? (optional, anonymous)')+'\" data-t-placeholder=\"What made you choose differently? (optional, anonymous)\"></textarea>';" +
      "h+='<div style=\"display:flex;gap:8px;margin-top:8px;align-items:center\">';" +
      "h+='<button class=\"btn btn-primary\" style=\"font-size:13px;padding:6px 14px\" data-action=\"submit-override-feedback\" data-race-idx=\"'+idx+'\" data-t=\"Submit feedback\">'+t('Submit feedback')+'</button>';" +
      "h+='<button class=\"btn btn-secondary\" style=\"font-size:13px;padding:6px 14px\" data-action=\"dismiss-override-feedback\" data-race-idx=\"'+idx+'\" data-t=\"Skip\">'+t('Skip')+'</button>';" +
      "h+='</div>';" +
      "h+='<div style=\"font-size:11px;color:var(--text2);margin-top:6px\" data-t=\"This feedback is anonymous and helps improve recommendations for everyone.\">'+t('This feedback is anonymous and helps improve recommendations for everyone.')+'</div>';" +
      "h+='</div>'" +
    "}" +
    "if(_ovActive&&_ov&&_ov.reasonSubmitted){" +
      "h+='<div style=\"margin-top:12px;font-size:13px;color:var(--ok);display:flex;align-items:center;gap:6px\">\u2705 <span data-t=\"Feedback sent\">'+t('Feedback sent')+'</span></div>'" +
    "}" +
    // Share this race button
    "h+='<div style=\"margin-top:20px\">';" +
    "h+='<button class=\"btn btn-secondary\" data-action=\"share-race\" data-idx=\"'+idx+'\">\u{1F4E4} '+t('Share this race')+'</button>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // ============ PROFILE VIEW ============
  "function renderProfile(){" +
    "var h='<h2 style=\"font-size:22px;font-weight:800;margin-bottom:16px\">'+t('Your Profile')+'</h2>';" +
    "if(S.summary){" +
      "h+='<div class=\"profile-summary\">\"'+esc(S.summary)+'\"</div>';" +
      "h+='<div class=\"actions\" style=\"justify-content:center;margin-bottom:16px\">';" +
      "if(S.regenerating){h+='<span style=\"font-size:13px;color:var(--text2)\">'+t('Regenerating...')+'</span>'}" +
      "else{h+='<button class=\"btn btn-secondary\" style=\"font-size:13px;padding:6px 14px\" data-action=\"share-profile\">\\uD83D\\uDCE4 '+t('Share')+'</button>';" +
      "h+='<button class=\"btn\" style=\"font-size:13px;padding:6px 14px\" data-action=\"regen-summary\">\\u2728 '+t('Regenerate Summary')+'</button>'}" +
      "h+='</div>'" +
    "}" +
    "h+='<div class=\"card\">';" +
    // Issues (ranked)
    "h+='<div class=\"profile-section\"><h3>'+t('Top Issues (ranked)')+'</h3>';" +
    "h+='<ol style=\"margin:0;padding-left:24px\">';" +
    "for(var i=0;i<Math.min(S.issues.length,7);i++){" +
      "var issue=ISSUES.find(function(x){return x.v===S.issues[i]});" +
      "h+='<li style=\"font-size:15px;margin-bottom:4px'+(i>=5?';opacity:.5':'')+'\">'+(issue?issue.icon+' ':'')+t(S.issues[i])+'</li>'" +
    "}" +
    "h+='</ol></div>';" +
    // Spectrum
    "if(S.spectrum){h+='<div class=\"profile-section\"><h3>'+t('Political Approach')+'</h3><p style=\"font-size:16px\">'+t(S.spectrum)+'</p></div>'}" +
    // Policy views
    "var pvKeys=Object.keys(S.policyViews);" +
    "if(pvKeys.length){" +
      "h+='<div class=\"profile-section\"><h3>'+t('Policy Stances')+'</h3>';" +
      "for(var i=0;i<pvKeys.length;i++){h+='<div style=\"margin-bottom:6px\"><span style=\"font-size:13px;color:var(--text2)\">'+t(pvKeys[i])+'</span><br><span style=\"font-size:15px;font-weight:600\">'+t(S.policyViews[pvKeys[i]])+'</span></div>'}" +
      "h+='</div>'" +
    "}" +
    // Qualities (ranked)
    "if(S.qualities.length){" +
      "h+='<div class=\"profile-section\"><h3>'+t('Candidate Qualities (ranked)')+'</h3>';" +
      "h+='<ol style=\"margin:0;padding-left:24px\">';" +
      "for(var i=0;i<Math.min(S.qualities.length,5);i++){" +
        "h+='<li style=\"font-size:15px;margin-bottom:4px'+(i>=3?';opacity:.5':'')+'\">'+(QUAL_ICONS[S.qualities[i]]||'')+' '+t(S.qualities[i])+'</li>'" +
      "}" +
      "h+='</ol></div>'" +
    "}" +
    // Freeform
    "if(S.freeform){h+='<div class=\"profile-section\"><h3>'+t('Additional Context')+'</h3><p style=\"font-size:15px;line-height:1.5\">'+esc(S.freeform)+'</p></div>'}" +
    // Address
    "if(S.address&&S.address.street){h+='<div class=\"profile-section\"><h3>'+t('Address')+'</h3><p style=\"font-size:15px\">'+esc(S.address.street)+', '+esc(S.address.city)+', '+esc(S.address.state)+' '+esc(S.address.zip)+'</p></div>'}" +
    "h+='</div>';" +
    // Send Feedback + Credits
    "h+='<div class=\"card\" style=\"margin-top:16px;text-align:center\">';" +
    "h+='<a href=\"mailto:howdy@txvotes.app\" style=\"font-size:15px;font-weight:600\">'+t('Send Feedback')+' &rarr;</a>';" +
    "h+='<p data-action=\"secret-tap\" style=\"font-size:13px;color:var(--text2);margin-top:8px;cursor:default;-webkit-user-select:none;user-select:none\">'+t('Powered by Claude (Anthropic)')+'</p>';" +
    "h+='</div>';" +
    // Language toggle
    "h+='<div class=\"card\" style=\"margin-top:16px;text-align:center\">';" +
    "h+='<div style=\"font-size:15px;font-weight:600;margin-bottom:8px\">\u{1F310} Language / Idioma</div>';" +
    "h+='<div class=\"party-row\" style=\"margin:0\">';" +
    "h+='<button class=\"party-btn'+(LANG==='en'?' lang-on':' lang-off')+'\" data-action=\"set-lang\" data-value=\"en\">English</button>';" +
    "h+='<button class=\"party-btn'+(LANG==='es'?' lang-on':' lang-off')+'\" data-action=\"set-lang\" data-value=\"es\">Espa\\u00F1ol</button>';" +
    "h+='</div></div>';" +
    // Reading level slider (extends with easter eggs)
    "h+='<div class=\"card\" style=\"margin-top:16px\">';" +
    "h+='<div style=\"font-size:15px;font-weight:600;margin-bottom:12px\">\u{1F4D6} '+t('Reading Level')+'</div>';" +
    "var rlMap=[1,3,4];if(eeCowboy)rlMap.push(7);" +
    "var rlNames={1:t('Simple'),3:t('Standard'),4:t('Detailed'),7:'\\uD83E\\uDD20 Howdy Partner!'};" +
    "var rlIdx=rlMap.indexOf(S.readingLevel);if(rlIdx<0)rlIdx=1;" +
    "var rlMax=rlMap.length-1;" +
    "h+='<input type=\"range\" min=\"0\" max=\"'+rlMax+'\" value=\"'+rlIdx+'\" data-action=\"set-reading-level\" style=\"width:100%;accent-color:'+(S.readingLevel===7?'#a16207':'var(--blue)')+'\">';" +
    "h+='<div style=\"display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-top:4px\">';" +
    "h+='<span>'+t('Simple')+'</span>';" +
    "h+='<span style=\"font-weight:600;color:'+(S.readingLevel===7?'#a16207':'var(--text1)')+'\">'+(rlNames[S.readingLevel]||t('Standard'))+'</span>';" +
    "h+='<span>'+(eeCowboy?'\\uD83E\\uDD20':t('Detailed'))+'</span>';" +
    "h+='</div>';" +
    "if(S.guideComplete&&!S.isLoading){h+='<button class=\"btn btn-primary\" style=\"width:100%;margin-top:12px\" data-action=\"reprocess-guide\">'+t('Reprocess Guide')+'</button>'}" +
    "h+='</div>';" +
    // Start Over
    "h+='<div style=\"margin-top:32px;padding-top:20px;border-top:1px solid var(--border)\">';" +
    "h+='<button class=\"btn btn-danger\" data-action=\"reset\">'+t('Start Over')+'</button>';" +
    "h+='<p class=\"text-center mt-sm\" style=\"font-size:13px;color:var(--text2)\">'+t('This will erase your profile and recommendations.')+'</p>';" +
    "h+='</div>';" +
    // IMPORTANT: Keep footer in sync with index.js generateFooter() — FOOTER_SYNC_PWA
    "h+='<div style=\"text-align:center;padding:24px 0 8px;font-size:13px;color:var(--text2)\">';" +
    "h+='<a href=\"/\" style=\"color:var(--text2)\">'+t('Texas Votes')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/how-it-works\" target=\"_blank\" style=\"color:var(--text2)\">'+t('How It Works')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/privacy\" target=\"_blank\" style=\"color:var(--text2)\">'+t('Privacy')+'</a>';" +
    "h+='<br><span style=\"margin-top:6px;display:inline-block\"><span style=\"color:#fff\">&starf;</span> '+t('Built in Texas')+' &middot; <a href=\"mailto:howdy@txvotes.app\" style=\"color:var(--text2)\">howdy@txvotes.app</a></span>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // ============ LLM COMPARE (DEBUG) ============
  "var LLM_META={" +
    "claude:{name:'Claude Sonnet',icon:'\\u{1F7E3}',color:'#7B61FF',provider:'Anthropic'}," +
    "'claude-haiku':{name:'Claude Haiku',icon:'\\u{1F7E3}',color:'#B39DFF',provider:'Anthropic'}," +
    "'claude-opus':{name:'Claude Opus',icon:'\\u{1F7E3}',color:'#5B3FCC',provider:'Anthropic'}," +
    "chatgpt:{name:'GPT-4o',icon:'\\u{1F7E2}',color:'#10A37F',provider:'OpenAI'}," +
    "'gpt-4o-mini':{name:'GPT-4o mini',icon:'\\u{1F7E2}',color:'#6BCF9F',provider:'OpenAI'}," +
    "gemini:{name:'Gemini Flash',icon:'\\u{1F535}',color:'#4285F4',provider:'Google'}," +
    "'gemini-pro':{name:'Gemini Pro',icon:'\\u{1F535}',color:'#1A73E8',provider:'Google'}," +
    "grok:{name:'Grok 3',icon:'\\u26AB',color:'#1DA1F2',provider:'xAI'}" +
  "};",

  "function llmGenerate(llmKey){" +
    "if(llmCompareLoading[llmKey])return;" +
    "var profile=null;try{var p=localStorage.getItem('tx_votes_profile');if(p)profile=JSON.parse(p)}catch(e){}" +
    "if(!profile){llmCompareErrors[llmKey]='No profile found';render();return}" +
    "llmCompareLoading[llmKey]=true;llmCompareErrors[llmKey]=null;render();" +
    "var cFips=S.districts&&S.districts.countyFips?S.districts.countyFips:null;" +
    "var parties=[];" +
    "if(S.repBallot)parties.push('republican');" +
    "if(S.demBallot)parties.push('democrat');" +
    "if(!parties.length)parties=['republican','democrat'];" +
    "var promises=parties.map(function(party){" +
      "return fetch('/app/api/guide',{method:'POST',headers:{'Content-Type':'application/json'}," +
        "body:JSON.stringify({party:party,profile:profile,districts:S.districts,lang:LANG,countyFips:cFips,readingLevel:S.readingLevel,llm:llmKey})" +
      "}).then(function(r){return r.json()}).then(function(d){return{party:party,data:d}})" +
    "});" +
    "Promise.allSettled(promises).then(function(results){" +
      "llmCompareLoading[llmKey]=false;" +
      "var ballots={};" +
      "for(var i=0;i<results.length;i++){" +
        "if(results[i].status==='fulfilled'&&results[i].value.data.ballot){" +
          "ballots[results[i].value.party]=results[i].value.data.ballot" +
        "}" +
      "}" +
      "if(Object.keys(ballots).length===0){llmCompareErrors[llmKey]='Generation failed';render();return}" +
      "llmCompareResults[llmKey]=ballots;" +
      "try{localStorage.setItem('tx_votes_llm_compare_'+llmKey,JSON.stringify(ballots))}catch(e){}" +
      "render()" +
    "}).catch(function(err){" +
      "llmCompareLoading[llmKey]=false;llmCompareErrors[llmKey]=err.message||'Request failed';render()" +
    "})" +
  "}",

  "function renderLLMCompare(){" +
    "var h='<button class=\"back-btn\" data-action=\"nav\" data-to=\"#/ballot\">&larr; Back to My Ballot</button>';" +
    "h+='<div class=\"llm-compare-header\">';" +
    "h+='<h2>\\u{1F50D} LLM Comparison</h2>';" +
    "h+='<p>Compare ballot recommendations across different AI models</p>';" +
    "h+='</div>';" +
    "var partyLabel=S.selectedParty==='democrat'?'Democratic':'Republican';" +
    "h+='<div class=\"card\" style=\"text-align:center;margin-bottom:16px\">';" +
    "h+='<div style=\"font-size:14px;color:var(--text2)\">Comparing '+partyLabel+' Primary ballots</div>';" +
    "h+='</div>';" +
    "var llmKeys=['claude','claude-haiku','claude-opus','chatgpt','gpt-4o-mini','gemini','gemini-pro','grok'];" +
    "for(var li=0;li<llmKeys.length;li++){" +
      "var lk=llmKeys[li];" +
      "if(!llmCompareResults[lk]){" +
        "try{var cached=localStorage.getItem('tx_votes_llm_compare_'+lk);if(cached)llmCompareResults[lk]=JSON.parse(cached)}catch(e){}" +
      "}" +
    "}" +
    "if(!llmCompareResults.claude&&(S.repBallot||S.demBallot)){" +
      "var cb={};if(S.repBallot)cb.republican=S.repBallot;if(S.demBallot)cb.democrat=S.demBallot;" +
      "llmCompareResults.claude=cb" +
    "}" +
    "h+='<div class=\"llm-btn-grid\">';" +
    "for(var i=0;i<llmKeys.length;i++){" +
      "var key=llmKeys[i];var meta=LLM_META[key];" +
      "var isDone=!!llmCompareResults[key];var isLoading=!!llmCompareLoading[key];var hasErr=!!llmCompareErrors[key];" +
      "var cls='llm-btn'+(isDone?' llm-done':'')+(isLoading?' llm-loading':'')+(hasErr?' llm-error':'');" +
      "h+='<button class=\"'+cls+'\" data-action=\"llm-generate\" data-llm=\"'+key+'\">';" +
      "h+='<span class=\"llm-icon\">'+meta.icon+'</span>';" +
      "h+=meta.name;" +
      "if(isLoading){h+='<div class=\"llm-status\"><span class=\"llm-spinner\"></span> Generating...</div>'}" +
      "else if(hasErr){h+='<div class=\"llm-status\" style=\"color:var(--bad)\">'+esc(llmCompareErrors[key])+'</div>'}" +
      "else if(isDone){h+='<div class=\"llm-status\" style=\"color:var(--ok)\">\\u2713 Ready</div>'}" +
      "else{h+='<div class=\"llm-status\">Tap to generate</div>'}" +
      "h+='</button>'" +
    "}" +
    "h+='</div>';" +
    "var readyLLMs=llmKeys.filter(function(k){return!!llmCompareResults[k]});" +
    "if(readyLLMs.length<2){" +
      "h+='<div class=\"card\" style=\"text-align:center;color:var(--text2);font-size:14px\">';" +
      "h+='<p>Generate ballots with at least 2 LLMs to see the comparison table.</p>';" +
      "h+='</div>';return h" +
    "}" +
    "h+='<div class=\"llm-tabs\">';" +
    "h+='<button class=\"llm-tab'+(llmCompareTab==='table'?' llm-tab-on':'')+'\" data-action=\"llm-tab\" data-tab=\"table\">\\u{1F4CA} Race by Race</button>';" +
    "h+='<button class=\"llm-tab'+(llmCompareTab==='summary'?' llm-tab-on':'')+'\" data-action=\"llm-tab\" data-tab=\"summary\">\\u{1F4CB} Agreement Summary</button>';" +
    "h+='</div>';" +
    "var currentBallot=S.selectedParty==='democrat'?S.demBallot:S.repBallot;" +
    "if(!currentBallot){h+='<div class=\"card\"><p>No ballot for selected party.</p></div>';return h}" +
    "var races=currentBallot.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
    "var contested=races.filter(function(r){return r.candidates&&r.candidates.filter(function(c){return !c.withdrawn}).length>1});" +
    "h+='<div class=\"llm-legend\">';" +
    "for(var ri2=0;ri2<readyLLMs.length;ri2++){" +
      "var rm=LLM_META[readyLLMs[ri2]];" +
      "h+='<span><span class=\"llm-legend-dot\" style=\"background:'+rm.color+'\"></span>'+rm.name+'</span>'" +
    "}" +
    "h+='<span><span class=\"llm-legend-dot\" style=\"background:var(--warn)\"></span>Disagree</span>';" +
    "h+='</div>';" +
    "if(llmCompareTab==='summary'){" +
      "var agree=0,disagree=0,total=contested.length;" +
      "for(var si=0;si<contested.length;si++){" +
        "var sr=contested[si];var sRecs=[];" +
        "for(var sj=0;sj<readyLLMs.length;sj++){" +
          "var sb=llmCompareResults[readyLLMs[sj]];" +
          "var sBallot=sb&&sb[S.selectedParty];" +
          "if(!sBallot)continue;" +
          "var sRace=null;for(var sk=0;sk<sBallot.races.length;sk++){if(sBallot.races[sk].office===sr.office&&sBallot.races[sk].district===sr.district){sRace=sBallot.races[sk];break}}" +
          "if(sRace&&sRace.recommendation)sRecs.push(sRace.recommendation.candidateName)" +
        "}" +
        "var allSame=sRecs.length>1&&sRecs.every(function(r){return r===sRecs[0]});" +
        "if(allSame)agree++;else if(sRecs.length>1)disagree++" +
      "}" +
      "var pct=total>0?Math.round(agree/total*100):0;" +
      "h+='<div class=\"card\" style=\"text-align:center;margin-bottom:16px\">';" +
      "h+='<div style=\"font-size:48px;font-weight:800;color:var(--blue)\">'+pct+'%</div>';" +
      "h+='<div style=\"font-size:15px;color:var(--text2)\">Agreement across '+readyLLMs.length+' LLMs</div>';" +
      "h+='<div style=\"display:flex;gap:16px;justify-content:center;margin-top:12px;font-size:14px\">';" +
      "h+='<span style=\"color:var(--ok)\">\\u2713 '+agree+' agree</span>';" +
      "h+='<span style=\"color:var(--warn)\">\\u2717 '+disagree+' disagree</span>';" +
      "h+='</div></div>';" +
      "if(disagree>0){" +
        "h+='<div class=\"section-head\">\\u26A0\\uFE0F Disagreements</div>';" +
        "for(var di=0;di<contested.length;di++){" +
          "var dr=contested[di];var dRecs={};" +
          "for(var dj=0;dj<readyLLMs.length;dj++){" +
            "var dBal=llmCompareResults[readyLLMs[dj]]&&llmCompareResults[readyLLMs[dj]][S.selectedParty];" +
            "if(!dBal)continue;" +
            "var dRace=null;for(var dk=0;dk<dBal.races.length;dk++){if(dBal.races[dk].office===dr.office&&dBal.races[dk].district===dr.district){dRace=dBal.races[dk];break}}" +
            "if(dRace&&dRace.recommendation)dRecs[readyLLMs[dj]]=dRace.recommendation" +
          "}" +
          "var dNames=Object.values(dRecs).map(function(r){return r.candidateName});" +
          "var allEq=dNames.length>1&&dNames.every(function(n){return n===dNames[0]});" +
          "if(!allEq&&dNames.length>1){" +
            "h+='<div class=\"llm-race-row\">';" +
            "h+='<div class=\"llm-race-office\">'+esc(dr.office)+(dr.district?' \\u2014 '+esc(dr.district):'')+'</div>';" +
            "var dCols=Math.min(readyLLMs.length,4);" +
            "h+='<div class=\"llm-rec-grid cols-'+dCols+'\">';" +
            "for(var dl=0;dl<readyLLMs.length;dl++){" +
              "var dKey=readyLLMs[dl];var dMeta=LLM_META[dKey];var dRec=dRecs[dKey];" +
              "h+='<div class=\"llm-rec-cell llm-disagree\">';" +
              "h+='<div class=\"llm-cell-label\" style=\"color:'+dMeta.color+'\">'+dMeta.name+'</div>';" +
              "if(dRec){" +
                "h+='<div class=\"llm-cell-name\">'+esc(dRec.candidateName)+'</div>';" +
                "h+='<div class=\"llm-cell-reason\">'+esc((dRec.reasoning||'').slice(0,120))+(dRec.reasoning&&dRec.reasoning.length>120?'...':'')+'</div>'" +
              "}else{h+='<div class=\"llm-cell-name\" style=\"color:var(--text2)\">No data</div>'}" +
              "h+='</div>'" +
            "}" +
            "h+='</div></div>'" +
          "}" +
        "}" +
      "}" +
      "if(agree>0){" +
        "h+='<div class=\"section-head\">\\u2705 Agreements</div>';" +
        "for(var ai2=0;ai2<contested.length;ai2++){" +
          "var ar=contested[ai2];var aRecs={};" +
          "for(var aj=0;aj<readyLLMs.length;aj++){" +
            "var aBal=llmCompareResults[readyLLMs[aj]]&&llmCompareResults[readyLLMs[aj]][S.selectedParty];" +
            "if(!aBal)continue;" +
            "var aRace=null;for(var ak=0;ak<aBal.races.length;ak++){if(aBal.races[ak].office===ar.office&&aBal.races[ak].district===ar.district){aRace=aBal.races[ak];break}}" +
            "if(aRace&&aRace.recommendation)aRecs[readyLLMs[aj]]=aRace.recommendation" +
          "}" +
          "var aNames=Object.values(aRecs).map(function(r){return r.candidateName});" +
          "var aAllEq=aNames.length>1&&aNames.every(function(n){return n===aNames[0]});" +
          "if(aAllEq&&aNames.length>1){" +
            "h+='<div class=\"llm-race-row\">';" +
            "h+='<div class=\"llm-race-office\">'+esc(ar.office)+(ar.district?' \\u2014 '+esc(ar.district):'')+'</div>';" +
            "h+='<div style=\"font-size:15px;font-weight:700\">\\u2713 '+esc(aNames[0])+'</div>';" +
            "h+='</div>'" +
          "}" +
        "}" +
      "}" +
    "}else{" +
      "for(var ti=0;ti<contested.length;ti++){" +
        "var tRace2=contested[ti];" +
        "h+='<div class=\"llm-race-row\">';" +
        "h+='<div class=\"llm-race-office\">'+esc(tRace2.office)+(tRace2.district?' \\u2014 '+esc(tRace2.district):'')+'</div>';" +
        "var tRecs={};var tNames=[];" +
        "for(var tj=0;tj<readyLLMs.length;tj++){" +
          "var tBal=llmCompareResults[readyLLMs[tj]]&&llmCompareResults[readyLLMs[tj]][S.selectedParty];" +
          "if(!tBal)continue;" +
          "var tRace3=null;for(var tk=0;tk<tBal.races.length;tk++){if(tBal.races[tk].office===tRace2.office&&tBal.races[tk].district===tRace2.district){tRace3=tBal.races[tk];break}}" +
          "if(tRace3&&tRace3.recommendation){tRecs[readyLLMs[tj]]=tRace3.recommendation;tNames.push(tRace3.recommendation.candidateName)}" +
        "}" +
        "var tAllSame=tNames.length>1&&tNames.every(function(n){return n===tNames[0]});" +
        "var tCols=Math.min(readyLLMs.length,4);" +
        "h+='<div class=\"llm-rec-grid cols-'+tCols+'\">';" +
        "for(var tl=0;tl<readyLLMs.length;tl++){" +
          "var tKey=readyLLMs[tl];var tMeta=LLM_META[tKey];var tRec=tRecs[tKey];" +
          "var tDisagree=!tAllSame&&tNames.length>1?' llm-disagree':'';" +
          "h+='<div class=\"llm-rec-cell'+tDisagree+'\">';" +
          "h+='<div class=\"llm-cell-label\" style=\"color:'+tMeta.color+'\">'+tMeta.name+'</div>';" +
          "if(tRec){" +
            "h+='<div class=\"llm-cell-name\">'+esc(tRec.candidateName)+'</div>';" +
            "if(tRec.confidence){h+='<div class=\"llm-cell-conf\">'+confBadge(tRec.confidence)+'</div>'}" +
            "h+='<div class=\"llm-cell-reason\">'+esc((tRec.reasoning||'').slice(0,100))+(tRec.reasoning&&tRec.reasoning.length>100?'...':'')+'</div>'" +
          "}else{h+='<div class=\"llm-cell-name\" style=\"color:var(--text2)\">No data</div>'}" +
          "h+='</div>'" +
        "}" +
        "h+='</div></div>'" +
      "}" +
    "}" +
    "h+='<div style=\"text-align:center;padding:24px 0\">';" +
    "h+='<button class=\"btn btn-secondary\" style=\"max-width:280px;margin:0 auto\" data-action=\"llm-clear\">Clear All Comparisons</button>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // ============ LLM EXPERIMENT ============
  "function expGenerate(){" +
    "if(expLoading.claude||expLoading[expChallenger])return;" +
    "var profile=null;try{var p=localStorage.getItem('tx_votes_profile');if(p)profile=JSON.parse(p)}catch(e){}" +
    "if(!profile){profile={tone:'balanced',issues:['Economy','Education','Healthcare','Immigration','Public Safety'],qualities:['Integrity','Experience','Leadership'],readingLevel:3}}" +
    "var cFips=S.districts&&S.districts.countyFips?S.districts.countyFips:null;" +
    "var parties=['republican','democrat'];" +
    // Determine which LLMs need generation
    "var toGen=[];" +
    "if(!expResults.claude)toGen.push('claude');" +
    "if(!expResults[expChallenger])toGen.push(expChallenger);" +
    "if(!toGen.length){render();return}" +
    "for(var gi=0;gi<toGen.length;gi++){expLoading[toGen[gi]]=true;expErrors[toGen[gi]]=null}" +
    "render();" +
    "for(var gj=0;gj<toGen.length;gj++){" +
      "(function(llmKey){" +
        "var t0=Date.now();" +
        "var promises=parties.map(function(party){" +
          "return fetch('/app/api/guide',{method:'POST',headers:{'Content-Type':'application/json'}," +
            "body:JSON.stringify({party:party,profile:profile,districts:S.districts,lang:LANG,countyFips:cFips,readingLevel:S.readingLevel,llm:llmKey})" +
          "}).then(function(r){return r.text()}).then(function(txt){return{party:party,text:txt,data:JSON.parse(txt)}})" +
        "});" +
        "Promise.allSettled(promises).then(function(results){" +
          "var elapsed=(Date.now()-t0)/1000;" +
          "expTiming[llmKey]=elapsed;" +
          "expLoading[llmKey]=false;" +
          "var ballots={};var apiErr=null;var totalChars=0;" +
          "for(var i=0;i<results.length;i++){" +
            "if(results[i].status==='fulfilled'){" +
              "totalChars+=results[i].value.text.length;" +
              "if(results[i].value.data.error){apiErr=results[i].value.data.error}" +
              "else if(results[i].value.data.ballot){ballots[results[i].value.party]=results[i].value.data.ballot}" +
            "}else{apiErr=results[i].reason?results[i].reason.message:'Request failed'}" +
          "}" +
          "if(Object.keys(ballots).length===0){expErrors[llmKey]=apiErr||'Generation failed';render();return}" +
          "var estOutputTokens=Math.ceil(totalChars/4);" +
          "var estInputTokens=Math.ceil(estOutputTokens*1.5);" +
          "var rates=EXP_COST[llmKey]||EXP_COST.claude;" +
          "expCosts[llmKey]=((estInputTokens*rates.input)+(estOutputTokens*rates.output))/1000000;" +
          "expResults[llmKey]=ballots;" +
          "render()" +
        "}).catch(function(err){" +
          "expLoading[llmKey]=false;expErrors[llmKey]=err.message||'Request failed';render()" +
        "})" +
      "})(toGen[gj])" +
    "}" +
  "}",

  "function computeExpAnalysis(claudeBallot,challengerBallot,challengerKey){" +
    "var result={totalItems:0,agreements:0,disagreements:0,agreePct:0,raceResults:[],propResults:[]," +
      "claudeStats:{avgConfidence:0,avgReasoningLen:0,avgMatchFactors:0,strongCount:0,goodCount:0,bestCount:0}," +
      "challengerStats:{avgConfidence:0,avgReasoningLen:0,avgMatchFactors:0,strongCount:0,goodCount:0,bestCount:0}," +
      "verdict:''};" +
    "if(!claudeBallot||!challengerBallot)return result;" +
    // Compare races
    "var cRaces=claudeBallot.races||[];var chRaces=challengerBallot.races||[];" +
    "var confVal=function(c){if(c==='Strong Match')return 3;if(c==='Good Match')return 2;if(c==='Best Available')return 1;if(c==='Symbolic Race')return 0;return 1};" +
    "var cConfSum=0,cConfN=0,cReasonSum=0,cReasonN=0,cMfSum=0,cMfN=0;" +
    "var chConfSum=0,chConfN=0,chReasonSum=0,chReasonN=0,chMfSum=0,chMfN=0;" +
    "for(var i=0;i<cRaces.length;i++){" +
      "var cr=cRaces[i];" +
      "if(!cr.isContested)continue;" +
      "var active=cr.candidates?cr.candidates.filter(function(c){return !c.withdrawn}):[];" +
      "if(active.length<2)continue;" +
      // Find matching race in challenger
      "var chR=null;for(var j=0;j<chRaces.length;j++){if(chRaces[j].office===cr.office&&chRaces[j].district===cr.district){chR=chRaces[j];break}}" +
      "if(!chR)continue;" +
      "var cRec=cr.recommendation;var chRec=chR.recommendation;" +
      "if(!cRec||!chRec)continue;" +
      "result.totalItems++;" +
      "var agree=cRec.candidateName===chRec.candidateName;" +
      "if(agree)result.agreements++;else result.disagreements++;" +
      // Stats
      "if(cRec.confidence){cConfSum+=confVal(cRec.confidence);cConfN++;" +
        "if(cRec.confidence==='Strong Match')result.claudeStats.strongCount++;" +
        "else if(cRec.confidence==='Good Match')result.claudeStats.goodCount++;" +
        "else result.claudeStats.bestCount++}" +
      "if(chRec.confidence){chConfSum+=confVal(chRec.confidence);chConfN++;" +
        "if(chRec.confidence==='Strong Match')result.challengerStats.strongCount++;" +
        "else if(chRec.confidence==='Good Match')result.challengerStats.goodCount++;" +
        "else result.challengerStats.bestCount++}" +
      "if(cRec.reasoning){cReasonSum+=cRec.reasoning.length;cReasonN++}" +
      "if(chRec.reasoning){chReasonSum+=chRec.reasoning.length;chReasonN++}" +
      "if(cRec.matchFactors){cMfSum+=cRec.matchFactors.length;cMfN++}" +
      "if(chRec.matchFactors){chMfSum+=chRec.matchFactors.length;chMfN++}" +
      "result.raceResults.push({office:cr.office,district:cr.district,claudeRec:cRec.candidateName,challengerRec:chRec.candidateName," +
        "agree:agree,claudeConfidence:cRec.confidence,challengerConfidence:chRec.confidence," +
        "claudeReasoning:cRec.reasoning||'',challengerReasoning:chRec.reasoning||''," +
        "claudeMatchFactors:cRec.matchFactors||[],challengerMatchFactors:chRec.matchFactors||[]})" +
    "}" +
    // Compare propositions
    "var cProps=claudeBallot.propositions||[];var chProps=challengerBallot.propositions||[];" +
    "for(var pi=0;pi<cProps.length;pi++){" +
      "var cp=cProps[pi];" +
      "var chP=null;for(var pj=0;pj<chProps.length;pj++){if(chProps[pj].number===cp.number){chP=chProps[pj];break}}" +
      "if(!chP)continue;" +
      "if(!cp.recommendation||!chP.recommendation)continue;" +
      "result.totalItems++;" +
      "var pAgree=cp.recommendation===chP.recommendation;" +
      "if(pAgree)result.agreements++;else result.disagreements++;" +
      "result.propResults.push({number:cp.number,title:cp.title,claudeRec:cp.recommendation,challengerRec:chP.recommendation," +
        "agree:pAgree,claudeReasoning:cp.reasoning||'',challengerReasoning:chP.reasoning||''})" +
    "}" +
    // Compute averages
    "result.claudeStats.avgConfidence=cConfN?Math.round(cConfSum/cConfN*10)/10:0;" +
    "result.challengerStats.avgConfidence=chConfN?Math.round(chConfSum/chConfN*10)/10:0;" +
    "result.claudeStats.avgReasoningLen=cReasonN?Math.round(cReasonSum/cReasonN):0;" +
    "result.challengerStats.avgReasoningLen=chReasonN?Math.round(chReasonSum/chReasonN):0;" +
    "result.claudeStats.avgMatchFactors=cMfN?Math.round(cMfSum/cMfN*10)/10:0;" +
    "result.challengerStats.avgMatchFactors=chMfN?Math.round(chMfSum/chMfN*10)/10:0;" +
    "result.agreePct=result.totalItems>0?Math.round(result.agreements/result.totalItems*100):0;" +
    // Generate verdict
    "var cName=LLM_META[challengerKey]?LLM_META[challengerKey].name:challengerKey;" +
    "if(result.agreePct>=90)result.verdict=t('Near-perfect agreement.')+' '+cName+' '+t('produces very similar recommendations to Claude.');" +
    "else if(result.agreePct>=80)result.verdict=t('Strong agreement.')+' '+t('Disagreements are mostly in lower-profile races.');" +
    "else if(result.agreePct>=60)result.verdict=t('Moderate agreement.')+' '+result.disagreements+' '+t('Significant differences \\u2014 review carefully before switching.');" +
    "else result.verdict=t('Low agreement.')+' '+cName+' '+t('makes substantially different recommendations.');" +
    "return result" +
  "}",

  "function renderExperiment(){" +
    "var h='<button class=\"back-btn\" data-action=\"nav\" data-to=\"#/ballot\">&larr; '+t('Back to My Ballot')+'</button>';" +
    "h+='<div class=\"exp-header\">';" +
    "h+='<h2>\\u{1F9EA} '+t('LLM Experiment')+'</h2>';" +
    "h+='<p>'+t('Compare Claude against another AI model')+'</p>';" +
    "h+='</div>';" +
    // Model selector + run button
    "h+='<div class=\"exp-controls\">';" +
    "h+='<span style=\"font-size:14px;font-weight:600\">Claude vs</span>';" +
    "h+='<select class=\"exp-select\" data-action=\"exp-select-model\">';" +
    "var expGroups=[" +
      "{label:'Anthropic',models:['claude-haiku','claude-opus']}," +
      "{label:'OpenAI',models:['chatgpt','gpt-4o-mini']}," +
      "{label:'Google',models:['gemini','gemini-pro']}," +
      "{label:'xAI',models:['grok']}" +
    "];" +
    "for(var gi=0;gi<expGroups.length;gi++){" +
      "var grp=expGroups[gi];" +
      "h+='<optgroup label=\"'+grp.label+'\">';" +
      "for(var ci=0;ci<grp.models.length;ci++){" +
        "var ck=grp.models[ci];var cm=LLM_META[ck];" +
        "h+='<option value=\"'+ck+'\"'+(expChallenger===ck?' selected':'')+'>'+cm.icon+' '+cm.name+'</option>'" +
      "}" +
      "h+='</optgroup>'" +
    "}" +
    "h+='</select>';" +
    "var anyLoading=expLoading.claude||expLoading[expChallenger];" +
    "h+='<button class=\"btn btn-primary\" data-action=\"exp-run\"'+(anyLoading?' disabled':'')+'>'+t('Run Experiment')+'</button>';" +
    "h+='</div>';" +
    // Loading state
    "if(anyLoading){" +
      "h+='<div class=\"card\">';" +
      "if(expLoading.claude){h+='<div class=\"exp-loading\"><span class=\"llm-spinner\"></span>'+t('Generating with')+' Claude...</div>'}" +
      "if(expLoading[expChallenger]){var chName=LLM_META[expChallenger]?LLM_META[expChallenger].name:expChallenger;h+='<div class=\"exp-loading\"><span class=\"llm-spinner\"></span>'+t('Generating with')+' '+chName+'...</div>'}" +
      "h+='</div>'" +
    "}" +
    // Error state
    "if(expErrors.claude){h+='<div class=\"card\" style=\"color:var(--bad)\">Claude: '+esc(expErrors.claude)+'</div>'}" +
    "if(expErrors[expChallenger]){h+='<div class=\"card\" style=\"color:var(--bad)\">'+esc(LLM_META[expChallenger].name)+': '+esc(expErrors[expChallenger])+'</div>'}" +
    // Check if we have both results
    "var hasBoth=expResults.claude&&expResults[expChallenger];" +
    "if(!hasBoth&&!anyLoading){" +
      "h+='<div class=\"card\" style=\"text-align:center;color:var(--text2);font-size:14px\">';" +
      "h+='<p>'+t('Run Experiment')+' to compare Claude against '+(LLM_META[expChallenger]?LLM_META[expChallenger].name:expChallenger)+'.</p>';" +
      "if(S.repBallot||S.demBallot){h+='<p style=\"font-size:12px;margin-top:8px\">Your existing Claude ballot will be used as the baseline.</p>'}" +
      "h+='</div>';return h" +
    "}" +
    "if(!hasBoth)return h;" +
    // Compute analysis
    "var party=S.selectedParty||'republican';" +
    "var cBal=expResults.claude[party];var chBal=expResults[expChallenger][party];" +
    "if(!cBal||!chBal){h+='<div class=\"card\"><p>No ballot data for selected party.</p></div>';return h}" +
    "var analysis=computeExpAnalysis(cBal,chBal,expChallenger);" +
    "var chMeta=LLM_META[expChallenger];" +
    // Party label
    "var partyLabel=party==='democrat'?t('Democratic'):t('Republican');" +
    "h+='<div style=\"text-align:center;margin-bottom:12px;font-size:13px;color:var(--text2)\">Comparing '+partyLabel+' Primary ballots</div>';" +
    // Verdict card
    "var verdictColor=analysis.agreePct>=80?'var(--ok)':analysis.agreePct>=60?'var(--warn)':'var(--bad)';" +
    "h+='<div class=\"card exp-verdict\">';" +
    "h+='<div class=\"exp-verdict-pct\" style=\"color:'+verdictColor+'\">'+analysis.agreePct+'%</div>';" +
    "h+='<div class=\"exp-verdict-label\">'+t('Agreement')+'</div>';" +
    "h+='<div style=\"display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:14px\">';" +
    "h+='<span style=\"color:var(--ok)\">\\u2713 '+analysis.agreements+' '+t('Agree')+'</span>';" +
    "h+='<span style=\"color:var(--warn)\">\\u2717 '+analysis.disagreements+' '+t('Disagree')+'</span>';" +
    "h+='</div>';" +
    "h+='<div class=\"exp-verdict-detail\">'+esc(analysis.verdict)+'</div>';" +
    "h+='</div>';" +
    // Speed & Cost comparison
    "if(expTiming.claude||expTiming[expChallenger]){" +
      "var cTime=expTiming.claude;var chTime=expTiming[expChallenger];" +
      "var cCost=expCosts.claude;var chCost=expCosts[expChallenger];" +
      "var maxTime=Math.max(cTime||0,chTime||0)||1;" +
      "h+='<div class=\"section-head\">'+t('Speed & Cost')+'</div>';" +
      "h+='<div class=\"exp-perf\">';" +
      // Speed card
      "h+='<div class=\"exp-perf-card\">';" +
      "h+='<h4>\\u23F1\\uFE0F '+t('Response Time')+'</h4>';" +
      "if(cTime){" +
        "h+='<div class=\"exp-perf-row\">';" +
        "h+='<span class=\"exp-perf-name\" style=\"color:#7B61FF\">Claude</span>';" +
        "h+='<div class=\"exp-perf-bar\"><div class=\"exp-perf-bar-fill\" style=\"width:'+Math.round((cTime/maxTime)*100)+'%;background:#7B61FF\"></div></div>';" +
        "h+='<span class=\"exp-perf-time\">'+cTime.toFixed(1)+'s</span>';" +
        "h+='</div>'" +
      "}" +
      "if(chTime){" +
        "h+='<div class=\"exp-perf-row\">';" +
        "h+='<span class=\"exp-perf-name\" style=\"color:'+chMeta.color+'\">'+chMeta.name+'</span>';" +
        "h+='<div class=\"exp-perf-bar\"><div class=\"exp-perf-bar-fill\" style=\"width:'+Math.round((chTime/maxTime)*100)+'%;background:'+chMeta.color+'\"></div></div>';" +
        "h+='<span class=\"exp-perf-time\">'+chTime.toFixed(1)+'s</span>';" +
        "h+='</div>'" +
      "}" +
      "if(cTime&&chTime){" +
        "var faster=cTime<chTime?'Claude':chMeta.name;" +
        "var diff2=Math.abs(cTime-chTime);" +
        "h+='<div class=\"exp-perf-sub\">'+faster+' '+t('was')+' '+diff2.toFixed(1)+'s '+t('faster')+'</div>'" +
      "}" +
      "h+='</div>';" +
      // Cost card
      "h+='<div class=\"exp-perf-card\">';" +
      "h+='<h4>\\u{1F4B0} '+t('Est. Cost')+'</h4>';" +
      "if(cCost!==undefined){h+='<div class=\"exp-perf-row\"><span class=\"exp-perf-name\" style=\"color:#7B61FF\">Claude</span><span class=\"exp-perf-time\">$'+cCost.toFixed(3)+'</span></div>'}" +
      "if(chCost!==undefined){h+='<div class=\"exp-perf-row\"><span class=\"exp-perf-name\" style=\"color:'+chMeta.color+'\">'+chMeta.name+'</span><span class=\"exp-perf-time\">$'+chCost.toFixed(3)+'</span></div>'}" +
      "if(cCost!==undefined&&chCost!==undefined){" +
        "var cheaper=cCost<chCost?'Claude':chMeta.name;" +
        "var ratio=cCost<chCost?(chCost/cCost):(cCost/chCost);" +
        "h+='<div class=\"exp-perf-sub\">'+cheaper+' ~'+ratio.toFixed(1)+'x '+t('cheaper')+'</div>'" +
      "}" +
      "h+='</div>';" +
      "h+='</div>';" +
      "h+='<div style=\"text-align:center;font-size:11px;color:var(--text2);margin-bottom:16px\">'+t('Cost estimated from response size (~4 chars/token)')+'</div>'" +
    "}" +
    // Stats cards
    "h+='<div class=\"exp-stats\">';" +
    // Confidence comparison
    "h+='<div class=\"exp-stat-card\">';" +
    "h+='<h4>'+t('Confidence Comparison')+'</h4>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Avg Confidence')+'</span><span>'+analysis.claudeStats.avgConfidence+' / '+analysis.challengerStats.avgConfidence+'</span></div>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Strong Match')+'</span><span>'+analysis.claudeStats.strongCount+' / '+analysis.challengerStats.strongCount+'</span></div>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Good Match')+'</span><span>'+analysis.claudeStats.goodCount+' / '+analysis.challengerStats.goodCount+'</span></div>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Best Available')+'</span><span>'+analysis.claudeStats.bestCount+' / '+analysis.challengerStats.bestCount+'</span></div>';" +
    "h+='</div>';" +
    // Reasoning quality
    "h+='<div class=\"exp-stat-card\">';" +
    "h+='<h4>'+t('Reasoning Quality')+'</h4>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Avg reasoning length')+'</span><span>'+analysis.claudeStats.avgReasoningLen+' / '+analysis.challengerStats.avgReasoningLen+'</span></div>';" +
    "h+='<div class=\"exp-stat-row\"><span class=\"exp-stat-label\">'+t('Avg match factors')+'</span><span>'+analysis.claudeStats.avgMatchFactors+' / '+analysis.challengerStats.avgMatchFactors+'</span></div>';" +
    "h+='</div>';" +
    "h+='</div>';" +
    // Stat card legend
    "h+='<div style=\"text-align:center;font-size:11px;color:var(--text2);margin-bottom:16px\">Claude / '+chMeta.name+'</div>';" +
    // Race-by-race results
    "h+='<div class=\"section-head\">'+t('Race-by-Race Results')+'</div>';" +
    "for(var ri=0;ri<analysis.raceResults.length;ri++){" +
      "var rr=analysis.raceResults[ri];" +
      "var rrId='exp-race-'+ri;" +
      "var isOpen=!!expExpandedRows[rrId];" +
      "h+='<div class=\"exp-race-item '+(rr.agree?'exp-agree':'exp-disagree')+'\" data-action=\"exp-toggle-detail\" data-id=\"'+rrId+'\">';" +
      "h+='<div class=\"exp-race-top\">';" +
      "h+='<span class=\"exp-race-icon\">'+(rr.agree?'\\u2705':'\\u26A0\\uFE0F')+'</span>';" +
      "h+='<span class=\"exp-race-office\">'+esc(rr.office)+(rr.district?' \\u2014 '+esc(rr.district):'')+'</span>';" +
      "if(rr.agree){h+='<span class=\"exp-race-name\">'+esc(rr.claudeRec)+'</span>'}" +
      "h+='</div>';" +
      // Expandable detail for disagreements (or any row if tapped)
      "if(isOpen){" +
        "h+='<div class=\"exp-detail\"><div class=\"exp-side\">';" +
        "h+='<div class=\"exp-side-col\"><h5 style=\"color:#7B61FF\">Claude</h5>';" +
        "h+='<div class=\"exp-pick\">'+esc(rr.claudeRec)+'</div>';" +
        "if(rr.claudeConfidence){h+=confBadge(rr.claudeConfidence)}" +
        "h+='<div class=\"exp-reason\">'+esc(rr.claudeReasoning.slice(0,200))+(rr.claudeReasoning.length>200?'...':'')+'</div>';" +
        "h+='</div>';" +
        "h+='<div class=\"exp-side-col\"><h5 style=\"color:'+chMeta.color+'\">'+chMeta.name+'</h5>';" +
        "h+='<div class=\"exp-pick\">'+esc(rr.challengerRec)+'</div>';" +
        "if(rr.challengerConfidence){h+=confBadge(rr.challengerConfidence)}" +
        "h+='<div class=\"exp-reason\">'+esc(rr.challengerReasoning.slice(0,200))+(rr.challengerReasoning.length>200?'...':'')+'</div>';" +
        "h+='</div>';" +
        "h+='</div></div>'" +
      "}" +
      "h+='</div>'" +
    "}" +
    // Propositions
    "if(analysis.propResults.length){" +
      "h+='<div class=\"section-head\">'+t('Propositions')+'</div>';" +
      "for(var pi2=0;pi2<analysis.propResults.length;pi2++){" +
        "var pr=analysis.propResults[pi2];" +
        "var prId='exp-prop-'+pi2;" +
        "var pOpen=!!expExpandedRows[prId];" +
        "h+='<div class=\"exp-race-item '+(pr.agree?'exp-agree':'exp-disagree')+'\" data-action=\"exp-toggle-detail\" data-id=\"'+prId+'\">';" +
        "h+='<div class=\"exp-race-top\">';" +
        "h+='<span class=\"exp-race-icon\">'+(pr.agree?'\\u2705':'\\u26A0\\uFE0F')+'</span>';" +
        "h+='<span class=\"exp-race-office\">Prop '+pr.number+': '+esc(pr.title)+'</span>';" +
        "if(pr.agree){h+='<span class=\"exp-race-name\">'+esc(pr.claudeRec)+'</span>'}" +
        "h+='</div>';" +
        "if(pOpen){" +
          "h+='<div class=\"exp-detail\"><div class=\"exp-side\">';" +
          "h+='<div class=\"exp-side-col\"><h5 style=\"color:#7B61FF\">Claude</h5>';" +
          "h+='<div class=\"exp-pick\">'+esc(pr.claudeRec)+'</div>';" +
          "h+='<div class=\"exp-reason\">'+esc(pr.claudeReasoning.slice(0,200))+(pr.claudeReasoning.length>200?'...':'')+'</div>';" +
          "h+='</div>';" +
          "h+='<div class=\"exp-side-col\"><h5 style=\"color:'+chMeta.color+'\">'+chMeta.name+'</h5>';" +
          "h+='<div class=\"exp-pick\">'+esc(pr.challengerRec)+'</div>';" +
          "h+='<div class=\"exp-reason\">'+esc(pr.challengerReasoning.slice(0,200))+(pr.challengerReasoning.length>200?'...':'')+'</div>';" +
          "h+='</div>';" +
          "h+='</div></div>'" +
        "}" +
        "h+='</div>'" +
      "}" +
    "}" +
    "return h;" +
  "}",

  // ============ VOTE INFO VIEW ============
  "function accSection(id,icon,title,body){" +
    "var open=S.expanded[id];" +
    "var h='<div class=\"acc\">';" +
    "h+='<div class=\"acc-head\" data-action=\"toggle-expand\" data-id=\"'+id+'\" role=\"button\" aria-expanded=\"'+!!open+'\" tabindex=\"0\">';" +
    "h+='<span class=\"acc-icon\" aria-hidden=\"true\">'+icon+'</span>';" +
    "h+=esc(title);" +
    "h+='<span class=\"acc-chev'+(open?' open':'')+'\" aria-hidden=\"true\">&#x25BC;</span>';" +
    "h+='</div>';" +
    "if(open){h+='<div class=\"acc-body\">'+body+'</div>'}" +
    "h+='</div>';" +
    "return h;" +
  "}",

  "function renderVoteInfo(){" +
    "var election=new Date(2026,2,3);" + // March 3, 2026
    "var now=new Date();" +
    "var diff=Math.ceil((election-now)/(1000*60*60*24));" +
    "var h='<h2 style=\"font-size:22px;font-weight:800;margin-bottom:16px\"><span style=\"color:#fff\">&starf;</span> '+t('Voting Info')+'</h2>';" +
    // Countdown card
    "h+='<div class=\"card\" style=\"text-align:center;margin-bottom:16px\">';" +
    "var isEarly=diff>0;" +
    "if(S.hasVoted){" +
      "h+='<div class=\"voted-sticker\">';" +
      // Inline waving flag SVG
      "h+='<svg width=\"70\" height=\"42\" viewBox=\"0 0 70 42\" style=\"margin-top:'+(isEarly?'6':'12')+'px\">';" +
      // 13 stripes
      "var sH=42/13;for(var si=0;si<13;si++){" +
        "var sc=si%2===0?'#CC1919':'#fff';" +
        "h+='<rect x=\"0\" y=\"'+(si*sH)+'\" width=\"70\" height=\"'+(sH+.5)+'\" fill=\"'+sc+'\"/>';" +
      "}" +
      // Canton (blue rectangle with stars)
      "h+='<rect x=\"0\" y=\"0\" width=\"29\" height=\"23\" fill=\"#0D2738\"/>';" +
      // 12 stars (3 rows x 4 cols)
      "for(var sr=0;sr<3;sr++){for(var sc2=0;sc2<4;sc2++){" +
        "var sx=4+sc2*6.5;var sy=4+sr*6.5;" +
        "h+='<circle cx=\"'+sx+'\" cy=\"'+sy+'\" r=\"1.5\" fill=\"#fff\"/>';" +
      "}}" +
      "h+='</svg>';" +
      "h+='<div class=\"voted-text\">'+t('I Voted')+'</div>';" +
      "if(isEarly)h+='<div class=\"voted-early\">'+t('Early!')+'</div>';" +
      "h+='</div>';" +
      "h+='<div class=\"countdown-label\" style=\"margin-bottom:8px\">'+t('You voted! Thank you for participating in democracy.')+'</div>';" +
      "h+='<button class=\"btn btn-secondary\" style=\"font-size:13px\" data-action=\"share-voted\">\u{1F4E4} '+t('Share')+'</button>';" +
      "h+='<div style=\"margin-top:8px\"><a href=\"#\" data-action=\"unvote\" style=\"font-size:13px;color:var(--text2)\">'+t('Actually, I didn\\u2019t vote yet.')+'</a></div>'" +
    "}else if(diff>0){" +
      "h+='<div class=\"countdown\">'+diff+'</div><div class=\"countdown-label\">'+t('days until Election Day')+'</div>';" +
      "h+='<button class=\"btn btn-primary\" style=\"margin-top:12px\" data-action=\"mark-voted\">\u{1F5F3}\u{FE0F} '+t('I Voted!')+'</button>'" +
    "}else if(diff===0){" +
      "h+='<div class=\"countdown\">\u{1F5F3}\u{FE0F}</div><div class=\"countdown-label\">'+t('Today is Election Day!')+'</div>';" +
      "h+='<button class=\"btn btn-primary\" style=\"margin-top:12px\" data-action=\"mark-voted\">\u{1F5F3}\u{FE0F} '+t('I Voted!')+'</button>'" +
    "}else{" +
      "h+='<div class=\"countdown\">\u2705</div><div class=\"countdown-label\">'+t('Election Day has passed')+'</div>';" +
      "h+='<button class=\"btn btn-primary\" style=\"margin-top:12px\" data-action=\"mark-voted\">\u{1F5F3}\u{FE0F} '+t('I Voted!')+'</button>'" +
    "}" +
    "h+='</div>';" +

    // Polling location card — dynamic based on county info
    "var ci=S.countyInfo;" +
    "h+='<div class=\"card\" style=\"margin-bottom:16px\">';" +
    "h+='<div style=\"font-size:16px;font-weight:700;margin-bottom:4px\">'+t('Find Your Polling Location')+'</div>';" +
    "if(ci&&ci.voteCenters){" +
      "h+='<p style=\"font-size:14px;color:var(--text2);margin-bottom:12px\">'+t('Your county uses Vote Centers \\u2014 you can vote at any location.')+'</p>'" +
    "}else{" +
      "h+='<p style=\"font-size:14px;color:var(--text2);margin-bottom:12px\">'+t('Find your polling location for Election Day.')+'</p>'" +
    "}" +
    "h+='<div style=\"display:flex;gap:8px;flex-wrap:wrap\">';" +
    "if(ci&&ci.electionsWebsite){" +
      "h+='<a href=\"'+esc(ci.electionsWebsite)+'\" target=\"_blank\" class=\"btn btn-primary\" style=\"flex:1;text-align:center;text-decoration:none\">'+t('Find Locations')+' &rarr;</a>'" +
    "}else{" +
      "h+='<a href=\"https://votetexas.gov/voting/where.html\" target=\"_blank\" class=\"btn btn-primary\" style=\"flex:1;text-align:center;text-decoration:none\">'+t('Find Locations')+' &rarr;</a>'" +
    "}" +
    "h+='</div></div>';" +

    // Key Dates accordion
    "var kdBody='';" +
    "var regPast=new Date(2026,1,2)<now;" + // Feb 2
    "var mailDate=new Date(2026,1,20);" + // Feb 20
    "var mailPast=mailDate<now;" +
    "var evStart=new Date(2026,1,17);" + // Feb 17
    "var evEnd=new Date(2026,1,27);" + // Feb 27
    "var evActive=now>=evStart&&now<=evEnd;" +
    "kdBody+='<div class=\"vi-row\"><span'+(regPast?' class=\"vi-strike\"':'')+'>'+t('Registration deadline')+'</span><span'+(regPast?' class=\"vi-strike\"':'')+'>Feb 2, 2026</span></div>';" +
    "kdBody+='<div class=\"vi-row\"><span'+(mailPast?' class=\"vi-strike\"':'')+'>'+t('Mail ballot application deadline')+'</span><span'+(mailPast?' class=\"vi-strike\"':'')+'>Feb 20, 2026</span></div>';" +
    "kdBody+='<div class=\"vi-row\"><span'+(evActive?' class=\"vi-highlight\"':'')+'>'+t('Early voting')+'</span><span'+(evActive?' class=\"vi-highlight\"':'')+'>Feb 17 \\u2013 27, 2026</span></div>';" +
    "kdBody+='<div class=\"vi-row\"><span class=\"vi-highlight\">'+t('Election Day')+'</span><span class=\"vi-highlight\">'+t('March 3, 2026')+'</span></div>';" +
    "h+=accSection('vi-dates','\u{1F4C5}',t('Key Dates'),kdBody);" +

    // Early Voting accordion — dynamic from county info
    "var evBody='';" +
    "if(ci&&ci.earlyVoting&&ci.earlyVoting.periods){" +
      "for(var evi=0;evi<ci.earlyVoting.periods.length;evi++){" +
        "var evp=ci.earlyVoting.periods[evi];" +
        "var isLast=evi===ci.earlyVoting.periods.length-1;" +
        "evBody+='<div class=\"vi-row\"><span'+(isLast?' style=\"font-weight:600\"':'')+'>'+esc(evp.dates)+'</span><span'+(isLast?' style=\"font-weight:600\"':'')+'>'+esc(evp.hours)+'</span></div>'" +
      "}" +
    "}else{" +
      "evBody+='<div class=\"vi-row\" style=\"flex-direction:column;gap:4px\"><span>Feb 17 \\u2013 27, 2026</span></div>';" +
      "evBody+='<p style=\"font-size:13px;color:var(--text2);margin-top:8px\">'+t('Early voting hours vary by county. Contact your county elections office for specific hours and locations.')+'</p>'" +
    "}" +
    "evBody+='<p style=\"font-size:13px;color:var(--text2);margin-top:8px\">'+t('Vote at any early voting location in your county.')+'</p>';" +
    "h+=accSection('vi-early','\u{1F552}',t('Early Voting'),evBody);" +

    // Election Day accordion — dynamic from county info
    "var edBody='';" +
    "var edHours=(ci&&ci.electionDay&&ci.electionDay.hours)?ci.electionDay.hours:'7:00 AM \\u2013 7:00 PM';" +
    "edBody+='<div class=\"vi-row\"><span style=\"font-weight:600\">'+t('Hours')+'</span><span style=\"font-weight:600\">'+esc(edHours)+'</span></div>';" +
    "if(ci&&ci.voteCenters){" +
      "edBody+='<p style=\"margin-top:8px\">'+t('Vote at any Vote Center in your county.')+'</p>'" +
    "}" +
    "edBody+='<p style=\"margin-top:8px;padding:10px;background:rgba(33,89,143,.06);border-radius:var(--rs);font-size:13px\">" +
      "<b>'+t('Open Primary:')+'</b> '+t('Texas has open primaries \\u2014 tell the poll worker which party\\u2019s primary you want. You can only vote in one.')+'</p>';" +
    "if(ci&&ci.electionDay&&ci.electionDay.locationUrl){" +
      "edBody+='<div style=\"margin-top:10px\"><a href=\"'+esc(ci.electionDay.locationUrl)+'\" target=\"_blank\" style=\"font-size:14px;font-weight:600;color:var(--blue)\">'+t('Find Election Day locations')+' &rarr;</a></div>'" +
    "}else{" +
      "edBody+='<div style=\"margin-top:10px\"><a href=\"https://votetexas.gov/voting/where.html\" target=\"_blank\" style=\"font-size:14px;font-weight:600;color:var(--blue)\">'+t('Find Election Day locations')+' &rarr;</a></div>'" +
    "}" +
    "h+=accSection('vi-eday','\u{1F3DB}\u{FE0F}',t('Election Day'),edBody);" +

    // Voter ID accordion
    "var idBody='';" +
    "var ids=['Texas driver\\u2019s license or DPS ID','Texas Election ID Certificate (EIC)','Texas concealed handgun license','U.S. military ID with photo','U.S. citizenship certificate with photo','U.S. passport (book or card)'];" +
    "for(var i=0;i<ids.length;i++){idBody+='<div class=\"vi-check\"><span class=\"vi-check-icon\">\\u2705</span>'+t(ids[i])+'</div>'}" +
    "idBody+='<p style=\"font-size:13px;color:var(--text2);margin-top:8px\">'+t('Expired IDs accepted if expired less than 4 years. No expiration limit for voters 70+.')+'</p>';" +
    "h+=accSection('vi-id','\u{1F4CB}',t('Voter ID'),idBody);" +

    // What to Bring accordion
    "var bringBody='';" +
    "bringBody+='<div style=\"padding:8px 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)\">';" +
    "bringBody+='<span>\u{1F4CB} '+t('Photo ID')+'</span><span class=\"vi-badge vi-badge-req\">'+t('REQUIRED')+'</span></div>';" +
    "bringBody+='<div style=\"padding:8px 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)\">';" +
    "bringBody+='<span>\u{1F4C4} '+t('Your cheat sheet (printed)')+'</span><span class=\"vi-badge vi-badge-opt\">'+t('Optional')+'</span></div>';" +
    "bringBody+='<div style=\"padding:8px 0;display:flex;justify-content:space-between;align-items:center\">';" +
    "bringBody+='<span>\u{1F4B3} '+t('Voter registration card')+'</span><span class=\"vi-badge vi-badge-opt\">'+t('Optional')+'</span></div>';" +
    "if(ci&&ci.phoneInBooth===false){" +
      "bringBody+='<div class=\"vi-warn\"><span style=\"font-size:18px\">\u26A0\u{FE0F}</span><div><b>'+t('Note:')+'</b> '+t('You may NOT use your phone in the voting booth. Print your cheat sheet before you go!')+'</div></div>'" +
    "}else{" +
      "bringBody+='<div class=\"vi-warn\"><span style=\"font-size:18px\">\u26A0\u{FE0F}</span><div>'+t('Check your county\\u2019s phone policy. Some counties prohibit phones in the booth. Print your cheat sheet to be safe!')+'</div></div>'" +
    "}" +
    "h+=accSection('vi-bring','\u{1F6CD}\u{FE0F}',t('What to Bring'),bringBody);" +

    // Resources accordion — dynamic from county info with statewide defaults
    "var resBody='';" +
    "if(ci&&ci.resources){" +
      "for(var ri=0;ri<ci.resources.length;ri++){" +
        "var res=ci.resources[ri];" +
        "resBody+='<div class=\"vi-link\"><a href=\"'+esc(res.url)+'\" target=\"_blank\">'+esc(res.name)+' &rarr;</a></div>'" +
      "}" +
    "}" +
    "resBody+='<div class=\"vi-link\"><a href=\"https://vote411.org\" target=\"_blank\">VOTE411 \\u2014 Personalized ballot &rarr;</a></div>';" +
    "resBody+='<div class=\"vi-link\"><a href=\"https://votetexas.gov\" target=\"_blank\">VoteTexas.gov \\u2014 State info &rarr;</a></div>';" +
    "h+=accSection('vi-res','\u{1F517}',t('Resources'),resBody);" +

    // Volunteer Opportunities accordion — location-specific + statewide
    "var volBody='';" +
    "if(ci&&ci.countyName){" +
      "volBody+='<div class=\"vi-link\"><a href=\"https://www.votetexas.gov/be-an-election-worker/\" target=\"_blank\">'+t('Be an Election Worker')+' \\u2014 '+esc(ci.countyName)+' County &rarr;</a></div>'" +
    "}else{" +
      "volBody+='<div class=\"vi-link\"><a href=\"https://www.votetexas.gov/be-an-election-worker/\" target=\"_blank\">'+t('Be an Election Worker')+' &rarr;</a></div>'" +
    "}" +
    "if(ci&&ci.electionsWebsite){" +
      "volBody+='<div class=\"vi-link\"><a href=\"'+esc(ci.electionsWebsite)+'\" target=\"_blank\">'+esc(ci.countyName)+' '+t('County Elections Office')+' &rarr;</a></div>'" +
    "}" +
    "volBody+='<div class=\"vi-link\"><a href=\"https://lwvtexas.org/volunteer\" target=\"_blank\">'+t('League of Women Voters TX')+' &rarr;</a></div>';" +
    "volBody+='<div class=\"vi-link\"><a href=\"https://www.rockthevote.org/get-involved/\" target=\"_blank\">'+t('Rock the Vote')+' &rarr;</a></div>';" +
    "volBody+='<div class=\"vi-link\"><a href=\"https://texascivilrightsproject.org/\" target=\"_blank\">'+t('Texas Civil Rights Project')+' &rarr;</a></div>';" +
    "volBody+='<p style=\"font-size:13px;color:var(--text2);margin-top:8px\">'+t('Help your neighbors vote! Poll workers, voter registration drives, and ride-to-polls programs need volunteers.')+'</p>';" +
    "h+=accSection('vi-vol','\u{1F91D}',t('Volunteer Opportunities'),volBody);" +

    // Contact card — dynamic from county info
    "h+='<div class=\"card\" style=\"margin-top:16px\">';" +
    "if(ci&&ci.countyName){" +
      "h+='<div style=\"font-size:16px;font-weight:700;margin-bottom:8px\">'+esc(ci.countyName)+' '+t('County Elections')+'</div>'" +
    "}else{" +
      "h+='<div style=\"font-size:16px;font-weight:700;margin-bottom:8px\">'+t('County Elections')+'</div>'" +
    "}" +
    "if(ci&&ci.electionsPhone){" +
      "h+='<div style=\"padding:6px 0\"><a href=\"tel:'+esc(ci.electionsPhone.replace(/[^0-9+]/g,''))+'\" style=\"font-size:15px;color:var(--blue);font-weight:600\">\u{1F4DE} '+esc(ci.electionsPhone)+'</a></div>'" +
    "}" +
    "if(ci&&ci.electionsWebsite){" +
      "var domain=ci.electionsWebsite.replace(/^https?:\\/\\//,'').replace(/\\/$/,'');" +
      "h+='<div style=\"padding:6px 0\"><a href=\"'+esc(ci.electionsWebsite)+'\" target=\"_blank\" style=\"font-size:15px;color:var(--blue);font-weight:600\">\u{1F310} '+esc(domain)+'</a></div>'" +
    "}else{" +
      "h+='<div style=\"padding:6px 0\"><a href=\"https://votetexas.gov\" target=\"_blank\" style=\"font-size:15px;color:var(--blue);font-weight:600\">\u{1F310} votetexas.gov</a></div>'" +
    "}" +
    "h+='</div>';" +

    // IMPORTANT: Keep footer in sync with index.js generateFooter() — FOOTER_SYNC_PWA
    "h+='<div style=\"text-align:center;padding:24px 0 8px;font-size:13px;color:var(--text2)\">';" +
    "h+='<a href=\"/\" style=\"color:var(--text2)\">'+t('Texas Votes')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/how-it-works\" target=\"_blank\" style=\"color:var(--text2)\">'+t('How It Works')+'</a>';" +
    "h+=' &middot; ';" +
    "h+='<a href=\"/privacy\" target=\"_blank\" style=\"color:var(--text2)\">'+t('Privacy')+'</a>';" +
    "h+='<br><span style=\"margin-top:6px;display:inline-block\"><span style=\"color:#fff\">&starf;</span> '+t('Built in Texas')+' &middot; <a href=\"mailto:howdy@txvotes.app\" style=\"color:var(--text2)\">howdy@txvotes.app</a></span>';" +
    "h+='</div>';" +
    "return h;" +
  "}",

  // ============ EVENT HANDLING ============
  "document.getElementById('app').addEventListener('click',function(e){" +
    "var el=e.target.closest('[data-action]');if(!el)return;e.preventDefault();" +
    "var action=el.dataset.action;" +
    "if(action==='start'){S.phase=1;S._iStart=Date.now();trk('interview_start');save();render()}" +
    "else if(action==='back'){" +
      "if(S.phase===4&&S.ddIndex>0){S.ddIndex--;render()}" +
      "else if(S.phase===5&&S.ddQuestions.length>0){S.phase=4;S.ddIndex=S.ddQuestions.length-1;render()}" +
      "else{S.phase=Math.max(0,S.phase-1);render()}" +
    "}" +
    "else if(action==='next'){" +
      "if(S.phase===2){" +
        "S.ddQuestions=[];S.ddIndex=0;" +
        "var topN=S.issues.slice(0,5);for(var i=0;i<topN.length;i++){if(DEEP_DIVES[topN[i]])S.ddQuestions.push(DEEP_DIVES[topN[i]])}" +
      "}" +
      "if(S.phase===6){var ta=document.getElementById('freeform-input');S.freeform=ta?ta.value.trim():S.freeform}" +
      "S.phase++;trk('interview_phase',{d1:'phase_'+S.phase});render()" +
    "}" +
    "else if(action==='sort-up'){" +
      "var key=el.dataset.key;var idx=parseInt(el.dataset.idx);" +
      "if(idx>0){var tmp=S[key][idx-1];S[key][idx-1]=S[key][idx];S[key][idx]=tmp;render()}" +
    "}" +
    "else if(action==='sort-down'){" +
      "var key=el.dataset.key;var idx=parseInt(el.dataset.idx);" +
      "var maxIdx=key==='issues'?(S._pickedIssues||0)-1:key==='qualities'?(S._pickedQuals||0)-1:S[key].length-1;" +
      "if(idx<maxIdx){var tmp=S[key][idx+1];S[key][idx+1]=S[key][idx];S[key][idx]=tmp;render()}" +
    "}" +
    "else if(action==='pick-issue'){" +
      "var idx=parseInt(el.dataset.idx);var n=S._pickedIssues||0;" +
      "if(n<5){var item=S.issues.splice(idx,1)[0];S.issues.splice(n,0,item);S._pickedIssues=n+1;render()}" +
    "}" +
    "else if(action==='unpick-issue'){" +
      "var idx=parseInt(el.dataset.idx);var n=S._pickedIssues||0;" +
      "if(idx<n){var item=S.issues.splice(idx,1)[0];S.issues.splice(n-1,0,item);S._pickedIssues=n-1;render()}" +
    "}" +
    "else if(action==='pick-quality'){" +
      "var idx=parseInt(el.dataset.idx);var n=S._pickedQuals||0;" +
      "if(n<3){var item=S.qualities.splice(idx,1)[0];S.qualities.splice(n,0,item);S._pickedQuals=n+1;render()}" +
    "}" +
    "else if(action==='unpick-quality'){" +
      "var idx=parseInt(el.dataset.idx);var n=S._pickedQuals||0;" +
      "if(idx<n){var item=S.qualities.splice(idx,1)[0];S.qualities.splice(n-1,0,item);S._pickedQuals=n-1;render()}" +
    "}" +
    "else if(action==='secret-tap'){secretToneRevealed=true;render()}" +
    "" +
    "else if(action==='select-tone'){S.readingLevel=parseInt(el.dataset.value)||1;trk('tone_select',{d1:''+S.readingLevel,v:S.readingLevel});render()}" +
    "else if(action==='select-spectrum'){S.spectrum=el.dataset.value;render()}" +
    "else if(action==='select-dd'){" +
      "var dd=S.ddQuestions[S.ddIndex];" +
      "S.policyViews[dd.q]=el.dataset.value;render()" +
    "}" +
    "else if(action==='next-dd'){" +
      "if(S.ddIndex<S.ddQuestions.length-1){S.ddIndex++;render()}" +
      "else{S.phase=5;render()}" +
    "}" +
    "else if(action==='skip-address'){S.address={street:'',city:'',state:'TX',zip:''};buildGuide()}" +
    "else if(action==='geolocate'){geolocate()}" +
    "else if(action==='retry'){buildGuide()}" +
    "else if(action==='set-party'){S.selectedParty=el.dataset.value;trk('party_switch',{d1:el.dataset.value});save();render()}" +
    "else if(action==='toggle-expand'){" +
      "var id=el.dataset.id;S.expanded[id]=!S.expanded[id];render()" +
    "}" +
    "else if(action==='nav'){location.hash=el.dataset.to}" +
    "else if(action==='reset'){" +
      "if(confirm(t('Start over? This will erase your profile and recommendations.'))){" +
        "S.phase=0;S.issues=[];S._pickedIssues=0;S.spectrum=null;S.policyViews={};S.qualities=[];S._pickedQuals=0;S.freeform='';S.readingLevel=1;" +
        "S.address={street:'',city:'',state:'TX',zip:''};S.ddIndex=0;S.ddQuestions=[];S.countyInfo=null;S.countyBallotAvailable=null;" +
        "S.repBallot=null;S.demBallot=null;S.selectedParty='republican';" +
        "S.guideComplete=false;S.summary=null;S.districts=null;S.expanded={};S.addressError=null;S.verifyingAddress=false;S.electionExpired=false;S.overrides={};" +
        "shuffledSpectrum=null;shuffledDD={};" +
        "try{localStorage.removeItem('tx_votes_profile');localStorage.removeItem('tx_votes_ballot_republican');" +
        "localStorage.removeItem('tx_votes_ballot_democrat');localStorage.removeItem('tx_votes_selected_party');localStorage.removeItem('tx_votes_has_voted');localStorage.removeItem('tx_votes_sharePromptSeen');" +
        "localStorage.removeItem('tx_votes_data_updated_republican');localStorage.removeItem('tx_votes_data_updated_democrat');" +
        "localStorage.removeItem('tx_votes_llm_compare_claude');localStorage.removeItem('tx_votes_llm_compare_chatgpt');localStorage.removeItem('tx_votes_llm_compare_gemini');localStorage.removeItem('tx_votes_llm_compare_grok');" +
        "localStorage.removeItem('tx_votes_election_date');localStorage.removeItem('tx_votes_post_election_dismissed');" +
        "localStorage.removeItem('tx_votes_overrides');" +
        "localStorage.removeItem('atx_votes_profile');localStorage.removeItem('atx_votes_ballot_republican');" +
        "localStorage.removeItem('atx_votes_ballot_democrat');localStorage.removeItem('atx_votes_selected_party');localStorage.removeItem('atx_votes_has_voted')}catch(e){}" +
        "location.hash='#/';render()" +
      "}" +
    "}" +
    "else if(action==='dismiss-disclaimer'){S.disclaimerDismissed=true;render()}" +
    "else if(action==='dismiss-novelty-warning'){S._noveltyBannerDismissed=true;render()}" +
    "else if(action==='show-novelty-warning'){S._noveltyBannerDismissed=false;render()}" +
    "else if(action==='switch-to-standard'){S.readingLevel=3;S._noveltyBannerDismissed=false;save();reprocessGuide()}" +
    "else if(action==='refresh-ballots'){S.staleBallot=false;refreshBallots();render()}" +
    "else if(action==='election-clear'){" +
      "S.phase=0;S.issues=[];S._pickedIssues=0;S.spectrum=null;S.policyViews={};S.qualities=[];S._pickedQuals=0;S.freeform='';S.readingLevel=1;" +
      "S.address={street:'',city:'',state:'TX',zip:''};S.ddIndex=0;S.ddQuestions=[];S.countyInfo=null;S.countyBallotAvailable=null;" +
      "S.repBallot=null;S.demBallot=null;S.selectedParty='republican';" +
      "S.guideComplete=false;S.summary=null;S.districts=null;S.expanded={};S.addressError=null;S.verifyingAddress=false;S.electionExpired=false;S.overrides={};" +
      "shuffledSpectrum=null;shuffledDD={};" +
      "try{localStorage.removeItem('tx_votes_profile');localStorage.removeItem('tx_votes_ballot_republican');" +
      "localStorage.removeItem('tx_votes_ballot_democrat');localStorage.removeItem('tx_votes_selected_party');localStorage.removeItem('tx_votes_has_voted');localStorage.removeItem('tx_votes_sharePromptSeen');" +
      "localStorage.removeItem('tx_votes_data_updated_republican');localStorage.removeItem('tx_votes_data_updated_democrat');" +
      "localStorage.removeItem('tx_votes_llm_compare_claude');localStorage.removeItem('tx_votes_llm_compare_chatgpt');localStorage.removeItem('tx_votes_llm_compare_gemini');localStorage.removeItem('tx_votes_llm_compare_grok');" +
      "localStorage.removeItem('tx_votes_election_date');localStorage.removeItem('tx_votes_post_election_dismissed');" +
      "localStorage.removeItem('tx_votes_overrides');" +
      "localStorage.removeItem('atx_votes_profile');localStorage.removeItem('atx_votes_ballot_republican');" +
      "localStorage.removeItem('atx_votes_ballot_democrat');localStorage.removeItem('atx_votes_selected_party');localStorage.removeItem('atx_votes_has_voted')}catch(e){}" +
      "location.hash='#/';render()" +
    "}" +
    "else if(action==='election-keep'){" +
      "S.electionExpired=false;" +
      "try{localStorage.setItem('tx_votes_post_election_dismissed','1')}catch(e){}" +
      "render()" +
    "}" +
    "else if(action==='set-lang'){trk('lang_toggle',{d1:el.dataset.value});setLang(el.dataset.value)}" +
    "else if(action==='mark-voted'){S.hasVoted=true;trk('i_voted');save();render();launchConfetti();setTimeout(showSharePrompt,1500)}" +
    "else if(action==='unvote'){S.hasVoted=false;save();render()}" +
    "else if(action==='share-voted'){trk('share_voted');shareStickerImage()}" +
    "else if(action==='do-print'){trk('cheatsheet_print');window.print()}" +
    "else if(action==='share'){shareGuide()}" +
    "else if(action==='share-app'){trk('share_app');shareApp()}" +
    "else if(action==='share-race'){trk('share_race',{d1:el.dataset.idx});shareRace(parseInt(el.dataset.idx))}" +
    "else if(action==='report-issue'){trk('report_issue',{d1:el.dataset.candidate});showReportModal(el.dataset.candidate,el.dataset.race)}" +
    "else if(action==='override-candidate'){" +
      "var _oIdx=parseInt(el.dataset.raceIdx);" +
      "var _oName=el.dataset.candidate;" +
      "var _ob=getBallot();if(_ob){" +
        "var _oRaces=_ob.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
        "var _oRace=_oRaces[_oIdx];" +
        "if(_oRace){" +
          "setOverride(_oRace,_oName);" +
          "trk('override_set',{d1:getRaceKey(_oRace),d2:_oName});" +
          "render()" +
        "}" +
      "}" +
    "}" +
    "else if(action==='undo-override'){" +
      "var _uIdx=parseInt(el.dataset.raceIdx);" +
      "var _ub=getBallot();if(_ub){" +
        "var _uRaces=_ub.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
        "var _uRace=_uRaces[_uIdx];" +
        "if(_uRace){" +
          "trk('override_undo',{d1:getRaceKey(_uRace)});" +
          "clearOverride(_uRace);" +
          "render()" +
        "}" +
      "}" +
    "}" +
    "else if(action==='submit-override-feedback'){" +
      "var _fIdx=parseInt(el.dataset.raceIdx);" +
      "var _fb=getBallot();if(_fb){" +
        "var _fRaces=_fb.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
        "var _fRace=_fRaces[_fIdx];" +
        "if(_fRace){" +
          "var _fOv=getOverride(_fRace);" +
          "var _fTa=document.getElementById('override-reason');" +
          "var _fReason=_fTa?_fTa.value.trim():'';" +
          "if(_fOv){" +
            "var _fKey=getRaceKey(_fRace);" +
            "_fOv.reason=_fReason;" +
            "_fOv.reasonSubmitted=true;" +
            "save();" +
            "trk('override_feedback',{d1:_fKey});" +
            "fetch('/app/api/override-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({party:S.selectedParty,race:_fKey,from:_fOv.originalCandidate,to:_fOv.chosenCandidate,reason:_fReason,lang:LANG})}).catch(function(){});" +
            "render()" +
          "}" +
        "}" +
      "}" +
    "}" +
    "else if(action==='dismiss-override-feedback'){" +
      "var _dIdx=parseInt(el.dataset.raceIdx);" +
      "var _db=getBallot();if(_db){" +
        "var _dRaces=_db.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
        "var _dRace=_dRaces[_dIdx];" +
        "if(_dRace){" +
          "var _dOv=getOverride(_dRace);" +
          "if(_dOv){_dOv.reasonSubmitted=true;save();render()}" +
        "}" +
      "}" +
    "}" +
    "else if(action==='share-profile'){trk('share_profile');shareProfileSummary()}" +
    "else if(action==='regen-summary'){regenerateSummary()}" +
    "else if(action==='reprocess-guide'){reprocessGuide()}" +
    "else if(action==='debug-tap'){debugTaps++;if(debugTaps>=5){debugTaps=0;location.hash='#/debug/compare'}}" +
    "else if(action==='secret-tap'){clearTimeout(secretTapTimer);secretTaps++;secretTapTimer=setTimeout(function(){secretTaps=0},3000);if(secretTaps>=7){secretTaps=0;showSecretMenu()}}" +
    "else if(action==='llm-generate'){llmGenerate(el.dataset.llm)}" +
    "else if(action==='llm-tab'){llmCompareTab=el.dataset.tab;render()}" +
    "else if(action==='llm-clear'){" +
      "llmCompareResults={};llmCompareErrors={};llmCompareLoading={};" +
      "try{var lks=['claude','chatgpt','gemini','grok'];for(var lci=0;lci<lks.length;lci++)localStorage.removeItem('tx_votes_llm_compare_'+lks[lci])}catch(e){}" +
      "render()" +
    "}" +
    "else if(action==='exp-run'){expGenerate()}" +
    "else if(action==='exp-toggle-detail'){var eid2=el.closest('[data-id]').dataset.id;expExpandedRows[eid2]=!expExpandedRows[eid2];render()}" +
  "});",

  // Select handler for experiment model picker
  "document.getElementById('app').addEventListener('change',function(e){" +
    "var el=e.target;if(!el.dataset||!el.dataset.action)return;" +
    "if(el.dataset.action==='exp-select-model'){expChallenger=el.value;expExpandedRows={};render()}" +
  "});",

  // Range input handler for reading level slider
  "document.getElementById('app').addEventListener('input',function(e){" +
    "var el=e.target;if(!el.dataset||!el.dataset.action)return;" +
    "if(el.dataset.action==='set-reading-level'){var rlMap=[1,3,4];if(eeCowboy)rlMap.push(7);S.readingLevel=rlMap[parseInt(el.value)]||3;save();render()}" +
  "});",

  // Tab bar click handler (tabs live outside #app)
  "document.getElementById('tabs').addEventListener('click',function(e){" +
    "var el=e.target.closest('[data-action]');if(!el)return;e.preventDefault();" +
    "if(el.dataset.action==='nav'){location.hash=el.dataset.to}" +
  "});",
  "document.getElementById('topnav').addEventListener('click',function(e){" +
    "var el=e.target.closest('[data-action]');if(!el)return;e.preventDefault();" +
    "if(el.dataset.action==='nav'){location.hash=el.dataset.to}" +
  "});",

  // Keyboard handler: Enter/Space activates [data-action] elements (accessibility)
  "document.addEventListener('keydown',function(e){" +
    "if(e.key==='Enter'||e.key===' '){" +
      "var el=e.target.closest('[data-action]');if(!el||el.tagName==='BUTTON'||el.tagName==='A'||el.tagName==='INPUT')return;" +
      "e.preventDefault();el.click()" +
    "}" +
  "});",

  // Easter egg: type 'yeehaw' or 'cowboy' on profile/ballot page to unlock Texas Cowboy (tone 7)
  "document.addEventListener('keydown',function(e){" +
    "if(eeCowboy)return;" +
    "var h=location.hash||'#/ballot';if(h!=='#/profile'&&h!=='#/ballot')return;" +
    "if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;" +
    "clearTimeout(yeehawTimer);" +
    "yeehawBuf+=e.key.toLowerCase();" +
    "yeehawTimer=setTimeout(function(){yeehawBuf=''},2000);" +
    "if(yeehawBuf.indexOf('yeehaw')!==-1||yeehawBuf.indexOf('cowboy')!==-1){" +
      "eeCowboy=true;localStorage.setItem('tx_votes_ee_cowboy','1');" +
      "yeehawBuf='';emojiBurst('\\uD83E\\uDD20',25);" +
      "if(navigator.vibrate)navigator.vibrate([100,50,100,50,200]);" +
      "S.readingLevel=7;save();reprocessGuide()" +
    "}" +
  "});",

  // Form submit for address — validate then verify via geocoder
  "document.getElementById('app').addEventListener('submit',function(e){" +
    "e.preventDefault();" +
    "var form=e.target;" +
    "var st=form.street.value.trim();" +
    "" +
    "var zip=form.zip.value.trim();" +
    // Client-side validation
    "if(!st){S.addressError=t('Please enter your street address.');render();return}" +
    "if(!/^\\d{5}$/.test(zip)){S.addressError=t('Please enter a valid 5-digit ZIP code.');render();return}" +
    "S.address={street:st,city:form.city.value||'',state:'TX',zip:zip};" +
    "S.addressError=null;S.verifyingAddress=true;render();" +
    // Verify address via districts API
    "fetch('/app/api/districts',{method:'POST',headers:{'Content-Type':'application/json'}," +
      "body:JSON.stringify({street:st,city:form.city.value||'',state:'TX',zip:zip})})" +
    ".then(function(r){" +
      "if(r.ok)return r.json();" +
      "if(r.status===404)throw new Error('not_found');" +
      "throw new Error('unavailable')" +
    "})" +
    ".then(function(d){S.districts=d;S.verifyingAddress=false;" +
      "if(d.countyFips){fetch('/app/api/county-info?fips='+d.countyFips).then(function(r){return r.ok?r.json():null}).then(function(ci){if(ci)S.countyInfo=ci}).catch(function(){})}" +
      "buildGuide()})" +
    ".catch(function(err){" +
      "S.verifyingAddress=false;" +
      "if(err.message==='not_found'){" +
        "S.addressError=t('We couldn\\u2019t find that address. Please check your street and ZIP, or skip to see all races.');render()" +
      "}else{" +
        // Census geocoder unavailable — proceed without districts
        "S.addressError=null;S.districts=null;buildGuide()" +
      "}" +
    "});" +
  "});",

  // Hash change
  "window.addEventListener('hashchange',render);",

  // ============ BUILD GUIDE ============
  "function lm(key){return t(key)}",
  // ============ SSE STREAMING GUIDE ============
  "function handleGuideEvent(party,type,data){" +
    "if(type==='meta'){" +
      "if(party==='republican'){S.repBallot=data.ballot;S.repCountyBallotAvailable=data.countyBallotAvailable}" +
      "else{S.demBallot=data.ballot;S.demCountyBallotAvailable=data.countyBallotAvailable}" +
    "}" +
    "else if(type==='profile'){" +
      "if(!S.summary)S.summary=data.profileSummary;" +
      "if(party==='republican')S._repSummary=data.profileSummary;" +
      "else S._demSummary=data.profileSummary" +
    "}" +
    "else if(type==='race'){" +
      // Merge the streamed race into the ballot
      "var b=party==='republican'?S.repBallot:S.demBallot;" +
      "if(b&&b.races){" +
        "for(var i=0;i<b.races.length;i++){" +
          "if(b.races[i].office===data.office&&(b.races[i].district||null)===(data.district||null)){" +
            "if(data.candidates)b.races[i].candidates=data.candidates;" +
            "b.races[i].recommendation=data.recommendation;" +
            "b.races[i]._streamed=true;" +
            "break" +
          "}" +
        "}" +
      "}" +
    "}" +
    "else if(type==='proposition'){" +
      "var bp=party==='republican'?S.repBallot:S.demBallot;" +
      "if(bp&&bp.propositions){" +
        "for(var j=0;j<bp.propositions.length;j++){" +
          "if(bp.propositions[j].number===data.number){" +
            "bp.propositions[j].recommendation=data.recommendation;" +
            "bp.propositions[j].reasoning=data.reasoning;" +
            "bp.propositions[j].caveats=data.caveats;" +
            "if(data.confidence)bp.propositions[j].confidence=data.confidence;" +
            "bp.propositions[j]._streamed=true;" +
            "break" +
          "}" +
        "}" +
      "}" +
    "}" +
    "else if(type==='complete'){" +
      "if(party==='republican'){S.repDataUpdatedAt=data.dataUpdatedAt;S._repBalance=data.balanceScore}" +
      "else{S.demDataUpdatedAt=data.dataUpdatedAt;S._demBalance=data.balanceScore}" +
    "}" +
  "}",

  "function streamGuide(party,profile,districts,cFips,llm){" +
    "return new Promise(function(resolve,reject){" +
      "var body=JSON.stringify({party:party,profile:profile,districts:districts,lang:LANG,countyFips:cFips,readingLevel:S.readingLevel,llm:llm});" +
      "fetch('/app/api/guide-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:body}).then(function(res){" +
        "if(!res.ok||!res.body){" +
          // Fallback to non-streaming endpoint
          "fetch('/app/api/guide',{method:'POST',headers:{'Content-Type':'application/json'},body:body}).then(function(r){return r.json()}).then(resolve).catch(reject);return" +
        "}" +
        "var reader=res.body.getReader();" +
        "var decoder=new TextDecoder();" +
        "var buf='';" +
        "var done=false;" +
        "var hasError=false;" +
        "function read(){" +
          "reader.read().then(function(result){" +
            "if(result.done){" +
              "if(!done)resolve({_streamed:true,party:party});" +
              "return" +
            "}" +
            "buf+=decoder.decode(result.value,{stream:true});" +
            // Parse SSE events from buffer
            "var parts=buf.split('\\n\\n');" +
            "buf=parts.pop()||'';" +
            "for(var i=0;i<parts.length;i++){" +
              "var evt=parts[i];" +
              "var evType=null,evData=null;" +
              "var lines=evt.split('\\n');" +
              "for(var j=0;j<lines.length;j++){" +
                "if(lines[j].indexOf('event: ')===0)evType=lines[j].slice(7);" +
                "else if(lines[j].indexOf('data: ')===0)evData=lines[j].slice(6)" +
              "}" +
              "if(evType&&evData){" +
                "try{var parsed=JSON.parse(evData)}catch(e){continue}" +
                "if(evType==='error'){hasError=true;resolve({error:parsed.error,party:party});return}" +
                "handleGuideEvent(party,evType,parsed);" +
                // Transition to ballot view on first meta event
                "if(evType==='meta'&&S.isLoading){" +
                  "S._streaming=true;S.isLoading=false;S.guideComplete=true;" +
                  // Set default selected party
                  "if(!S.selectedParty||S.selectedParty!==party){" +
                    "if(S.spectrum==='Progressive'||S.spectrum==='Liberal')S.selectedParty='democrat';" +
                    "else if(S.spectrum==='Conservative'||S.spectrum==='Libertarian')S.selectedParty='republican';" +
                    "else S.selectedParty=party" +
                  "}" +
                  "location.hash='#/ballot'" +
                "}" +
                "render()" +
              "}" +
            "}" +
            "if(!hasError)read()" +
          "}).catch(function(err){if(!done)reject(err)})" +
        "}" +
        "read()" +
      "}).catch(reject)" +
    "})" +
  "}",

  "function buildGuide(){" +
    "trk('interview_complete',{d1:''+S.readingLevel,d2:S.spectrum,ms:Date.now()-(S._iStart||Date.now())});" +
    "trk('guide_start');" +
    "S.phase=8;S.error=null;S.isLoading=true;S._streaming=false;render();" +
    "doGuide();" +
  "}",

  "async function doGuide(){" +
    "try{" +
      // Build profile object for API
      "var profile={" +
        "topIssues:S.issues," +
        "politicalSpectrum:S.spectrum||'Moderate'," +
        "policyViews:S.policyViews," +
        "candidateQualities:S.qualities," +
        "freeform:S.freeform||null" +
      "};" +
      // Infer party order
      "var demFirst=false;" +
      "if(S.spectrum==='Progressive'||S.spectrum==='Liberal')demFirst=true;" +
      "else if(S.spectrum==='Moderate'||S.spectrum==='Independent / Issue-by-Issue')demFirst=Math.random()<0.5;" +
      "var cFips=S.districts&&S.districts.countyFips?S.districts.countyFips:null;" +
      "var _llm=window._llmOverride||null;" +
      // Use streaming for both parties in parallel
      "var repP=streamGuide('republican',profile,S.districts,cFips,_llm);" +
      "var demP=streamGuide('democrat',profile,S.districts,cFips,_llm);" +
      "var results=await Promise.allSettled([repP,demP]);" +
      "var repResult=results[0].status==='fulfilled'?results[0].value:null;" +
      "var demResult=results[1].status==='fulfilled'?results[1].value:null;" +
      // Store county ballot availability
      "if(S.repCountyBallotAvailable!==undefined)S.countyBallotAvailable=S.repCountyBallotAvailable;" +
      "else if(S.demCountyBallotAvailable!==undefined)S.countyBallotAvailable=S.demCountyBallotAvailable;" +
      // Handle both failing
      "if(!S.repBallot&&!S.demBallot){" +
        "var _errMsg='Failed to generate recommendations. Please try again.';" +
        "var _apiErr=(repResult&&repResult.error)||(demResult&&demResult.error)||null;" +
        "if(_apiErr)_errMsg+=' ('+_apiErr+')';" +
        "S.error=_errMsg;S.isLoading=false;S._streaming=false;" +
        "render();return" +
      "}" +
      // Set summary from inferred party (streaming may have already set S.summary)
      "if(!S.summary){" +
        "S.summary=(demFirst?S._demSummary:S._repSummary)||S._repSummary||S._demSummary||null" +
      "}" +
      // Set default party if not already set by streaming
      "if(!S.selectedParty||(!S.repBallot&&S.selectedParty==='republican')||(!S.demBallot&&S.selectedParty==='democrat')){" +
        "if(S.spectrum==='Progressive'||S.spectrum==='Liberal')S.selectedParty='democrat';" +
        "else if(S.spectrum==='Conservative'||S.spectrum==='Libertarian')S.selectedParty='republican';" +
        "else S.selectedParty=S.repBallot?'republican':'democrat';" +
        "if(S.selectedParty==='republican'&&!S.repBallot)S.selectedParty='democrat';" +
        "if(S.selectedParty==='democrat'&&!S.demBallot)S.selectedParty='republican'" +
      "}" +
      // Finalize
      "S._streaming=false;S.guideComplete=true;S.isLoading=false;" +
      "trk('guide_complete',{ms:Date.now()-(S._iStart||Date.now())});" +
      "save();" +
      "if(location.hash!=='#/ballot'){location.hash='#/ballot'}" +
      "render();" +
    "}catch(err){" +
      "trk('guide_error',{d1:(err.message||'unknown').slice(0,128)});" +
      "S._streaming=false;S.isLoading=false;" +
      "S.error=err.message||'Something went wrong. Please try again.';render();" +
    "}" +
  "}",

  // ============ SECRET MENU (mobile-friendly easter egg trigger) ============
  "function showSecretMenu(){" +
    "var ov=document.createElement('div');" +
    "ov.id='secret-menu-overlay';" +
    "ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn .2s ease';" +
    "var h='<div style=\"background:var(--card);border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)\">';" +
    "h+='<div style=\"font-size:28px;margin-bottom:8px\">\\uD83E\\uDD2B</div>';" +
    "h+='<h3 style=\"font-size:18px;font-weight:800;margin-bottom:4px\">Secret Menu</h3>';" +
    "h+='<p style=\"font-size:13px;color:var(--text2);margin-bottom:16px\">You found the hidden modes!</p>';" +
    "h+='<div data-action=\"secret-unlock\" data-mode=\"cowboy\" style=\"display:flex;align-items:center;gap:12px;padding:14px;background:rgba(161,98,7,.08);border:2px solid rgba(161,98,7,.3);border-radius:12px;margin-bottom:16px;cursor:pointer;-webkit-tap-highlight-color:transparent\">';" +
    "h+='<span style=\"font-size:32px\">\\uD83E\\uDD20</span>';" +
    "h+='<div style=\"text-align:left\"><div style=\"font-size:15px;font-weight:700\">Texas Cowboy</div><div style=\"font-size:12px;color:var(--text2)\">Howdy partner! A cowboy explains your ballot</div></div>';" +
    "h+='</div>';" +
    "h+='<button data-action=\"secret-close\" style=\"background:none;border:1px solid var(--border);border-radius:8px;padding:8px 20px;font-size:14px;color:var(--text2);cursor:pointer;font-family:inherit\">Never mind</button>';" +
    "h+='</div>';" +
    "ov.innerHTML=h;" +
    "ov.addEventListener('click',function(e){" +
      "var el=e.target.closest('[data-action]');" +
      "if(el){e.preventDefault();var action=el.dataset.action;" +
        "if(action==='secret-unlock'){" +
          "var mode=el.dataset.mode;" +
          "if(mode==='cowboy'){" +
            "if(!eeCowboy){eeCowboy=true;localStorage.setItem('tx_votes_ee_cowboy','1');emojiBurst('\\uD83E\\uDD20',25);if(navigator.vibrate)navigator.vibrate([100,50,100,50,200])}" +
            "S.readingLevel=7;save();ov.remove();render()" +
          "}" +
        "}else if(action==='secret-close'){ov.remove()}" +
      "}else if(e.target===ov){ov.remove()}" +
    "});" +
    "document.body.appendChild(ov)" +
  "}",

  // ============ REPROCESS GUIDE ============
  "function reprocessGuide(){" +
    "S.guideComplete=false;S.phase=8;S.error=null;S.isLoading=true;S._streaming=false;render();" +
    "doGuide();" +
  "}",

  // ============ SHARE PROFILE SUMMARY ============
  "function shareProfileSummary(){" +
    "if(!S.summary)return;" +
    "var text=S.summary+'\\n\\nBuild your own voting guide at txvotes.app';" +
    "if(navigator.share){" +
      "navigator.share({title:t('My Texas Votes Profile'),text:text,url:'https://txvotes.app'}).catch(function(){})" +
    "}else{" +
      "navigator.clipboard.writeText(text).then(function(){alert(t('Copied to clipboard!'))}).catch(function(){alert(text)})" +
    "}" +
  "}",

  // ============ REGENERATE SUMMARY ============
  "function regenerateSummary(){" +
    "S.regenerating=true;render();" +
    "var profile={topIssues:S.issues,politicalSpectrum:S.spectrum,candidateQualities:S.qualities,policyViews:S.policyViews,freeform:S.freeform||null};" +
    "fetch('/app/api/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:profile,lang:LANG,readingLevel:S.readingLevel,llm:window._llmOverride||null})})" +
    ".then(function(r){return r.json()})" +
    ".then(function(d){" +
      "if(d.error)throw new Error(d.error);" +
      "S.summary=d.summary;S.regenerating=false;save();render()" +
    "})" +
    ".catch(function(e){" +
      "S.regenerating=false;render();" +
      "alert(t('Could not regenerate summary. Please try again.'))" +
    "})" +
  "}",

  // ============ SHARE ============
  "function shareGuide(){" +
    "var b=getBallot();if(!b)return;" +
    "var lines=['Texas Votes \\u2014 My Voting Guide','Build yours at txvotes.app',''];" +
    "var races=b.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)}).filter(function(r){return r.isContested&&r.recommendation});" +
    "for(var i=0;i<races.length;i++){" +
      "var r=races[i];" +
      "lines.push(r.office+(r.district?' \\u2014 '+r.district:'')+': '+r.recommendation.candidateName)" +
    "}" +
    "if(b.propositions&&b.propositions.length){" +
      "lines.push('');lines.push('Propositions:');" +
      "for(var i=0;i<b.propositions.length;i++){" +
        "var p=b.propositions[i];lines.push('Prop '+p.number+': '+p.recommendation)" +
      "}" +
    "}" +
    "" +
    "var text=lines.join('\\n');" +
    "if(navigator.share){" +
      "navigator.share({title:'Texas Votes',text:text}).catch(function(){})" +
    "}else{" +
      "navigator.clipboard.writeText(text).then(function(){alert('Copied to clipboard!')}).catch(function(){alert(text)})" +
    "}" +
  "}",

  // ============ SHARE APP ============
  "function shareApp(){" +
    "var text='The Texas primary is March 3. Get your free personalized voting guide at txvotes.app';" +
    "if(navigator.share){" +
      "navigator.share({title:'Texas Votes',text:text,url:'https://txvotes.app'}).catch(function(){})" +
    "}else{" +
      "navigator.clipboard.writeText(text).then(function(){alert('Copied to clipboard!')}).catch(function(){alert(text)})" +
    "}" +
  "}",

  // ============ SHARE RACE ============
  "function shareRace(idx){" +
    "var b=getBallot();if(!b)return;" +
    "var races=b.races.slice().sort(function(a,b){return sortOrder(a)-sortOrder(b)});" +
    "var race=races[idx];if(!race)return;" +
    "var lines=[race.office+(race.district?' \\u2014 '+race.district:'')];" +
    "if(race.recommendation){" +
      "lines.push('My pick: '+race.recommendation.candidateName);" +
      "if(race.recommendation.reasoning)lines.push(race.recommendation.reasoning)" +
    "}" +
    "lines.push('');lines.push('Build your own voting guide at txvotes.app');" +
    "var text=lines.join('\\n');" +
    "if(navigator.share){" +
      "navigator.share({title:'Texas Votes \\u2014 '+race.office,text:text}).catch(function(){})" +
    "}else{" +
      "navigator.clipboard.writeText(text).then(function(){alert('Copied to clipboard!')}).catch(function(){alert(text)})" +
    "}" +
  "}",

  // ============ REPORT ISSUE ============
  "function showReportModal(candidateName,raceName){" +
    "var d=document.createElement('div');" +
    "d.className='report-overlay';" +
    "d.innerHTML='<div class=\"report-card\">" +
      "<h3>'+t('Report an Issue')+'</h3>" +
      "<p class=\"report-subtext\">'+t('Help us improve. Select the type of issue and add details if you can.')+'</p>" +
      "<div style=\"font-size:13px;color:var(--text2);margin-bottom:12px;padding:8px 10px;background:rgba(128,128,128,.08);border-radius:8px\">" +
        "<strong>'+esc(candidateName)+'</strong> &mdash; '+esc(raceName)+'" +
      "</div>" +
      "<div class=\"report-radio\">" +
        "<label><input type=\"radio\" name=\"report-type\" value=\"incorrect\"> '+t('Incorrect info')+'</label>" +
        "<label><input type=\"radio\" name=\"report-type\" value=\"bias\"> '+t('Perceived bias')+'</label>" +
        "<label><input type=\"radio\" name=\"report-type\" value=\"missing\"> '+t('Missing info')+'</label>" +
        "<label><input type=\"radio\" name=\"report-type\" value=\"other\"> '+t('Other')+'</label>" +
      "</div>" +
      "<textarea id=\"report-details\" placeholder=\"'+esc(t('Describe the issue...'))+'\"></textarea>" +
      "<div class=\"report-actions\">" +
        "<button class=\"btn btn-secondary\" data-action=\"report-cancel\">'+t('Cancel')+'</button>" +
        "<button class=\"btn btn-primary\" data-action=\"report-submit\">'+t('Submit Report')+'</button>" +
      "</div>" +
    "</div>';" +
    "document.body.appendChild(d);" +
    "d.addEventListener('click',function(e){" +
      "var btn=e.target.closest('[data-action]');" +
      "if(btn&&btn.dataset.action==='report-submit'){" +
        "var checked=d.querySelector('input[name=report-type]:checked');" +
        "if(!checked){alert(t('Please select an issue type.'));return}" +
        "var details=d.querySelector('#report-details').value||'';" +
        "var typeLabels={incorrect:t('Incorrect info'),bias:t('Perceived bias'),missing:t('Missing info'),other:t('Other')};" +
        "var subject=encodeURIComponent('Issue Report: '+candidateName+' - '+raceName);" +
        "var body=encodeURIComponent(" +
          "'Candidate: '+candidateName+'\\n'+" +
          "'Race: '+raceName+'\\n'+" +
          "'Issue Type: '+typeLabels[checked.value]+'\\n'+" +
          "'Details: '+(details||'(none)')+'\\n\\n'+" +
          "'Reported from Texas Votes app'" +
        ");" +
        "window.open('mailto:flagged@txvotes.app?subject='+subject+'&body='+body,'_self');" +
        "trk('report_submitted',{d1:checked.value,d2:candidateName});" +
        "d.remove();" +
        "setTimeout(function(){alert(t('Thank you! Your report has been sent.'))},300)" +
      "}else if((btn&&btn.dataset.action==='report-cancel')||e.target===d){" +
        "d.remove()" +
      "}" +
    "})" +
  "}",

  // ============ SHARE STICKER ============
  "function shareStickerImage(){" +
    "var W=440,H=330;" +
    "var c=document.createElement('canvas');c.width=W;c.height=H;" +
    "var ctx=c.getContext('2d');" +
    // White oval background
    "ctx.save();ctx.beginPath();ctx.ellipse(W/2,H/2,W/2-4,H/2-4,0,0,Math.PI*2);ctx.closePath();" +
    "ctx.fillStyle='#fff';ctx.fill();" +
    "ctx.strokeStyle='#0D2738';ctx.lineWidth=4;ctx.stroke();" +
    "ctx.beginPath();ctx.ellipse(W/2,H/2,W/2-1,H/2-1,0,0,Math.PI*2);ctx.closePath();" +
    "ctx.strokeStyle='#CC1919';ctx.lineWidth=3;ctx.stroke();" +
    "ctx.beginPath();ctx.ellipse(W/2,H/2,W/2-4,H/2-4,0,0,Math.PI*2);ctx.closePath();ctx.clip();" +
    // Flag — 13 stripes
    "var fw=140,fh=84,fx=(W-fw)/2,fy=24;" +
    "var sH=fh/13;" +
    "for(var si=0;si<13;si++){" +
      "ctx.fillStyle=si%2===0?'#CC1919':'#fff';" +
      "ctx.fillRect(fx,fy+si*sH,fw,sH+1);" +
    "}" +
    // Canton
    "var cw=58,ch=46;" +
    "ctx.fillStyle='#0D2738';ctx.fillRect(fx,fy,cw,ch);" +
    // Stars (3x4 grid)
    "ctx.fillStyle='#fff';" +
    "for(var sr=0;sr<3;sr++){for(var sc=0;sc<4;sc++){" +
      "ctx.beginPath();ctx.arc(fx+8+sc*13,fy+8+sr*13,3,0,Math.PI*2);ctx.fill();" +
    "}}" +
    // "I Voted" text
    "ctx.fillStyle='#0D2738';ctx.font='bold italic 84px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='top';" +
    "ctx.fillText('I Voted',W/2,fy+fh+8);" +
    // "Early!" text if during early voting
    "var election=new Date(2026,2,3);var now=new Date();var diff=Math.ceil((election-now)/(1000*60*60*24));" +
    "if(diff>0){ctx.fillStyle='#CC1919';ctx.font='bold italic 48px Georgia,serif';ctx.fillText('Early!',W/2,fy+fh+88);}" +
    // "txvotes.app" at bottom
    "ctx.fillStyle='#888';ctx.font='24px -apple-system,sans-serif';ctx.fillText('txvotes.app',W/2,H-40);" +
    "ctx.restore();" +
    // Convert to blob and share
    "c.toBlob(function(blob){" +
      "var vText='I voted in the Texas Primary! \\u{1F5F3}\\uFE0F\\n\\nBuild your personalized voting guide at txvotes.app';" +
      "if(navigator.share&&navigator.canShare){" +
        "var file=new File([blob],'i-voted.png',{type:'image/png'});" +
        "var shareData={title:'I Voted!',text:vText,files:[file]};" +
        "if(navigator.canShare(shareData)){navigator.share(shareData).catch(function(){});return}" +
      "}" +
      // Fallback: text share
      "if(navigator.share){navigator.share({title:'I Voted!',text:vText}).catch(function(){})}" +
      "else{navigator.clipboard.writeText(vText).then(function(){alert('Copied to clipboard!')}).catch(function(){alert(vText)})}" +
    "},'image/png');" +
  "}",


  // ============ CONFETTI BURST (Canvas-based fireworks) ============
  "function launchConfetti(){" +
    "if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;" +
    "var cvs=document.createElement('canvas');" +
    "cvs.className='fw-canvas';" +
    "var dpr=window.devicePixelRatio||1;" +
    "var W=window.innerWidth;var H=window.innerHeight;" +
    "cvs.width=W*dpr;cvs.height=H*dpr;" +
    "cvs.style.width=W+'px';cvs.style.height=H+'px';" +
    "document.body.appendChild(cvs);" +
    "var ctx=cvs.getContext('2d');" +
    "ctx.scale(dpr,dpr);" +
    // Color palettes: patriotic red/white/blue + gold accents
    "var palettes=[" +
      "['#CC1919','#FF4444','#FF6666','#FF8888']," +
      "['#FFFFFF','#E8E8E8','#F0F0F0','#FFD700']," +
      "['#0D2738','#3b82f6','#60A5FA','#93C5FD']," +
      "['#FFD700','#FFA500','#FF6347','#FFE066']," +
      "['#CC1919','#FFFFFF','#3b82f6','#FFD700']" +
    "];" +
    "var gravity=0.12;var friction=0.985;" +
    "var particles=[];var shells=[];var sparkles=[];" +
    "var startTime=Date.now();var duration=4800;" +
    "function rand(a,b){return a+Math.random()*(b-a)}" +
    // Shell: rises from bottom
    "function Shell(x,targetY,delay,pi){" +
      "this.x=x;this.y=H;this.targetY=targetY;this.delay=delay;" +
      "this.palette=palettes[pi%palettes.length];" +
      "this.speed=rand(8,13);this.alive=true;this.launched=false;" +
      "this.trail=[];this.time=0" +
    "}" +
    "Shell.prototype.update=function(){" +
      "if(!this.launched)return;" +
      "this.y-=this.speed;this.speed*=0.98;" +
      "this.trail.push({x:this.x+rand(-1,1),y:this.y,a:0.8,sz:rand(1.5,3)});" +
      "if(this.trail.length>12)this.trail.shift();" +
      "for(var i=0;i<this.trail.length;i++){this.trail[i].a*=0.88;this.trail[i].sz*=0.95}" +
      "if(this.y<=this.targetY||this.speed<2){this.alive=false;this.burst()}" +
    "};" +
    "Shell.prototype.draw=function(){" +
      "if(!this.launched||!this.alive)return;" +
      "for(var i=0;i<this.trail.length;i++){" +
        "var t=this.trail[i];ctx.globalAlpha=t.a;" +
        "ctx.fillStyle=this.palette[0];" +
        "ctx.beginPath();ctx.arc(t.x,t.y,t.sz,0,Math.PI*2);ctx.fill()" +
      "}" +
      "ctx.globalAlpha=1;ctx.fillStyle=this.palette[0];" +
      "ctx.beginPath();ctx.arc(this.x,this.y,2.5,0,Math.PI*2);ctx.fill()" +
    "};" +
    // Burst: creates particles when shell explodes
    "Shell.prototype.burst=function(){" +
      "var count=Math.floor(rand(70,120));" +
      "var burstRadius=rand(3,7);" +
      "var bx=this.x;var by=this.y;var pal=this.palette;" +
      // Initial flash glow
      "sparkles.push({x:bx,y:by,r:10,maxR:rand(60,100),a:0.9,color:pal[0],growth:rand(6,10)});" +
      "for(var i=0;i<count;i++){" +
        "var angle=Math.random()*Math.PI*2;" +
        "var speed=rand(1.5,burstRadius);" +
        // Slight bias toward spherical distribution
        "var r=Math.pow(Math.random(),0.5);" +
        "var vx=Math.cos(angle)*speed*r;" +
        "var vy=Math.sin(angle)*speed*r;" +
        "var c=pal[Math.floor(Math.random()*pal.length)];" +
        "particles.push({" +
          "x:bx,y:by,vx:vx,vy:vy," +
          "color:c,alpha:1,decay:rand(0.012,0.025)," +
          "size:rand(1.5,4),trail:[],twinkle:Math.random()<0.3,twinkleSpeed:rand(0.05,0.15)" +
        "})" +
      "}" +
      // Add some larger slow-moving sparkle particles
      "var sparkCount=Math.floor(rand(8,16));" +
      "for(var j=0;j<sparkCount;j++){" +
        "var sa=Math.random()*Math.PI*2;" +
        "var ss=rand(0.5,2.5);" +
        "particles.push({" +
          "x:bx,y:by,vx:Math.cos(sa)*ss,vy:Math.sin(sa)*ss," +
          "color:'#FFD700',alpha:1,decay:rand(0.008,0.015)," +
          "size:rand(2.5,5),trail:[],twinkle:true,twinkleSpeed:rand(0.08,0.2)" +
        "})" +
      "}" +
    "};" +
    // Particle update with gravity and friction
    "function updateParticles(){" +
      "for(var i=particles.length-1;i>=0;i--){" +
        "var p=particles[i];" +
        "p.trail.push({x:p.x,y:p.y,a:p.alpha*0.5});" +
        "if(p.trail.length>6)p.trail.shift();" +
        "p.vy+=gravity;p.vx*=friction;p.vy*=friction;" +
        "p.x+=p.vx;p.y+=p.vy;" +
        "p.alpha-=p.decay;" +
        "if(p.alpha<=0)particles.splice(i,1)" +
      "}" +
    "}" +
    // Draw particles with trails and twinkle
    "function drawParticles(){" +
      "for(var i=0;i<particles.length;i++){" +
        "var p=particles[i];" +
        // Draw trail
        "for(var j=0;j<p.trail.length;j++){" +
          "var t=p.trail[j];t.a*=0.75;" +
          "ctx.globalAlpha=t.a*0.4;" +
          "ctx.fillStyle=p.color;" +
          "ctx.beginPath();ctx.arc(t.x,t.y,p.size*0.6,0,Math.PI*2);ctx.fill()" +
        "}" +
        // Twinkle effect
        "var alpha=p.alpha;" +
        "if(p.twinkle){alpha*=(0.5+0.5*Math.sin(Date.now()*p.twinkleSpeed))}" +
        "ctx.globalAlpha=alpha;" +
        "ctx.fillStyle=p.color;" +
        "ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();" +
        // Glow effect on brighter particles
        "if(p.size>2.5){" +
          "ctx.globalAlpha=alpha*0.3;" +
          "ctx.beginPath();ctx.arc(p.x,p.y,p.size*2.5,0,Math.PI*2);ctx.fill()" +
        "}" +
      "}" +
    "}" +
    // Sparkle (flash) update and draw
    "function updateSparkles(){" +
      "for(var i=sparkles.length-1;i>=0;i--){" +
        "var s=sparkles[i];" +
        "s.r+=s.growth;s.a-=0.04;" +
        "if(s.a<=0){sparkles.splice(i,1);continue}" +
        "ctx.globalAlpha=s.a*0.25;" +
        "ctx.fillStyle=s.color;" +
        "ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()" +
      "}" +
    "}" +
    // Schedule shells across the full viewport
    "var shellDefs=[" +
      "{d:0,x:W*0.5,y:H*0.25,p:0}," +
      "{d:150,x:W*0.2,y:H*0.3,p:1}," +
      "{d:350,x:W*0.8,y:H*0.2,p:2}," +
      "{d:600,x:W*0.35,y:H*0.15,p:3}," +
      "{d:800,x:W*0.65,y:H*0.28,p:4}," +
      "{d:1000,x:W*0.15,y:H*0.22,p:0}," +
      "{d:1200,x:W*0.85,y:H*0.18,p:2}," +
      "{d:1500,x:W*0.45,y:H*0.12,p:1}," +
      "{d:1700,x:W*0.7,y:H*0.35,p:3}," +
      "{d:1900,x:W*0.3,y:H*0.2,p:4}," +
      "{d:2200,x:W*0.55,y:H*0.15,p:0}," +
      "{d:2500,x:W*0.1,y:H*0.3,p:2}," +
      "{d:2700,x:W*0.9,y:H*0.25,p:1}," +
      "{d:3000,x:W*0.4,y:H*0.1,p:3}," +
      "{d:3200,x:W*0.6,y:H*0.2,p:4}," +
      "{d:3500,x:W*0.5,y:H*0.18,p:0}" +
    "];" +
    "for(var si=0;si<shellDefs.length;si++){" +
      "shells.push(new Shell(shellDefs[si].x,shellDefs[si].y,shellDefs[si].d,shellDefs[si].p))" +
    "}" +
    // Animation loop
    "var rafId;function animate(){" +
      "var elapsed=Date.now()-startTime;" +
      "ctx.clearRect(0,0,W,H);" +
      // Launch shells at their scheduled time
      "for(var i=0;i<shells.length;i++){" +
        "if(!shells[i].launched&&elapsed>=shells[i].delay){shells[i].launched=true}" +
        "if(shells[i].alive&&shells[i].launched){shells[i].update();shells[i].draw()}" +
      "}" +
      "updateParticles();drawParticles();updateSparkles();" +
      "ctx.globalAlpha=1;" +
      // Continue until all particles gone and all shells fired + enough time passed
      "var allDone=elapsed>duration&&particles.length===0&&sparkles.length===0;" +
      "if(allDone){cancelAnimationFrame(rafId);cvs.remove();return}" +
      "rafId=requestAnimationFrame(animate)" +
    "}" +
    "rafId=requestAnimationFrame(animate)" +
  "}",

  // Emoji burst animation for easter egg unlocks
  "function emojiBurst(emoji,count){" +
    "for(var i=0;i<(count||20);i++){" +
      "var el=document.createElement('div');" +
      "el.textContent=emoji;" +
      "el.style.cssText='position:fixed;font-size:'+(40+Math.random()*48)+'px;left:'+Math.random()*100+'vw;top:100vh;z-index:99999;pointer-events:none;animation:emojiFall '+(2+Math.random()*2)+'s ease-out '+(Math.random()*0.5)+'s forwards;';" +
      "document.body.appendChild(el);" +
      "setTimeout(function(){el.remove()},5000)" +
    "}" +
  "}",

  // ============ SHARE PROMPT (post-vote) ============
  "function showSharePrompt(){" +
    "if(localStorage.getItem('tx_votes_sharePromptSeen'))return;" +
    "localStorage.setItem('tx_votes_sharePromptSeen','1');" +
    "var d=document.createElement('div');" +
    "d.id='share-prompt-overlay';" +
    "d.className='share-prompt-overlay';" +
    "d.innerHTML='<div class=\"share-prompt-card\">" +
      "<h3>\\u{1F389} '+t('You did it!')+'</h3>" +
      "<p>'+t('Now help 3 friends do the same. Share Texas Votes with someone who needs help deciding.')+'</p>" +
      "<button class=\"btn btn-primary\" data-action=\"share-app-prompt\" style=\"width:100%\">\\u{1F4E4} '+t('Share Texas Votes')+'</button>" +
      "<button class=\"share-prompt-dismiss\" data-action=\"dismiss-share-prompt\">'+t('Maybe later')+'</button>" +
    "</div>';" +
    "document.body.appendChild(d);" +
    "d.addEventListener('click',function(e){" +
      "var btn=e.target.closest('[data-action]');" +
      "if(btn&&btn.dataset.action==='share-app-prompt'){" +
        "var shareText='I just voted in the Texas Primary! Build your own personalized voting guide at https://txvotes.app';" +
        "if(navigator.share){navigator.share({title:'Texas Votes',text:shareText}).catch(function(){})}" +
        "else{navigator.clipboard.writeText(shareText).then(function(){alert('Copied to clipboard!')}).catch(function(){alert(shareText)})}" +
        "d.remove()" +
      "}else if((btn&&btn.dataset.action==='dismiss-share-prompt')||e.target===d){" +
        "d.remove()" +
      "}" +
    "})" +
  "}",

  // ============ BACKGROUND REFRESH ============
  "function refreshBallots(){" +
    "if(!S.guideComplete)return;" +
    "var parties=[];" +
    "if(S.repBallot)parties.push('republican');" +
    "if(S.demBallot)parties.push('democrat');" +
    "parties.forEach(function(party){" +
      "var bUrl='/app/api/ballot?party='+party;" +
      "if(S.districts&&S.districts.countyFips)bUrl+='&county='+S.districts.countyFips;" +
      "fetch(bUrl).then(function(r){" +
        "if(!r.ok)return null;return r.json()" +
      "}).then(function(remote){" +
        "if(!remote)return;" +
        "var key=party==='republican'?'repBallot':'demBallot';" +
        "var current=S[key];if(!current)return;" +
        "var changed=false;" +
        "for(var ri=0;ri<current.races.length;ri++){" +
          "var cr=current.races[ri];" +
          "var rr=null;" +
          "for(var j=0;j<remote.races.length;j++){" +
            "if(remote.races[j].office===cr.office&&remote.races[j].district===cr.district){rr=remote.races[j];break}" +
          "}" +
          "if(!rr)continue;" +
          "for(var ci=0;ci<cr.candidates.length;ci++){" +
            "var cc=cr.candidates[ci];var rc=null;" +
            "for(var k=0;k<rr.candidates.length;k++){" +
              "if(rr.candidates[k].name===cc.name){rc=rr.candidates[k];break}" +
            "}" +
            "if(!rc)continue;" +
            // Merge factual fields, preserve personalized fields
            "current.races[ri].candidates[ci].endorsements=rc.endorsements;" +
            "current.races[ri].candidates[ci].polling=rc.polling;" +
            "current.races[ri].candidates[ci].fundraising=rc.fundraising;" +
            "current.races[ri].candidates[ci].background=rc.background;" +
            "current.races[ri].candidates[ci].pros=rc.pros;" +
            "current.races[ri].candidates[ci].cons=rc.cons;" +
            "current.races[ri].candidates[ci].keyPositions=rc.keyPositions;" +
            "current.races[ri].candidates[ci].summary=rc.summary;" +
            "changed=true" +
          "}" +
        "}" +
        // Merge new races from remote (e.g. county races added after guide generation)
        "var seenRaces={};" +
        "for(var si=0;si<current.races.length;si++){seenRaces[current.races[si].office+'|'+(current.races[si].district||'')]=true}" +
        "for(var ni=0;ni<remote.races.length;ni++){" +
          "var nr=remote.races[ni];" +
          "if(!seenRaces[nr.office+'|'+(nr.district||'')]){current.races.push(nr);changed=true}" +
        "}" +
        "if(changed){S[key]=current;S.countyBallotAvailable=true;save();render()}" +
      "}).catch(function(){})" +
    "})" +
  "}",

  // ============ INIT ============
  "load();",
  "(function(){if(location.search.indexOf('start=1')!==-1&&S.phase===0){S.phase=1;S._iStart=Date.now();save()}}());",
  "(function(){var m=location.search.match(/tone=(\\d+)/);if(m&&!S.guideComplete){var tn=parseInt(m[1]);S.readingLevel=tn;if(tn===7&&!eeCowboy){eeCowboy=true;localStorage.setItem('tx_votes_ee_cowboy','1')}if(S.phase<2)S.phase=2;save()}}());",
  "(function(){var s=location.search.toLowerCase();var llms=['gemini','grok','chatgpt'];for(var i=0;i<llms.length;i++){if(s.indexOf(llms[i])!==-1){window._llmOverride=llms[i];break}}}());",
  "if(location.search)history.replaceState(null,'',location.pathname+location.hash);",
  "if(!S.guideComplete&&location.hash&&location.hash!=='#/'&&location.hash!=='#/llm-experiment'&&location.hash!=='#/debug/compare')location.hash='#/';",
  "render();",
  "refreshBallots();",
  "if('serviceWorker' in navigator){navigator.serviceWorker.register('/app/sw.js').catch(function(){})}",

  // Track interview abandonment when page is hidden mid-interview
  "document.addEventListener('visibilitychange',function(){" +
    "if(document.visibilityState==='hidden'&&S.phase>0&&S.phase<8&&!S.guideComplete){" +
      "var _ab={event:'interview_abandon',props:{lang:LANG,d1:'phase_'+S.phase,ms:Date.now()-(S._iStart||Date.now())}};" +
      "if(_adminKey)_ab._admin_key=_adminKey;" +
      "navigator.sendBeacon('/app/api/ev',JSON.stringify(_ab))" +
    "}" +
  "});",
].join("\n");

// MARK: - App HTML (must be after CSS and APP_JS)

var APP_HTML =
  '<!DOCTYPE html><html lang="en"><head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "<title>Texas Votes</title>" +
  '<link rel="manifest" href="/app/manifest.json">' +
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">' +
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
  '<link rel="icon" type="image/x-icon" href="/favicon.ico">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
  '<meta name="theme-color" content="#21598e">' +
  '<meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
  '<meta name="description" content="Your personalized voting guide for Texas elections.">' +
  '<meta property="og:title" content="Texas Votes — Your Personalized Voting Guide">' +
  '<meta property="og:description" content="Get a personalized, nonpartisan voting guide for Texas elections in 5 minutes.">' +
  '<meta property="og:type" content="website">' +
  '<meta property="og:url" content="https://txvotes.app/app">' +
  '<meta property="og:site_name" content="Texas Votes">' +
  '<meta property="og:image" content="https://txvotes.app/og-image.png">' +
  '<meta property="og:image:width" content="1200">' +
  '<meta property="og:image:height" content="630">' +
  '<meta property="og:image:type" content="image/png">' +
  '<meta name="twitter:card" content="summary_large_image">' +
  '<meta name="twitter:title" content="Texas Votes — Your Personalized Voting Guide">' +
  '<meta name="twitter:description" content="Get a personalized, nonpartisan voting guide for Texas elections in 5 minutes.">' +
  '<meta name="twitter:image" content="https://txvotes.app/og-image.png">' +
  "<style>" +
  CSS +
  "</style>" +
  "</head><body>" +
  '<a class="skip-link" href="#app">Skip to content</a>' +
  '<div id="topnav" role="navigation" aria-label="Main navigation"></div>' +
  '<main id="app"></main>' +
  '<div id="tabs" role="navigation" aria-label="Tab navigation"></div>' +
  "<script>" +
  APP_JS +
  "</script>" +
  "</body></html>";

export { APP_JS };
