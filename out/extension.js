"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const erd_visualizer_1 = require("./features/erd-visualizer");
function activate(context) {
    (0, erd_visualizer_1.activate)(context);
}
function deactivate() {
    (0, erd_visualizer_1.deactivate)();
}
//# sourceMappingURL=extension.js.map