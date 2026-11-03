// Builds the single-file game: bundles src/ and inlines it with public/style.css into ./index.html
// (and also writes public/game.js for local development).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const result = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false });
const js = result.outputFiles[0].text;
writeFileSync('public/game.js', js);
const css = readFileSync('public/style.css', 'utf8');
const html = readFileSync('public/index.html', 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="game.js"></script>', () => `<script>\n${js.replace(/<\/script/g, '<\\/script')}\n</script>`);
writeFileSync('index.html', html);
console.log(`Built index.html (${(html.length / 1024).toFixed(0)} KB)`);
