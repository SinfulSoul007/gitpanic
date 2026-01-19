import simpleGit, { SimpleGit, LogResult, StatusResult, BranchSummary } from 'simple-git';
import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface ReflogEntry {
  hash: string;
  action: string;
  message: string;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export class GitWrapper {
  private git: SimpleGit;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.git = simpleGit(workspaceRoot);
    logger.info(`GitWrapper initialized for: ${workspaceRoot}`);
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();
    return {
      current: status.current,
      tracking: status.tracking,
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  async getRecentCommits(count: number = 10): Promise<CommitInfo[]> {
    try {
      const log: LogResult = await this.git.log({ maxCount: count });
      return log.all.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
      }));
    } catch (error) {
      logger.error('Failed to get recent commits', error as Error);
      return [];
    }
  }

  async getLastCommit(): Promise<CommitInfo | null> {
    const commits = await this.getRecentCommits(1);
    return commits[0] || null;
  }

  async getCurrentBranch(): Promise<string | null> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch {
      return null;
    }
  }

  async getBranches(): Promise<BranchSummary> {
    return this.git.branch();
  }

  async getReflog(count: number = 50): Promise<ReflogEntry[]> {
    try {
      const result = await this.git.raw(['reflog', '--format=%H|%gs', `-n${count}`]);
      const lines = result.trim().split('\n').filter(Boolean);
      return lines.map((line) => {
        const [hash, ...rest] = line.split('|');
        const message = rest.join('|');
        const actionMatch = message.match(/^(\w+):/);
        return {
          hash,
          action: actionMatch ? actionMatch[1] : 'unknown',
          message,
        };
      });
    } catch (error) {
      logger.error('Failed to get reflog', error as Error);
      return [];
    }
  }

  async softReset(ref: string = 'HEAD~1'): Promise<void> {
    logger.info(`Performing soft reset to ${ref}`);
    await this.git.reset(['--soft', ref]);
  }

  async mixedReset(ref: string = 'HEAD~1'): Promise<void> {
    logger.info(`Performing mixed reset to ${ref}`);
    await this.git.reset(['--mixed', ref]);
  }

  async hardReset(ref: string = 'HEAD~1'): Promise<void> {
    logger.info(`Performing hard reset to ${ref}`);
    await this.git.reset(['--hard', ref]);
  }

  async amendCommitMessage(newMessage: string): Promise<void> {
    logger.info('Amending commit message');
    await this.git.commit(newMessage, [], { '--amend': null });
  }

  async amendCommit(message?: string): Promise<void> {
    logger.info('Amending commit with staged changes');
    const options: Record<string, null> = { '--amend': null, '--no-edit': null };
    if (message) {
      delete options['--no-edit'];
    }
    await this.git.commit(message || '', [], options);
  }

  async stageFiles(files: string[]): Promise<void> {
    await this.git.add(files);
  }

  async stageAll(): Promise<void> {
    await this.git.add('.');
  }

  async createBranch(branchName: string): Promise<void> {
    logger.info(`Creating branch: ${branchName}`);
    await this.git.checkoutLocalBranch(branchName);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    logger.info(`Checking out branch: ${branchName}`);
    await this.git.checkout(branchName);
  }

  async checkoutNewBranch(branchName: string, startPoint?: string): Promise<void> {
    logger.info(`Creating and checking out branch: ${branchName}`);
    if (startPoint) {
      await this.git.checkout(['-b', branchName, startPoint]);
    } else {
      await this.git.checkout(['-b', branchName]);
    }
  }

  async cherryPick(commitHash: string): Promise<void> {
    logger.info(`Cherry-picking commit: ${commitHash}`);
    await this.git.raw(['cherry-pick', commitHash]);
  }

  async recoverBranchFromReflog(branchName: string, commitHash: string): Promise<void> {
    logger.info(`Recovering branch ${branchName} from ${commitHash}`);
    await this.git.checkout(['-b', branchName, commitHash]);
  }

  async getDeletedBranches(): Promise<{ name: string; hash: string }[]> {
    const reflog = await this.getReflog(100);
    const deletedBranches: { name: string; hash: string }[] = [];
    const seenBranches = new Set<string>();

    for (const entry of reflog) {
      const deleteMatch = entry.message.match(/checkout: moving from (\S+) to/);
      if (deleteMatch) {
        const branchName = deleteMatch[1];
        if (!seenBranches.has(branchName)) {
          seenBranches.add(branchName);
          const branches = await this.getBranches();
          if (!branches.all.includes(branchName)) {
            deletedBranches.push({ name: branchName, hash: entry.hash });
          }
        }
      }
    }

    return deletedBranches;
  }

  async getCommitsBetween(baseRef: string, headRef: string = 'HEAD'): Promise<CommitInfo[]> {
    try {
      const log = await this.git.log({ from: baseRef, to: headRef });
      return log.all.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
      }));
    } catch {
      return [];
    }
  }

  async getHeadHash(): Promise<string> {
    const result = await this.git.revparse(['HEAD']);
    return result.trim();
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return status.staged.length > 0 || status.modified.length > 0;
  }

  async hasStagedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return status.staged.length > 0;
  }

  async hasRemote(): Promise<boolean> {
    try {
      const remotes = await this.git.getRemotes();
      return remotes.length > 0;
    } catch {
      return false;
    }
  }

  async isPushed(commitHash: string): Promise<boolean> {
    try {
      const status = await this.getStatus();
      if (!status.tracking) {
        return false;
      }
      const result = await this.git.raw(['branch', '-r', '--contains', commitHash]);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  // Detached HEAD detection and recovery
  async isDetachedHead(): Promise<boolean> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim() === 'HEAD';
    } catch {
      return false;
    }
  }

  async getDetachedHeadInfo(): Promise<{ hash: string; message: string } | null> {
    try {
      const isDetached = await this.isDetachedHead();
      if (!isDetached) return null;

      const hash = await this.getHeadHash();
      const lastCommit = await this.getLastCommit();
      return {
        hash: hash.substring(0, 7),
        message: lastCommit?.message || 'Unknown commit',
      };
    } catch {
      return null;
    }
  }

  // Operation state detection
  async getOngoingOperation(): Promise<'merge' | 'rebase' | 'cherry-pick' | 'bisect' | null> {
    try {
      const gitDir = await this.git.revparse(['--git-dir']);
      const fs = await import('fs');
      const path = await import('path');

      const gitPath = path.resolve(this.workspaceRoot, gitDir.trim());

      if (fs.existsSync(path.join(gitPath, 'MERGE_HEAD'))) {
        return 'merge';
      }
      if (fs.existsSync(path.join(gitPath, 'rebase-merge')) ||
          fs.existsSync(path.join(gitPath, 'rebase-apply'))) {
        return 'rebase';
      }
      if (fs.existsSync(path.join(gitPath, 'CHERRY_PICK_HEAD'))) {
        return 'cherry-pick';
      }
      if (fs.existsSync(path.join(gitPath, 'BISECT_LOG'))) {
        return 'bisect';
      }

      return null;
    } catch {
      return null;
    }
  }

  async abortMerge(): Promise<void> {
    logger.info('Aborting merge');
    await this.git.merge(['--abort']);
  }

  async abortRebase(): Promise<void> {
    logger.info('Aborting rebase');
    await this.git.rebase(['--abort']);
  }

  async abortCherryPick(): Promise<void> {
    logger.info('Aborting cherry-pick');
    await this.git.raw(['cherry-pick', '--abort']);
  }

  async continueMerge(): Promise<void> {
    logger.info('Continuing merge');
    await this.git.merge(['--continue']);
  }

  async continueRebase(): Promise<void> {
    logger.info('Continuing rebase');
    await this.git.rebase(['--continue']);
  }

  async continueCherryPick(): Promise<void> {
    logger.info('Continuing cherry-pick');
    await this.git.raw(['cherry-pick', '--continue']);
  }

  // Stash operations
  async getStashList(): Promise<{ index: number; message: string; hash: string }[]> {
    try {
      const result = await this.git.raw(['stash', 'list', '--format=%gd|%H|%s']);
      const lines = result.trim().split('\n').filter(Boolean);
      return lines.map((line) => {
        const [ref, hash, message] = line.split('|');
        const indexMatch = ref.match(/stash@\{(\d+)\}/);
        return {
          index: indexMatch ? parseInt(indexMatch[1], 10) : 0,
          hash,
          message: message || 'No message',
        };
      });
    } catch {
      return [];
    }
  }

  async createStash(message?: string): Promise<void> {
    logger.info(`Creating stash${message ? `: ${message}` : ''}`);
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash(['push']);
    }
  }

  async applyStash(index: number = 0): Promise<void> {
    logger.info(`Applying stash@{${index}}`);
    await this.git.stash(['apply', `stash@{${index}}`]);
  }

  async popStash(index: number = 0): Promise<void> {
    logger.info(`Popping stash@{${index}}`);
    await this.git.stash(['pop', `stash@{${index}}`]);
  }

  async dropStash(index: number): Promise<void> {
    logger.info(`Dropping stash@{${index}}`);
    await this.git.stash(['drop', `stash@{${index}}`]);
  }

  async getDroppedStashes(): Promise<{ hash: string; message: string }[]> {
    try {
      const reflog = await this.getReflog(100);
      const droppedStashes: { hash: string; message: string }[] = [];

      for (const entry of reflog) {
        if (entry.message.includes('stash') && entry.message.includes('drop')) {
          const messageMatch = entry.message.match(/: (.+)$/);
          droppedStashes.push({
            hash: entry.hash,
            message: messageMatch ? messageMatch[1] : 'Unknown stash',
          });
        }
      }

      return droppedStashes;
    } catch {
      return [];
    }
  }

  async recoverStash(hash: string): Promise<void> {
    logger.info(`Recovering stash from ${hash}`);
    await this.git.raw(['stash', 'store', '-m', 'Recovered stash', hash]);
  }

  // File-level recovery
  async getFileHistory(filePath: string, count: number = 20): Promise<CommitInfo[]> {
    try {
      const log = await this.git.log({ file: filePath, maxCount: count });
      return log.all.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
      }));
    } catch {
      return [];
    }
  }

  async restoreFile(filePath: string, commitHash: string): Promise<void> {
    logger.info(`Restoring ${filePath} from ${commitHash}`);
    await this.git.checkout([commitHash, '--', filePath]);
  }

  async getFileAtCommit(filePath: string, commitHash: string): Promise<string> {
    try {
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch {
      return '';
    }
  }

  async getDeletedFiles(count: number = 50): Promise<{ path: string; hash: string; message: string }[]> {
    try {
      const result = await this.git.raw([
        'log', '--diff-filter=D', '--name-only', '--format=%H|%s', `-n${count}`
      ]);
      const lines = result.trim().split('\n').filter(Boolean);
      const deletedFiles: { path: string; hash: string; message: string }[] = [];

      let currentHash = '';
      let currentMessage = '';

      for (const line of lines) {
        if (line.includes('|')) {
          [currentHash, currentMessage] = line.split('|');
        } else if (line && currentHash) {
          deletedFiles.push({
            path: line,
            hash: currentHash,
            message: currentMessage,
          });
        }
      }

      return deletedFiles;
    } catch {
      return [];
    }
  }

  // Unstage operations
  async unstageFile(filePath: string): Promise<void> {
    logger.info(`Unstaging ${filePath}`);
    await this.git.reset(['HEAD', '--', filePath]);
  }

  async unstageAll(): Promise<void> {
    logger.info('Unstaging all files');
    await this.git.reset(['HEAD']);
  }

  // Discard changes
  async discardFileChanges(filePath: string): Promise<void> {
    logger.info(`Discarding changes in ${filePath}`);
    await this.git.checkout(['--', filePath]);
  }

  async discardAllChanges(): Promise<void> {
    logger.info('Discarding all changes');
    await this.git.checkout(['.']);
  }

  // Clean untracked files
  async getUntrackedFiles(): Promise<string[]> {
    const status = await this.getStatus();
    return status.untracked;
  }

  async cleanUntrackedFiles(files?: string[]): Promise<void> {
    logger.info('Cleaning untracked files');
    if (files && files.length > 0) {
      for (const file of files) {
        await this.git.clean('f', [file]);
      }
    } else {
      await this.git.clean('f', ['-d']);
    }
  }

  async cleanDryRun(): Promise<string[]> {
    try {
      const result = await this.git.raw(['clean', '-n', '-d']);
      return result.split('\n')
        .filter(Boolean)
        .map((line: string) => line.replace(/^Would remove /, ''));
    } catch {
      return [];
    }
  }

  // Squash commits
  async squashCommits(count: number, message: string): Promise<void> {
    logger.info(`Squashing ${count} commits`);
    await this.git.reset(['--soft', `HEAD~${count}`]);
    await this.git.commit(message, []);
  }

  // Force push recovery
  async getRemoteHead(remote: string = 'origin'): Promise<string | null> {
    try {
      const status = await this.getStatus();
      if (!status.tracking) return null;

      const result = await this.git.raw(['ls-remote', remote, status.tracking.replace(`${remote}/`, '')]);
      const match = result.match(/^([a-f0-9]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async fetchRemote(remote: string = 'origin'): Promise<void> {
    logger.info(`Fetching from ${remote}`);
    await this.git.fetch([remote]);
  }

  async getDivergedCommits(): Promise<{ local: CommitInfo[]; remote: CommitInfo[] }> {
    try {
      const status = await this.getStatus();
      if (!status.tracking) {
        return { local: [], remote: [] };
      }

      const localCommits = status.ahead > 0
        ? await this.git.log({ from: status.tracking, to: 'HEAD' })
        : { all: [] };

      const remoteCommits = status.behind > 0
        ? await this.git.log({ from: 'HEAD', to: status.tracking })
        : { all: [] };

      return {
        local: localCommits.all.map((c) => ({
          hash: c.hash,
          message: c.message,
          author: c.author_name,
          date: c.date,
        })),
        remote: remoteCommits.all.map((c) => ({
          hash: c.hash,
          message: c.message,
          author: c.author_name,
          date: c.date,
        })),
      };
    } catch {
      return { local: [], remote: [] };
    }
  }

  // Diff operations
  async getDiff(filePath?: string, staged: boolean = false): Promise<string> {
    try {
      const args = staged ? ['--cached'] : [];
      if (filePath) {
        args.push('--', filePath);
      }
      return await this.git.diff(args);
    } catch {
      return '';
    }
  }

  async getDiffBetweenCommits(from: string, to: string): Promise<string> {
    try {
      return await this.git.diff([from, to]);
    } catch {
      return '';
    }
  }

  // Conflict detection
  async getConflictedFiles(): Promise<string[]> {
    try {
      const result = await this.git.diff(['--name-only', '--diff-filter=U']);
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

let gitWrapper: GitWrapper | null = null;

export function getGitWrapper(): GitWrapper {
  if (!gitWrapper) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }
    gitWrapper = new GitWrapper(workspaceRoot);
  }
  return gitWrapper;
}

export function resetGitWrapper(): void {
  gitWrapper = null;
}
