import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

interface StashAction {
  label: string;
  description: string;
  detail: string;
  action: 'create' | 'apply' | 'pop' | 'drop' | 'view' | 'recover';
}

export async function openStash(): Promise<void> {
  try {
    const git = getGitWrapper();
    const stashList = await git.getStashList();
    const hasChanges = await git.hasUncommittedChanges();

    const actions: StashAction[] = [];

    if (hasChanges) {
      actions.push({
        label: '$(plus) Create New Stash',
        description: 'Save current changes to stash',
        detail: 'Stash your uncommitted changes for later',
        action: 'create',
      });
    }

    if (stashList.length > 0) {
      actions.push({
        label: '$(list-flat) View Stash List',
        description: `${stashList.length} stash(es) available`,
        detail: 'Browse and manage your stashes',
        action: 'view',
      });

      actions.push({
        label: '$(arrow-down) Apply Latest Stash',
        description: stashList[0]?.message || 'No message',
        detail: 'Apply stash@{0} without removing it',
        action: 'apply',
      });

      actions.push({
        label: '$(check) Pop Latest Stash',
        description: stashList[0]?.message || 'No message',
        detail: 'Apply stash@{0} and remove it from stash list',
        action: 'pop',
      });
    }

    actions.push({
      label: '$(history) Recover Dropped Stash',
      description: 'Search reflog for dropped stashes',
      detail: 'Recover accidentally dropped stashes',
      action: 'recover',
    });

    if (stashList.length === 0 && !hasChanges) {
      showWarning('No stashes and no changes to stash');
      return;
    }

    const selected = await vscode.window.showQuickPick(actions, {
      placeHolder: 'What do you want to do with stashes?',
      title: 'Git Panic: Stash Operations',
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'create':
        await createStash();
        break;
      case 'view':
        await viewStashList();
        break;
      case 'apply':
        await applyStash(0);
        break;
      case 'pop':
        await popStash(0);
        break;
      case 'recover':
        await recoverDroppedStash();
        break;
    }
  } catch (error) {
    logger.error('Failed to handle stash operation', error as Error);
    showError(`Failed to handle stash operation: ${(error as Error).message}`);
  }
}

async function createStash(): Promise<void> {
  const git = getGitWrapper();

  const message = await vscode.window.showInputBox({
    placeHolder: 'Optional stash message',
    title: 'Git Panic: Create Stash',
    prompt: 'Enter a description for this stash (optional)',
  });

  if (message === undefined) {
    return;
  }

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Create stash${message ? `: ${message}` : ''}`
  );

  await git.createStash(message || undefined);

  await actionHistory.completeAction(action);

  showSuccess(
    `Changes stashed${message ? `: "${message}"` : ''}`,
    'View Stashes',
    () => viewStashList()
  );
}

async function viewStashList(): Promise<void> {
  const git = getGitWrapper();
  const stashList = await git.getStashList();

  if (stashList.length === 0) {
    showWarning('No stashes found');
    return;
  }

  const stashItems = stashList.map((stash) => ({
    label: `stash@{${stash.index}}`,
    description: stash.message,
    detail: `Hash: ${stash.hash.substring(0, 7)}`,
    index: stash.index,
  }));

  const selected = await vscode.window.showQuickPick(stashItems, {
    placeHolder: 'Select a stash to manage',
    title: 'Git Panic: Stash List',
  });

  if (!selected) {
    return;
  }

  const stashActions = [
    { label: '$(arrow-down) Apply', description: 'Apply without removing', action: 'apply' as const },
    { label: '$(check) Pop', description: 'Apply and remove', action: 'pop' as const },
    { label: '$(trash) Drop', description: 'Remove from stash list', action: 'drop' as const },
  ];

  const stashAction = await vscode.window.showQuickPick(stashActions, {
    placeHolder: `What do you want to do with stash@{${selected.index}}?`,
    title: 'Git Panic: Stash Action',
  });

  if (!stashAction) {
    return;
  }

  switch (stashAction.action) {
    case 'apply':
      await applyStash(selected.index);
      break;
    case 'pop':
      await popStash(selected.index);
      break;
    case 'drop':
      await dropStash(selected.index);
      break;
  }
}

async function applyStash(index: number): Promise<void> {
  const git = getGitWrapper();

  try {
    await git.applyStash(index);
    showSuccess(`Applied stash@{${index}}`);
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      showWarning('Stash applied with conflicts. Resolve them manually.');
    } else {
      throw error;
    }
  }
}

async function popStash(index: number): Promise<void> {
  const git = getGitWrapper();

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Pop stash@{${index}}`
  );

  try {
    await git.popStash(index);
    await actionHistory.completeAction(action);
    showSuccess(`Popped stash@{${index}}`);
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      await actionHistory.completeAction(action);
      showWarning('Stash applied with conflicts. Resolve them manually. Stash was not removed.');
    } else {
      throw error;
    }
  }
}

async function dropStash(index: number): Promise<void> {
  const git = getGitWrapper();

  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to drop stash@{${index}}? This cannot be easily undone.`,
    { modal: true },
    'Drop Stash',
    'Cancel'
  );

  if (confirm !== 'Drop Stash') {
    return;
  }

  await git.dropStash(index);

  showSuccess(
    `Dropped stash@{${index}}`,
    'Recover',
    () => recoverDroppedStash()
  );
}

async function recoverDroppedStash(): Promise<void> {
  const git = getGitWrapper();
  const droppedStashes = await git.getDroppedStashes();

  if (droppedStashes.length === 0) {
    showWarning('No dropped stashes found in reflog');
    return;
  }

  const stashItems = droppedStashes.map((stash) => ({
    label: `$(history) ${stash.hash.substring(0, 7)}`,
    description: stash.message,
    hash: stash.hash,
  }));

  const selected = await vscode.window.showQuickPick(stashItems, {
    placeHolder: 'Select a dropped stash to recover',
    title: 'Git Panic: Recover Dropped Stash',
  });

  if (!selected) {
    return;
  }

  await git.recoverStash(selected.hash);

  showSuccess(
    `Recovered stash from ${selected.hash.substring(0, 7)}`,
    'View Stashes',
    () => viewStashList()
  );
}
