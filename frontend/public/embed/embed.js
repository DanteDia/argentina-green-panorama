(function () {
  "use strict";

  var EMBED_ORIGIN = "__EMBED_ORIGIN__";
  var SELECTOR = "[data-green-panorama-event]";
  var MOUNTED_ATTR = "data-gp-mounted";
  var DEFAULT_HEIGHT = 720;

  var mountedByIframe = new WeakMap();
  var listeners = { ready: [], resize: [], error: [] };

  function emit(name, payload) {
    var handlers = listeners[name];
    if (!handlers) return;
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](payload); } catch (e) { /* swallow user callback errors */ }
    }
  }

  function buildSrc(slug, opts) {
    var qs = [];
    if (opts.theme) qs.push("theme=" + encodeURIComponent(opts.theme));
    if (opts.primary) qs.push("primary=" + encodeURIComponent(opts.primary));
    if (opts.locale) qs.push("locale=" + encodeURIComponent(opts.locale));
    if (opts.autoHeight) qs.push("height=auto");
    var query = qs.length ? "?" + qs.join("&") : "";
    return EMBED_ORIGIN + "/event/" + encodeURIComponent(slug) + "/embed" + query;
  }

  function mount(el, opts) {
    if (!el || el.getAttribute(MOUNTED_ATTR) === "1") return null;
    opts = opts || {};

    var slug = opts.slug || el.getAttribute("data-green-panorama-event") || el.getAttribute("data-slug");
    if (!slug) {
      emit("error", { el: el, message: "Missing slug (data-green-panorama-event)" });
      return null;
    }

    var heightAttr = opts.height != null ? String(opts.height) : el.getAttribute("data-height");
    var autoHeight = heightAttr === "auto";
    var fixedHeight = autoHeight ? null : parseInt(heightAttr, 10) || DEFAULT_HEIGHT;

    var iframe = document.createElement("iframe");
    iframe.src = buildSrc(slug, {
      theme: opts.theme || el.getAttribute("data-theme") || undefined,
      primary: opts.primary || el.getAttribute("data-primary") || undefined,
      locale: opts.locale || el.getAttribute("data-locale") || undefined,
      autoHeight: autoHeight,
    });
    iframe.setAttribute("title", "Green Panorama Event Map");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "origin");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    if (fixedHeight) iframe.style.height = fixedHeight + "px";
    else iframe.style.minHeight = "600px";

    mountedByIframe.set(iframe, { slug: slug, el: el });
    el.appendChild(iframe);
    el.setAttribute(MOUNTED_ATTR, "1");

    return iframe;
  }

  function unmount(el) {
    if (!el) return;
    var iframes = el.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      mountedByIframe.delete(iframes[i]);
      iframes[i].remove();
    }
    el.removeAttribute(MOUNTED_ATTR);
  }

  function scan(root) {
    var container = root || document;
    var nodes = container.querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  function onMessage(e) {
    if (e.origin !== EMBED_ORIGIN) return;
    var data = e.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (data.type.indexOf("gp:") !== 0) return;

    var meta = null;
    var iframe = null;
    var list = document.querySelectorAll("iframe");
    for (var i = 0; i < list.length; i++) {
      if (list[i].contentWindow === e.source) {
        iframe = list[i];
        meta = mountedByIframe.get(iframe);
        break;
      }
    }
    if (!iframe || !meta) return;

    if (data.type === "gp:ready") {
      emit("ready", { slug: meta.slug, iframe: iframe });
      return;
    }
    if (data.type === "gp:resize" && typeof data.height === "number" && data.height > 0) {
      iframe.style.height = Math.ceil(data.height) + "px";
      emit("resize", { slug: meta.slug, iframe: iframe, height: data.height });
      return;
    }
  }

  function init() {
    scan(document);
    if (typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches(SELECTOR)) mount(node);
            if (node.querySelectorAll) {
              var inner = node.querySelectorAll(SELECTOR);
              for (var k = 0; k < inner.length; k++) mount(inner[k]);
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.GreenPanorama = {
    origin: EMBED_ORIGIN,
    mount: mount,
    unmount: unmount,
    scan: scan,
    on: function (name, cb) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(cb);
    },
    off: function (name, cb) {
      var arr = listeners[name];
      if (!arr) return;
      var idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };

  window.addEventListener("message", onMessage);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
