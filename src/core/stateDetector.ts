import { getGitWrapper, GitStatus, CommitInfo } from './gitWrapper';
import { logger } from '../utils/logger';

export type OngoingOperation = 'merge' | 'rebase' | 'cherry-pick' | 'bisect' | null;

export interface RepoState {
  isGitRepo: boolean;
  currentBranch: string | null;
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasRemote: boolean;
  lastCommit: CommitInfo | null;
  status: GitStatus | null;
  issues: RepoIssue[];
  isDetachedHead: boolean;
  ongoingOperation: OngoingOperation;
  hasConflicts: boolean;
  conflictedFiles: string[];
  hasStashes: boolean;
  stashCount: number;
}

export interface RepoIssue {
  type: 'warning' | 'error' | 'info';
  code: string;
  message: string;
  suggestion?: string;
}

export async function detectRepoState(): Promise<RepoState> {
  const git = getGitWrapper();

  const defaultState: RepoState = {
    isGitRepo: false,
    currentBranch: null,
    hasUncommittedChanges: false,
    hasStagedChanges: false,
    hasRemote: false,
    lastCommit: null,
    status: null,
    issues: [],
    isDetachedHead: false,
    ongoingOperation: null,
    hasConflicts: false,
    conflictedFiles: [],
    hasStashes: false,
    stashCount: 0,
  };

  try {
    const isGitRepo = await git.isGitRepo();
    if (!isGitRepo) {
      return {
        ...defaultState,
        issues: [
          {
            type: 'error',
            code: 'NOT_GIT_REPO',
            message: 'Current workspace is not a Git repository',
            suggestion: 'Initialize a Git repository with "git init"',
          },
        ],
      };
    }

    const [
      currentBranch,
      hasUncommittedChanges,
      hasStagedChanges,
      hasRemote,
      lastCommit,
      status,
      isDetachedHead,
      ongoingOperation,
      conflictedFiles,
      stashList,
    ] = await Promise.all([
      git.getCurrentBranch(),
      git.hasUncommittedChanges(),
      git.hasStagedChanges(),
      git.hasRemote(),
      git.getLastCommit(),
      git.getStatus(),
      git.isDetachedHead(),
      git.getOngoingOperation(),
      git.getConflictedFiles(),
      git.getStashList(),
    ]);

    const issues = detectIssues({
      currentBranch,
      hasUncommittedChanges,
      hasStagedChanges,
      hasRemote,
      lastCommit,
      status,
      isDetachedHead,
      ongoingOperation,
      conflictedFiles,
    });

    return {
      isGitRepo: true,
      currentBranch,
      hasUncommittedChanges,
      hasStagedChanges,
      hasRemote,
      lastCommit,
      status,
      issues,
      isDetachedHead,
      ongoingOperation,
      hasConflicts: conflictedFiles.length > 0,
      conflictedFiles,
      hasStashes: stashList.length > 0,
      stashCount: stashList.length,
    };
  } catch (error) {
    logger.error('Failed to detect repo state', error as Error);
    return {
      ...defaultState,
      issues: [
        {
          type: 'error',
          code: 'DETECTION_FAILED',
          message: 'Failed to detect repository state',
          suggestion: 'Check if Git is installed and accessible',
        },
      ],
    };
  }
}

interface DetectionContext {
  currentBranch: string | null;
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasRemote: boolean;
  lastCommit: CommitInfo | null;
  status: GitStatus | null;
  isDetachedHead: boolean;
  ongoingOperation: OngoingOperation;
  conflictedFiles: string[];
}

function detectIssues(context: DetectionContext): RepoIssue[] {
  const issues: RepoIssue[] = [];

  // Critical issues first
  if (context.isDetachedHead) {
    issues.push({
      type: 'warning',
      code: 'DETACHED_HEAD',
      message: 'You are in detached HEAD state',
      suggestion: 'Create a branch to save your work, or checkout an existing branch',
    });
  }

  if (context.ongoingOperation) {
    const operationNames: Record<string, string> = {
      'merge': 'Merge',
      'rebase': 'Rebase',
      'cherry-pick': 'Cherry-pick',
      'bisect': 'Bisect',
    };
    issues.push({
      type: 'warning',
      code: 'ONGOING_OPERATION',
      message: `${operationNames[context.ongoingOperation]} in progress`,
      suggestion: context.conflictedFiles.length > 0
        ? `Resolve ${context.conflictedFiles.length} conflict(s) or abort`
        : 'Continue or abort the operation',
    });
  }

  if (context.conflictedFiles.length > 0 && !context.ongoingOperation) {
    issues.push({
      type: 'error',
      code: 'HAS_CONFLICTS',
      message: `${context.conflictedFiles.length} file(s) have merge conflicts`,
      suggestion: 'Resolve conflicts before continuing',
    });
  }

  if (!context.lastCommit) {
    issues.push({
      type: 'info',
      code: 'NO_COMMITS',
      message: 'Repository has no commits yet',
      suggestion: 'Create your first commit',
    });
  }

  if (context.status && context.status.ahead > 0) {
    issues.push({
      type: 'info',
      code: 'UNPUSHED_COMMITS',
      message: `You have ${context.status.ahead} unpushed commit(s)`,
      suggestion: 'These commits are safe to modify with Git Panic',
    });
  }

  if (context.status && context.status.behind > 0) {
    issues.push({
      type: 'warning',
      code: 'BEHIND_REMOTE',
      message: `Your branch is ${context.status.behind} commit(s) behind remote`,
      suggestion: 'Consider pulling changes before making modifications',
    });
  }

  if (context.hasUncommittedChanges && !context.hasStagedChanges) {
    issues.push({
      type: 'info',
      code: 'UNSTAGED_CHANGES',
      message: 'You have unstaged changes',
    });
  }

  if (context.hasStagedChanges) {
    issues.push({
      type: 'info',
      code: 'STAGED_CHANGES',
      message: 'You have staged changes ready to commit',
    });
  }

  return issues;
}

export async function canUndoCommit(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const lastCommit = await git.getLastCommit();
  if (!lastCommit) {
    return { allowed: false, reason: 'No commits to undo' };
  }

  return { allowed: true };
}

export async function canAmendCommit(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const lastCommit = await git.getLastCommit();
  if (!lastCommit) {
    return { allowed: false, reason: 'No commits to amend' };
  }

  const isPushed = await git.isPushed(lastCommit.hash);
  if (isPushed) {
    return {
      allowed: true,
      reason: 'Warning: This commit has been pushed. Amending will require a force push.',
    };
  }

  return { allowed: true };
}

export async function canMoveCommits(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const commits = await git.getRecentCommits(1);
  if (commits.length === 0) {
    return { allowed: false, reason: 'No commits to move' };
  }

  return { allowed: true };
}

export async function canRecoverBranch(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const deletedBranches = await git.getDeletedBranches();
  if (deletedBranches.length === 0) {
    return { allowed: false, reason: 'No recently deleted branches found in reflog' };
  }

  return { allowed: true };
}

export async function canFixDetachedHead(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const isDetached = await git.isDetachedHead();
  if (!isDetached) {
    return { allowed: false, reason: 'Not in detached HEAD state' };
  }

  return { allowed: true };
}

export async function canAbortOperation(): Promise<{ allowed: boolean; reason?: string; operation?: string }> {
  const git = getGitWrapper();

  const operation = await git.getOngoingOperation();
  if (!operation) {
    return { allowed: false, reason: 'No ongoing Git operation' };
  }

  return { allowed: true, operation };
}

export async function canStash(): Promise<{ allowed: boolean; reason?: string; hasStashes?: boolean }> {
  const git = getGitWrapper();

  const [hasChanges, stashList] = await Promise.all([
    git.hasUncommittedChanges(),
    git.getStashList(),
  ]);

  if (!hasChanges && stashList.length === 0) {
    return { allowed: false, reason: 'No changes to stash and no existing stashes' };
  }

  return { allowed: true, hasStashes: stashList.length > 0 };
}

export async function canUnstage(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const hasStagedChanges = await git.hasStagedChanges();
  if (!hasStagedChanges) {
    return { allowed: false, reason: 'No staged files' };
  }

  return { allowed: true };
}

export async function canDiscardChanges(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const hasChanges = await git.hasUncommittedChanges();
  if (!hasChanges) {
    return { allowed: false, reason: 'No changes to discard' };
  }

  return { allowed: true };
}

export async function canCleanUntracked(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const untrackedFiles = await git.getUntrackedFiles();
  if (untrackedFiles.length === 0) {
    return { allowed: false, reason: 'No untracked files' };
  }

  return { allowed: true };
}

export async function canSquashCommits(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const commits = await git.getRecentCommits(2);
  if (commits.length < 2) {
    return { allowed: false, reason: 'Need at least 2 commits to squash' };
  }

  return { allowed: true };
}

export async function canForcePushRecovery(): Promise<{ allowed: boolean; reason?: string }> {
  const git = getGitWrapper();

  const hasRemote = await git.hasRemote();
  if (!hasRemote) {
    return { allowed: false, reason: 'No remote configured' };
  }

  return { allowed: true };
}
