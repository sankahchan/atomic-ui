import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureBackupDirectory, resolveAppRootDir, resolveBackupDir } from './backup-storage';

test('resolveAppRootDir collapses standalone runtime cwd to the app root', () => {
  assert.equal(resolveAppRootDir('/opt/atomic-ui/.next/standalone'), '/opt/atomic-ui');
});

test('resolveBackupDir stays rooted at the app root for standalone runtime cwd', () => {
  assert.equal(
    resolveBackupDir('/opt/atomic-ui/.next/standalone'),
    '/opt/atomic-ui/storage/backups',
  );
});

test('ensureBackupDirectory migrates legacy standalone backups into the canonical directory', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-backups-'));
  const standaloneCwd = path.join(tempRoot, '.next', 'standalone');
  const legacyBackupDir = path.join(standaloneCwd, 'storage', 'backups');
  const canonicalBackupDir = path.join(tempRoot, 'storage', 'backups');
  const legacyFilePath = path.join(legacyBackupDir, 'backup.dump');

  fs.mkdirSync(legacyBackupDir, { recursive: true });
  fs.writeFileSync(legacyFilePath, 'legacy-backup');

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const resolvedBackupDir = ensureBackupDirectory(standaloneCwd);

  assert.equal(resolvedBackupDir, canonicalBackupDir);
  assert.equal(fs.existsSync(path.join(canonicalBackupDir, 'backup.dump')), true);
  assert.equal(
    fs.readFileSync(path.join(canonicalBackupDir, 'backup.dump'), 'utf8'),
    'legacy-backup',
  );
  assert.equal(fs.existsSync(legacyFilePath), false);
});
