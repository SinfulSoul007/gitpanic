import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function cleanUntracked(): Promise<void> {
  try {
    const git = getGitWrapper();
    const untrackedFiles = await git.getUntrackedFiles();

    if (untrackedFiles.length === 0) {
      showWarning('No untracked files to clean');
      return;
    }

    const options = [
      {
        label: '$(eye) Preview What Would Be Deleted',
        description: 'Dry run - see files without deleting',
        detail: 'Shows exactly what files would be removed',
        action: 'preview' as const,
      },
      {
        label: '$(list-selection) Select Files to Delete',
        description: 'Choose specific files',
        detail: 'Pick individual files to remove',
        action: 'select' as const,
      },
      {
        label: '$(trash) Delete All Untracked Files',
        description: `${untrackedFiles.length} file(s)`,
        detail: 'DANGEROUS: Remove all untracked files and directories',
        action: 'all' as const,
      },
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'How do you want to clean untracked files?',
      title: 'Git Panic: Clean Untracked Files',
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'preview':
        await previewClean();
        break;
      case 'select':
        await selectFilesToClean(untrackedFiles);
        break;
      case 'all':
        await cleanAllUntracked();
        break;
    }
  } catch (error) {
    logger.error('Failed to clean untracked files', error as Error);
    showError(`Failed to clean untracked files: ${(error as Error).message}`);
  }
}

async function previewClean(): Promise<void> {
  const git = getGitWrapper();
  const wouldRemove = await git.cleanDryRun();

  if (wouldRemove.length === 0) {
    showWarning('No files would be removed');
    return;
  }

  const items = wouldRemove.map((file) => ({
    label: `$(trash) ${file}`,
    description: 'Would be deleted',
  }));

  items.push({
    label: '',
    description: '',
  });

  items.push({
    label: '$(warning) Delete These Files',
    description: `Remove ${wouldRemove.length} file(s)`,
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${wouldRemove.length} file(s) would be removed`,
    title: 'Git Panic: Clean Preview',
  });

  if (selected?.label.includes('Delete These Files')) {
    await cleanAllUntracked();
  }
}

async function selectFilesToClean(untrackedFiles: string[]): Promise<void> {
  const git = getGitWrapper();

  const fileItems = untrackedFiles.map((file) => ({
    label: file,
    description: 'Untracked',
    picked: false,
  }));

  const selected = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Select files to delete (use Space to select, Enter to confirm)',
    title: 'Git Panic: Select Files to Clean',
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete ${selected.length} file(s)? This cannot be undone.\n\nFiles: ${selected.slice(0, 5).map((f) => f.label).join(', ')}${selected.length > 5 ? '...' : ''}`,
    { modal: true },
    'Delete Selected',
    'Cancel'
  );

  if (confirm !== 'Delete Selected') {
    return;
  }

  const filesToClean = selected.map((item) => item.label);
  await git.cleanUntrackedFiles(filesToClean);

  showSuccess(`Deleted ${selected.length} file(s)`);
}

async function cleanAllUntracked(): Promise<void> {
  const git = getGitWrapper();
  const wouldRemove = await git.cleanDryRun();

  if (wouldRemove.length === 0) {
    showWarning('No files to clean');
    return;
  }

  const fileList = wouldRemove.slice(0, 10).join('\n');
  const moreCount = wouldRemove.length - 10;

  const confirm = await vscode.window.showWarningMessage(
    `DANGER: Delete ${wouldRemove.length} untracked file(s)?\n\n${fileList}${moreCount > 0 ? `\n...and ${moreCount} more` : ''}\n\nThis cannot be undone!`,
    { modal: true },
    'Delete All',
    'Cancel'
  );

  if (confirm !== 'Delete All') {
    return;
  }

  await git.cleanUntrackedFiles();

  showSuccess(`Deleted ${wouldRemove.length} untracked file(s)`);
}
