# babel-plugin-transform-modules-iife

This plugin transforms ES2015 modules to an IIFE format; reading and writing from global namespaces.

It can be used if you are only targeting browser globals, and you don't want to deal with the complexity and overhead introduced by the [@babel/plugin-tansform-modules-umd](https://github.com/babel/babel/blob/master/packages/babel-plugin-transform-modules-umd) plugin. The additional CommonJS and AMD logic in the UMD format can cause problems on occasion.

While the inspiration for this plugin was taken from the UMD transform plugin, the output more closely resembles that of the `iife` format from [rollup](https://rollupjs.org/guide/en#core-functionality).

## Install

Using npm:

```sh
npm install --save-dev babel-plugin-transform-modules-iife
```

or using yarn:

```sh
yarn add babel-plugin-transform-modules-iife --dev
```

## Example

### In:
```javascript
import { foo } from './foo.js';

export const bar = foo;
```

### Out:
```javascript
this.Dog = this.Dog || {};

this.Dog.Cat = function (_foo, _exports) {
  "use strict";
  const bar = _foo.foo;
  _exports.bar = bar;
  return _exports;
}({}, this.Foo.Bar.dummyRootFoo);
```

## Usage

The plugin can be used in a normal Babel workflow like:
```javascript
import babel from '@babel/core';
babel.transformFile('input.mjs', {
    plugins: [['babel-plugin-transform-modules-iife', pluginOptions]]
});
```
...where `pluginOptions` is an object with the following properties:

### `importNamespace`
A dot-separated string that specifies the global object path containing the definitions of the objects that are imported.

### `exportNamespace`
A dot-separated string that specifies the global object path that will be assigned the exports from the module.

### `importRelativePath`
A path string that will be applied to the module specifier paths so the generated import variable names can be controlled to some degree.

> This does not need to be an actual path on disk. It is simply used to help normalize the global variable names for the imported modules.

For example, with the following options:
```javascript
{
    importNameSpace: 'Dog.Cat',
    importRelativePath: '/dummy/root'
}
```
, a statement like `import { foo } from '../bar/baz.js';` would result in the import definition to be found in the global variable `Dog.Cat.dummyBarBaz`.

This follows the algorithm:
- The import specifier is combined with the `importRelativePath` parameter using `path.resolve(specifier, relativePath)`.
- That absolute path is stripped of any path separators and converted to camelCase.
- The resulting variable name is appended to the global object path specified by the `importNamespace` parameter.