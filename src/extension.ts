import { activate as erdActivate, deactivate as erdDeactivate } from './features/erd-visualizer';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  try {
    erdActivate(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ERD Visualizer] Activation failed:', error);
    vscode.window.showErrorMessage(`ERD Visualizer failed to activate: ${message}`);
  }
}

export function deactivate() {
  erdDeactivate();
}
