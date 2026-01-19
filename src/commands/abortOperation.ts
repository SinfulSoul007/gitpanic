import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

type OngoingOperation = 'merge' | 'rebase' | 'cherry-pick' | 'bisect';

interface OperationInfo {
  name: string;
  description: string;
  canAbort: boolean;
  canContinue: boolean;
}

const operationDetails: Record<OngoingOperation, OperationInfo> = {
  merge: {
    name: 'Merge',
    description: 'A merge operation is in progress',
    canAbort: true,
    canContinue: true,
  },
  rebase: {
    name: 'Rebase',
    description: 'A rebase operation is in progress',
    canAbort: true,
    canContinue: true,
  },
  'cherry-pick': {
    name: 'Cherry-pick',
    description: 'A cherry-pick operation is in progress',
    canAbort: true,
    canContinue: true,
  },
  bisect: {
    name: 'Bisect',
    description: 'A bisect operation is in progress',
    canAbort: true,
    canContinue: false,
  },
};

export async function abortOperation(): Promise<void> {
  try {
    const git = getGitWrapper();

    const operation = await git.getOngoingOperation();
    if (!operation) {
      showWarning('No ongoing Git operation to abort');
      return;
    }

    const info = operationDetails[operation];
    const conflictedFiles = await git.getConflictedFiles();

    const options: vscode.QuickPickItem[] = [];

    if (info.canAbort) {
      options.push({
        label: `$(close) Abort ${info.name}`,
        description: 'Cancel the operation and return to previous state',
        detail: `Runs: git ${operation} --abort`,
      });
    }

    if (info.canContinue && conflictedFiles.length === 0) {
      options.push({
        label: `$(play) Continue ${info.name}`,
        description: 'Continue after resolving conflicts',
        detail: `Runs: git ${operation} --continue`,
      });
    }

    if (conflictedFiles.length > 0) {
      options.push({
        label: `$(warning) View ${conflictedFiles.length} Conflicted Files`,
        description: 'See files with merge conflicts',
        detail: conflictedFiles.slice(0, 3).join(', ') + (conflictedFiles.length > 3 ? '...' : ''),
      });
    }

    const statusMessage = conflictedFiles.length > 0
      ? `${info.description} with ${conflictedFiles.length} conflict(s)`
      : info.description;

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: statusMessage,
      title: `Git Panic: ${info.name} in Progress`,
    });

    if (!selected) {
      return;
    }

    if (selected.label.includes('Abort')) {
      await performAbort(operation);
    } else if (selected.label.includes('Continue')) {
      await performContinue(operation);
    } else if (selected.label.includes('View')) {
      await showConflictedFiles(conflictedFiles);
    }
  } catch (error) {
    logger.error('Failed to handle operation', error as Error);
    showError(`Failed to handle operation: ${(error as Error).message}`);
  }
}

async function performAbort(operation: OngoingOperation): Promise<void> {
  const git = getGitWrapper();
  const info = operationDetails[operation];

  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to abort the ${info.name.toLowerCase()}? This will discard any merge conflict resolutions.`,
    { modal: true },
    'Abort',
    'Cancel'
  );

  if (confirm !== 'Abort') {
    return;
  }

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Abort ${info.name.toLowerCase()} operation`
  );

  switch (operation) {
    case 'merge':
      await git.abortMerge();
      break;
    case 'rebase':
      await git.abortRebase();
      break;
    case 'cherry-pick':
      await git.abortCherryPick();
      break;
    case 'bisect':
      await git.hardReset('BISECT_HEAD');
      break;
  }

  await actionHistory.completeAction(action);

  showSuccess(
    `${info.name} aborted successfully`,
    'View Log',
    () => logger.show()
  );
}

async function performContinue(operation: OngoingOperation): Promise<void> {
  const git = getGitWrapper();
  const info = operationDetails[operation];

  try {
    switch (operation) {
      case 'merge':
        await git.continueMerge();
        break;
      case 'rebase':
        await git.continueRebase();
        break;
      case 'cherry-pick':
        await git.continueCherryPick();
        break;
    }

    showSuccess(`${info.name} completed successfully`);
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      showError('Cannot continue: there are still unresolved conflicts');
    } else {
      throw error;
    }
  }
}

async function showConflictedFiles(files: string[]): Promise<void> {
  const fileItems = files.map((file) => ({
    label: `$(warning) ${file}`,
    description: 'Has merge conflicts',
    filePath: file,
  }));

  const selected = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Select a file to open',
    title: 'Git Panic: Conflicted Files',
  });

  if (selected) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const uri = vscode.Uri.file(`${workspaceRoot}/${selected.filePath}`);
      await vscode.window.showTextDocument(uri);
    }
  }
}
