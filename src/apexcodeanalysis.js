const _ = require("lodash");
const { camelCase, forEach } = require("lodash");
const { nextTick } = require("process");
const { string, number } = require("yargs");

module.exports = {
  generate: function generate(optionsArg) {
    let options = undefined;
    let isTestClass = false;
    let isDeprecatedClass = false;
    const symbols = new Map();
    const symbolsSource = new Map();
    const symbolsFileList = new Map();
    const declarations = new Map();
    const classMembers = new Map();

    const CLASS_TYPES = [`Class`, `Interface`];
    const CLASS_AND_ENUM_TYPES = [
      `Class`,
      `Database`,
      `Enum`,
      `Interface`,
      `System`,
    ];

    const RESERVED = [
      `delete`,
      `from`,
      `instanceof`,
      `return`,
      `select`,
      `update`,
      `upsert`,
      `where`,
    ];

    const HIDDEN_TAGS = [`@exclude`, `@hidden`];
    const EXCLUDED_TYPES = [
      `account`,
      `apexpages`,
      `asyncapexjob`,
      `batchablecontext`,
      `blob`,
      `boolean`,
      `contact`,
      `crypto`,
      `custompermission`,
      `database.error`,
      `database`,
      `date`,
      `datetime`,
      `decimal`,
      `deploycontainer`,
      `describefieldresult`,
      `describesobjectresult`,
      `double`,
      `emailfileattachment`,
      `exception`,
      `featuremanagement`,
      `fieldpermissions`,
      `fields`,
      `groupmember`,
      `httprequest`,
      `httpresponse`,
      `id`,
      `integer`,
      `json`,
      `limits`,
      `map`,
      `matcher`,
      `math`,
      `messaging`,
      `metadata`,
      `metadataservice`,
      `newmap`,
      `object`,
      `oldmap`,
      `opportunity`,
      `pagereference`,
      `pattern`,
      `permissionset`,
      `permissionsetassignment`,
      `profile`,
      `recordtype`,
      `recordtypeinfo`,
      `schema.sobjectfield`,
      `schema.sobjecttype`,
      `schema`,
      `singleemailmessage`,
      `sobject`,
      `sobjecttype`,
      `string`,
      `system`,
      `test`,
      `time`,
      `triggernew`,
      `triggerold`,
      `type`,
      `url`,
      `userinfo`,
    ];

    let ExcludedTypesArrays = [];

    EXCLUDED_TYPES.forEach(function (t) {
      ExcludedTypesArrays.push(`${t}[]`);
      addDeclaration(undefined, t, true);
    });

    const REGEX_TEST = /([A-Z])\w+/gi;
    //const REGEX_TYPE_PARAM = /(<+[\w ]*(\,)*[\w ]*>+)*/g;

    // Capture group 1 = object path, group 2 = method  String.toLowerCase() 1 = String, 2 = toLowerCase
    const REGEX_SYMBOL = /([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(/gi;
    /**
     * Capture group 1 = Object or primitive type
     *         group 2 = Type Parameter (optional)
     *         group 3 = Variable name
     *         group 4 = new or Cast
     *         group 5 = Initializer
     *         group 6 = Initializer Type Parameter (optional)
     */
    const REGEX_DECLARATION =
      /([\w\[\]]+) *(<+.*>+)*[ \t]+([\w]+)\s*(?:=\s*(\[|new|\(+\1(?:<+.*>+)*\))*\s*([\w']+)(<+.*>+)*|;)/gim;

    const REGEX_FOR = /(?:for|catch)\s*\(([\w\. ]+)(<+.*>+)* ([\w]+)/gi;

    /**
     * Capture group 1 = Object or primitive type
     *         group 2 = Type Parameter (optional)
     *         group 3 = Param name
     */
    const REGEX_PARAM =
      /([a-zA-Z0-9_]+\s*(?:<+[a-zA-Z0-9_ ]+\,*[a-zA-Z0-9_ ]*>+)*\s*)([a-zA-Z0-9_]*)/gi;

    const REGEX_PARAMETER_LIST =
      /[public|private|protected|global]+ [\w<>, \[\]]*\(([\w<>,. )]+)\)/gi;

    const REGEX_STRING = /([\"'`])(?:[\s\S])*?(?:(?<!\\)\1)/gim;
    const REGEX_COMMENT = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gim;
    const REGEX_COMMENT_INLINE = /\/\/.*$/gim;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gim;
    const REGEX_COMMENT_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)\s*}/gim;
    const REGEX_ACCESSORS = /^[ \t]*(global|public|protected|private)/gi;

    const REGEX_CLASS = new RegExp(
      REGEX_ATTRIBUTES.source +
        REGEX_ACCESSORS.source +
        /\s*([\w\s]*)\s+(class|enum|interface)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{/
          .source,
      "gmi"
    );

    const REGEX_ABSTRACT_METHOD = new RegExp(
      REGEX_ATTRIBUTES.source +
        /(?:\@[^\n]*[\s]+)*^[ \t]*(abstract)[ \t]*(global|public|protected|private)[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\,\. ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:{|;)/
          .source,
      "gmi"
    );

    const REGEX_METHOD = new RegExp(
      REGEX_ATTRIBUTES.source +
        REGEX_ACCESSORS.source +
        /[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\,\. ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:{|;)/
          .source,
      "gmi"
    );

    const REGEX_CONSTRUCTOR = new RegExp(
      REGEX_ATTRIBUTES.source +
        REGEX_ACCESSORS.source +
        /[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:[{])/.source,
      "gmi"
    );

    const REGEX_PROPERTY = new RegExp(
      REGEX_ATTRIBUTES.source +
        REGEX_ACCESSORS.source +
        /\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*(?:{\s*get([^}]+)}|(?:=[\w\s\[\]<>,{}'=()]*)|;)+/
          .source,
      "gmi"
    );

    const ENTITY_TYPE = {
      CLASS: 1,
      METHOD: 2,
      PROPERTY: 3,
      CONSTRUCTOR: 4,
    };

    ///// Main /////////////////////////////////////////////////////////////////////////////////////////////////////////
    return (function () {
      normalizeOptions();
      let raw = iterateFiles();
      let data = formatOutput();
      return data;
    })();

    ///// Normalize Options ////////////////////////////////////////////////////////////////////////////////////////////
    function normalizeOptions() {
      ///// Normalize arguments:
      options = Object.assign(
        {
          include: ["**/*.cls"],
          exclude: ["**/node_modules/**/*"],
          output: undefined,
          format: "markdown",
          accessors: ["global", "public", "private", "protected"],
        },
        optionsArg
      );
      hasOutput = options.output;
      ///// Negate all the excluded patterns:
      options.exclude = [].concat(options.exclude).map(function (item) {
        if (item.charAt(0) === "!") {
          return item;
        }
        return "!" + item;
      });
    }

    ///// Parse File ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseFile(text, lang, fileName) {
      let fileData = [];
      let symbolData = [];
      let declarationData = [];
      let paramsData = [];
      let classData = [];
      let classes = [];
      let i = 0;
      let parsedText;

      classData = matchAll(text, REGEX_CLASS, true);

      __LOG__("Classes = " + classData.length);

      classData.forEach(function (c) {
        classes.push(getClass(c));
      });

      classes = setClassBodyCodeOnly(classes);
      classes = setLevels(classes);
      classes = setClassPaths(classes); //.sort(ClassComparator);

      // Build parsedText
      classes.forEach(function (c) {
        parsedText +=
          "\n" + c.bodyCodeOnly.replace(/this\./gi, `${c.toc.toLowerCase()}.`);
      });

      // This handles for test classes, the code for which will have been stripped from the parsedText
      parsedText = parsedText != null ? parsedText : text;

      classData.forEach(function (data) {
        __LOG__(
          `Class = ${classes[i].path} ${classes[i].isTest ? `Test Class` : ``}`
        );

        // Append this class def to the output stream
        let parsedClass = parseData([data], ENTITY_TYPE.CLASS, classes[i]);
        if (fileData.length === 0) {
          fileData = parsedClass;
        } else {
          fileData = fileData.concat(parsedClass);
        }

        // Append the class member defs to the output stream
        let members = parseClass(classes[i], lang);
        if (members !== undefined) fileData = fileData.concat(members);

        // Adds members to the classMembers map with the class name as the key
        members.forEach(function (m) {
          let symbol = m[0].toc.substr(0, m[0].toc.indexOf("("));
          //__DBG__(`${classes[i].path},${symbol}`);
          addMember(classes[i].path, symbol, fileName);
        });

        i++;
      });

      let declarationCount = 0;

      ///// Declarations - we use these to replace custom variable names with
      //    the actual object/type it was declared as

      ///// Standard Declarations
      declarationData = matchAll(parsedText, REGEX_DECLARATION, true);
      declarationCount += declarationData.length;
      declarationData.forEach(function (data) {
        addDeclaration(data[3], data[1] + (data[2] ?? ""));
      });

      ///// For Loop Declarations
      declarationData = matchAll(parsedText, REGEX_FOR, true);
      declarationCount += declarationData.length;
      declarationData.forEach(function (data) {
        addDeclaration(data[3], data[1] + (data[2] ?? ""));
      });

      ///// Param Declarations
      paramsData = matchAll(parsedText, REGEX_PARAMETER_LIST, true);
      declarationCount += paramsData.length;
      paramsData.forEach(function (data) {
        let params = matchAll(data[1], REGEX_PARAM, true);
        params.forEach(function (param) {
          addDeclaration(param[2], param[1]);
        });
      });

      __LOG__(`Declarations = ${declarationCount}`);

      ///// Internal References (to class methods inside this file)
      classes.forEach(function (c) {
        let apexClass = c.path.toLowerCase();
        //__DBG__('Class = ' + apexClass);
        // Check if the class has any members first, some classes may have no valid member methods such as test classes
        if (classMembers.get(apexClass)) {
          classMembers.get(apexClass).forEach(function (method) {
            let methodCall = RegExp(
              "^[ \\t\\w<>=,\\.]*(" +
                method +
                ")+[\\s]*\\([\\w\\d\\s\\(\\)'<>\\.,]*\\)\\s*[{|;]?",
              "gim"
            );
            //__DBG__('Method = ' + method);
            let refs = matchAll(parsedText, methodCall, true);
            let symbol = `${apexClass}.${method}`.toLocaleLowerCase();

            refs.forEach(function (r) {
              r[0] = r[0].replace(/[\s]/g, ` `);
              // Include all refs but not method declarations
              if (!r[0].match(REGEX_METHOD)) {
                symbols.set(symbol, (symbols.get(symbol) ?? 0) + 1); // increment
                addFileToSymbol(symbol, fileName);
              }
            });
          });
        }
      });

      ///// External References (to class methods outside this file)
      symbolData = matchAll(parsedText, REGEX_SYMBOL, true);
      symbolData.forEach(function (data) {
        let v = data[1].toLowerCase();
        let type = declarations.get(v) ?? `${v}`;

        if (!excludedType(type)) {
          let symbol = `${type}.${data[2]}`.toLowerCase();
          symbols.set(symbol, (symbols.get(symbol) ?? 0) + 1);
          addFileToSymbol(symbol, fileName);
        }
      });

      return fileData;
    }

    ///// Parse Class //////////////////////////////////////////////////////////////////////////////////////////////////
    function parseClass(target, lang) {
      let children = [];
      let classType = target.name.toLowerCase(); // Class, Enum, Interface, etc.

      ///// Handle Properties
      let propertyData = matchAll(target.bodyCodeOnly, REGEX_PROPERTY, true);
      //propertyData = filter(propertyData, lang, classType, "properties");
      __LOG__("Properties = " + propertyData.length);

      if (propertyData.length > 0) {
        children = children.concat(
          parseData(propertyData, ENTITY_TYPE.PROPERTY)
        );
      }

      ///// Handle Constructors
      let constructorData = matchAll(
        target.bodyCodeOnly,
        REGEX_CONSTRUCTOR,
        true
      );
      //constructorData = filter(constructorData, lang, classType);
      __LOG__("Constructors = " + constructorData.length);

      if (constructorData.length > 0) {
        children = children.concat(
          parseData(constructorData, ENTITY_TYPE.CONSTRUCTOR)
        );
      }

      ///// Handle Abstract Methods
      let abstractData = matchAll(
        target.bodyCodeOnly,
        REGEX_ABSTRACT_METHOD,
        true
      );
      //abstractData = filter(abstractData, lang, classType, "abstracts");
      __LOG__("Abstract Methods = " + abstractData.length);

      if (abstractData.length > 0) {
        children = children.concat(parseData(abstractData, ENTITY_TYPE.METHOD));
      }

      ///// Handle Methods
      let methodData = matchAll(target.bodyCodeOnly, REGEX_METHOD, true);
      //methodData = filter(methodData, lang, classType, "methods");
      __LOG__("Methods = " + methodData.length);

      if (methodData.length > 0) {
        children = children.concat(parseData(methodData, ENTITY_TYPE.METHOD));
      }
      return children;
    }

    ///// Parse Data ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseData(rawData, entityType, header) {
      let fileDataLines = [];

      rawData.forEach(function (data) {
        let lastObject = {
          name: "default",
          text: "",
        };
        let commentData = [];

        if (entityType === ENTITY_TYPE.CLASS) {
          if (data[0].includes("@IsTest")) {
            isTestClass = true;
            return;
          }
          ///// This property tracks whether the entire class is deprecated, versus the specific entity
          isDeprecatedClass =
            data[0].includes(`@Deprecated`) && header.level === 0;
        }

        ///// Skip test entities
        if (
          (data[0].indexOf("@IsTest") !== -1 ||
            isTestClass ||
            isDeprecatedClass) &&
          entityType !== ENTITY_TYPE.CLASS
        ) {
          return;
        }
        let entityHeader =
          header === undefined ? getEntity(data, entityType) : header;

        ///// Skip invalid entities, or entities that have excluded accessors (see getEntity() method)
        if (entityHeader === undefined) return;

        ///// Push onto output stack
        if (entityType != ENTITY_TYPE.PROPERTY && entityHeader.name != "enum") {
          fileDataLines.push([entityHeader]);
          //fileDataLines.push(commentData);
        } else {
          ///// For Property & Enum entities, add the comment as the descrip
          if (commentData[0] && !entityHeader.isDeprecated)
            entityHeader.descrip = commentData[0].text;

          //fileDataLines.push([entityHeader]);
        }
      });
      return fileDataLines;
    }

    ///// Format Output ////////////////////////////////////////////////////////////////////////////////////////////////
    function formatOutput() {
      const fs = require("fs");
      const path = require("path");
      const mkdirp = require("mkdirp");

      ///// Create CSV file
      let csvData = "";
      let sourceFile = "";
      let symbolsAsc = new Map([...symbols.entries()].sort());
      symbolsAsc.forEach(function (value, key) {
        sourceFile = symbolsSource.get(key);
        if (sourceFile != undefined) {
          csvData += `\n"${key}",${value},"${sourceFile}","${outputFileList(
            key
          )}"`;
        }
      });
      csvData = `Method,References,Source,Files` + csvData;

      ///// Write out the csv
      __LOG__(
        "FINISHED PROCESSING\nWriting results to: " + options.output,
        true,
        true
      );
      let csvFile =
        options.output.substring(0, options.output.indexOf(`.`)) + `.csv`;

      let folder = path.dirname(options.output);

      if (!fs.existsSync(folder)) {
        mkdirp.sync(folder);
      }
      fs.writeFileSync(csvFile, csvData, "utf8");

      return csvData;
    }

    ///// Iterate Files ////////////////////////////////////////////////////////////////////////////////////////////////
    function iterateFiles() {
      const globule = require("globule");
      const fs = require("fs");
      let docComments = {};
      __LOG__("STARTING...", true, true);
      const files = globule.find(
        [].concat(options.include).concat(options.exclude)
      );
      __LOG__("Files found: " + files.length);
      for (let a = 0; a < files.length; a++) {
        let file = files[a];
        // Skip managed package files & MetadataService
        if (
          file.indexOf("__") != -1 ||
          file.indexOf("MetadataService.cls") != -1 ||
          file.indexOf("MetadataServiceTest.cls") != -1
        ) {
          __LOG__(`File: ${file} skipped.`);
          continue;
        }
        let lang = getLang(file);
        __LOG__(`File = ${file} Lang: ${lang}`, true);
        let contents = fs.readFileSync(file).toString();
        let matches = parseFile(contents, lang, file);
        if (matches.length !== 0) {
          docComments[file] = matches;
        }
      }
      return docComments;
    }

    ///// Utility Methods //////////////////////////////////////////////////////////////////////////////////////////////
    function excludedType(str) {
      if (!str) return true;
      str = str.toLowerCase().trim();
      if (str.substr(str.length - 3) == "__c") return true;
      if (str.substr(str.length - 3) == "__r") return true;
      if (str.substr(str.length - 5) == "__mdt") return true;
      if (str.substr(str.length - 2) == "[]") return true;
      if (str.substr(0, 4) == "map<") return true;
      if (str.substr(0, 4) == "set<") return true;
      if (str.substr(0, 5) == "list<") return true;
      if (str == `[]`) return true;
      if (EXCLUDED_TYPES.includes(str)) return true;
      if (ExcludedTypesArrays.includes(str)) return true;
      return false;
    }

    function addDeclaration(token, type) {
      if (!type) {
        __LOG__(`***ERROR: No type defined for variable ${token}`);
        return;
      }

      type = type.toLowerCase().trim();

      // Skip reserved words such as return statements
      if (RESERVED.includes(type)) {
        return;
      }

      if (token) {
        token = token.toLowerCase().trim();
        // The token here is the declared variable, and Type is the object Type
        if (!declarations.get(token)) {
          declarations.set(token, type);
        }
      }
      // We add the Type referencing itself as well to account for static usage
      token = type;
      if (!declarations.get(token)) {
        declarations.set(token, type);
      }
    }

    function addMember(apexClass, member, path) {
      if (!apexClass | !member | !path) {
        return;
      }
      if (path.indexOf("/") != -1) {
        path = path.substr(path.lastIndexOf("/") + 1, path.length);
      }
      apexClass = apexClass.toLowerCase().trim();
      member = member.toLowerCase().trim();
      let symbol = apexClass + "." + member;
      if (!classMembers.get(apexClass)) {
        classMembers.set(apexClass, [member]);
      } else {
        classMembers.get(apexClass).push(member);
      }
      symbols.set(symbol, (symbols.get(symbol) ?? 0) + 0);
      symbolsSource.set(symbol, path);
      symbolsFileList.set(symbol, classMembers.get(apexClass).path);
      addFileToSymbol(symbol, path);
    }

    function addFileToSymbol(symbol, fileName) {
      let files = symbolsFileList.get(symbol);
      if (!files) files = new Set();
      fileName = fileName
        .substr(fileName.lastIndexOf("/") + 1, fileName.length)
        .toLowerCase()
        .trim();
      files.add(fileName);
      symbolsFileList.set(symbol, files);
    }

    function outputFileList(symbol) {
      let ret = ``;
      let files = symbolsFileList.get(symbol);
      if (!files) return ret;
      files.forEach(function (f) {
        ret += `${f}, `;
      });
      ret = ret.substr(0, ret.length - 2);
      return ret;
    }

    function getEnumBody(str) {
      let ret = [];
      if (str === undefined) return ret;
      str = str.replace(/[\s\n]/g, "");
      str = str.substring(str.indexOf(`{`) + 1, str.indexOf(`}`));
      ret = str.split(`,`);
      return ret;
    }

    function matchAll(str, regexp, excludeComments) {
      let ret = [];
      let result = undefined;
      let noComments = str.replace(REGEX_COMMENT, ``).replace(/\/\/.*/g, ``);
      while ((result = regexp.exec(noComments))) {
        ret.push(result);
      }
      return ret;
    }

    function isHidden(data) {
      let ret = false;
      let jd = data[0].match(REGEX_COMMENT);
      if (jd === null) return false;
      HIDDEN_TAGS.forEach(function (tag) {
        if (jd[0].toLowerCase().includes(tag)) {
          ret = true;
          return;
        }
      });
      return ret;
    }

    function EntityComparator(a, b) {
      if (a[4] < b[4]) return -1;
      if (a[4] > b[4]) return 1;
      return 0;
    }

    function ClassComparator(a, b) {
      if (a.toc < b.toc) return -1;
      if (a.toc > b.toc) return 1;
      return 0;
    }

    function getEntity(data, entityType) {
      let ret = undefined;
      if (entityType === ENTITY_TYPE.CLASS) ret = getClass(data);
      if (entityType === ENTITY_TYPE.METHOD) ret = getMethod(data);
      if (entityType === ENTITY_TYPE.PROPERTY) ret = getProp(data);
      if (entityType === ENTITY_TYPE.CONSTRUCTOR) ret = getConstructor(data);
      return ret;
    }

    function getProp(data) {
      let ret = {
        name: "Property",
        accessor: data[1],
        toc: data[4],
        text: data[4],
        type: data[3],
        descrip: "",
        static: data[2] === "static",
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: data[0].includes(`@Deprecated`),
        isCommentRequired: true,
        isExclude: isHidden(data),
      };
      return ret;
    }

    function getMethod(data) {
      data[2] = data[2] === "override" ? "" : data[2];
      let ret = {
        name: "Method",
        accessor: data[1],
        toc: data[4] + data[5],
        text: data[2] + " " + data[3] + " " + data[4] + data[5],
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: data[0].includes(`@Deprecated`),
        isCommentRequired: true,
        isExclude: isHidden(data),
      };
      return ret;
    }

    function getConstructor(data) {
      let ret = {
        name: "Method",
        accessor: data[1],
        toc: data[2] + data[3],
        text: data[2] + data[3],
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: data[0].includes(`@Deprecated`),
        isCommentRequired: true,
        isExclude: isHidden(data),
      };
      return ret;
    }

    function getClass(data) {
      let endIndex = getEndIndex(data);
      let ret = {
        name: data[3], // Class, Enum, Interface, etc.
        accessor: data[1],
        toc: data[4],
        text: data[4],
        body: data.input.substring(data.index, endIndex), // data.index is from the regex matching object
        bodyCodeOnly: undefined,
        line: getLineNumber(data),
        signature:
          (data[1] + " " + data[2] + " " + data[3] + " " + data[4]).replace(
            `  `,
            ` `
          ) + " ",
        start: data.index,
        end: endIndex,
        path: ``,
        descrip: ``,
        level: undefined,
        isDeprecated: data[0].includes(`@Deprecated`),
        isTest: data[0].includes(`@isTest`),
        isCommentRequired:
          data[3] !== `enum` && (!data[5] || data[5].includes(`exception`)),
        isExclude: isHidden(data),
      };
      return ret;
    }

    function setLevels(classes) {
      classes.forEach(function (cur) {
        cur.level = recLevel(cur, classes.slice(0), 0);
      });
      return classes;
    }

    function recLevel(target, classes, level) {
      classes.forEach(function (cur) {
        if (target !== cur) {
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            level = recLevel(cur, classes, level + 1);
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return level;
    }

    function setClassPaths(classes) {
      classes.forEach(function (cur) {
        cur.path = recPath(cur, cur.path, classes.slice(0)) + cur.toc;
      });
      return classes;
    }

    function recPath(target, path, classes) {
      classes.forEach(function (cur) {
        if (target !== cur) {
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            path += recPath(cur, cur.toc, classes) + ".";
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return path;
    }

    /**
     * For all classes, puts the class definition stripped of all sub-class definitions into a field on the class
     * @param {*} classes
     */
    function setClassBodyCodeOnly(classes) {
      classes.forEach(function (c) {
        if (c.body === undefined) return; // continue the forEach
        c.bodyCodeOnly = c.body;
        classes.forEach(function (comp) {
          if (c !== comp) {
            let isChild = c.body.includes(comp.signature);
            if (isChild) {
              c.bodyCodeOnly = c.bodyCodeOnly.replace(comp.body, ``);
            }
          }
        });
      });
      return classes;
    }

    function getLineNumber(data) {
      if (data.index === 0) return 1;
      let codeBlock = data.input.substr(0, data.index);
      let lineNum = codeBlock.match(/\n/g || []).length + 1;
      return lineNum;
    }

    // Counts opening and closing brackets to find the terminator of the class def
    function getEndIndex(data) {
      let codeBlock = data.input.substring(data.index, data.input.length);
      ///// Replace comment bodies with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_COMMENT, function (match, p1) {
        return "/**" + "".padStart(match.length - 5, "%") + "*/";
      });
      codeBlock = codeBlock.replace(REGEX_COMMENT_INLINE, function (match, p1) {
        return "//".padEnd(match.length, "%");
      });
      ///// Replace string literals with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_STRING, function (match, p1) {
        return p1 + "".padStart(match.length - 2, "%") + p1;
      });
      let ob = 0;
      let cb = 0;
      let endIndex = undefined;
      for (let i = 0; i < codeBlock.length; i++) {
        if (codeBlock.charAt(i) === "{") ob++;
        if (codeBlock.charAt(i) === "}") cb++;
        if (ob !== 0 && cb !== 0 && ob === cb) {
          endIndex = i + data.index + 1;
          break;
        }
      }
      return endIndex;
    }

    function escapeAngleBrackets(str) {
      return str.replace(/([\<\>])/g, function (match) {
        return `\\${match}`;
      });
    }

    function getLang(file) {
      if (file.substr(file.length - 4, file.length) === ".cls") return "apex";
    }

    function undentBlock(block) {
      let REGEX_INDEX = /^[ \t]*\**[ \t]+/g;
      let indent = null;
      block.split("\n").forEach(function (line) {
        let match = line.match(REGEX_INDEX);
        let cur = match !== null ? match[0].length : null;
        if (cur < indent || indent === null) indent = cur;
      });
      let ret = "";
      block.split("\n").forEach(function (line) {
        line = undent(line, indent);
        ret += line;
      });
      return ret;
    }

    function undent(str, remove) {
      let ret = "";
      let count = 0;
      for (let i = 0; i < str.length; i++) {
        let c = str.charAt(i);
        if (c === " " && count < remove) {
          count++;
        } else {
          break;
        }
      }
      ret = str.substr(count, str.length);
      if (ret === "\n" || ret === " ") ret;
      return ret + "\n";
    }

    function isEmpty(str) {
      if (str === null || str === undefined) return true;
      if (str.trim() == ``) return true;
      return false;
    }

    function __DBG__(msg) {
      ///*
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      console.log.apply(console, ["[DEBUGGING] " + msg].concat(otherArgs));
      //*/
    }

    function __LOG__(msg, bump, div) {
      if (options.output === undefined) {
        return;
      }
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      if (bump) {
        console.log(`\n`);
      }
      if (div) {
        console.log(
          "**********************************************************************"
        );
      }
      console.log.apply(console, ["[LOG] " + msg]);
    }
  },
};
