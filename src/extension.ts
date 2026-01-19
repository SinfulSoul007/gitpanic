import * as vscode from 'vscode';
import {
  undoLastCommit,
  fixCommitMessage,
  addToLastCommit,
  moveCommits,
  recoverBranch,
  fixDetachedHead,
  abortOperation,
  openStash,
  recoverFile,
  unstageFiles,
  squashCommits,
  discardChanges,
  forcePushRecovery,
  cleanUntracked,
} from './commands';
import { openPanicMenu, undoLastPanicAction } from './ui/panicMenu';
import { createStatusBar, registerStatusBarConfigListener, disposeStatusBar } from './ui/statusBar';
import { actionHistory } from './core/actionHistory';
import { logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Git Panic extension activating...');

  actionHistory.initialize(context);

  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(registerStatusBarConfigListener());

  const commands = [
    // Core commands
    vscode.commands.registerCommand('gitpanic.openPanicMenu', openPanicMenu),
    vscode.commands.registerCommand('gitpanic.undoLastCommit', undoLastCommit),
    vscode.commands.registerCommand('gitpanic.fixCommitMessage', fixCommitMessage),
    vscode.commands.registerCommand('gitpanic.addToLastCommit', addToLastCommit),
    vscode.commands.registerCommand('gitpanic.moveCommits', moveCommits),
    vscode.commands.registerCommand('gitpanic.recoverBranch', recoverBranch),
    vscode.commands.registerCommand('gitpanic.undoLastAction', undoLastPanicAction),

    // Tier 1: Critical commands
    vscode.commands.registerCommand('gitpanic.fixDetachedHead', fixDetachedHead),
    vscode.commands.registerCommand('gitpanic.abortOperation', abortOperation),
    vscode.commands.registerCommand('gitpanic.openStash', openStash),
    vscode.commands.registerCommand('gitpanic.recoverFile', recoverFile),
    vscode.commands.registerCommand('gitpanic.unstageFiles', unstageFiles),

    // Tier 2/3: High value commands
    vscode.commands.registerCommand('gitpanic.squashCommits', squashCommits),
    vscode.commands.registerCommand('gitpanic.discardChanges', discardChanges),
    vscode.commands.registerCommand('gitpanic.forcePushRecovery', forcePushRecovery),
    vscode.commands.registerCommand('gitpanic.cleanUntracked', cleanUntracked),
  ];

  context.subscriptions.push(...commands);

  logger.info('Git Panic extension activated successfully');
  logger.info(`Registered ${commands.length} commands`);
}

export function deactivate(): void {
  logger.info('Git Panic extension deactivating...');
  disposeStatusBar();
  logger.info('Git Panic extension deactivated');
}
