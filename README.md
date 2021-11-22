# apex-code-analysis

Tool to parse Apex classes and produce a report of unused public methods

Inspired and partially based on https://github.com/allnulled/apexcodeanalysis

## 1. Installation

From within the repo folder:

`~$ npm install -s`

To use the CLI anywhere, install it globally:

`~$ npm install -g`

To see the help, run:

`apexcodeanalysis --help`

If the above doesn't work, your Node bin path is probably wrong or missing.  Find what it should be as follows:

`node -pe process.execPath`

Result will look like this: `/usr/local/Cellar/node/10.5.0/bin/node`

Add it to your PATH, for instance within `~\.bash-profile` like so:

`export PATH=$PATH:/usr/local/Cellar/node/10.5.0/bin`

## 2. Features

## 3. Specify apexcodeanalysis comments

A valid apexcodeanalysis unit of information is made by any comment that:

· Starts with tabulations or spaces or nothing, followed by `/**`.

· Ends with tabulations or spaces or nothing, followed by `*/`.

#### Input:

## 4. Extract documentation

### Extract documentation by the CLI

Once installed globally, you can run from your terminal:

`~$ apexcodeanalysis -i 1.js 2.js 3.js -o out.md -f markdown -e 2.js`

Which would mean:

`~$ apexcodeanalysis --include 1.js 2.js 3.js --output out.md --format markdown --exclude 2.js`

### Other considerations

Consider to omit the `exclude` and `format` option.

The default value of `format` option is `markdown`.

By default, the values of each option are:

```
{
	include: ["**/*.js"],
	exclude: ["**/node_modules/**/*"],
	output: undefined,
	format: "markdown"
}
```

To add the symbols `*/` inside our apexcodeanalysis comments, simply write `* /` instead,
and this will be translated to `*/` automatically.

abcdefg hijklmnop qrstuvwxyz 123 456 789 -+'[]{}\|'";:/?.>,<>