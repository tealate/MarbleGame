import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile, lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordCanvas, verifyVideo } from './capture-browser.mjs';
import { checkGit, commitFiles, git } from './capture-git.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let server;
let browser;
let temporary;
let cleaning;
async function cleanup() {
  return cleaning ??= (async () => {
    try { await browser?.close(); } finally {
      try { await server?.close(); } finally {
        if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      }
    }
    console.log('Cleanup complete: capture Edge and Vite closed.');
  })();
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => { cleanup().finally(() => process.exit(130)); });
}
function npm(command) {
  const options = { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 300000 };
  if (process.platform === 'win32') execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${command}`], options);
  else execFileSync('npm', command.split(' '), options);
}
export function validateConfig(c) {
  for (const [key, min, max] of [['width', 16, 4096], ['height', 16, 4096], ['durationSeconds', 1, 120], ['fps', 1, 60], ['videoBitsPerSecond', 100000, 50000000], ['waitBeforeCaptureMs', 0, 60000], ['timeoutMs', 1000, 180000], ['port', 0, 65535]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`Invalid ${key}: expected integer ${min}..${max}`);
  }
  for (const key of ['screenshot', 'video', 'autoPush', 'softwareRendering', 'runChecks']) if (typeof c[key] !== 'boolean') throw new Error(`Invalid ${key}`);
  if (!c.screenshot && !c.video) throw new Error('Enable screenshot or video');
  if (!['mp4', 'webm'].includes(c.format)) throw new Error('format must be mp4 or webm');
  if (typeof c.filename !== 'string' || !/^[a-zA-Z0-9_{}.-]+$/.test(c.filename) || !c.filename.includes('{timestamp}')) throw new Error('filename must include {timestamp} and use letters, digits, -, _, or .');
  if (typeof c.outputDirectory !== 'string' || !/^docs\/previews(?:\/[a-zA-Z0-9_-]+)*$/.test(c.outputDirectory)) throw new Error('outputDirectory must be docs/previews or a subdirectory');
  if (typeof c.edgeExecutablePath !== 'string') throw new Error('Invalid edgeExecutablePath');
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ required');
  const args = process.argv.slice(2);
  let configPath = path.join(root, 'tools/capture.config.json');
  let noPush = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-push') noPush = true;
    else if (args[i] === '--config' && args[i + 1]) configPath = path.resolve(args[++i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateConfig(config);
  if (noPush) config.autoPush = false;
  console.log(`Capture: ${config.width}x${config.height}, ${config.durationSeconds}s, ${config.fps} FPS, ${config.format}; upload=${config.autoPush}`);
  const base = config.autoPush ? checkGit(root) : undefined;
  let dependencies;
  try { dependencies = await Promise.all([import('vite'), import('playwright-core')]); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    console.log('Installing locked dependencies with npm ci...');
    npm('ci --no-audit --no-fund');
    dependencies = await Promise.all([import('vite'), import('playwright-core')]);
  }
  if (config.runChecks) { npm('test'); npm('run build'); }
  temporary = await mkdtemp(path.join(os.tmpdir(), 'marble-capture-'));
  const hooks = path.join(temporary, 'empty-hooks');
  await mkdir(hooks);
  const [{ createServer }, { chromium }] = dependencies;
  server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: config.port, strictPort: true, open: false, watch: null }, clearScreen: false });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/`;
  const response = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
  if (!response.ok) throw new Error(`Vite HTTP ${response.status}`);
  browser = await chromium.launch({ ...(config.edgeExecutablePath ? { executablePath: config.edgeExecutablePath } : { channel: 'msedge' }), headless: true, timeout: config.timeoutMs,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(config.softwareRendering ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
  const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1 });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.setDefaultTimeout(config.timeoutMs);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: config.timeoutMs });
  // main.ts attaches this canvas only after await createGameScreen / Rapier init.
  await page.locator('#game canvas').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(config.waitBeforeCaptureMs);
  const size = await page.locator('#game canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  if (!size.width || !size.height) throw new Error('Canvas has no framebuffer');
  console.log('Physics ready; source framebuffer:', size);
  const name = config.filename.replaceAll('{timestamp}', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  const artifacts = [];
  if (config.screenshot) {
    const filename = `${name}.png`;
    const bytes = await page.screenshot({ type: 'png', animations: 'disabled' });
    if (bytes.readUInt32BE(16) !== config.width || bytes.readUInt32BE(20) !== config.height) throw new Error('PNG resolution mismatch');
    await writeFile(path.join(temporary, filename), bytes);
    artifacts.push(filename);
  }
  if (config.video) {
    console.log('Recording...');
    const recording = await page.evaluate(recordCanvas, config);
    const filename = `${name}.${config.format}`;
    const bytes = Buffer.from(recording.data, 'base64');
    if (bytes.length < 10000 || bytes.length > 95 * 1024 * 1024) throw new Error(`Invalid video size: ${bytes.length}`);
    if (config.format === 'mp4' ? bytes.toString('ascii', 4, 8) !== 'ftyp' : bytes.subarray(0, 4).toString('hex') !== '1a45dfa3') throw new Error('Invalid video container signature');
    await writeFile(path.join(temporary, filename), bytes);
    console.log(`Recorded ${recording.mimeType}, ${bytes.length} bytes. Verifying saved video playback...`);
    const playback = await browser.newPage();
    const report = await playback.evaluate(verifyVideo, { data: (await readFile(path.join(temporary, filename))).toString('base64'), config });
    await playback.close();
    console.log('Playback PASS:', JSON.stringify(report));
    artifacts.push(filename);
  }
  if (errors.length) throw new Error(`Game errors: ${errors.join('\n')}`);
  // Reject symlinks/junctions so configured output cannot escape the repository.
  let directory = root;
  for (const part of config.outputDirectory.split('/')) {
    directory = path.join(directory, part);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Output directory is a link: ${directory}`);
  }
  const resolved = await realpath(directory);
  if (!resolved.toLowerCase().startsWith((await realpath(root)).toLowerCase() + path.sep)) throw new Error('Output escapes repository');
  const files = [];
  for (const filename of artifacts) {
    const from = path.join(temporary, filename);
    const to = path.join(directory, filename);
    await copyFile(from, to, constants.COPYFILE_EXCL);
    if (hash(await readFile(from)) !== hash(await readFile(to))) throw new Error('Copy checksum mismatch');
    files.push(`${config.outputDirectory}/${filename}`);
    console.log(`Saved: ${to}`);
  }
  // Release all capture resources before any network publication operation.
  await browser.close(); browser = undefined;
  await server.close(); server = undefined;
  if (config.autoPush) {
    if (checkGit(root) !== base) throw new Error('Repository changed during capture');
    const commit = commitFiles(root, files, base, hooks);
    console.log(`Capture-only commit: ${commit}`);
    git(root, ['-c', `core.hooksPath=${hooks}`, 'push', '--no-follow-tags', 'origin', `${commit}:refs/heads/main`]);
    for (const file of files) {
      const publicUrl = `https://raw.githubusercontent.com/tealate/MarbleGame/${commit}/${file}`;
      let verified = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const result = await fetch(publicUrl, { signal: AbortSignal.timeout(config.timeoutMs) });
          if (result.ok && hash(Buffer.from(await result.arrayBuffer())) === hash(await readFile(path.join(root, file)))) { verified = true; break; }
        } catch { /* CDN propagation or transient network failure; bounded retry. */ }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!verified) throw new Error(`Pushed, but public download verification failed: ${publicUrl}`);
      console.log(`Mobile HTTPS URL (download to play):\n${publicUrl}`);
    }
  } else console.log('Upload disabled: no Git staging, commit, or push performed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) { console.error('CAPTURE FAILED:', error.stderr?.toString() || error.message); process.exitCode = 1; }
  finally { await cleanup().catch(error => { console.error('Cleanup failed:', error.message); process.exitCode = 1; }); }
}
