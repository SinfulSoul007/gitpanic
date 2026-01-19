import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning, showProgress } from '../ui/notifications';
import { logger } from '../utils/logger';

interface RecoveryOption {
  label: string;
  description: string;
  detail: string;
  action: 'check-diverged' | 'find-reflog' | 'fetch-remote';
}

export async function forcePushRecovery(): Promise<void> {
  try {
    const git = getGitWrapper();

    const hasRemote = await git.hasRemote();
    if (!hasRemote) {
      showWarning('No remote configured for this repository');
      return;
    }

    const options: RecoveryOption[] = [
      {
        label: '$(git-compare) Check Diverged Commits',
        description: 'Compare local and remote',
        detail: 'See commits that differ between local and remote branches',
        action: 'check-diverged',
      },
      {
        label: '$(history) Find Lost Commits in Reflog',
        description: 'Search recent history',
        detail: 'Find commits that may have been lost due to force push',
        action: 'find-reflog',
      },
      {
        label: '$(cloud-download) Fetch Remote Changes',
        description: 'Update remote tracking',
        detail: 'Fetch latest changes from remote to compare',
        action: 'fetch-remote',
      },
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'How do you want to recover from force push?',
      title: 'Git Panic: Force Push Recovery',
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'check-diverged':
        await checkDivergedCommits();
        break;
      case 'find-reflog':
        await findLostCommitsInReflog();
        break;
      case 'fetch-remote':
        await fetchAndCompare();
        break;
    }
  } catch (error) {
    logger.error('Failed to recover from force push', error as Error);
    showError(`Failed to recover: ${(error as Error).message}`);
  }
}

async function checkDivergedCommits(): Promise<void> {
  const git = getGitWrapper();

  await showProgress('Analyzing diverged commits...', async () => {
    await git.fetchRemote();
  });

  const status = await git.getStatus();

  if (!status.tracking) {
    showWarning('No tracking branch configured. Cannot compare with remote.');
    return;
  }

  const diverged = await git.getDivergedCommits();

  if (diverged.local.length === 0 && diverged.remote.length === 0) {
    showSuccess('Branch is in sync with remote');
    return;
  }

  const items: vscode.QuickPickItem[] = [];

  if (diverged.local.length > 0) {
    items.push({
      label: '--- Local commits (not on remote) ---',
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const commit of diverged.local) {
      items.push({
        label: `$(arrow-up) ${commit.hash.substring(0, 7)}`,
        description: commit.message.split('\n')[0].substring(0, 50),
        detail: `${commit.author} - ${new Date(commit.date).toLocaleDateString()}`,
      });
    }
  }

  if (diverged.remote.length > 0) {
    items.push({
      label: '--- Remote commits (not local) ---',
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const commit of diverged.remote) {
      items.push({
        label: `$(arrow-down) ${commit.hash.substring(0, 7)}`,
        description: commit.message.split('\n')[0].substring(0, 50),
        detail: `${commit.author} - ${new Date(commit.date).toLocaleDateString()}`,
      });
    }
  }

  items.push({
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
  });

  items.push({
    label: '$(git-merge) Reset to Remote',
    description: 'Abandon local commits and match remote',
    detail: `Warning: This will discard ${diverged.local.length} local commit(s)`,
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${diverged.local.length} local, ${diverged.remote.length} remote commits diverged`,
    title: 'Git Panic: Diverged Commits',
  });

  if (selected?.label.includes('Reset to Remote')) {
    await resetToRemote(status.tracking);
  }
}

async function resetToRemote(tracking: string): Promise<void> {
  const git = getGitWrapper();

  const confirm = await vscode.window.showWarningMessage(
    `Reset to ${tracking}? This will discard all local commits not on remote.`,
    { modal: true },
    'Reset to Remote',
    'Cancel'
  );

  if (confirm !== 'Reset to Remote') {
    return;
  }

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Reset to remote: ${tracking}`
  );

  await git.hardReset(tracking);

  await actionHistory.completeAction(action);

  showSuccess(
    `Reset to ${tracking}`,
    'View Log',
    () => logger.show()
  );
}

async function findLostCommitsInReflog(): Promise<void> {
  const git = getGitWrapper();
  const reflog = await git.getReflog(50);

  if (reflog.length === 0) {
    showWarning('No reflog entries found');
    return;
  }

  const commitHashes = new Set<string>();
  const uniqueEntries = reflog.filter((entry) => {
    if (commitHashes.has(entry.hash)) {
      return false;
    }
    commitHashes.add(entry.hash);
    return true;
  });

  const items = uniqueEntries.map((entry) => ({
    label: `$(git-commit) ${entry.hash.substring(0, 7)}`,
    description: entry.action,
    detail: entry.message,
    hash: entry.hash,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a commit to recover to',
    title: 'Git Panic: Reflog History',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  const recoveryOptions = [
    { label: '$(git-branch) Create branch at this commit', action: 'branch' as const },
    { label: '$(history) Reset HEAD to this commit', action: 'reset' as const },
    { label: '$(git-cherry-pick) Cherry-pick this commit', action: 'cherry-pick' as const },
  ];

  const recoveryAction = await vscode.window.showQuickPick(recoveryOptions, {
    placeHolder: `What do you want to do with ${selected.hash.substring(0, 7)}?`,
    title: 'Git Panic: Recover Commit',
  });

  if (!recoveryAction) {
    return;
  }

  switch (recoveryAction.action) {
    case 'branch':
      await createBranchAtCommit(selected.hash);
      break;
    case 'reset':
      await resetToCommit(selected.hash);
      break;
    case 'cherry-pick':
      await cherryPickCommit(selected.hash);
      break;
  }
}

async function createBranchAtCommit(hash: string): Promise<void> {
  const git = getGitWrapper();

  const branchName = await vscode.window.showInputBox({
    placeHolder: 'Enter new branch name',
    title: 'Git Panic: Create Recovery Branch',
    validateInput: (value) => {
      if (!value) return 'Branch name is required';
      if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
        return 'Branch name can only contain letters, numbers, /, _, and -';
      }
      return null;
    },
  });

  if (!branchName) {
    return;
  }

  await git.checkoutNewBranch(branchName, hash);

  showSuccess(`Created branch "${branchName}" at ${hash.substring(0, 7)}`);
}

async function resetToCommit(hash: string): Promise<void> {
  const git = getGitWrapper();

  const confirm = await vscode.window.showWarningMessage(
    `Reset HEAD to ${hash.substring(0, 7)}? This will change your commit history.`,
    { modal: true },
    'Reset',
    'Cancel'
  );

  if (confirm !== 'Reset') {
    return;
  }

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Reset to reflog commit: ${hash.substring(0, 7)}`
  );

  await git.hardReset(hash);

  await actionHistory.completeAction(action);

  showSuccess(
    `Reset to ${hash.substring(0, 7)}`,
    'View Log',
    () => logger.show()
  );
}

async function cherryPickCommit(hash: string): Promise<void> {
  const git = getGitWrapper();

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Cherry-pick commit: ${hash.substring(0, 7)}`
  );

  try {
    await git.cherryPick(hash);

    await actionHistory.completeAction(action);

    showSuccess(`Cherry-picked ${hash.substring(0, 7)}`);
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      await actionHistory.completeAction(action);
      showWarning('Cherry-pick has conflicts. Resolve them and commit manually.');
    } else {
      throw error;
    }
  }
}

async function fetchAndCompare(): Promise<void> {
  const git = getGitWrapper();

  await showProgress('Fetching from remote...', async () => {
    await git.fetchRemote();
  });

  const status = await git.getStatus();

  if (!status.tracking) {
    showWarning('No tracking branch configured');
    return;
  }

  let message = `Synced with remote.\n\n`;
  message += `Branch: ${status.current}\n`;
  message += `Tracking: ${status.tracking}\n`;
  message += `Ahead: ${status.ahead} commit(s)\n`;
  message += `Behind: ${status.behind} commit(s)`;

  if (status.ahead === 0 && status.behind === 0) {
    showSuccess('Branch is up to date with remote');
  } else {
    vscode.window.showInformationMessage(message, 'Check Diverged Commits').then((action) => {
      if (action === 'Check Diverged Commits') {
        checkDivergedCommits();
      }
    });
  }
}
