const { resolve, parse } = require('path');
const { declare } = require('@babel/helper-plugin-utils');
const { isModule, rewriteModuleStatementsAndPrepareHeader, hasExports } = require('@babel/helper-module-transforms');
const { types: t, template } = require('@babel/core');

const wrapper = template(`
    (function(IMPORT_NAMES) {
    })(BROWSER_ARGUMENTS);
`);

module.exports = declare((api, options) => {
    api.assertVersion(7);

    const {
        loose,
        allowTopLevelThis,
        strict,
        strictMode,
        noInterop,
        exportNamespace,
        importNamespace,
        importRelativePath
    } = options;

    function buildExportNamespace() {
        const members = exportNamespace ? exportNamespace.split('.') : [];
        let id = t.thisExpression();
        const statements = members.map(seg => {
            id = t.memberExpression(id, t.identifier(seg));
            return t.expressionStatement(
                t.assignmentExpression('=', id, t.logicalExpression('||', id, t.objectExpression([])))
            );
        });
        return { expression: id, statements };
    }

    function buildImportNamespace() {
        const members = importNamespace ? importNamespace.split('.') : [];
        const ns = members.reduce((acc, current) => {
            return (acc = t.memberExpression(acc, t.identifier(current)));
        }, t.thisExpression());
        return ns;
    }

    /**
     * Build the member expression that reads from a global for a given source.
     */
    function buildBrowserArg(source, namespace) {
        const idPath = importRelativePath ? resolve(importRelativePath, source) : source;
        const parts = parse(idPath);
        return t.memberExpression(namespace, t.identifier(t.toIdentifier(`${parts.dir}/${parts.name}`)));
    }

    return {
        visitor: {
            Program: {
                exit(path) {
                    if (!isModule(path)) return;

                    const { meta } = rewriteModuleStatementsAndPrepareHeader(path, {
                        loose,
                        strict,
                        strictMode,
                        allowTopLevelThis,
                        noInterop
                    });

                    // The arguments of the outer, IIFE function
                    const iifeArgs = [];

                    // The corresponding arguments to the inner function called by the IIFE
                    const innerArgs = [];

                    // If exports are detected, set up the export namespace info
                    let exportStatements = [];
                    if (hasExports(meta)) {
                        const exportNamespaceInfo = buildExportNamespace();
                        exportStatements = exportNamespaceInfo.statements;
                        iifeArgs.push(exportNamespaceInfo.expression);
                        innerArgs.push(t.identifier(meta.exportName));
                    }

                    // Get the import namespace and build up the 2 sets of arguments based on the module's import statements
                    const importExpression = buildImportNamespace();
                    for (const [source, metadata] of meta.source) {
                        iifeArgs.push(buildBrowserArg(source, importExpression));
                        innerArgs.push(t.identifier(metadata.name));
                    }

                    // Cache the module's body and directives and then clear them out so they can be wrapped with the IIFE
                    const { body, directives } = path.node;
                    path.node.directives = [];
                    path.node.body = [];

                    // Get the iife wrapper Node
                    const wrappedBody = wrapper({
                        BROWSER_ARGUMENTS: iifeArgs,
                        IMPORT_NAMES: innerArgs
                    });

                    // Re-build the path:
                    //  - Add the statements that ensure the export namespace exists (if the module has exports)
                    //  - Add the IIFE wrapper
                    //  - Query the wrapper to get its body
                    //  - Add the cached directives and original body to the IIFE wrapper
                    for (let exportStatement of exportStatements) {
                        path.pushContainer('body', exportStatement);
                    }
                    const umdWrapper = path.pushContainer('body', [wrappedBody])[0];
                    const umdFactory = umdWrapper.get('expression.callee.body');
                    umdFactory.pushContainer('body', directives);
                    umdFactory.pushContainer('body', body);
                }
            }
        }
    };
});
