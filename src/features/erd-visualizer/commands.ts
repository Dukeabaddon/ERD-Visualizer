import * as vscode from 'vscode';
import { parseSchemaFromText } from './parser';
import { getWebviewContent } from './webview';

export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  const openCmd = vscode.commands.registerCommand('erdVisualizer.open', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open a SQL or JSON schema file to visualize.');
      return;
    }
    const text = editor.document.getText();
    await openVisualizerPanel(context, text, editor.document.uri);
  });

  const openForEditorCmd = vscode.commands.registerCommand('erdVisualizer.openForEditor', async (uri?: vscode.Uri) => {
    // If a uri is passed (from editor/title), use it; otherwise fall back to active editor
    let doc: vscode.TextDocument | undefined;
    if (uri) {
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch (e) {
        // ignore and fallback
        doc = undefined;
      }
    }
    if (!doc && vscode.window.activeTextEditor) {
      doc = vscode.window.activeTextEditor.document;
    }
    if (!doc) {
      vscode.window.showInformationMessage('Open a SQL or JSON schema file to visualize.');
      return;
    }
    // simple language/extension check
    const lang = doc.languageId;
    const ext = doc.fileName ? doc.fileName.split('.').pop() : '';
    if (!(lang === 'json' || lang === 'sql' || ext === 'json' || ext === 'sql')) {
      vscode.window.showInformationMessage('ERD Visualizer: file type not supported');
      return;
    }
    const text = doc.getText();
    await openVisualizerPanel(context, text, doc.uri);
  });

  const openFileCmd = vscode.commands.registerCommand('erdVisualizer.openFromFile', async () => {
    const uri = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'SQL/JSON': ['sql', 'json'] } });
    if (!uri || uri.length === 0) return;
    const doc = await vscode.workspace.openTextDocument(uri[0]);
    await openVisualizerPanel(context, doc.getText(), uri[0]);
  });

  return [openCmd, openForEditorCmd, openFileCmd];
}

async function openVisualizerPanel(context: vscode.ExtensionContext, text: string, sourceUri?: vscode.Uri) {
  const model = parseSchemaFromText(text);
  const panel = vscode.window.createWebviewPanel('erdVisualizer', 'ERD Visualizer', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });

  panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, model);

  // handle messages from webview
  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg.command === 'reveal') {
      // reveal position in editor if mapping exists
      if (sourceUri && msg.entity && msg.column) {
        const doc = await vscode.workspace.openTextDocument(sourceUri);
        const editor = await vscode.window.showTextDocument(doc, { preview: true });
        // Note: parser may not provide exact positions; attempt a best-effort find
        const regex = new RegExp("\\b" + escapeRegExp(msg.column) + "\\b", 'i');
        for (let i = 0; i < doc.lineCount; i++) {
          const line = doc.lineAt(i);
          if (regex.test(line.text)) {
            const matchIndex = line.text.search(regex);
            const pos = new vscode.Position(i, matchIndex);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(pos, pos.translate(0, msg.column.length || 0));
            break;
          }
        }
      }
    }
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
