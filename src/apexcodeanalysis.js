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
    const declarations = new Map();
    const classMembers = new Map();

    const CLASS_TYPES = [`Class`, `Interface`];
    const CLASS_AND_ENUM_TYPES = [
      `Class`,
      `Interface`,
      `Enum`,
      `System`,
      `Database`
    ];
    const HIDDEN_TAGS = [`@exclude`, `@hidden`];
    const EXCLUDED_TYPES = [
      `Blob`,
      `Boolean`,
      `Crypto`,
      `Database`,
      `Date`,
      `Datetime`,
      `Decimal`,
      `Double`,
      `Exception`,
      `Fields`,
      `Httprequest`,
      `Httpresponse`,
      `Integer`,
      `Json`,
      `Limits`,
      `Matcher`,
      `Math`,
      `Metadata`,
      `Metadataservice`
      `Object`,
      `Pagereference`,
      `Pattern`,
      `Recordtypeinfo`,
      `Schema`,
      `Sobject`,
      `Sobjecttype`,
      `String`,
      `System`,
      `Test`,
      `Time`
      `Triggernew`,
      `Triggerold`,
      `Userinfo`,
    ];

    const REGEX_TEST = /([A-Z])\w+/gi;
    //const REGEX_TYPE_PARAM = /(<+[\w ]*(\,)*[\w ]*>+)*/g;

    // Capture group 1 = variable, group 2 = method  String.toLowerCase() 1 = String, 2 = toLowerCase
    const REGEX_SYMBOL = /([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(/gi;
    /**
     * Capture group 1 = Object or primitive type
     *         group 2 = Type Parameter (optional)
     *         group 3 = Variable name
     *         group 4 = new or Cast
     *         group 5 = Initializer
     *         group 6 = Initializer Type Parameter (optional)
     */
    const REGEX_DECLARATION = /([\w]+) *(<+.*>+)*[ \t]+([\w]+)\s*=\s*(new|\(+\1(?:<+.*>+)*\))*\s*([\w']+)(<+.*>+)*/gim;

    const REGEX_FOR = /for \(([\w]+)(<+.*>+)* ([\w]+)/gi;

    /**
     * Capture group 1 = Object or primitive type
     *         group 2 = Type Parameter (optional)
     *         group 3 = Param name
     */
    const REGEX_PARAM = /([a-zA-Z0-9_]+\s*(?:<+[a-zA-Z0-9_ ]+\,*[a-zA-Z0-9_ ]*>+)*\s*)([a-zA-Z0-9_]*)/gi;

    const REGEX_PARAMETER_LIST = /[public|private|protected|global]+ [\w ]*\(([\w<>, )]+)\)/gi;

    const REGEX_STRING = /([\"'`])(?:[\s\S])*?(?:(?<!\\)\1)/gim;
    const REGEX_COMMENT = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gim;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gim;
    const REGEX_COMMENT_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)\s*}/gim;
    const REGEX_ACCESSORS = /^[ \t]*(global|public|private)/gi;

    const REGEX_CLASS = new RegExp(
      REGEX_ATTRIBUTES.source +
        REGEX_ACCESSORS.source +
        /\s*([\w\s]*)\s+(class|enum|interface)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{/
          .source,
      "gmi"
    );

    const REGEX_ABSTRACT_METHOD = new RegExp(
      REGEX_ATTRIBUTES.source +
        /(?:\@[^\n]*[\s]+)*^[ \t]*(abstract)[ \t]*(global|public|private)[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\,\. ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:{|;)/
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
      CONSTRUCTOR: 4
    };

    ///// Main /////////////////////////////////////////////////////////////////////////////////////////////////////////
    return (function() {
      normalizeOptions();
      let raw = iterateFiles();
      let data = formatOutput(raw);
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
          accessors: ["global", "public", "private", "protected"]
        },
        optionsArg
      );
      hasOutput = options.output;
      ///// Negate all the excluded patterns:
      options.exclude = [].concat(options.exclude).map(function(item) {
        if (item.charAt(0) === "!") {
          return item;
        }
        return "!" + item;
      });
    }

    function toCamelCase(str) {
      if (!str) return str;
      return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
        if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
      });
    }

    function toTitleCase(str) {
      return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      });
    }

    function rightPad(str, padding) {
      let p = "";
      padding -= str.length;
      while (padding-- > 0) {
        p += " ";
      }
      return str + p;
    }

    function excludedType(str) {
      if (!str) return true;
      str = toTitleCase(str).trim();
      if (str.substr(str.length - 3) == "__c") return true;
      if (str.substr(0, 4) == "Map<") return true;
      if (str.substr(0, 4) == "Set<") return true;
      if (str.substr(0, 5) == "List<") return true;
      if (EXCLUDED_TYPES.includes(str)) return true;
      return false;
    }

    function addDeclaration(token, type) {
      if (!token | !type) {
        __DBG__(`*** ${token} : ${type}`);
        return;
      }
      token = toCamelCase(token).trim();
      type = toTitleCase(type).trim();
      if (!declarations.get(token)) {
        //__DBG__(`${rightPad(token, 25)} : ${type}`);
        declarations.set(token, type);
      }
    }

    function addMember(apexClass, member) {
      if (!apexClass | !member) {
        //__DBG__(`Member = ${apexClass} : ${member}`);
        return;
      }
      apexClass = toTitleCase(apexClass).trim();
      member = toCamelCase(member).trim();
      let symbol = apexClass + "." + member;
      //__DBG__(`${rightPad(apexClass, 25)} : ${member}`);
      if (!classMembers.get(apexClass)) {
        classMembers.set(apexClass, [member]);
      } else {
        classMembers.get(apexClass).push(member);
      }
      symbols.set(symbol, (symbols.get(symbol) ?? 0) + 0);
    }

    ///// Parse File ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseFile(text, lang) {
      let fileData = [];
      let symbolData = [];
      let declarationData = [];
      let paramsData = [];
      let classData = [];
      let classes = [];
      let allClasses = []; // Includes private and other classes so we can remove them from the parent body
      let i = 0;

      classData = matchAll(text, REGEX_CLASS, true);

      ///// All classes
      classData.forEach(function(data) {
        let c = getClass(data);
        allClasses.push(c);
      });

      ///// Filtered classes (only public and global)
      classData = filter(classData, lang, undefined, "classes");
      __LOG__("Classes = " + classData.length);

      classData.forEach(function(data) {
        let c = getClass(data);
        classes.push(c);
      });

      classes = setClassBodyCodeOnly(allClasses);
      classes = setLevels(classes);
      classes = setClassPaths(classes); //.sort(ClassComparator);

      classData.forEach(function(data) {
        let parsedClass = parseData([data], ENTITY_TYPE.CLASS, classes[i]);
        __LOG__("Class = " + classes[i].path);
        if (fileData.length === 0) {
          fileData = parsedClass;
        } else {
          fileData = fileData.concat(parsedClass);
        }
        let members = parseClass(classes[i], lang);
        if (members !== undefined) fileData = fileData.concat(members);

        members.forEach(function(m) {
          addMember(classes[i].path, m[0].toc.substr(0, m[0].toc.indexOf("(")));
        });

        i++;
      });

      let declarationCount = 0;

      ///// Standard Declarations
      declarationData = matchAll(text, REGEX_DECLARATION, true);
      declarationCount += declarationData.length;
      declarationData.forEach(function(data) {
        addDeclaration(data[3], data[1] + (data[2] ?? ""));
      });

      ///// For Loop Declarations
      declarationData = matchAll(text, REGEX_FOR, true);
      declarationCount += declarationData.length;
      declarationData.forEach(function(data) {
        addDeclaration(data[3], data[1] + (data[2] ?? ""));
      });

      ///// Param Declarations
      paramsData = matchAll(text, REGEX_PARAMETER_LIST, true);
      declarationCount += paramsData.length;
      paramsData.forEach(function(data) {
        let params = matchAll(data[1], REGEX_PARAM, true);
        params.forEach(function(param) {
          addDeclaration(param[2], param[1]);
        });
      });

      __LOG__(`Declarations = ${declarationCount}`);

      ///// Internal References
      classes.forEach(function(c) {
        let apexClass = toTitleCase(c.path).trim();
        // Check if the class has any members first, some classes may have no valid member methods such as test classes
        if (classMembers.get(apexClass)) {
          classMembers.get(apexClass).forEach(function(method) {
            let methodCall = RegExp(
              "^[ \\t\\w<>=,]*(" + method + ")+\\s*\\(.*\\)\\s*{*",
              "gim"
            );
            let refs = matchAll(text, methodCall, true);
            let symbol = apexClass + "." + method;
            refs.forEach(function(r) {
              // Skip method declartions, otherwise increment ref count
              r[0] = r[0].replace("\n", "");
              if (!r[0].match(REGEX_METHOD)) {
                symbols.set(symbol, (symbols.get(symbol) ?? 0) + 1);
              }
            });
          });
        }
      });

      ///// External References
      symbolData = matchAll(text, REGEX_SYMBOL, true);
      symbolData.forEach(function(data) {
        let v = toCamelCase(data[1]);
        let type = declarations.get(v) ?? v;
        if (!excludedType(type)) {
          let token = toTitleCase(type) + "." + toCamelCase(data[2]);
          symbols.set(token, (symbols.get(token) ?? 0) + 1);
        }
      });

      let symbolsAsc = new Map([...symbols.entries()].sort());

      symbolsAsc.forEach(function(value, key) {
        __DBG__(`${key}, refs ${value}`);
      });

      return fileData;
    }

    ///// Parse Class //////////////////////////////////////////////////////////////////////////////////////////////////
    function parseClass(target, lang) {
      let children = [];
      let classType = target.name.toLowerCase(); // Class, Enum, Interface, etc.

      ///// Handle Properties
      let propertyData = matchAll(target.bodyCodeOnly, REGEX_PROPERTY, true);
      propertyData = filter(propertyData, lang, classType, "properties");
      __LOG__("Properties = " + propertyData.length);

      if (propertyData.length > 0) {
        children = children.concat(
          parseData(propertyData, ENTITY_TYPE.PROPERTY)
        );
        // TODO: Add these to global property list
      }

      ///// Handle Constructors
      let constructorData = matchAll(
        target.bodyCodeOnly,
        REGEX_CONSTRUCTOR,
        true
      );
      constructorData = filter(constructorData, lang, classType);
      __LOG__("Constructors = " + constructorData.length);

      if (constructorData.length > 0) {
        children = children.concat(
          parseData(constructorData, ENTITY_TYPE.CONSTRUCTOR)
        );
        // TODO: Add these to global constructors list
      }

      ///// Handle Abstract Methods
      let abstractData = matchAll(
        target.bodyCodeOnly,
        REGEX_ABSTRACT_METHOD,
        true
      );
      abstractData = filter(abstractData, lang, classType, "abstracts");
      __LOG__("Abstract Methods = " + abstractData.length);

      if (abstractData.length > 0) {
        children = children.concat(parseData(abstractData, ENTITY_TYPE.METHOD));
        // TODO: Add these to global abstract methods list
      }

      ///// Handle Methods
      let methodData = matchAll(target.bodyCodeOnly, REGEX_METHOD, true);
      methodData = filter(methodData, lang, classType, "methods");
      __LOG__("Methods = " + methodData.length);

      if (methodData.length > 0) {
        children = children.concat(parseData(methodData, ENTITY_TYPE.METHOD));
        // TODO: Add these to global mthods list
      }

      return children;
    }

    ///// Parse Data ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseData(rawData, entityType, header) {
      let fileDataLines = [];

      rawData.forEach(function(data) {
        let lastObject = {
          name: "default",
          text: ""
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

        ///// Flag for todo
        // if (entityHeader.isCommentRequired && !entityHeader.isDeprecated) {
        //   commentData.push({
        //     name: "todo",
        //     text: STR_TODO.replace("_ENTITY_", entityHeader.name)
        //   });
        // }

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
    function formatOutput(docComments) {
      const fs = require("fs");
      const path = require("path");
      const mkdirp = require("mkdirp");
      let data = undefined;
      if (options.format === "markdown") {
        let tocData = "";
        data = "";
        for (let file in docComments) {
          let docCommentsFile = docComments[file];
          let firstProp = true;
          let firstParam = true;
          let isMethod = false;
          let parentName;
          for (let a = 0; a < docCommentsFile.length; a++) {
            let cdataList = docCommentsFile[a];
            if (cdataList === null || cdataList === undefined) break;
            for (let b = 0; b < cdataList.length; b++) {
              (function(cdata) {
                ///// Stage the data
                let entityType =
                  cdata[b].name === undefined
                    ? ""
                    : cdata[b].name.replace(/^@/g, "");
                let text =
                  cdata[b].text === undefined
                    ? ""
                    : cdata[b].text.replace(/\n/gm, " ").trim();
                let entitySubtype =
                  cdata[b].type === undefined
                    ? ""
                    : cdata[b].type.replace(/\n/gm, " ");
                let entityName =
                  cdata[b].toc === undefined
                    ? ""
                    : cdata[b].toc.replace(/\n/gm, " ");
                let classPath =
                  cdata[b].path === undefined
                    ? ""
                    : cdata[b].path.replace(/\n/gm, " ");
                let body = cdata[b].body === undefined ? "" : cdata[b].body;
                let descrip =
                  cdata[b].descrip === undefined
                    ? ""
                    : cdata[b].descrip.replace(/\n/gm, " ").trim();
                let codeBlock = matchAll(
                  cdata[b].text,
                  REGEX_COMMENT_CODE_BLOCK
                );
                let isDeprecated =
                  cdata[b].isDeprecated ||
                  (isDeprecatedClass && cdata[b].level > 0);
                let deprecated = isDeprecated ? ` *deprecated*` : ``;

                ///// Propercase entityType
                if (entityType.length) {
                  entityType =
                    entityType[0].toUpperCase() + entityType.substr(1);
                }
                if (CLASS_TYPES.includes(entityType)) {
                  firstProp = true;
                  isMethod = false;
                  parentName = entityName;
                }
                if (entityType === `Method`) {
                  firstParam = true;
                  isMethod = true;
                  parentName = entityName;
                }

                ///// Code Blocks
                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                  codeBlock.forEach(function(block) {
                    text = text.replace(
                      block[0].replace(/\n/gm, ` `),
                      "\n##### Example:\n```" +
                        getLang(file) +
                        undentBlock(block[1]) +
                        "```\n"
                    );
                  });
                }

                ///// Classes, Enum & Interface types
                if (CLASS_AND_ENUM_TYPES.includes(entityType)) {
                  entityType = entityType.toLowerCase();
                  tocData += `\n1. [${classPath} ${entityType}](#${classPath.replace(
                    /\s/g,
                    "-"
                  )}-${entityType}) ${deprecated}`;
                  text = `${classPath} ${entityType}${deprecated}`;
                  text = `\n---\n### ${text}`;

                  ///// Enum values
                  if (entityType === "enum" && body !== undefined) {
                    text += `\n${descrip}`;
                    text += "\n\n|Values|\n|:---|";
                    getEnumBody(body).forEach(function(enumText) {
                      text += `\n|${enumText}|`;
                    });
                  }

                  ///// Methods
                } else if (entityType === "Method") {
                  tocData += `\n   * ${escapeAngleBrackets(
                    entityName
                  )}${deprecated}`;
                  text = `#### ${escapeAngleBrackets(text)}${deprecated}`;

                  ///// Parameters
                } else if (entityType === "Param") {
                  let pname = text.substr(0, text.indexOf(" "));
                  let descrip = text.substr(text.indexOf(" "));
                  if (isMethod) {
                    if (firstParam) {
                      data +=
                        "\n##### Parameters:\n\n|Name|Description|\n|:---|:---|\n";
                      firstParam = false;
                    }
                    text = `|${pname}${deprecated}|${descrip}|`;
                  } else {
                    text = `* TODO: Parameter ${pname} defined in class comment; move to method or constructor.`;
                  }

                  ///// Return values
                } else if (entityType === "Return") {
                  if (isMethod) {
                    text = "\n##### Return value:\n\n" + text;
                  } else {
                    text = `* TODO: Return value defined in class comment, but should not be.`;
                  }

                  ///// Properties
                } else if (entityType === "Property") {
                  if (firstProp) {
                    data +=
                      "\n#### Properties\n\n|Static?|Type|Property|Description|" +
                      "\n|:---|:---|:---|:---|\n";
                    firstProp = false;
                  }
                  let static = cdata[b].static ? "Yes" : " ";
                  descrip = descrip.replace(/\/\*\*/g, "");
                  text = `|${static}|${entitySubtype}|${text}|${descrip}${deprecated}|`;
                } else if (entityType === "Author") {
                  text = "";
                }
                data += `${text}\n`;
              })(cdataList);
            }
          }
          data += "\n";
        }
        /////File header
        data = "# API Reference\n" + tocData + "\n" + data;
      } else {
        data = JSON.stringify(docComments, null, 4);
      }

      if (options.output === undefined) {
        console.log(data);

        ///// Write out to the specified file
      } else {
        __LOG__("Writing results to: " + options.output);
        let folder = path.dirname(options.output);
        if (fs.existsSync(folder)) {
          if (fs.lstatSync(folder).isDirectory()) {
            fs.writeFileSync(options.output, data, "utf8");
          } else {
            throw {
              name: "DumpingResultsError",
              message: "Destination folder is already a file"
            };
          }
        } else {
          mkdirp.sync(folder);
          fs.writeFileSync(options.output, data, "utf8");
        }
      }
      return data;
    }

    ///// Iterate Files ////////////////////////////////////////////////////////////////////////////////////////////////
    function iterateFiles() {
      const globule = require("globule");
      const fs = require("fs");
      let docComments = {};
      __LOG__("Starting.");
      __LOG__("Files:", options.include);
      __LOG__("Excluded:", options.exclude);
      __LOG__("Output:", options.output);
      __LOG__("Format:", options.format);
      __LOG__("Accessors:", options.accessors);
      const files = globule.find(
        [].concat(options.include).concat(options.exclude)
      );
      __LOG__("Files found: " + files.length);
      for (let a = 0; a < files.length; a++) {
        let file = files[a];
        // Skip managed package files & MetadataService
        if (
          file.indexOf("__") != -1 ||
          file.indexOf("MetadataService.cls") != -1
        ) {
          //__LOG__(`File: ${file} skipped.`);
          continue;
        }
        let lang = getLang(file);
        __LOG__(`File: ${file} Lang: ${lang}`);
        let contents = fs.readFileSync(file).toString();
        let matches = parseFile(contents, lang);
        if (matches.length !== 0) {
          docComments[file] = matches;
        }
      }
      return docComments;
    }

    ///// Utility Methods //////////////////////////////////////////////////////////////////////////////////////////////
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
      let i = 0;
      let noComments = str.replace(REGEX_COMMENT, ``).replace(/\/\/.*/g, ``);
      while ((result = regexp.exec(str)) && ++i < 1000) {
        if (
          noComments.includes(result[0]) ||
          result[0].trim().substring(0, 3) === `/**` ||
          !excludeComments
        ) {
          ret.push(result);
        }
      }
      if (i == 1000) {
        throw new Error("BOOM!\n" + ret[0] + "\n" + ret[1]);
      }
      return ret;
    }

    function filter(data, lang, parentType, type) {
      data = filterByAccessors(data, lang, parentType, type);
      data = filterByHidden(data, lang, parentType);
      return data;
    }

    function filterByAccessors(data, lang, parentType, type) {
      let ret = [];
      data.forEach(function(target) {
        if (
          options.accessors.includes(target[1]) ||
          (parentType === `interface` && lang === `apex` && isEmpty(target[1]))
        ) {
          ret.push(target);
        } else {
          __DBG__(
            `Filtered out ${target[1]} accessor for entity ${target[4]}.`
          );
        }
      });
      if (ret.length < data.length)
        __DBG__(
          `Filtered out ${data.length - ret.length} ${type} based on accessors.`
        );
      return ret;
    }

    function filterByHidden(data) {
      let ret = [];
      data.forEach(function(target) {
        if (!isHidden(target)) ret.push(target);
      });
      if (ret.length < data.length)
        __DBG__(
          `Filtered out ${data.length - ret.length} types which are @hidden.`
        );
      return ret;
    }

    function isHidden(data) {
      let ret = false;
      let jd = data[0].match(REGEX_COMMENT);
      if (jd === null) return false;
      HIDDEN_TAGS.forEach(function(tag) {
        if (jd[0].toLowerCase().includes(tag)) {
          ret = true;
          return;
        }
      });
      return ret;
    }

    // function merge(data1, data2, key1, key2) {
    //   let keys = [];
    //   data1.forEach(function(item) {
    //     keys.push(item[key1]);
    //   });
    //   data2.forEach(function(item) {
    //     if (!keys.includes(item[key2])) {
    //       data1.push(item);
    //     }
    //   });
    //   return data1;
    // }

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
        isExclude: isHidden(data)
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
        isExclude: isHidden(data)
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
        isExclude: isHidden(data)
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
        isCommentRequired:
          data[3] !== `enum` && (!data[5] || data[5].includes(`exception`)),
        isExclude: isHidden(data)
      };
      return ret;
    }

    function setLevels(classes) {
      classes.forEach(function(cur) {
        cur.level = recLevel(cur, classes.slice(0), 0);
      });
      return classes;
    }

    function recLevel(target, classes, level) {
      classes.forEach(function(cur) {
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
      classes.forEach(function(cur) {
        cur.path = recPath(cur, cur.path, classes.slice(0)) + cur.toc;
      });
      return classes;
    }

    function recPath(target, path, classes) {
      classes.forEach(function(cur) {
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
      classes.forEach(function(target) {
        target.bodyCodeOnly = target.body;
        classes.forEach(function(cur) {
          if (target !== cur) {
            let isChild = target.body.includes(cur.signature);
            if (isChild) {
              target.bodyCodeOnly = target.bodyCodeOnly.replace(cur.body, ``);
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

    function getEndIndex(data) {
      let codeBlock = data.input.substring(data.index, data.input.length);
      ///// Replace comment bodies with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_COMMENT, function(match, p1) {
        return "/**" + "".padStart(match.length - 5) + "*/";
      });
      ///// Replace string literals with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_STRING, function(match, p1) {
        return p1 + "".padStart(match.length - 2) + p1;
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
      codeBlock = data.input.substring(data.index, endIndex);
      return endIndex;
    }

    function escapeAngleBrackets(str) {
      return str.replace(/([\<\>])/g, function(match) {
        return `\\${match}`;
      });
    }

    function getLang(file) {
      if (file.substr(file.length - 4, file.length) === ".cls") return "apex";
    }

    function undentBlock(block) {
      let REGEX_INDEX = /^[ \t]*\**[ \t]+/g;
      let indent = null;
      block.split("\n").forEach(function(line) {
        let match = line.match(REGEX_INDEX);
        let cur = match !== null ? match[0].length : null;
        if (cur < indent || indent === null) indent = cur;
      });
      let ret = "";
      block.split("\n").forEach(function(line) {
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

    function __LOG__(msg) {
      if (options.output === undefined) {
        return;
      }
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      console.log.apply(console, ["[LOG] " + msg].concat(otherArgs));
    }
  }
};

function Symbol(parent, token, refs) {
  this.parent = parent;
  this.token = token;
  this.refs = refs;
}
