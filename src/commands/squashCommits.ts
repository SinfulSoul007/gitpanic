import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeReset, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function squashCommits(): Promise<void> {
  try {
    const git = getGitWrapper();

    const commits = await git.getRecentCommits(10);
    if (commits.length < 2) {
      showWarning('Need at least 2 commits to squash');
      return;
    }

    const commitItems = commits.map((commit, index) => ({
      label: `${index + 1}. ${commit.message.split('\n')[0].substring(0, 50)}`,
      description: commit.hash.substring(0, 7),
      detail: `${commit.author} - ${new Date(commit.date).toLocaleDateString()}`,
      commitCount: index + 1,
    }));

    const selectedCommit = await vscode.window.showQuickPick(commitItems, {
      placeHolder: 'How many commits to squash into one?',
      title: 'Git Panic: Squash Commits',
    });

    if (!selectedCommit || selectedCommit.commitCount < 2) {
      if (selectedCommit?.commitCount === 1) {
        showWarning('Select at least 2 commits to squash');
      }
      return;
    }

    const commitsToSquash = commits.slice(0, selectedCommit.commitCount);
    const existingMessages = commitsToSquash
      .map((c, i) => `${i + 1}. ${c.message}`)
      .reverse()
      .join('\n\n');

    const newMessage = await vscode.window.showInputBox({
      placeHolder: 'Enter the commit message for the squashed commit',
      title: 'Git Panic: New Commit Message',
      prompt: `Squashing ${selectedCommit.commitCount} commits`,
      value: commitsToSquash[commitsToSquash.length - 1].message.split('\n')[0],
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Commit message is required';
        }
        return null;
      },
    });

    if (!newMessage) {
      return;
    }

    const safetyCheck = await checkBeforeReset('soft', selectedCommit.commitCount);
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const confirmMessage = `Squash ${selectedCommit.commitCount} commits:\n\n${existingMessages.substring(0, 200)}${existingMessages.length > 200 ? '...' : ''}\n\nInto: "${newMessage}"`;

    const confirm = await vscode.window.showWarningMessage(
      confirmMessage,
      { modal: true },
      'Squash',
      'Cancel'
    );

    if (confirm !== 'Squash') {
      return;
    }

    const action = await actionHistory.recordAction(
      'undo_commit',
      `Squash ${selectedCommit.commitCount} commits`
    );

    await git.squashCommits(selectedCommit.commitCount, newMessage);

    await actionHistory.completeAction(action);

    showSuccess(
      `Squashed ${selectedCommit.commitCount} commits into one`,
      'View Log',
      () => logger.show()
    );
  } catch (error) {
    logger.error('Failed to squash commits', error as Error);
    showError(`Failed to squash commits: ${(error as Error).message}`);
  }
}
