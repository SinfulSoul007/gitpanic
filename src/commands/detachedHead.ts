import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeBranchCreate, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

interface DetachedHeadOption {
  label: string;
  description: string;
  detail: string;
  action: 'create-branch' | 'checkout-existing';
}

const detachedHeadOptions: DetachedHeadOption[] = [
  {
    label: '$(git-branch) Create New Branch from Current State',
    description: 'Recommended - save your work',
    detail: 'Create a new branch pointing to current commit to preserve your work',
    action: 'create-branch',
  },
  {
    label: '$(git-commit) Checkout Existing Branch',
    description: 'Switch to an existing branch',
    detail: 'Warning: uncommitted changes on detached HEAD may be lost',
    action: 'checkout-existing',
  },
];

export async function fixDetachedHead(): Promise<void> {
  try {
    const git = getGitWrapper();

    const isDetached = await git.isDetachedHead();
    if (!isDetached) {
      showWarning('Not in detached HEAD state');
      return;
    }

    const detachedInfo = await git.getDetachedHeadInfo();
    const infoMessage = detachedInfo
      ? `Currently at ${detachedInfo.hash}: "${detachedInfo.message.split('\n')[0].substring(0, 40)}"`
      : 'Detached HEAD state detected';

    vscode.window.showInformationMessage(`$(warning) ${infoMessage}`);

    const selectedOption = await vscode.window.showQuickPick(detachedHeadOptions, {
      placeHolder: 'How do you want to fix the detached HEAD?',
      title: 'Git Panic: Fix Detached HEAD',
    });

    if (!selectedOption) {
      return;
    }

    if (selectedOption.action === 'create-branch') {
      await createBranchFromDetached();
    } else {
      await checkoutExistingBranch();
    }
  } catch (error) {
    logger.error('Failed to fix detached HEAD', error as Error);
    showError(`Failed to fix detached HEAD: ${(error as Error).message}`);
  }
}

async function createBranchFromDetached(): Promise<void> {
  const git = getGitWrapper();

  const branchName = await vscode.window.showInputBox({
    placeHolder: 'Enter new branch name',
    title: 'Git Panic: Create Branch from Detached HEAD',
    prompt: 'This will create a new branch at the current commit',
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

  const safetyCheck = await checkBeforeBranchCreate(branchName);
  if (!(await showSafetyWarnings(safetyCheck))) {
    return;
  }

  const action = await actionHistory.recordAction(
    'create_branch',
    `Create branch "${branchName}" from detached HEAD`
  );

  await git.checkoutNewBranch(branchName);

  await actionHistory.completeAction(action);

  showSuccess(
    `Created and switched to branch "${branchName}"`,
    'View Log',
    () => logger.show()
  );
}

async function checkoutExistingBranch(): Promise<void> {
  const git = getGitWrapper();

  const branches = await git.getBranches();
  const branchItems = branches.all
    .filter((b) => !b.startsWith('remotes/'))
    .map((branch) => ({
      label: branch === branches.current ? `$(check) ${branch}` : branch,
      description: branch === branches.current ? 'current' : '',
    }));

  if (branchItems.length === 0) {
    showError('No local branches found');
    return;
  }

  const selectedBranch = await vscode.window.showQuickPick(branchItems, {
    placeHolder: 'Select branch to checkout',
    title: 'Git Panic: Checkout Branch',
  });

  if (!selectedBranch) {
    return;
  }

  const branchName = selectedBranch.label.replace('$(check) ', '');

  const hasChanges = await git.hasUncommittedChanges();
  if (hasChanges) {
    const proceed = await vscode.window.showWarningMessage(
      'You have uncommitted changes. They may be lost when switching branches.',
      { modal: true },
      'Proceed',
      'Cancel'
    );
    if (proceed !== 'Proceed') {
      return;
    }
  }

  await git.checkoutBranch(branchName);

  showSuccess(`Switched to branch "${branchName}"`);
}
