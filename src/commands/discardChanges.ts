import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

interface DiscardOption {
  label: string;
  description: string;
  detail: string;
  action: 'select' | 'unstaged' | 'all';
}

export async function discardChanges(): Promise<void> {
  try {
    const git = getGitWrapper();
    const status = await git.getStatus();

    const hasStaged = status.staged.length > 0;
    const hasModified = status.modified.length > 0;

    if (!hasStaged && !hasModified) {
      showWarning('No changes to discard');
      return;
    }

    const options: DiscardOption[] = [];

    if (hasModified) {
      options.push({
        label: '$(list-selection) Select Files to Discard',
        description: 'Choose specific files',
        detail: 'Pick individual files to discard changes from',
        action: 'select',
      });

      options.push({
        label: '$(trash) Discard All Unstaged Changes',
        description: `${status.modified.length} modified file(s)`,
        detail: 'Discard changes in all modified files (keeps staged changes)',
        action: 'unstaged',
      });
    }

    if (hasStaged || hasModified) {
      options.push({
        label: '$(warning) Discard ALL Changes',
        description: `${status.staged.length} staged, ${status.modified.length} modified`,
        detail: 'DANGEROUS: Discard both staged and unstaged changes',
        action: 'all',
      });
    }

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'What changes do you want to discard?',
      title: 'Git Panic: Discard Changes',
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'select':
        await selectFilesToDiscard(status.modified);
        break;
      case 'unstaged':
        await discardUnstagedChanges(status.modified);
        break;
      case 'all':
        await discardAllChanges(status.staged, status.modified);
        break;
    }
  } catch (error) {
    logger.error('Failed to discard changes', error as Error);
    showError(`Failed to discard changes: ${(error as Error).message}`);
  }
}

async function selectFilesToDiscard(modifiedFiles: string[]): Promise<void> {
  const git = getGitWrapper();

  const fileItems = modifiedFiles.map((file) => ({
    label: file,
    description: 'Modified',
    picked: false,
  }));

  const selected = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Select files to discard changes (use Space to select, Enter to confirm)',
    title: 'Git Panic: Select Files to Discard',
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Discard changes in ${selected.length} file(s)? This cannot be undone.`,
    { modal: true },
    'Discard',
    'Cancel'
  );

  if (confirm !== 'Discard') {
    return;
  }

  for (const file of selected) {
    await git.discardFileChanges(file.label);
  }

  showSuccess(`Discarded changes in ${selected.length} file(s)`);
}

async function discardUnstagedChanges(modifiedFiles: string[]): Promise<void> {
  const git = getGitWrapper();

  const confirm = await vscode.window.showWarningMessage(
    `Discard unstaged changes in ${modifiedFiles.length} file(s)? This cannot be undone.\n\nFiles: ${modifiedFiles.slice(0, 5).join(', ')}${modifiedFiles.length > 5 ? '...' : ''}`,
    { modal: true },
    'Discard All Unstaged',
    'Cancel'
  );

  if (confirm !== 'Discard All Unstaged') {
    return;
  }

  await git.discardAllChanges();

  showSuccess(`Discarded changes in ${modifiedFiles.length} file(s)`);
}

async function discardAllChanges(stagedFiles: string[], modifiedFiles: string[]): Promise<void> {
  const git = getGitWrapper();
  const totalCount = stagedFiles.length + modifiedFiles.length;

  const confirm = await vscode.window.showWarningMessage(
    `DANGER: Discard ALL changes?\n\n${stagedFiles.length} staged file(s)\n${modifiedFiles.length} modified file(s)\n\nThis cannot be undone!`,
    { modal: true },
    'Discard Everything',
    'Cancel'
  );

  if (confirm !== 'Discard Everything') {
    return;
  }

  if (stagedFiles.length > 0) {
    await git.unstageAll();
  }

  await git.discardAllChanges();

  showSuccess(`Discarded all changes in ${totalCount} file(s)`);
}
