(function () {
  "use strict";

  var CONTEXTS = [
    {
      key: "tenant-a",
      label: "Tenant A user",
      blurb: "A request from a user that belongs to tenant A only.",
      gucSet: true,
      gucValue: "A",
      reason: null,
      result: ["A"]
    },
    {
      key: "tenant-b",
      label: "Tenant B user",
      blurb: "A request from a user that belongs to tenant B only.",
      gucSet: true,
      gucValue: "B",
      reason: null,
      result: ["B"]
    },
    {
      key: "multi",
      label: "Multi-tenant user",
      blurb: "A request from a user that belongs to both tenant A and tenant B (e.g. a freelancer working across both).",
      gucSet: true,
      gucValue: "A,B",
      reason: null,
      result: ["A", "B"]
    },
    {
      key: "admin",
      label: "Admin (bypass)",
      blurb: "An administrative request the middleware intentionally exempts. No tenant context is written.",
      gucSet: false,
      gucValue: null,
      reason: "Middleware leaves the GUC unset. Policy Branch A returns true for every row.",
      result: ["A", "B"]
    },
    {
      key: "job",
      label: "Background job",
      blurb: "A scheduled job running outside any HTTP request. No tenant context to apply.",
      gucSet: false,
      gucValue: null,
      reason: "No request, no middleware ran. The transaction opens with no GUC set.",
      result: ["A", "B"]
    }
  ];

  var EVENTS = [
    { id: 1, tenant_id: "A", name: "spring-summit" },
    { id: 2, tenant_id: "B", name: "winter-fest"   }
  ];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function injectStyles() {
    if (document.getElementById("rls-demo-styles")) return;
    var css = [
      ".rls-demo,.rls-demo *{box-sizing:border-box}",
      ".rls-demo p,.rls-demo pre,.rls-demo table,.rls-demo h4{margin:0;box-shadow:none}",
      ".rls-demo{border:1px solid var(--border-color,#adbac7);border-radius:6px;",
      "padding:18px 20px;margin:24px 0;background:var(--table-background-color,#fafafa);",
      "font:14px/1.5 'Merriweather',serif}",
      ".rls-demo .rls-picker{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}",
      ".rls-demo button.rls-p{font:13px/1 'Merriweather',serif;padding:7px 11px;",
      "border:1px solid var(--border-color,#adbac7);background:var(--background-color,#fff);",
      "color:var(--text-color,#000);cursor:pointer;border-radius:4px}",
      ".rls-demo button.rls-p:hover{border-color:var(--primary-color,#115ca1)}",
      ".rls-demo button.rls-p[aria-pressed=\"true\"]{background:var(--primary-color,#115ca1);",
      "color:#fff;border-color:var(--primary-color,#115ca1)}",
      ".rls-demo .rls-blurb{font-style:italic;color:var(--faded-color,#7b8894);margin:0 0 14px}",
      ".rls-demo .rls-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}",
      "@media (max-width:640px){.rls-demo .rls-cols{grid-template-columns:1fr}}",
      ".rls-demo .rls-card{border:1px solid var(--border-color,#adbac7);border-radius:4px;",
      "padding:11px 13px;background:var(--background-color,#fff)}",
      ".rls-demo .rls-card h4{margin:0 0 8px;font-size:11px;letter-spacing:.1em;",
      "text-transform:uppercase;color:var(--faded-color,#7b8894);font-weight:700}",
      ".rls-demo .rls-sql{background:#1a1612;color:#ece3cd;padding:10px 12px;border-radius:3px;",
      "font-family:'JetBrains Mono','Menlo',monospace;font-size:12px;white-space:pre;overflow-x:auto;line-height:1.55;margin:0}",
      ".rls-demo .rls-sql .k{color:#d8a657}.rls-demo .rls-sql .s{color:#a9b665}",
      ".rls-demo .rls-sql .c{color:#7a6c55;font-style:italic}",
      ".rls-demo .rls-state{margin:10px 0 0;font-family:'JetBrains Mono','Menlo',monospace;font-size:12.5px}",
      ".rls-demo .rls-state .lbl{color:var(--faded-color,#7b8894);margin-right:8px}",
      ".rls-demo .rls-state code{background:var(--code-background-color,#eee);padding:1px 6px;border-radius:3px}",
      ".rls-demo .rls-state .unset{color:var(--faded-color,#7b8894);font-style:italic}",
      ".rls-demo .rls-reason{margin-top:10px;font-size:13px;color:var(--faded-color,#7b8894);font-style:italic;line-height:1.5}",
      ".rls-demo table.rls-rows{border-collapse:collapse;width:100%;margin-top:10px;font-family:'JetBrains Mono','Menlo',monospace;font-size:12.5px}",
      ".rls-demo table.rls-rows th,.rls-demo table.rls-rows td{padding:5px 8px;text-align:left;",
      "border-bottom:1px solid var(--table-border-color,#ddd)}",
      ".rls-demo table.rls-rows th{font-weight:700;color:var(--faded-color,#7b8894);font-size:11px;letter-spacing:.06em;text-transform:uppercase}",
      ".rls-demo table.rls-rows tr.hidden td{opacity:.22;text-decoration:line-through}",
      ".rls-demo .rls-tag{display:inline-block;padding:1px 6px;border-radius:10px;font-size:10.5px;",
      "letter-spacing:.05em;text-transform:uppercase;font-weight:700}",
      ".rls-demo .rls-tag.kept{background:#dff3df;color:#2a7a2a}",
      ".rls-demo .rls-tag.dropped{background:#f5dada;color:#a83232}",
      ".rls-demo .rls-summary{margin-top:10px;font-size:13px;color:var(--text-color,#000)}"
    ].join("");
    var s = document.createElement("style");
    s.id = "rls-demo-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function renderGucPanel(ctx) {
    var card = el("div", { class: "rls-card" });
    card.appendChild(el("h4", { text: "What the middleware writes" }));

    var pre = el("pre", { class: "rls-sql" });
    if (ctx.gucSet) {
      pre.innerHTML =
        '<span class="k">SET LOCAL</span> app.current_tenant = ' +
        '<span class="s">\'' + ctx.gucValue + '\'</span>;';
    } else {
      pre.innerHTML = '<span class="c">-- nothing written; no SET LOCAL is issued</span>';
    }
    card.appendChild(pre);

    var state = el("p", { class: "rls-state" });
    state.appendChild(el("span", { class: "lbl", text: "current_setting:" }));
    if (ctx.gucSet) {
      state.appendChild(el("code", { text: "'" + ctx.gucValue + "'" }));
    } else {
      state.appendChild(el("span", { class: "unset", text: "(unset)" }));
    }
    card.appendChild(state);

    if (ctx.reason) {
      card.appendChild(el("p", { class: "rls-reason", text: ctx.reason }));
    }
    return card;
  }

  function renderResultPanel(ctx) {
    var card = el("div", { class: "rls-card" });
    card.appendChild(el("h4", { text: "What SELECT * FROM event returns" }));

    var pre = el("pre", { class: "rls-sql" });
    pre.innerHTML = '<span class="k">SELECT</span> id, tenant_id, name <span class="k">FROM</span> event;';
    card.appendChild(pre);

    var table = el("table", { class: "rls-rows" });
    table.appendChild(el("tr", {}, [
      el("th", { text: "id" }),
      el("th", { text: "tenant_id" }),
      el("th", { text: "name" }),
      el("th", { text: "" })
    ]));
    EVENTS.forEach(function (ev) {
      var visible = ctx.result.indexOf(ev.tenant_id) !== -1;
      var tr = el("tr", { class: visible ? "" : "hidden" }, [
        el("td", { text: String(ev.id) }),
        el("td", { text: ev.tenant_id }),
        el("td", { text: ev.name }),
        el("td", {}, [
          el("span", {
            class: "rls-tag " + (visible ? "kept" : "dropped"),
            text: visible ? "kept" : "filtered"
          })
        ])
      ]);
      table.appendChild(tr);
    });
    card.appendChild(table);

    var summary;
    if (!ctx.gucSet) {
      summary = "Policy Branch A fires (GUC unset, allow). All rows pass through.";
    } else {
      var visibleCount = ctx.result.length;
      summary = "Policy compares each row's tenant_id against the GUC. " +
        visibleCount + " row" + (visibleCount === 1 ? "" : "s") + " kept, " +
        (EVENTS.length - visibleCount) + " filtered.";
    }
    card.appendChild(el("p", { class: "rls-summary", text: summary }));
    return card;
  }

  function render(container, ctx) {
    container.innerHTML = "";

    var picker = el("div", { class: "rls-picker" });
    CONTEXTS.forEach(function (other) {
      var b = el("button", {
        class: "rls-p",
        type: "button",
        "aria-pressed": other.key === ctx.key ? "true" : "false",
        onclick: function () { render(container, other); }
      }, [other.label]);
      picker.appendChild(b);
    });
    container.appendChild(picker);

    container.appendChild(el("p", { class: "rls-blurb", text: ctx.blurb }));

    var cols = el("div", { class: "rls-cols" }, [
      renderGucPanel(ctx),
      renderResultPanel(ctx)
    ]);
    container.appendChild(cols);
  }

  function init() {
    var targets = document.querySelectorAll("[data-rls-demo]");
    if (!targets.length) return;
    injectStyles();
    targets.forEach(function (t) {
      t.classList.add("rls-demo");
      render(t, CONTEXTS[0]);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
