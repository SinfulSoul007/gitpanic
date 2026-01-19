import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeAmend, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function fixCommitMessage(): Promise<void> {
  try {
    const git = getGitWrapper();

    const lastCommit = await git.getLastCommit();
    if (!lastCommit) {
      showError('No commits to amend');
      return;
    }

    const safetyCheck = await checkBeforeAmend();
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const currentMessage = lastCommit.message;

    const newMessage = await vscode.window.showInputBox({
      prompt: 'Enter the new commit message',
      value: currentMessage,
      valueSelection: [0, currentMessage.length],
      placeHolder: 'New commit message',
      title: 'Git Panic: Fix Commit Message',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Commit message cannot be empty';
        }
        return null;
      },
    });

    if (!newMessage) {
      return;
    }

    if (newMessage === currentMessage) {
      vscode.window.showInformationMessage('Commit message unchanged');
      return;
    }

    const action = await actionHistory.recordAction(
      'amend_message',
      `Changed commit message from "${currentMessage.substring(0, 30)}..." to "${newMessage.substring(0, 30)}..."`
    );

    await git.amendCommitMessage(newMessage);

    await actionHistory.completeAction(action);

    showSuccess('Commit message updated successfully', 'View Log', () => logger.show());
  } catch (error) {
    logger.error('Failed to fix commit message', error as Error);
    showError(`Failed to fix commit message: ${(error as Error).message}`);
  }
}
