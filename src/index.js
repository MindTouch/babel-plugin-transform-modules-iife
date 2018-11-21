const { resolve, parse } = require('path');
const { declare } = require('@babel/helper-plugin-utils');
const { isModule, rewriteModuleStatementsAndPrepareHeader, hasExports } = require('@babel/helper-module-transforms');
const { types: t, template } = require('@babel/core');

const wrapper = template(`
    GLOBAL_ASSIGNMENT = (function(IMPORT_NAMES) {
    }({}, BROWSER_ARGUMENTS));
`);
const wrapperNoExports = template(`
    (function(IMPORT_NAMES) {
    }(BROWSER_ARGUMENTS));
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
        const members = exportNamespace.split('.');
        const final = members.pop();
        let id = t.thisExpression();
        const statements = members.map(seg => {
            id = t.memberExpression(id, t.identifier(seg));
            return t.expressionStatement(
                t.assignmentExpression('=', id, t.logicalExpression('||', id, t.objectExpression([])))
            );
        });
        return [t.memberExpression(id, t.identifier(final)), statements];
    }

    function buildImportNamespace() {
        const members = importNamespace.split('.');
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
                    const withExports = hasExports(meta);

                    const browserArgs = [];
                    const importNames = [];
                    const importExpression = buildImportNamespace();
                    const exportIdentifier = t.identifier(meta.exportName);

                    if (withExports) {
                        importNames.push(exportIdentifier);
                    }
                    for (const [source, metadata] of meta.source) {
                        browserArgs.push(buildBrowserArg(source, importExpression));
                        importNames.push(t.identifier(metadata.name));
                    }

                    const { body, directives } = path.node;
                    path.node.directives = [];
                    path.node.body = [];

                    let wrappedBody;
                    if (withExports) {
                        const [exportExpression, exportStatements] = buildExportNamespace();
                        for (let exportStatement of exportStatements) {
                            path.pushContainer('body', exportStatement);
                        }
                        wrappedBody = wrapper({
                            GLOBAL_ASSIGNMENT: exportExpression,
                            BROWSER_ARGUMENTS: browserArgs,
                            IMPORT_NAMES: importNames
                        });
                    } else {
                        wrappedBody = wrapperNoExports({ BROWSER_ARGUMENTS: browserArgs, IMPORT_NAMES: importNames });
                    }

                    const umdWrapper = path.pushContainer('body', [wrappedBody])[0];
                    const bodyQuery = withExports ? 'expression.right.callee.body' : 'expression.callee.body';
                    const umdFactory = umdWrapper.get(bodyQuery);
                    umdFactory.pushContainer('body', directives);
                    umdFactory.pushContainer('body', body);
                    if (withExports) {
                        umdFactory.pushContainer('body', t.returnStatement(exportIdentifier));
                    }
                }
            }
        }
    };
});
