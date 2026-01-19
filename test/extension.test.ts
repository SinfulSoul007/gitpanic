import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('gitpanic.gitpanic'));
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'gitpanic.openPanicMenu',
      'gitpanic.undoLastCommit',
      'gitpanic.fixCommitMessage',
      'gitpanic.addToLastCommit',
      'gitpanic.moveCommits',
      'gitpanic.recoverBranch',
      'gitpanic.undoLastAction',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    }
  });
});
