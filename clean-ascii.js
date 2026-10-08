// clean-ascii.js — run once with: node clean-ascii.js
const fs = require("fs");

const files = ["public/js/dashboard/overview.js"];

files.forEach((p) => {
  if (!fs.existsSync(p)) {
    console.log(`SKIP: ${p} not found`);
    return;
  }

  let t = fs.readFileSync(p, "utf8");
  const before = t.length;

  t = t.replace(/\uFEFF/g, ""); // BOM
  t = t.replace(/[\u2014\u2013]/g, "-"); // em dash, en dash
  t = t.replace(/\u2026/g, "..."); // ellipsis
  t = t.replace(/[\u2018\u2019]/g, "'"); // curly single quotes
  t = t.replace(/[\u201C\u201D]/g, '"'); // curly double quotes
  t = t.replace(/\u00B7/g, "&middot;"); // middot
  t = t.replace(/[^\x00-\x7F]/g, ""); // everything else (icons)

  fs.writeFileSync(p, t, "utf8");
  console.log(`${p}: ${before} -> ${t.length}`);
});

console.log("Done.");
