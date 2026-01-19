# Git Panic

**Big friendly buttons for common Git disasters.**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=gitpanic.gitpanic)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](https://github.com/SinfulSoul007/gitpanic)

---

## The Problem

We've all been there:

- You committed to the wrong branch
- You typo'd your commit message
- You accidentally deleted a branch
- You're stuck in a merge conflict nightmare
- You're in "detached HEAD state" and have no idea what that means
- You force pushed and now everything is gone

Git is powerful, but its recovery commands are cryptic. When something goes wrong, you end up frantically searching Stack Overflow while your work hangs in the balance.

**Git Panic** fixes this. Instead of memorizing arcane commands like `git reflog` and `git reset --soft HEAD~1`, you get friendly buttons that explain what they do and show you the Git commands being run.

---

## Features

Git Panic provides **16 recovery operations** organized into intuitive categories, plus action history with undo capability.

### Commit Operations

| Feature | Description | Git Command |
|---------|-------------|-------------|
| **Undo Last Commit(s)** | Remove recent commits while choosing what to keep | `git reset --soft/mixed/hard HEAD~N` |
| **Fix Commit Message** | Change the message of your last commit | `git commit --amend -m "new message"` |
| **Add Files to Last Commit** | Add forgotten files without creating a new commit | `git add <files> && git commit --amend --no-edit` |
| **Squash Commits** | Combine multiple commits into one clean commit | `git reset --soft HEAD~N && git commit` |

### Branch Operations

| Feature | Description | Git Command |
|---------|-------------|-------------|
| **Move Commits to New Branch** | Accidentally committed to main? Move commits to a feature branch | `git cherry-pick && git reset --hard` |
| **Recover Deleted Branch** | Restore a branch you accidentally deleted | `git reflog && git checkout -b <branch> <hash>` |
| **Fix Detached HEAD** | Escape the dreaded detached HEAD state | `git checkout -b <new-branch>` |
| **Force Push Recovery** | Recover after force push or diverged history | `git reflog && git reset --hard <hash>` |

### Staging Operations

| Feature | Description | Git Command |
|---------|-------------|-------------|
| **Unstage Files** | Remove files from staging without losing changes | `git reset HEAD <file>` |
| **Discard Local Changes** | Throw away uncommitted changes (selective or all) | `git checkout -- <file>` |
| **Clean Untracked Files** | Remove untracked files and directories | `git clean -fd` |

### Recovery Operations

| Feature | Description | Git Command |
|---------|-------------|-------------|
| **Abort Merge/Rebase/Cherry-pick** | Get out of a failed operation | `git merge/rebase --abort` |
| **Recover File from History** | Restore a file to a previous version | `git checkout <commit> -- <file>` |
| **Stash Operations** | Save, apply, pop, or recover stashes | `git stash push/pop/apply` |

### Safety Features

| Feature | Description |
|---------|-------------|
| **Action History** | Every GitPanic action is recorded with before/after states |
| **Undo GitPanic Action** | Made a mistake with GitPanic? Undo it! |
| **Educational Tooltips** | Every action shows the equivalent Git command |
| **Confirmation Dialogs** | Dangerous actions require explicit confirmation |
| **Push Detection** | Warns when modifying commits that have been pushed |

---

## Installation

### VS Code Marketplace (Recommended)

1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac)
3. Search for "Git Panic"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from [GitHub Releases](https://github.com/SinfulSoul007/gitpanic/releases)
2. In VS Code, press `Ctrl+Shift+P` and type "Install from VSIX"
3. Select the downloaded file

### CLI Version

A standalone terminal version is available:

```bash
# npm (requires Node.js)
npm install -g gitpanic-cli

# Homebrew (macOS/Linux)
brew tap SinfulSoul007/gitpanic
brew install gitpanic
```

See [gitpanic-cli](https://github.com/SinfulSoul007/gitpanic-cli) for more details.

---

## Usage

### Opening the Panic Menu

**Option 1: Command Palette**
- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Type "Git Panic" and select "Git Panic: Open Panic Menu"

**Option 2: Status Bar**
- Click the Git Panic button in the status bar (enabled by default)

### The Panic Menu

When you open the panic menu, you'll see:

1. **Priority Actions** - If you're in a problematic state (detached HEAD, merge conflict), relevant fixes appear at the top
2. **All Operations** - Organized by category (Commits, Branches, Staging, Recovery)
3. **Repository Status** - Current issues and warnings about your repo

Each menu item shows:
- A description of what it does
- The current state (e.g., "3 files staged")
- The equivalent Git command

### Example Workflows

**"I committed to the wrong branch"**
1. Open Git Panic menu
2. Select "Move Commits to New Branch"
3. Choose how many commits to move
4. Enter the new branch name
5. Done! Your commits are now on the new branch.

**"I need to add a file I forgot"**
1. Stage the forgotten file normally
2. Open Git Panic menu
3. Select "Add Files to Last Commit"
4. Confirm the action
5. Your staged files are now part of the last commit.

**"I'm in detached HEAD state"**
1. Open Git Panic menu - it will show "Fix Detached HEAD" as a priority action
2. Select it
3. Choose to create a new branch or checkout an existing one
4. Your work is saved!

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Git Panic: Open Panic Menu` | Open the main panic menu |
| `Git Panic: Undo Last Commit` | Undo the most recent commit(s) |
| `Git Panic: Fix Last Commit Message` | Change the last commit's message |
| `Git Panic: Add Files to Last Commit` | Amend staged files to last commit |
| `Git Panic: Squash Commits` | Combine multiple commits |
| `Git Panic: Move Commits to New Branch` | Move commits to a different branch |
| `Git Panic: Recover Deleted Branch` | Restore a deleted branch from reflog |
| `Git Panic: Fix Detached HEAD State` | Escape detached HEAD |
| `Git Panic: Recover from Force Push` | Recover from force push disasters |
| `Git Panic: Unstage Files` | Remove files from staging |
| `Git Panic: Discard Local Changes` | Discard uncommitted changes |
| `Git Panic: Clean Untracked Files` | Remove untracked files |
| `Git Panic: Abort Merge/Rebase/Cherry-pick` | Abort an ongoing operation |
| `Git Panic: Recover File from History` | Restore a file from a previous commit |
| `Git Panic: Stash Operations` | Create, apply, pop, or recover stashes |
| `Git Panic: Undo Last GitPanic Action` | Undo the last GitPanic operation |

---

## Configuration

Configure Git Panic in VS Code settings (`Ctrl+,` / `Cmd+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `gitpanic.showStatusBarButton` | `true` | Show Git Panic button in status bar |
| `gitpanic.confirmDangerousActions` | `true` | Show confirmation dialogs for destructive actions |
| `gitpanic.maxActionHistory` | `50` | Maximum number of actions to keep in undo history |

---

## How It Works

Git Panic uses the same Git commands you'd use manually - it just makes them accessible. Here's what happens behind the scenes:

1. **State Detection**: When you open the menu, Git Panic analyzes your repository state using commands like `git status`, `git reflog`, and file system checks for ongoing operations.

2. **Smart Recommendations**: Based on your state, Git Panic surfaces the most relevant actions. In detached HEAD? That fix is right at the top.

3. **Safety Checks**: Before any destructive action, Git Panic checks if commits have been pushed, if you have uncommitted changes, and other factors that might cause problems.

4. **Action Recording**: Every action records the before/after state, allowing you to undo GitPanic operations.

5. **Execution**: Actions are performed using the [simple-git](https://github.com/steveukx/git-js) library, which wraps the actual Git commands.

---

## Contributing

Contributions are welcome! Here's how to get started:

### Development Setup

```bash
# Clone the repository
git clone https://github.com/SinfulSoul007/gitpanic.git
cd gitpanic

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch
```

### Building

```bash
# Create production build
npm run package

# Create VSIX package (requires vsce)
npx vsce package
```

### Testing

```bash
npm run test
```

### Project Structure

```
gitpanic/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── commands/             # All 16 command implementations
│   │   ├── undoCommit.ts
│   │   ├── fixCommitMessage.ts
│   │   └── ...
│   ├── core/                 # Core logic
│   │   ├── gitWrapper.ts     # Git operations wrapper
│   │   ├── stateDetector.ts  # Repository state analysis
│   │   ├── actionHistory.ts  # Undo functionality
│   │   └── safetyChecks.ts   # Pre-action validation
│   ├── ui/                   # VS Code UI components
│   │   ├── panicMenu.ts      # Main quick pick menu
│   │   ├── statusBar.ts      # Status bar button
│   │   └── notifications.ts  # User notifications
│   └── utils/
│       ├── config.ts         # Configuration management
│       └── logger.ts         # Logging utilities
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [simple-git](https://github.com/steveukx/git-js) - The excellent Git wrapper that powers all operations
- The countless Stack Overflow answers that inspired this extension

---

## Related Projects

- [gitpanic-cli](https://github.com/SinfulSoul007/gitpanic-cli) - Standalone terminal version
- [homebrew-gitpanic](https://github.com/SinfulSoul007/homebrew-gitpanic) - Homebrew formula for easy installation

---

**Stop panicking. Start recovering.**
