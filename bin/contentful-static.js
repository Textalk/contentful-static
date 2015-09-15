#!/usr/bin/env node
var yargs = require('yargs').usage('Usage: $0 -t [templateDir] -b [buildDir] -e [nunjucks] -h [host] -s [space] -a [accessToken] -c [secure] [data.json]')
                           .help('h')
                           .describe('t', 'Template dir')
                           .default('t', 'templates')
                           .alias('t', 'templates')
                           .describe('e', 'Template engine')
                           .default('e', 'nunjucks')
                           .alias('e','engine')
                           .describe('h', 'API host address')
                           .alias('h', 'host')
                           .describe('a', 'contentful access token')
                           .alias('a', 'access')
                           .describe('s', 'contentful space')
                           .alias('s', 'space')
                           .describe('a', 'contentful access token')
                           .alias('a', 'access')
                           .describe('c', 'contentful security token')
                           .alias('c', 'secure')
                           .alias('h', 'help')
                           .describe('b', 'Build dir')
                           .default('b', 'build')
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
  space: argv.s || process.env.CONTENTFUL_SPACE,
  secure: argv.c || process.env.CONTENTFUL_SECURE,
  accessToken: argv.a || process.env.CONTENTFUL_ACCESS,
  engine: argv.e,
  templates: argv.t
};
contentfulStatic.config(config);

if (!config.accessToken) {
  console.error(chalk.red('No access token specified'));
  yargs.showHelp();
  process.exit();
}

if (!config.space) {
  console.error(chalk.red('No space specified'));
  yargs.showHelp();
  process.exit();
}


var contentPromise;
if (argv._[0]) {
  try {
    content = JSON.parse(fs.readFileSync(argv._[0]));
    contentPromise = q.when(content);
  } catch (e) {
    console.log(chalk.red('Could not load contentful data'));
    console.error(e);
    process.exit();
  }
} else {
  contentPromise = contentfulStatic.sync();
}

contentPromise.then(function(content) {
  return contentfulStatic.render(content).then(function(includes) {
    // Start churning out pages
    rimraf.sync(argv.b);
    mkdirp.sync(argv.b);
    
    // TODO: some kind of config of what should be saved to file.
    Object.keys(content).forEach(function(key) {
      if (key.indexOf('page-') === 0) {
        content[key].forEach(function(entry) {
          var filename = (entry.fields && entry.fields.id) || entry.sys.id;
          fs.writeFileSync(path.join(argv.b, filename + '.html'), includes[entry.sys.id]);
          console.log(chalk.cyan('Wrote ' + filename + '.html'));
        });
      }
    });
  });
}).catch(function(err) {
  console.log(chalk.red("I'm sorry, something just went wrong."));
  console.error(err);
});
