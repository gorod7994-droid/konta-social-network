import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('crowd-rush.html','utf8');
const games=fs.readFileSync('games.html','utf8');
const mobile=fs.readFileSync('mobile/src/Extras.js','utf8');
const sitemap=fs.readFileSync('sitemap.xml','utf8');
assert.match(html,/<!doctype html>/i);
assert.match(html,/id="game"/);
assert.match(html,/id="turbo"/);
assert.match(html,/id="overlay"/);
assert.match(html,/requestAnimationFrame\(frame\)/);
assert.match(html,/addEventListener\('pointerdown'/);
assert.match(html,/function setup\(/);
assert.match(html,/function multiplier\(/);
assert.match(html,/function victory\(/);
assert.match(html,/function defeat\(/);
assert.match(html,/function upgrade\(/);
assert.match(html,/localStorage\.setItem/);
assert.match(games,/href="\/crowd-rush\.html"/);
assert.match(mobile,/game==='crowd'/);
assert.match(sitemap,/crowd-rush\.html/);
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,'Game inline JS missing');
new Function(match[1]); // Parse only, never execute the browser game in Node.
console.log('Crowd Rush game syntax and KONTA integrations: OK');
