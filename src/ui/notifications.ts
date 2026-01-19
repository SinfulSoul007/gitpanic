import * as vscode from 'vscode';

export function showSuccess(
  message: string,
  actionLabel?: string,
  action?: () => void | Promise<void>
): void {
  if (actionLabel && action) {
    vscode.window.showInformationMessage(`✓ ${message}`, actionLabel).then((selected) => {
      if (selected === actionLabel) {
        action();
      }
    });
  } else {
    vscode.window.showInformationMessage(`✓ ${message}`);
  }
}

export function showError(message: string): void {
  vscode.window.showErrorMessage(`✗ Git Panic: ${message}`);
}

export function showWarning(message: string): void {
  vscode.window.showWarningMessage(`⚠ ${message}`);
}

export async function showConfirmation(
  message: string,
  confirmLabel: string = 'Yes',
  cancelLabel: string = 'No'
): Promise<boolean> {
  const result = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    confirmLabel,
    cancelLabel
  );
  return result === confirmLabel;
}

export function showProgress<T>(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ) => Promise<T>
): Thenable<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Git Panic: ${title}`,
      cancellable: false,
    },
    task
  );
}
