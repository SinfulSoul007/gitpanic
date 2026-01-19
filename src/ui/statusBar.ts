import * as vscode from 'vscode';
import { getConfig, onConfigChange } from '../utils/config';
import { logger } from '../utils/logger';
import { getGitWrapper } from '../core/gitWrapper';

let statusBarItem: vscode.StatusBarItem | null = null;
let updateInterval: NodeJS.Timeout | null = null;

export function createStatusBar(): vscode.StatusBarItem {
  if (statusBarItem) {
    return statusBarItem;
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );

  statusBarItem.text = '$(warning) Git Panic';
  statusBarItem.tooltip = 'Open Git Panic Menu - Quick fixes for Git disasters';
  statusBarItem.command = 'gitpanic.openPanicMenu';

  updateVisibility();
  startStateMonitoring();

  logger.info('Status bar item created');

  return statusBarItem;
}

async function updateStatusBarState(): Promise<void> {
  if (!statusBarItem) return;

  try {
    const git = getGitWrapper();
    const [isDetached, operation, conflictedFiles] = await Promise.all([
      git.isDetachedHead(),
      git.getOngoingOperation(),
      git.getConflictedFiles(),
    ]);

    if (isDetached) {
      statusBarItem.text = '$(alert) DETACHED HEAD';
      statusBarItem.tooltip = 'Click to fix detached HEAD state';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.command = 'gitpanic.fixDetachedHead';
      return;
    }

    if (operation) {
      const operationIcons: Record<string, string> = {
        'merge': '$(git-merge)',
        'rebase': '$(git-pull-request)',
        'cherry-pick': '$(git-cherry-pick)',
        'bisect': '$(search)',
      };
      const icon = operationIcons[operation] || '$(warning)';
      const hasConflicts = conflictedFiles.length > 0;

      statusBarItem.text = hasConflicts
        ? `${icon} ${operation.toUpperCase()} (${conflictedFiles.length} conflicts)`
        : `${icon} ${operation.toUpperCase()} in progress`;
      statusBarItem.tooltip = hasConflicts
        ? `Click to resolve conflicts or abort ${operation}`
        : `Click to continue or abort ${operation}`;
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.command = 'gitpanic.abortOperation';
      return;
    }

    // Reset to default state
    statusBarItem.text = '$(warning) Git Panic';
    statusBarItem.tooltip = 'Open Git Panic Menu - Quick fixes for Git disasters';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.command = 'gitpanic.openPanicMenu';
  } catch {
    // Silently ignore errors during state update
  }
}

function startStateMonitoring(): void {
  // Initial update
  updateStatusBarState();

  // Update every 5 seconds
  updateInterval = setInterval(updateStatusBarState, 5000);
}

function stopStateMonitoring(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

export function updateVisibility(): void {
  if (!statusBarItem) {
    return;
  }

  const config = getConfig();
  if (config.showStatusBarButton) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

export function registerStatusBarConfigListener(): vscode.Disposable {
  return onConfigChange((config) => {
    updateVisibility();
  });
}

export function disposeStatusBar(): void {
  stopStateMonitoring();
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = null;
    logger.info('Status bar item disposed');
  }
}

export function triggerStatusBarUpdate(): void {
  updateStatusBarState();
}

export function setStatusBarText(text: string): void {
  if (statusBarItem) {
    statusBarItem.text = text;
  }
}

export function resetStatusBarText(): void {
  if (statusBarItem) {
    statusBarItem.text = '$(warning) Git Panic';
  }
}
