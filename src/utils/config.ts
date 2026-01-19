import * as vscode from 'vscode';

export interface GitPanicConfig {
  showStatusBarButton: boolean;
  confirmDangerousActions: boolean;
  maxActionHistory: number;
}

export function getConfig(): GitPanicConfig {
  const config = vscode.workspace.getConfiguration('gitpanic');
  return {
    showStatusBarButton: config.get<boolean>('showStatusBarButton', true),
    confirmDangerousActions: config.get<boolean>('confirmDangerousActions', true),
    maxActionHistory: config.get<number>('maxActionHistory', 50),
  };
}

export function onConfigChange(callback: (config: GitPanicConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gitpanic')) {
      callback(getConfig());
    }
  });
}
