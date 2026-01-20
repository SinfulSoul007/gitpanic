# Changelog

All notable changes to the "Git Panic" extension will be documented in this file.

## [0.1.0] - 2025-01-20

### Added

- Initial release of Git Panic
- **Commit Operations**
  - Undo Last Commit(s) - with soft/mixed/hard reset options
  - Fix Commit Message - amend the last commit message
  - Add Files to Last Commit - amend staged files to last commit
  - Squash Commits - combine multiple commits into one
- **Branch Operations**
  - Move Commits to New Branch - move commits from current branch
  - Recover Deleted Branch - restore branches from reflog
  - Fix Detached HEAD State - escape detached HEAD
  - Force Push Recovery - recover from force push disasters
- **Staging Operations**
  - Unstage Files - remove files from staging
  - Discard Local Changes - revert uncommitted changes
  - Clean Untracked Files - remove untracked files
- **Recovery Operations**
  - Abort Merge/Rebase/Cherry-pick - cancel ongoing operations
  - Recover File from History - restore files from previous commits
  - Stash Operations - create, apply, pop, drop, recover stashes
- **Safety Features**
  - Action History with undo capability
  - Educational tooltips showing Git commands
  - Confirmation dialogs for dangerous actions
  - Push detection warnings
- Status bar button for quick access
- Command palette integration
