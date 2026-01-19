import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { logger } from '../utils/logger';

export async function showDiffPreview(
  filePath: string,
  staged: boolean = false
): Promise<void> {
  try {
    const git = getGitWrapper();
    const diff = await git.getDiff(filePath, staged);

    if (!diff) {
      vscode.window.showInformationMessage('No changes to show');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitpanicDiff',
      `Diff: ${filePath}`,
      vscode.ViewColumn.One,
      {
        enableScripts: false,
      }
    );

    panel.webview.html = createDiffHtml(diff, filePath, staged);
  } catch (error) {
    logger.error('Failed to show diff preview', error as Error);
    vscode.window.showErrorMessage(`Failed to show diff: ${(error as Error).message}`);
  }
}

export async function showCommitDiffPreview(
  fromCommit: string,
  toCommit: string
): Promise<void> {
  try {
    const git = getGitWrapper();
    const diff = await git.getDiffBetweenCommits(fromCommit, toCommit);

    if (!diff) {
      vscode.window.showInformationMessage('No changes between commits');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitpanicDiff',
      `Diff: ${fromCommit.substring(0, 7)}..${toCommit.substring(0, 7)}`,
      vscode.ViewColumn.One,
      {
        enableScripts: false,
      }
    );

    panel.webview.html = createDiffHtml(diff, `${fromCommit.substring(0, 7)}..${toCommit.substring(0, 7)}`, false);
  } catch (error) {
    logger.error('Failed to show commit diff preview', error as Error);
    vscode.window.showErrorMessage(`Failed to show diff: ${(error as Error).message}`);
  }
}

function createDiffHtml(diff: string, title: string, staged: boolean): string {
  const escapedDiff = escapeHtml(diff);
  const coloredDiff = colorDiffLines(escapedDiff);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 14px);
      padding: 16px;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .header {
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 16px;
    }
    .header h2 {
      margin: 0;
      font-size: 16px;
    }
    .header .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-left: 8px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .diff-container {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.5;
    }
    .line-add {
      background-color: rgba(40, 167, 69, 0.2);
      color: #28a745;
    }
    .line-del {
      background-color: rgba(220, 53, 69, 0.2);
      color: #dc3545;
    }
    .line-header {
      color: var(--vscode-textPreformat-foreground);
      font-weight: bold;
    }
    .line-info {
      color: #6c757d;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>
      Git Panic: Diff Preview
      <span class="badge">${staged ? 'Staged' : 'Unstaged'}</span>
    </h2>
    <div style="color: var(--vscode-descriptionForeground); margin-top: 4px;">
      ${escapeHtml(title)}
    </div>
  </div>
  <div class="diff-container">${coloredDiff}</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function colorDiffLines(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return `<span class="line-add">${line}</span>`;
      }
      if (line.startsWith('-') && !line.startsWith('---')) {
        return `<span class="line-del">${line}</span>`;
      }
      if (line.startsWith('@@')) {
        return `<span class="line-header">${line}</span>`;
      }
      if (line.startsWith('diff ') || line.startsWith('index ') ||
          line.startsWith('---') || line.startsWith('+++')) {
        return `<span class="line-info">${line}</span>`;
      }
      return line;
    })
    .join('\n');
}

export interface DryRunResult {
  command: string;
  description: string;
  changes: string[];
  warnings: string[];
}

export async function showDryRunPreview(result: DryRunResult): Promise<boolean> {
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(terminal) Command that will run:',
      description: result.command,
      kind: vscode.QuickPickItemKind.Separator,
    },
  ];

  if (result.changes.length > 0) {
    items.push({
      label: '--- Changes ---',
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const change of result.changes.slice(0, 10)) {
      items.push({
        label: `  ${change}`,
      });
    }

    if (result.changes.length > 10) {
      items.push({
        label: `  ... and ${result.changes.length - 10} more`,
      });
    }
  }

  if (result.warnings.length > 0) {
    items.push({
      label: '--- Warnings ---',
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const warning of result.warnings) {
      items.push({
        label: `$(warning) ${warning}`,
      });
    }
  }

  items.push({
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
  });

  items.push({
    label: '$(check) Execute',
    description: 'Run the command',
  });

  items.push({
    label: '$(close) Cancel',
    description: 'Abort the operation',
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: result.description,
    title: 'Git Panic: Preview Operation',
  });

  return selected?.label === '$(check) Execute';
}
