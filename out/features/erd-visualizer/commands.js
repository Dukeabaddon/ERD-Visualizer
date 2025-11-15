"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const parser_1 = require("./parser");
const webview_1 = require("./webview");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function registerCommands(context) {
    const openCmd = vscode.commands.registerCommand('erdVisualizer.open', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a SQL or JSON schema file to visualize.');
            return;
        }
        const text = editor.document.getText();
        await openVisualizerPanel(context, text, editor.document.uri);
    });
    const openForEditorCmd = vscode.commands.registerCommand('erdVisualizer.openForEditor', async (uri) => {
        // If a uri is passed (from editor/title), use it; otherwise fall back to active editor
        let doc;
        if (uri) {
            try {
                doc = await vscode.workspace.openTextDocument(uri);
            }
            catch (e) {
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
        if (!uri || uri.length === 0)
            return;
        const doc = await vscode.workspace.openTextDocument(uri[0]);
        await openVisualizerPanel(context, doc.getText(), uri[0]);
    });
    return [openCmd, openForEditorCmd, openFileCmd];
}
async function openVisualizerPanel(context, text, sourceUri) {
    const model = (0, parser_1.parseSchemaFromText)(text);
    const panel = vscode.window.createWebviewPanel('erdVisualizer', 'ERD Visualizer', vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    // attempt to read the authoritative visual spec from openspec (design-notes.md)
    let visualSpec = undefined;
    try {
        const specPath = path.join(context.extensionUri.fsPath, 'openspec', 'changes', 'ui-enhancement', 'design-notes.md');
        if (fs.existsSync(specPath)) {
            const raw = fs.readFileSync(specPath, 'utf8');
            const m = raw.match(/```json\s*([\s\S]*?)\s*```/m);
            if (m && m[1])
                visualSpec = JSON.parse(m[1]);
        }
    }
    catch (e) {
        // ignore parse/read errors and fall back to defaults in the webview
        visualSpec = undefined;
    }
    // default to using bordered entities as the new default (no toggle)
    try {
        if (visualSpec) {
            if (typeof visualSpec.useBorderedEntities === 'undefined')
                visualSpec.useBorderedEntities = true;
        }
        else {
            visualSpec = { useBorderedEntities: true };
        }
    }
    catch (e) {
        // ignore
    }
    panel.webview.html = (0, webview_1.getWebviewContent)(panel.webview, context.extensionUri, model, visualSpec);
    // handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
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
        else if (msg.command === 'saveLayout') {
            try {
                if (sourceUri) {
                    const key = 'erd.layout:' + sourceUri.toString();
                    await context.workspaceState.update(key, msg.layout);
                }
            }
            catch (e) {
                // ignore
            }
        }
    });
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=commands.js.map