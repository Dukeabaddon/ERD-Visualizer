import * as vscode from 'vscode';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  const disposables = registerCommands(context);
  disposables.forEach(d => context.subscriptions.push(d));
}

export function deactivate() {
  // nothing to clean up specifically
}
