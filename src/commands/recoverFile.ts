import * as vscode from 'vscode';
import { getGitWrapper } from '../core/gitWrapper';
import { actionHistory } from '../core/actionHistory';
import { showSuccess, showError, showWarning } from '../ui/notifications';
import { logger } from '../utils/logger';

interface RecoverFileOption {
  label: string;
  description: string;
  detail: string;
  action: 'restore-version' | 'recover-deleted';
}

const recoverOptions: RecoverFileOption[] = [
  {
    label: '$(history) Restore File to Previous Version',
    description: 'Browse commit history for a file',
    detail: 'Select a specific version of an existing file to restore',
    action: 'restore-version',
  },
  {
    label: '$(trash) Recover Deleted File',
    description: 'Find and restore deleted files',
    detail: 'Search for files that were deleted in previous commits',
    action: 'recover-deleted',
  },
];

export async function recoverFile(): Promise<void> {
  try {
    const selected = await vscode.window.showQuickPick(recoverOptions, {
      placeHolder: 'What do you want to recover?',
      title: 'Git Panic: Recover File',
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'restore-version':
        await restoreFileVersion();
        break;
      case 'recover-deleted':
        await recoverDeletedFile();
        break;
    }
  } catch (error) {
    logger.error('Failed to recover file', error as Error);
    showError(`Failed to recover file: ${(error as Error).message}`);
  }
}

async function restoreFileVersion(): Promise<void> {
  const git = getGitWrapper();

  const activeEditor = vscode.window.activeTextEditor;
  let filePath = '';

  if (activeEditor) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      filePath = activeEditor.document.uri.fsPath.replace(workspaceRoot + '/', '').replace(workspaceRoot + '\\', '');
    }
  }

  const inputPath = await vscode.window.showInputBox({
    placeHolder: 'Enter file path (relative to repo root)',
    title: 'Git Panic: Select File to Restore',
    prompt: 'Enter the path to the file you want to restore',
    value: filePath,
    validateInput: (value) => {
      if (!value) return 'File path is required';
      return null;
    },
  });

  if (!inputPath) {
    return;
  }

  const history = await git.getFileHistory(inputPath, 20);

  if (history.length === 0) {
    showError(`No history found for "${inputPath}". Check if the file path is correct.`);
    return;
  }

  const commitItems = history.map((commit) => ({
    label: `${commit.hash.substring(0, 7)} - ${commit.message.split('\n')[0].substring(0, 50)}`,
    description: new Date(commit.date).toLocaleDateString(),
    detail: `Author: ${commit.author}`,
    hash: commit.hash,
  }));

  const selectedCommit = await vscode.window.showQuickPick(commitItems, {
    placeHolder: 'Select a version to restore',
    title: `Git Panic: File History for ${inputPath}`,
  });

  if (!selectedCommit) {
    return;
  }

  const previewOptions = [
    { label: '$(eye) Preview Changes', action: 'preview' as const },
    { label: '$(check) Restore Now', action: 'restore' as const },
  ];

  const previewChoice = await vscode.window.showQuickPick(previewOptions, {
    placeHolder: 'Preview changes before restoring?',
    title: 'Git Panic: Confirm Restore',
  });

  if (!previewChoice) {
    return;
  }

  if (previewChoice.action === 'preview') {
    await previewFileVersion(inputPath, selectedCommit.hash);

    const confirm = await vscode.window.showInformationMessage(
      'Do you want to restore this version?',
      'Restore',
      'Cancel'
    );

    if (confirm !== 'Restore') {
      return;
    }
  }

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Restore ${inputPath} to ${selectedCommit.hash.substring(0, 7)}`
  );

  await git.restoreFile(inputPath, selectedCommit.hash);

  await actionHistory.completeAction(action);

  showSuccess(
    `Restored "${inputPath}" to version ${selectedCommit.hash.substring(0, 7)}`,
    'Open File',
    async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const uri = vscode.Uri.file(`${workspaceRoot}/${inputPath}`);
        await vscode.window.showTextDocument(uri);
      }
    }
  );
}

async function previewFileVersion(filePath: string, commitHash: string): Promise<void> {
  const git = getGitWrapper();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    return;
  }

  const oldContent = await git.getFileAtCommit(filePath, commitHash);
  const oldUri = vscode.Uri.parse(`gitpanic-preview:${commitHash}/${filePath}`);

  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(): string {
      return oldContent;
    }
  })();

  const disposable = vscode.workspace.registerTextDocumentContentProvider('gitpanic-preview', provider);

  const currentUri = vscode.Uri.file(`${workspaceRoot}/${filePath}`);

  await vscode.commands.executeCommand('vscode.diff',
    oldUri,
    currentUri,
    `${filePath} (${commitHash.substring(0, 7)}) ↔ Current`
  );

  setTimeout(() => disposable.dispose(), 60000);
}

async function recoverDeletedFile(): Promise<void> {
  const git = getGitWrapper();
  const deletedFiles = await git.getDeletedFiles(50);

  if (deletedFiles.length === 0) {
    showWarning('No deleted files found in recent history');
    return;
  }

  const uniqueFiles = new Map<string, typeof deletedFiles[0]>();
  for (const file of deletedFiles) {
    if (!uniqueFiles.has(file.path)) {
      uniqueFiles.set(file.path, file);
    }
  }

  const fileItems = Array.from(uniqueFiles.values()).map((file) => ({
    label: `$(trash) ${file.path}`,
    description: `Deleted in ${file.hash.substring(0, 7)}`,
    detail: file.message.substring(0, 50),
    path: file.path,
    hash: file.hash,
  }));

  const selected = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Select a deleted file to recover',
    title: 'Git Panic: Recover Deleted File',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  const parentHash = `${selected.hash}~1`;

  const action = await actionHistory.recordAction(
    'undo_commit',
    `Recover deleted file: ${selected.path}`
  );

  try {
    await git.restoreFile(selected.path, parentHash);

    await actionHistory.completeAction(action);

    showSuccess(
      `Recovered "${selected.path}"`,
      'Open File',
      async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const uri = vscode.Uri.file(`${workspaceRoot}/${selected.path}`);
          await vscode.window.showTextDocument(uri);
        }
      }
    );
  } catch {
    showError(`Failed to recover "${selected.path}". The file may have been renamed or moved.`);
  }
}
