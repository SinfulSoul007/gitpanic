import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function unstageFiles(): Promise<void> {
  try {
    const git = getGitWrapper();
    const status = await git.getStatus();

    if (status.staged.length === 0) {
      showWarning('No staged files to unstage');
      return;
    }

    const options = [
      {
        label: '$(check-all) Unstage All Files',
        description: `${status.staged.length} file(s) staged`,
        detail: 'Unstage all currently staged files',
        action: 'all' as const,
      },
      {
        label: '$(list-selection) Select Files to Unstage',
        description: 'Choose specific files',
        detail: 'Pick individual files to unstage',
        action: 'select' as const,
      },
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'How do you want to unstage files?',
      title: 'Git Panic: Unstage Files',
    });

    if (!selected) {
      return;
    }

    if (selected.action === 'all') {
      await unstageAllFiles();
    } else {
      await selectFilesToUnstage(status.staged);
    }
  } catch (error) {
    logger.error('Failed to unstage files', error as Error);
    showError(`Failed to unstage files: ${(error as Error).message}`);
  }
}

async function unstageAllFiles(): Promise<void> {
  const git = getGitWrapper();
  const status = await git.getStatus();
  const count = status.staged.length;

  await git.unstageAll();

  showSuccess(`Unstaged ${count} file(s)`);
}

async function selectFilesToUnstage(stagedFiles: string[]): Promise<void> {
  const git = getGitWrapper();

  const fileItems = stagedFiles.map((file) => ({
    label: file,
    description: 'Staged',
    picked: false,
  }));

  const selected = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Select files to unstage (use Space to select, Enter to confirm)',
    title: 'Git Panic: Select Files to Unstage',
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {
    return;
  }

  for (const file of selected) {
    await git.unstageFile(file.label);
  }

  showSuccess(`Unstaged ${selected.length} file(s)`);
}
