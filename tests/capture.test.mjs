import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkGit, commitFiles, git } from '../tools/capture-git.mjs';
import { validateConfig } from '../tools/capture.mjs';

test('capture configuration rejects unsafe output paths and accidental overwrite names', () => {
  const config = JSON.parse(readFileSync(new URL('../tools/capture.config.json', import.meta.url)));
  validateConfig(config);
  for (const invalid of [{ outputDirectory: '../outside' }, { filename: 'latest' }, { fps: 0 }, { video: false, screenshot: false }, { autoPush: 'false' }]) {
    assert.throws(() => validateConfig({ ...config, ...invalid }));
  }
});

test('capture commit preserves staged and unstaged work; remote mismatch/divergence are refused', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'marble-git-test-'));
  try {
    const remote = path.join(root, 'remote.git');
    const work = path.join(root, 'work');
    const hooks = path.join(root, 'hooks');
    mkdirSync(work); mkdirSync(hooks);
    git(root, ['init', '--bare', remote]);
    git(work, ['init', '-b', 'main']);
    git(work, ['config', 'user.name', 'Capture Test']);
    git(work, ['config', 'user.email', 'capture@example.invalid']);
    git(work, ['config', 'commit.gpgSign', 'false']);
    writeFileSync(path.join(work, 'existing.txt'), 'base\n');
    git(work, ['add', '--', 'existing.txt']);
    git(work, ['commit', '-m', 'base']);
    git(work, ['remote', 'add', 'origin', remote]);
    git(work, ['push', 'origin', 'main']);
    const base = checkGit(work, remote);
    assert.throws(() => checkGit(work), /Unexpected origin/);
    writeFileSync(path.join(work, 'existing.txt'), 'staged\n');
    git(work, ['add', '--', 'existing.txt']);
    writeFileSync(path.join(work, 'existing.txt'), 'unstaged\n');
    writeFileSync(path.join(work, 'untracked.txt'), 'keep\n');
    const staged = git(work, ['diff', '--cached', '--binary']);
    mkdirSync(path.join(work, 'docs/previews'), { recursive: true });
    const files = ['docs/previews/test.png', 'docs/previews/test.mp4'];
    for (const file of files) writeFileSync(path.join(work, file), 'capture bytes');
    const commit = commitFiles(work, files, base, hooks);
    assert.equal(git(work, ['diff', '--cached', '--binary']), staged);
    assert.equal(readFileSync(path.join(work, 'existing.txt'), 'utf8'), 'unstaged\n');
    assert.equal(readFileSync(path.join(work, 'untracked.txt'), 'utf8'), 'keep\n');
    assert.deepEqual(git(work, ['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split('\n').sort(), files.sort());
    assert.throws(() => checkGit(work, remote), /differ/);
    git(work, ['push', 'origin', `${commit}:refs/heads/main`]);
    assert.equal(checkGit(work, remote), commit);
    git(work, ['switch', '-c', 'other']);
    assert.throws(() => checkGit(work, remote), /branch main/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
