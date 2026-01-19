import * as vscode from 'vscode';
import { getGitWrapper } from './gitWrapper';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export interface SafetyCheckResult {
  safe: boolean;
  warnings: string[];
  blockers: string[];
}

export async function checkBeforeReset(
  mode: 'soft' | 'mixed' | 'hard',
  commitCount: number = 1
): Promise<SafetyCheckResult> {
  const git = getGitWrapper();
  const warnings: string[] = [];
  const blockers: string[] = [];

  const commits = await git.getRecentCommits(commitCount);
  if (commits.length < commitCount) {
    blockers.push(`Only ${commits.length} commits available, cannot undo ${commitCount}`);
  }

  if (mode === 'hard') {
    const hasChanges = await git.hasUncommittedChanges();
    if (hasChanges) {
      warnings.push('Hard reset will discard all uncommitted changes');
    }
  }

  for (const commit of commits) {
    const isPushed = await git.isPushed(commit.hash);
    if (isPushed) {
      warnings.push(
        `Commit "${commit.message.substring(0, 50)}" has been pushed. Undoing will require force push.`
      );
    }
  }

  return {
    safe: blockers.length === 0,
    warnings,
    blockers,
  };
}

export async function checkBeforeAmend(): Promise<SafetyCheckResult> {
  const git = getGitWrapper();
  const warnings: string[] = [];
  const blockers: string[] = [];

  const lastCommit = await git.getLastCommit();
  if (!lastCommit) {
    blockers.push('No commits to amend');
    return { safe: false, warnings, blockers };
  }

  const isPushed = await git.isPushed(lastCommit.hash);
  if (isPushed) {
    warnings.push('This commit has been pushed. Amending will require a force push.');
  }

  return {
    safe: blockers.length === 0,
    warnings,
    blockers,
  };
}

export async function checkBeforeBranchCreate(branchName: string): Promise<SafetyCheckResult> {
  const git = getGitWrapper();
  const warnings: string[] = [];
  const blockers: string[] = [];

  const branches = await git.getBranches();
  if (branches.all.includes(branchName)) {
    blockers.push(`Branch "${branchName}" already exists`);
  }

  if (!/^[a-zA-Z0-9/_-]+$/.test(branchName)) {
    blockers.push('Branch name contains invalid characters');
  }

  return {
    safe: blockers.length === 0,
    warnings,
    blockers,
  };
}

export async function confirmDangerousAction(
  actionName: string,
  details: string,
  warnings: string[] = []
): Promise<boolean> {
  const config = getConfig();

  if (!config.confirmDangerousActions) {
    return true;
  }

  let message = `${actionName}\n\n${details}`;
  if (warnings.length > 0) {
    message += '\n\n⚠️ Warnings:\n' + warnings.map((w) => `• ${w}`).join('\n');
  }

  const result = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    'Proceed',
    'Cancel'
  );

  const confirmed = result === 'Proceed';
  logger.info(`Dangerous action "${actionName}" ${confirmed ? 'confirmed' : 'cancelled'}`);
  return confirmed;
}

export async function showSafetyWarnings(result: SafetyCheckResult): Promise<boolean> {
  if (!result.safe) {
    const blockerMessage = result.blockers.join('\n');
    await vscode.window.showErrorMessage(`Cannot proceed:\n${blockerMessage}`);
    return false;
  }

  if (result.warnings.length > 0) {
    const warningMessage = result.warnings.join('\n• ');
    const proceed = await vscode.window.showWarningMessage(
      `⚠️ Warnings:\n• ${warningMessage}`,
      { modal: true },
      'Proceed Anyway',
      'Cancel'
    );
    return proceed === 'Proceed Anyway';
  }

  return true;
}
