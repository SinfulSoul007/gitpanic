import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeBranchCreate, checkBeforeReset, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function moveCommits(): Promise<void> {
  try {
    const git = getGitWrapper();

    const commits = await git.getRecentCommits(10);
    if (commits.length === 0) {
      showError('No commits to move');
      return;
    }

    const commitItems = commits.map((commit, index) => ({
      label: `${index + 1}. ${commit.message.split('\n')[0].substring(0, 60)}`,
      description: commit.hash.substring(0, 7),
      detail: `${commit.author} - ${new Date(commit.date).toLocaleDateString()}`,
      commitCount: index + 1,
      hash: commit.hash,
    }));

    const selectedCommit = await vscode.window.showQuickPick(commitItems, {
      placeHolder: 'Select how many commits to move (from most recent)',
      title: 'Git Panic: Move Commits to New Branch',
    });

    if (!selectedCommit) {
      return;
    }

    const branches = await git.getBranches();
    const currentBranch = await git.getCurrentBranch();

    const branchOptions = [
      {
        label: '$(add) Create new branch',
        description: 'Create a new branch for these commits',
        isNew: true,
        branchName: '',
      },
      ...branches.all
        .filter((b) => b !== currentBranch && !b.startsWith('remotes/'))
        .map((b) => ({
          label: `$(git-branch) ${b}`,
          description: 'Move to existing branch',
          isNew: false,
          branchName: b,
        })),
    ];

    const selectedBranch = await vscode.window.showQuickPick(branchOptions, {
      placeHolder: 'Where should these commits go?',
      title: 'Git Panic: Target Branch',
    });

    if (!selectedBranch) {
      return;
    }

    let targetBranch: string;

    if (selectedBranch.isNew) {
      const newBranchName = await vscode.window.showInputBox({
        prompt: 'Enter the new branch name',
        placeHolder: 'feature/my-new-branch',
        title: 'Git Panic: New Branch Name',
        validateInput: async (value) => {
          if (!value.trim()) {
            return 'Branch name cannot be empty';
          }
          if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
            return 'Branch name contains invalid characters';
          }
          const check = await checkBeforeBranchCreate(value);
          if (!check.safe) {
            return check.blockers[0];
          }
          return null;
        },
      });

      if (!newBranchName) {
        return;
      }

      targetBranch = newBranchName;
    } else {
      targetBranch = selectedBranch.branchName;
    }

    const safetyCheck = await checkBeforeReset('hard', selectedCommit.commitCount);
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const confirmResult = await vscode.window.showWarningMessage(
      `This will:\n` +
        `1. Create/switch to branch "${targetBranch}"\n` +
        `2. Cherry-pick ${selectedCommit.commitCount} commit(s)\n` +
        `3. Return to "${currentBranch}" and remove these commits\n\n` +
        `Continue?`,
      { modal: true },
      'Yes, move commits',
      'Cancel'
    );

    if (confirmResult !== 'Yes, move commits') {
      return;
    }

    const action = await actionHistory.recordAction(
      'move_commits',
      `Moved ${selectedCommit.commitCount} commit(s) to ${targetBranch}`
    );

    const commitsToMove = commits.slice(0, selectedCommit.commitCount).reverse();
    const headBeforeMove = await git.getHeadHash();

    if (selectedBranch.isNew) {
      const baseBranch = currentBranch || 'HEAD';
      await git.checkoutNewBranch(targetBranch, `${baseBranch}~${selectedCommit.commitCount}`);
    } else {
      await git.checkoutBranch(targetBranch);
    }

    for (const commit of commitsToMove) {
      try {
        await git.cherryPick(commit.hash);
      } catch (cherryPickError) {
        showError(`Cherry-pick failed for commit ${commit.hash.substring(0, 7)}. Please resolve conflicts manually.`);
        logger.error('Cherry-pick failed', cherryPickError as Error);
        return;
      }
    }

    await git.checkoutBranch(currentBranch!);
    await git.hardReset(`HEAD~${selectedCommit.commitCount}`);

    await actionHistory.completeAction(action);

    showSuccess(
      `Moved ${selectedCommit.commitCount} commit(s) to "${targetBranch}"`,
      'Switch to Branch',
      async () => {
        await git.checkoutBranch(targetBranch);
        vscode.window.showInformationMessage(`Switched to ${targetBranch}`);
      }
    );
  } catch (error) {
    logger.error('Failed to move commits', error as Error);
    showError(`Failed to move commits: ${(error as Error).message}`);
  }
}
