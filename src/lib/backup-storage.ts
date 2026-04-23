import fs from 'fs';
import path from 'path';

const STANDALONE_SUFFIX = `${path.sep}.next${path.sep}standalone`;

export function resolveAppRootDir(cwd = process.cwd()) {
  const resolvedCwd = path.resolve(cwd);
  if (resolvedCwd.endsWith(STANDALONE_SUFFIX)) {
    return resolvedCwd.slice(0, -STANDALONE_SUFFIX.length) || path.sep;
  }

  return resolvedCwd;
}

function resolveLegacyStandaloneBackupDir(cwd = process.cwd()) {
  const resolvedCwd = path.resolve(cwd);
  if (!resolvedCwd.endsWith(STANDALONE_SUFFIX)) {
    return null;
  }

  return path.join(resolvedCwd, 'storage', 'backups');
}

export function resolveBackupDir(cwd = process.cwd()) {
  return path.join(resolveAppRootDir(cwd), 'storage', 'backups');
}

export const BACKUP_DIR = resolveBackupDir();

function moveFilePreservingContents(sourcePath: string, targetPath: string) {
  try {
    fs.renameSync(sourcePath, targetPath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }
  }

  fs.copyFileSync(sourcePath, targetPath);
  fs.unlinkSync(sourcePath);
}

export function ensureBackupDirectory(cwd = process.cwd()) {
  const backupDir = resolveBackupDir(cwd);
  fs.mkdirSync(backupDir, { recursive: true });

  const legacyBackupDir = resolveLegacyStandaloneBackupDir(cwd);
  if (!legacyBackupDir || legacyBackupDir === backupDir || !fs.existsSync(legacyBackupDir)) {
    return backupDir;
  }

  for (const entry of fs.readdirSync(legacyBackupDir)) {
    const sourcePath = path.join(legacyBackupDir, entry);
    const targetPath = path.join(backupDir, entry);

    if (!fs.statSync(sourcePath).isFile() || fs.existsSync(targetPath)) {
      continue;
    }

    moveFilePreservingContents(sourcePath, targetPath);
  }

  return backupDir;
}
