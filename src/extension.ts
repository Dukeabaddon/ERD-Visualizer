import { activate as erdActivate, deactivate as erdDeactivate } from './features/erd-visualizer';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  erdActivate(context);
}

export function deactivate() {
  erdDeactivate();
}
