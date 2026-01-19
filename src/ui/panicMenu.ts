import * as vscode from 'vscode';
import { detectRepoState, RepoState } from '../core/stateDetector';
import { actionHistory } from '../core/actionHistory';
import { logger } from '../utils/logger';

interface PanicMenuItem extends vscode.QuickPickItem {
  command?: string;
  enabled: boolean;
  gitCommand?: string;
}

const gitCommandExplanations: Record<string, string> = {
  'gitpanic.undoLastCommit': 'git reset --soft/mixed/hard HEAD~N',
  'gitpanic.fixCommitMessage': 'git commit --amend -m "new message"',
  'gitpanic.addToLastCommit': 'git add <files> && git commit --amend --no-edit',
  'gitpanic.moveCommits': 'git cherry-pick <commits> && git reset --hard',
  'gitpanic.recoverBranch': 'git reflog && git checkout -b <branch> <hash>',
  'gitpanic.fixDetachedHead': 'git checkout -b <new-branch> or git checkout <existing-branch>',
  'gitpanic.abortOperation': 'git merge/rebase/cherry-pick --abort',
  'gitpanic.openStash': 'git stash push/pop/apply/drop',
  'gitpanic.recoverFile': 'git checkout <commit> -- <file>',
  'gitpanic.unstageFiles': 'git reset HEAD <file>',
  'gitpanic.squashCommits': 'git reset --soft HEAD~N && git commit',
  'gitpanic.discardChanges': 'git checkout -- <file>',
  'gitpanic.forcePushRecovery': 'git reflog && git reset --hard <hash>',
  'gitpanic.cleanUntracked': 'git clean -fd',
};

export async function openPanicMenu(): Promise<void> {
  const state = await detectRepoState();

  if (!state.isGitRepo) {
    vscode.window.showErrorMessage('Not in a Git repository');
    return;
  }

  const menuItems = buildMenuItems(state);

  const quickPick = vscode.window.createQuickPick<PanicMenuItem>();
  quickPick.title = 'Git Panic - What went wrong?';
  quickPick.placeholder = 'Select an action to fix your Git situation';
  quickPick.items = menuItems;
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    if (selected && selected.command && selected.enabled) {
      quickPick.hide();
      await vscode.commands.executeCommand(selected.command);
    } else if (selected && !selected.enabled) {
      vscode.window.showWarningMessage('This action is not available in the current state');
    }
  });

  quickPick.onDidHide(() => {
    quickPick.dispose();
  });

  quickPick.show();
}

function buildMenuItems(state: RepoState): PanicMenuItem[] {
  const items: PanicMenuItem[] = [];

  const hasCommits = state.lastCommit !== null;
  const lastUndoableAction = actionHistory.getLastUndoableAction();

  // Priority items based on state
  if (state.isDetachedHead) {
    items.push({
      label: '$(alert) Fix Detached HEAD State',
      description: 'RECOMMENDED - You are in detached HEAD',
      detail: `Create a branch or checkout existing. Git: ${gitCommandExplanations['gitpanic.fixDetachedHead']}`,
      command: 'gitpanic.fixDetachedHead',
      enabled: true,
      gitCommand: gitCommandExplanations['gitpanic.fixDetachedHead'],
    });
  }

  if (state.ongoingOperation) {
    const conflictText = state.hasConflicts ? ` (${state.conflictedFiles.length} conflicts)` : '';
    items.push({
      label: `$(warning) Abort/Continue ${state.ongoingOperation}${conflictText}`,
      description: 'RECOMMENDED - Operation in progress',
      detail: `Abort or continue the current operation. Git: ${gitCommandExplanations['gitpanic.abortOperation']}`,
      command: 'gitpanic.abortOperation',
      enabled: true,
      gitCommand: gitCommandExplanations['gitpanic.abortOperation'],
    });
  }

  if (state.isDetachedHead || state.ongoingOperation) {
    items.push({
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
      enabled: false,
    });
  }

  // Commit Operations
  items.push({
    label: '--- Commit Operations ---',
    kind: vscode.QuickPickItemKind.Separator,
    enabled: false,
  });

  items.push({
    label: '$(history) Undo Last Commit(s)',
    description: hasCommits ? state.lastCommit?.message.split('\n')[0].substring(0, 40) : 'No commits',
    detail: `Remove recent commits while keeping or discarding changes. Git: ${gitCommandExplanations['gitpanic.undoLastCommit']}`,
    command: 'gitpanic.undoLastCommit',
    enabled: hasCommits,
    gitCommand: gitCommandExplanations['gitpanic.undoLastCommit'],
  });

  items.push({
    label: '$(edit) Fix Commit Message',
    description: hasCommits ? `Current: "${state.lastCommit?.message.split('\n')[0].substring(0, 30)}..."` : 'No commits',
    detail: `Change the message of the last commit. Git: ${gitCommandExplanations['gitpanic.fixCommitMessage']}`,
    command: 'gitpanic.fixCommitMessage',
    enabled: hasCommits,
    gitCommand: gitCommandExplanations['gitpanic.fixCommitMessage'],
  });

  items.push({
    label: '$(add) Add Files to Last Commit',
    description: state.hasStagedChanges || state.hasUncommittedChanges ? 'Changes available' : 'No changes',
    detail: `Add forgotten files to the last commit. Git: ${gitCommandExplanations['gitpanic.addToLastCommit']}`,
    command: 'gitpanic.addToLastCommit',
    enabled: hasCommits && (state.hasStagedChanges || state.hasUncommittedChanges),
    gitCommand: gitCommandExplanations['gitpanic.addToLastCommit'],
  });

  items.push({
    label: '$(fold) Squash Commits',
    description: hasCommits ? 'Combine multiple commits' : 'Need 2+ commits',
    detail: `Merge several commits into one. Git: ${gitCommandExplanations['gitpanic.squashCommits']}`,
    command: 'gitpanic.squashCommits',
    enabled: hasCommits,
    gitCommand: gitCommandExplanations['gitpanic.squashCommits'],
  });

  // Branch Operations
  items.push({
    label: '--- Branch Operations ---',
    kind: vscode.QuickPickItemKind.Separator,
    enabled: false,
  });

  items.push({
    label: '$(git-branch) Move Commits to New Branch',
    description: hasCommits ? `Move from ${state.currentBranch}` : 'No commits',
    detail: `Move recent commits to a different branch. Git: ${gitCommandExplanations['gitpanic.moveCommits']}`,
    command: 'gitpanic.moveCommits',
    enabled: hasCommits,
    gitCommand: gitCommandExplanations['gitpanic.moveCommits'],
  });

  items.push({
    label: '$(search) Recover Deleted Branch',
    description: 'Search reflog for deleted branches',
    detail: `Restore a branch that was accidentally deleted. Git: ${gitCommandExplanations['gitpanic.recoverBranch']}`,
    command: 'gitpanic.recoverBranch',
    enabled: true,
    gitCommand: gitCommandExplanations['gitpanic.recoverBranch'],
  });

  if (!state.isDetachedHead) {
    items.push({
      label: '$(alert) Fix Detached HEAD State',
      description: 'Not currently in detached HEAD',
      detail: `Create a branch or checkout existing. Git: ${gitCommandExplanations['gitpanic.fixDetachedHead']}`,
      command: 'gitpanic.fixDetachedHead',
      enabled: false,
      gitCommand: gitCommandExplanations['gitpanic.fixDetachedHead'],
    });
  }

  items.push({
    label: '$(cloud-download) Force Push Recovery',
    description: state.hasRemote ? 'Compare with remote' : 'No remote configured',
    detail: `Recover from force push or diverged branches. Git: ${gitCommandExplanations['gitpanic.forcePushRecovery']}`,
    command: 'gitpanic.forcePushRecovery',
    enabled: state.hasRemote,
    gitCommand: gitCommandExplanations['gitpanic.forcePushRecovery'],
  });

  // Staging Operations
  items.push({
    label: '--- Staging Operations ---',
    kind: vscode.QuickPickItemKind.Separator,
    enabled: false,
  });

  items.push({
    label: '$(remove) Unstage Files',
    description: state.hasStagedChanges ? `${state.status?.staged.length} file(s) staged` : 'No staged files',
    detail: `Remove files from staging area. Git: ${gitCommandExplanations['gitpanic.unstageFiles']}`,
    command: 'gitpanic.unstageFiles',
    enabled: state.hasStagedChanges,
    gitCommand: gitCommandExplanations['gitpanic.unstageFiles'],
  });

  items.push({
    label: '$(trash) Discard Local Changes',
    description: state.hasUncommittedChanges ? 'Has uncommitted changes' : 'No changes',
    detail: `Discard unstaged or all local changes. Git: ${gitCommandExplanations['gitpanic.discardChanges']}`,
    command: 'gitpanic.discardChanges',
    enabled: state.hasUncommittedChanges,
    gitCommand: gitCommandExplanations['gitpanic.discardChanges'],
  });

  const untrackedCount = state.status?.untracked.length || 0;
  items.push({
    label: '$(clear-all) Clean Untracked Files',
    description: untrackedCount > 0 ? `${untrackedCount} untracked file(s)` : 'No untracked files',
    detail: `Remove untracked files and directories. Git: ${gitCommandExplanations['gitpanic.cleanUntracked']}`,
    command: 'gitpanic.cleanUntracked',
    enabled: untrackedCount > 0,
    gitCommand: gitCommandExplanations['gitpanic.cleanUntracked'],
  });

  // Recovery Operations
  items.push({
    label: '--- Recovery Operations ---',
    kind: vscode.QuickPickItemKind.Separator,
    enabled: false,
  });

  if (!state.ongoingOperation) {
    items.push({
      label: '$(stop) Abort Merge/Rebase/Cherry-pick',
      description: 'No operation in progress',
      detail: `Abort an ongoing Git operation. Git: ${gitCommandExplanations['gitpanic.abortOperation']}`,
      command: 'gitpanic.abortOperation',
      enabled: false,
      gitCommand: gitCommandExplanations['gitpanic.abortOperation'],
    });
  }

  items.push({
    label: '$(file-code) Recover File from History',
    description: 'Restore single file or deleted file',
    detail: `Restore a file to a previous version. Git: ${gitCommandExplanations['gitpanic.recoverFile']}`,
    command: 'gitpanic.recoverFile',
    enabled: true,
    gitCommand: gitCommandExplanations['gitpanic.recoverFile'],
  });

  items.push({
    label: '$(archive) Stash Operations',
    description: state.hasStashes ? `${state.stashCount} stash(es)` : 'No stashes',
    detail: `Create, apply, pop, or recover stashes. Git: ${gitCommandExplanations['gitpanic.openStash']}`,
    command: 'gitpanic.openStash',
    enabled: true,
    gitCommand: gitCommandExplanations['gitpanic.openStash'],
  });

  // Meta Operations
  items.push({
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
    enabled: false,
  });

  items.push({
    label: '$(discard) Undo Last GitPanic Action',
    description: lastUndoableAction ? `Undo: ${lastUndoableAction.description.substring(0, 40)}` : 'No actions to undo',
    detail: 'Revert the last GitPanic operation',
    command: 'gitpanic.undoLastAction',
    enabled: lastUndoableAction !== null,
  });

  // Issues Section
  if (state.issues.length > 0) {
    items.push({
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
      enabled: false,
    });

    items.push({
      label: '--- Repository Status ---',
      kind: vscode.QuickPickItemKind.Separator,
      enabled: false,
    });

    for (const issue of state.issues) {
      const icon = issue.type === 'error' ? '$(error)' : issue.type === 'warning' ? '$(warning)' : '$(info)';
      items.push({
        label: `${icon} ${issue.message}`,
        description: issue.suggestion || '',
        enabled: false,
      });
    }
  }

  return items;
}

export async function undoLastPanicAction(): Promise<void> {
  const result = await actionHistory.undoLastAction();

  if (result.success) {
    vscode.window.showInformationMessage(result.message);
  } else {
    vscode.window.showErrorMessage(result.message);
  }
}
