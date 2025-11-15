"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const commands_1 = require("./commands");
function activate(context) {
    const disposables = (0, commands_1.registerCommands)(context);
    disposables.forEach(d => context.subscriptions.push(d));
}
function deactivate() {
    // nothing to clean up specifically
}
//# sourceMappingURL=index.js.map