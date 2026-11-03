import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 120000,
    windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function checkGit(root, expectedRemote = 'https://github.com/tealate/MarbleGame.git') {
  if (git(root, ['branch', '--show-current']) !== 'main') throw new Error('Capture upload requires branch main. Branches are never switched automatically.');
  for (const kind of ['--all', '--push']) { // Check effective fetch and push destinations.
    const args = kind === '--push' ? ['remote', 'get-url', '--push', '--all', 'origin'] : ['remote', 'get-url', '--all', 'origin'];
    const urls = git(root, args).split(/\r?\n/);
    const accepted = expectedRemote === 'https://github.com/tealate/MarbleGame.git'
      ? [expectedRemote, expectedRemote.slice(0, -4), 'git@github.com:tealate/MarbleGame.git'] : [expectedRemote];
    if (urls.length !== 1 || !accepted.includes(urls[0])) throw new Error(`Unexpected origin URL: ${urls.join(', ')}`);
  }
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
    if (existsSync(path.resolve(root, git(root, ['rev-parse', '--git-path', marker])))) throw new Error(`Git operation in progress: ${marker}`);
  }
  if (git(root, ['ls-files', '-u'])) throw new Error('Resolve Git conflicts before capturing.');
  const head = git(root, ['rev-parse', 'HEAD']);
  const remote = git(root, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s/)[0];
  if (head !== remote) throw new Error('Local HEAD and origin/main differ. Reconcile them manually (including any previous failed upload); no pull, reset, or force push was performed.');
  git(root, ['var', 'GIT_AUTHOR_IDENT']);
  git(root, ['var', 'GIT_COMMITTER_IDENT']);
  return head;
}

export function commitFiles(root, files, base, emptyHooksDirectory) {
  if (git(root, ['rev-parse', 'HEAD']) !== base || git(root, ['branch', '--show-current']) !== 'main') throw new Error('Git HEAD changed during capture');
  // Paths are new, exclusive-created files. Existing staged files are not involved.
  for (const file of files) {
    if (git(root, ['ls-files', '--', file])) throw new Error(`Output already tracked/staged: ${file}`);
  }
  const stagedBefore = git(root, ['diff', '--cached', '--binary']);
  git(root, ['add', '--intent-to-add', '--', ...files]);
  git(root, ['-c', `core.hooksPath=${emptyHooksDirectory}`, 'commit', '--only', '-m', 'docs: add automated game capture', '--', ...files]);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const changed = git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split(/\r?\n/).sort();
  if (JSON.stringify(changed) !== JSON.stringify([...files].sort()) || git(root, ['rev-parse', 'HEAD^']) !== base) throw new Error('Commit audit failed; nothing was pushed');
  if (git(root, ['diff', '--cached', '--binary']) !== stagedBefore) throw new Error('Staged changes audit failed; nothing was pushed');
  return commit;
}
