import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeBranchCreate, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function recoverBranch(): Promise<void> {
  try {
    const git = getGitWrapper();

    const reflog = await git.getReflog(100);
    if (reflog.length === 0) {
      showError('No reflog entries found');
      return;
    }

    const branchMoves = reflog
      .filter((entry) => entry.message.includes('checkout: moving from'))
      .map((entry) => {
        const match = entry.message.match(/checkout: moving from (\S+) to (\S+)/);
        if (match) {
          return {
            fromBranch: match[1],
            toBranch: match[2],
            hash: entry.hash,
            message: entry.message,
          };
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const branches = await git.getBranches();
    const existingBranches = new Set(branches.all);

    const deletedBranches = new Map<string, { hash: string; message: string }>();

    for (const move of branchMoves) {
      if (!existingBranches.has(move.fromBranch) && !deletedBranches.has(move.fromBranch)) {
        if (move.fromBranch !== 'HEAD' && !move.fromBranch.match(/^[0-9a-f]{7,40}$/)) {
          deletedBranches.set(move.fromBranch, {
            hash: move.hash,
            message: move.message,
          });
        }
      }
    }

    if (deletedBranches.size === 0) {
      showError('No recently deleted branches found in reflog');
      return;
    }

    const branchItems = Array.from(deletedBranches.entries()).map(([name, info]) => ({
      label: `$(git-branch) ${name}`,
      description: info.hash.substring(0, 7),
      detail: 'Click to recover this branch',
      branchName: name,
      hash: info.hash,
    }));

    const selectedBranch = await vscode.window.showQuickPick(branchItems, {
      placeHolder: 'Select a branch to recover',
      title: 'Git Panic: Recover Deleted Branch',
    });

    if (!selectedBranch) {
      return;
    }

    let recoveryName = selectedBranch.branchName;

    if (existingBranches.has(recoveryName)) {
      const newName = await vscode.window.showInputBox({
        prompt: `Branch "${recoveryName}" already exists. Enter a new name:`,
        value: `${recoveryName}-recovered`,
        placeHolder: 'New branch name',
        title: 'Git Panic: Branch Name',
        validateInput: async (value) => {
          if (!value.trim()) {
            return 'Branch name cannot be empty';
          }
          const check = await checkBeforeBranchCreate(value);
          if (!check.safe) {
            return check.blockers[0];
          }
          return null;
        },
      });

      if (!newName) {
        return;
      }

      recoveryName = newName;
    }

    const safetyCheck = await checkBeforeBranchCreate(recoveryName);
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const action = await actionHistory.recordAction(
      'recover_branch',
      `Recovered branch "${recoveryName}" from ${selectedBranch.hash.substring(0, 7)}`
    );

    await git.recoverBranchFromReflog(recoveryName, selectedBranch.hash);

    await actionHistory.completeAction(action);

    const switchToBranch = await vscode.window.showInformationMessage(
      `Branch "${recoveryName}" recovered successfully!`,
      'Switch to Branch',
      'Stay Here'
    );

    if (switchToBranch === 'Switch to Branch') {
      await git.checkoutBranch(recoveryName);
      showSuccess(`Switched to ${recoveryName}`);
    } else {
      const currentBranch = await git.getCurrentBranch();
      if (currentBranch) {
        await git.checkoutBranch(currentBranch);
      }
    }
  } catch (error) {
    logger.error('Failed to recover branch', error as Error);
    showError(`Failed to recover branch: ${(error as Error).message}`);
  }
}
