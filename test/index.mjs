import { URL } from 'url';
import { dirname } from 'path';
import { readdir, readFile } from 'fs';
import { promisify } from 'util';
import babel from '@babel/core';

const readD = promisify(readdir);
const readF = promisify(readFile);
const babelFile = promisify(babel.transformFile);

const thisDir = dirname(new URL(import.meta.url).pathname);

async function assertTransform(fixtureDirectory, options) {
    const { code } = await babelFile(`${fixtureDirectory}/input.mjs`, { plugins: [['./', options]] });
    const output = await readF(`${fixtureDirectory}/output.js`, 'utf8');
    if (code !== output) {
        console.error('Generated code does not match expected');
        console.error('Generated:');
        console.error(code);
        console.log();
        console.error('Expected:');
        console.error(output);
        return false;
    }
    console.log('Passed');
    return true;
}

(async () => {
    const fixturesDir = `${thisDir}/fixtures`;
    const entries = await readD(fixturesDir, { withFileTypes: true });
    for (let entry of entries) {
        if (entry.isDirectory()) {
            console.log(`${thisDir}/${entry.name}`);
            const passed = await assertTransform(`${fixturesDir}/${entry.name}`, {
                importNamespace: 'Foo.Bar',
                exportNamespace: 'Dog.Cat',
                importRelativePath: '/dummy/root'
            });
        }
    }
})();
