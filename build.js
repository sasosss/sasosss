#!/usr/bin/env node
/* Build the single-file artifact: inlines CSS and all JS modules into
   dist/PersistentCivilizationSimulator.html */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

const scriptOrder = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scriptOrder.map(p => {
  const code = fs.readFileSync(path.join(root, p), 'utf8');
  return `/* ===== ${p} ===== */\n${code}`;
}).join('\n');

let out = html
  .replace(/<link rel="stylesheet"[^>]+>/, `<style>\n${css}\n</style>`)
  .replace(/(<script src="[^"]+"><\/script>\s*)+/, `<script>\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>\n`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outPath = path.join(root, 'dist/PersistentCivilizationSimulator.html');
fs.writeFileSync(outPath, out);
console.log(`Built ${outPath} (${(out.length / 1024).toFixed(0)} kB)`);
