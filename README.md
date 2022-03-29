# apex-code-analysis

Tool to parse Apex classes and produce a report of unused public methods

Inspired and partially based on https://github.com/allnulled/javadoc

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

## 2. Usage

Once installed globally, you can run the cli from your terminal.

This will scan the current folder and sub-folders for Apex code and produce a the report in markdown format (using the default settings, see below):

`~$ apexcodeanalysis -o out.md`

Two files will be generated: `out.md` and `out.csv`  Both contain a list of all the methods organized by class name along with the reference count and which files reference the method.

The following example uses the `-include` and `-exclude` flags to specify the files to expand more granularly:

`~$ apexcodeanalysis -i 1.cls 2*.cls -o out.md -f markdown -e 2_exclude_me.cls`

Which expands to:

`~$ apexcodeanalysis -include 1.cls 2*.cls -output out.md -format json -exlude 2_exclude_me.cls`

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

# BUG LIST
* 2022-03-28 Not able to detect current class for method calls and replace this.METHOD with CLASS.METHOD
* 2022-03-28 Not able to detect class membership for method calls when calling from within containing class.  Similar to above but without this. preceeding METHOD
