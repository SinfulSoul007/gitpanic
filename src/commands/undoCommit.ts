import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeReset, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError } from '../ui/notifications';
import { logger } from '../utils/logger';

type ResetMode = 'soft' | 'mixed' | 'hard';

interface ResetOption {
  label: string;
  mode: ResetMode;
  description: string;
  detail: string;
}

const resetOptions: ResetOption[] = [
  {
    label: '$(history) Soft Reset',
    mode: 'soft',
    description: 'Keep changes staged',
    detail: 'Undo the commit but keep all changes staged and ready to commit again',
  },
  {
    label: '$(file) Mixed Reset',
    mode: 'mixed',
    description: 'Keep changes unstaged',
    detail: 'Undo the commit and unstage changes, but keep the files modified',
  },
  {
    label: '$(trash) Hard Reset',
    mode: 'hard',
    description: '⚠️ Discard all changes',
    detail: 'Completely undo the commit and discard all changes (DANGEROUS)',
  },
];

export async function undoLastCommit(): Promise<void> {
  try {
    const git = getGitWrapper();

    const commits = await git.getRecentCommits(5);
    if (commits.length === 0) {
      showError('No commits to undo');
      return;
    }

    const commitItems = commits.map((commit, index) => ({
      label: `${index + 1}. ${commit.message.split('\n')[0].substring(0, 60)}`,
      description: commit.hash.substring(0, 7),
      detail: `${commit.author} - ${new Date(commit.date).toLocaleDateString()}`,
      commitCount: index + 1,
    }));

    const selectedCommit = await vscode.window.showQuickPick(commitItems, {
      placeHolder: 'How many commits to undo?',
      title: 'Git Panic: Undo Commits',
    });

    if (!selectedCommit) {
      return;
    }

    const selectedMode = await vscode.window.showQuickPick(resetOptions, {
      placeHolder: 'How do you want to handle the changes?',
      title: 'Git Panic: Reset Mode',
    });

    if (!selectedMode) {
      return;
    }

    const safetyCheck = await checkBeforeReset(selectedMode.mode, selectedCommit.commitCount);
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const action = await actionHistory.recordAction(
      'undo_commit',
      `Undo ${selectedCommit.commitCount} commit(s) with ${selectedMode.mode} reset`
    );

    const resetRef = `HEAD~${selectedCommit.commitCount}`;

    switch (selectedMode.mode) {
      case 'soft':
        await git.softReset(resetRef);
        break;
      case 'mixed':
        await git.mixedReset(resetRef);
        break;
      case 'hard':
        await git.hardReset(resetRef);
        break;
    }

    await actionHistory.completeAction(action);

    showSuccess(
      `Undid ${selectedCommit.commitCount} commit(s) with ${selectedMode.mode} reset`,
      'View Log',
      () => logger.show()
    );
  } catch (error) {
    logger.error('Failed to undo commit', error as Error);
    showError(`Failed to undo commit: ${(error as Error).message}`);
  }
}
