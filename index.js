var fs       = require('fs');
var path     = require('path');
var chalk    = require('chalk');
var findup   = require('findup-sync');
var mkdirp   = require('mkdirp');
var walkSync = require('walk-sync');
var JSHINT   = require('jshint').JSHINT;
var helpers  = require('broccoli-kitchen-sink-helpers');
var Filter   = require('broccoli-filter');

var mapSeries = require('promise-map-series')

JSHinter.prototype = Object.create(Filter.prototype);
JSHinter.prototype.constructor = JSHinter;
function JSHinter (inputTree, options) {
  if (!(this instanceof JSHinter)) return new JSHinter(inputTree, options);

  options = options || {};

  this.inputTree = inputTree;
  this.log       = true;

  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
};

JSHinter.prototype.extensions = ['js'];
JSHinter.prototype.targetExtension = 'jshint.js';

JSHinter.prototype.write = function (readTree, destDir) {
  var self = this
  self._errors = [];

  return readTree(this.inputTree).then(function (srcDir) {
    var paths = walkSync(srcDir)

    if (!self.jshintrc) {
      self.jshintrc = self.getConfig(path.join(srcDir, self.jshintrcRoot || ''));
    }

    return mapSeries(paths, function (relativePath) {
      if (relativePath.slice(-1) === '/') {
        mkdirp.sync(destDir + '/' + relativePath)
      } else {
        if (self.canProcessFile(relativePath)) {
          return self.processAndCacheFile(srcDir, destDir, relativePath)
        } else {
          helpers.copyPreserveSync(
            srcDir + '/' + relativePath, destDir + '/' + relativePath)
        }
      }
    })
  })
  .finally(function() {
    if (self._errors.length > 0) {
      var label = ' JSHint Error' + (self._errors.length > 1 ? 's' : '')
      console.log('\n' + self._errors.join('\n'));
      console.log(chalk.yellow('===== ' + self._errors.length + label + '\n'));
    }
  })
}

JSHinter.prototype.processString = function (content, relativePath) {
  var passed = JSHINT(content, this.jshintrc);
  var errors = this.processErrors(relativePath, JSHINT.errors);

  if (!passed && this.log) {
    this.logError(errors);
  }

  if (!this.disableTestGenerator) {
    return this.testGenerator(relativePath, passed, errors);
  }
};

JSHinter.prototype.processErrors = function (file, errors) {
  if (!errors) { return ''; }

  var len = errors.length,
  str = '',
  error, idx;

  if (len === 0) { return ''; }

  for (idx=0; idx<len; idx++) {
    error = errors[idx];
    if (error !== null) {
      str += file  + ': line ' + error.line + ', col ' +
        error.character + ', ' + error.reason + '\n';
    }
  }

  return str + "\n" + len + ' error' + ((len === 1) ? '' : 's');
}

JSHinter.prototype.testGenerator = function(relativePath, passed, errors) {
  if (errors) {
    errors = "\\n" + this.escapeErrorString(errors);
  } else {
    errors = ""
  }

  return "suite('JSHint - " + path.dirname(relativePath) + "');\n" +
         "test('" + relativePath + " should pass jshint', function() { \n" +
         !!passed +".should.be.ok; \n"+
         "});\n"
};

JSHinter.prototype.logError = function(message, color) {
  color = color || 'red';

  this._errors.push(chalk[color](message) + "\n");
};

JSHinter.prototype.getConfig = function(rootPath) {
  if (!rootPath) { rootPath = process.cwd(); }

  var jshintrcPath = findup('.jshintrc', {cwd: rootPath, nocase: true});

  if (jshintrcPath) {
    var config = fs.readFileSync(jshintrcPath, {encoding: 'utf8'});

    try {
      return JSON.parse(this.stripComments(config));
    } catch (e) {
      console.error(chalk.red('Error occured parsing .jshintrc.'));
      console.error(e.stack);

      return null;
    }
  }
};

JSHinter.prototype.stripComments = function(string) {
  string = string || "";

  string = string.replace(/\/\*(?:(?!\*\/)[\s\S])*\*\//g, "");
  string = string.replace(/\/\/[^\n\r]*/g, ""); // Everything after '//'

  return string;
};

JSHinter.prototype.escapeErrorString = function(string) {
  string = string.replace(/\n/gi, "\\n");
  string = string.replace(/'/gi, "\\'");

  return string;
};

module.exports = JSHinter;
