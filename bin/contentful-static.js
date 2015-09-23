#!/usr/bin/env node
var yargs = require('yargs').usage('Usage: $0 -e [nunjucks] -h [host] -a [accessToken] -c [secure]  <space> <templates> <dest>')
                           .demand(3)
                           .command('space', 'Contentful space or path to json file')
                           .command('templates', 'Path to templates')
                           .command('dest', 'Destination path')
                           .help('h')
                           .describe('e', 'Template engine')
                           .default('e', 'nunjucks')
                           .alias('e','engine')
                           .describe('h', 'API host address')
                           .alias('h', 'host')
                           .describe('a', 'contentful access token')
                           .alias('a', 'access')
                           .describe('a', 'contentful access token')
                           .alias('a', 'access')
                           .describe('c', 'contentful security token')
                           .alias('c', 'secure')
                           .alias('h', 'help');

var argv = yargs.argv;

var contentfulStatic = require('../');
var chalk = require('chalk');
var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var q = require('q');


var config = {
  host: argv.h || process.env.CONTENTFUL_HOST,
  space: argv._[0] || process.env.CONTENTFUL_SPACE,
  secure: argv.c || process.env.CONTENTFUL_SECURE,
  accessToken: argv.a || process.env.CONTENTFUL_ACCESS,
  engine: argv.e,
  templates: argv._[1]
};


if (!config.accessToken) {
  console.error(chalk.red('No access token specified'));
  yargs.showHelp();
  process.exit();
}
contentfulStatic.config(config);


var contentPromise;
if (/\.json$/.test(argv._[0])) {
  try {
    content = JSON.parse(fs.readFileSync(argv._[0]));
    contentPromise = q.when(content);
  } catch (e) {
    console.log(chalk.red('Could not load contentful data'));
    console.error(e);
    process.exit();
  }

} else {
  contentfulStatic.config(config);
  contentPromise = contentfulStatic.sync();
}

contentPromise.then(function(content) {
  console.log(chalk.green('Content fetched'));
  return contentfulStatic.render(content).then(function(byLocale) {
    console.log(chalk.green('Pages rendered'));
    // Clean build dir.
    var buildDir = argv._[2];
    rimraf.sync(buildDir);
    mkdirp.sync(buildDir);

    // Start churning out pages by locale
    Object.keys(byLocale).forEach(function(code) {
      var includes = byLocale[code];

      // TODO: some kind of config of what should be saved to file.
      content.entries[code].forEach(function(entry) {
        if (entry.fields.filepath) {
          var filepath = path.join(buildDir, code, entry.fields.filepath);
          mkdirp.sync(path.dirname(filepath));
          fs.writeFileSync(filepath, includes[entry.sys.id]);
          console.log(chalk.cyan('Wrote ' + filepath));
        }
      });

    });
  });
}).catch(function(err) {
  console.log(chalk.red("I'm sorry, something just went wrong."));
  console.error(err);
});
