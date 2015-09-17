# Simple static site generator for contentful #

## What it's for ##
A CLI tool to generate a site from templates + data from a contentful space

## How to use it ##

To build a site from a space using the templates in `templatesFolder`
```sh
contentful-static -a yourAccessToken yourSpaceId templatesFolder/ dest/
```

## Template building

Each entry in your contentful data is matched against a template by checking it's `contentType`
name.

### Template variables

Availiable in the template context are

| Name        |                                          |
|:------------|------------------------------------------|
| entry       | The entry for this template              |
| content     | The entire contentful data object.       |
| entries     | All entries                              |
| includes    | HTML data for all entries already rendered. Key is id. |
| include(entry)  | A function (shorthand for direct usage of include). Takes either a list of entries or an entry and returns it's html |
| debug(obj) | Print debug for an object |

### A note on templates
As a default `contentful-static` uses the template language [nunjucks](https://mozilla.github.io/nunjucks/).
But since it uses [consolidate](https://www.npmjs.com/package/consolidate) in theory any other
templating language can be used.

### Install with NPM ###

```sh
npm install -g contentful-static
```

## API

```js
var contentfulStatic = require('contentful-static');
```

### 3. Configure ###

```js
contentfulStatic.config({
    // Path to templates.
    templates: 'templates'
    // Your Contentful space ID
    space: 'my12space34id',
    // Contentful Access Token
    accessToken: '5fdae8a3myacc3sst0ken573962'
});
```

### 4. Fetch  ###

```js

// With promise
contentfulStatic.sync().then(function(json) {
  console.log('contentful-static: data stored successfully!', json);
}, function (err) {
  console.log('contentful-static: data could not be fetched');
});

// With callback
contentfulStatic.sync(function(err, json) {
    if(err) {
        console.log('contentful-static: data could not be fetched');
        return false;
    }
    console.log('contentful-static: data fetched successfully!', json);
});
```

### 4. Render  ###

```js

// With promise
contentfulStatic.render(json).then(function(htmls) {
  // Rendered data is an object where key is entry sys id and value is its HTML
  console.log(htmls);
}, function (err) {
  console.log('Could not render templates');
});

// With callback
contentfulStatic.render(json, function(err, htmls) {
    // Handle callback
});
```
