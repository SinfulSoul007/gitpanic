import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { checkBeforeAmend, showSafetyWarnings } from '../core/safetyChecks';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError } from '../ui/notifications';
import { logger } from '../utils/logger';

export async function addToLastCommit(): Promise<void> {
  try {
    const git = getGitWrapper();

    const lastCommit = await git.getLastCommit();
    if (!lastCommit) {
      showError('No commits to amend');
      return;
    }

    const status = await git.getStatus();
    const hasChanges = status.modified.length > 0 || status.staged.length > 0 || status.untracked.length > 0;

    if (!hasChanges) {
      showError('No changes to add to the commit');
      return;
    }

    const safetyCheck = await checkBeforeAmend();
    if (!(await showSafetyWarnings(safetyCheck))) {
      return;
    }

    const allFiles = [
      ...status.staged.map((f) => ({ file: f, status: 'staged' })),
      ...status.modified.map((f) => ({ file: f, status: 'modified' })),
      ...status.untracked.map((f) => ({ file: f, status: 'untracked' })),
    ];

    const fileItems = allFiles.map((item) => ({
      label: item.file,
      description: item.status,
      picked: item.status === 'staged',
      file: item.file,
    }));

    const selectedFiles = await vscode.window.showQuickPick(fileItems, {
      canPickMany: true,
      placeHolder: 'Select files to add to the last commit',
      title: 'Git Panic: Add to Last Commit',
    });

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    const filesToStage = selectedFiles.map((item) => item.file);

    const updateMessage = await vscode.window.showQuickPick(
      [
        {
          label: '$(check) Keep current message',
          description: lastCommit.message.split('\n')[0].substring(0, 50),
          keepMessage: true,
        },
        {
          label: '$(edit) Edit message',
          description: 'Change the commit message',
          keepMessage: false,
        },
      ],
      {
        placeHolder: 'What about the commit message?',
        title: 'Git Panic: Commit Message',
      }
    );

    if (!updateMessage) {
      return;
    }

    let newMessage: string | undefined;
    if (!updateMessage.keepMessage) {
      newMessage = await vscode.window.showInputBox({
        prompt: 'Enter the new commit message',
        value: lastCommit.message,
        placeHolder: 'Commit message',
        title: 'Git Panic: Edit Commit Message',
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Commit message cannot be empty';
          }
          return null;
        },
      });

      if (newMessage === undefined) {
        return;
      }
    }

    const action = await actionHistory.recordAction(
      'amend_commit',
      `Added ${filesToStage.length} file(s) to last commit`
    );

    await git.stageFiles(filesToStage);
    await git.amendCommit(newMessage);

    await actionHistory.completeAction(action);

    showSuccess(
      `Added ${filesToStage.length} file(s) to last commit`,
      'View Log',
      () => logger.show()
    );
  } catch (error) {
    logger.error('Failed to add to last commit', error as Error);
    showError(`Failed to add to last commit: ${(error as Error).message}`);
  }
}
