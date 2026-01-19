import * as vscode from 'vscode';
import { getGitWrapper } from './gitWrapper';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';

export type ActionType =
  | 'undo_commit'
  | 'amend_message'
  | 'amend_commit'
  | 'move_commits'
  | 'recover_branch'
  | 'create_branch';

export interface RecordedAction {
  id: string;
  type: ActionType;
  timestamp: Date;
  description: string;
  beforeState: {
    headHash: string;
    branch: string | null;
  };
  afterState?: {
    headHash: string;
    branch: string | null;
  };
  undoCommand?: string;
  canUndo: boolean;
}

class ActionHistoryManager {
  private actions: RecordedAction[] = [];
  private context: vscode.ExtensionContext | null = null;
  private readonly storageKey = 'gitpanic.actionHistory';

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadFromStorage();
    logger.info('Action history manager initialized');
  }

  private loadFromStorage(): void {
    if (!this.context) return;

    const stored = this.context.workspaceState.get<RecordedAction[]>(this.storageKey);
    if (stored) {
      this.actions = stored.map((action) => ({
        ...action,
        timestamp: new Date(action.timestamp),
      }));
      logger.info(`Loaded ${this.actions.length} actions from storage`);
    }
  }

  private saveToStorage(): void {
    if (!this.context) return;

    const config = getConfig();
    const trimmedActions = this.actions.slice(-config.maxActionHistory);
    this.actions = trimmedActions;
    this.context.workspaceState.update(this.storageKey, trimmedActions);
  }

  async recordAction(
    type: ActionType,
    description: string,
    canUndo: boolean = true
  ): Promise<RecordedAction> {
    const git = getGitWrapper();

    const action: RecordedAction = {
      id: this.generateId(),
      type,
      timestamp: new Date(),
      description,
      beforeState: {
        headHash: await git.getHeadHash(),
        branch: await git.getCurrentBranch(),
      },
      canUndo,
    };

    this.actions.push(action);
    logger.info(`Recorded action: ${type} - ${description}`);

    return action;
  }

  async completeAction(action: RecordedAction): Promise<void> {
    const git = getGitWrapper();

    action.afterState = {
      headHash: await git.getHeadHash(),
      branch: await git.getCurrentBranch(),
    };

    if (action.canUndo && action.beforeState.headHash !== action.afterState.headHash) {
      action.undoCommand = `git reset --hard ${action.beforeState.headHash}`;
    }

    this.saveToStorage();
    logger.info(`Completed action: ${action.id}`);
  }

  getLastAction(): RecordedAction | null {
    return this.actions[this.actions.length - 1] || null;
  }

  getLastUndoableAction(): RecordedAction | null {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      if (this.actions[i].canUndo && this.actions[i].undoCommand) {
        return this.actions[i];
      }
    }
    return null;
  }

  async undoLastAction(): Promise<{ success: boolean; message: string }> {
    const lastAction = this.getLastUndoableAction();

    if (!lastAction) {
      return { success: false, message: 'No undoable actions in history' };
    }

    if (!lastAction.beforeState.headHash) {
      return { success: false, message: 'Cannot undo: missing before state' };
    }

    try {
      const git = getGitWrapper();
      await git.hardReset(lastAction.beforeState.headHash);

      lastAction.canUndo = false;
      this.saveToStorage();

      logger.info(`Undid action: ${lastAction.id}`);
      return {
        success: true,
        message: `Undid "${lastAction.description}"`,
      };
    } catch (error) {
      logger.error('Failed to undo action', error as Error);
      return {
        success: false,
        message: `Failed to undo: ${(error as Error).message}`,
      };
    }
  }

  getRecentActions(count: number = 10): RecordedAction[] {
    return this.actions.slice(-count).reverse();
  }

  clearHistory(): void {
    this.actions = [];
    this.saveToStorage();
    logger.info('Action history cleared');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export const actionHistory = new ActionHistoryManager();
