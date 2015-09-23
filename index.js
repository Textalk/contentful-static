var
	contentful = require('contentful');
	fs = require('fs'),
	mkdirp = require('mkdirp'),
	q = require('q'),
	chalk = require('chalk'),
	rimraf = require('rimraf'),
	consolidate = require('consolidate'),
	path = require('path');

module.exports = (function() {

	var contentTypes = {
		array: [],
		byId: {}
	};

	var db = {
		_sys: {
			contentTypes: [],
			entries: [],
			assets: []
		}
	};

	var options = {
		engine: 'nunjucks',
		templates: 'templates',
		apiconfig: {
			space: null,
			accessToken: null,
			secure: true,
			host: 'cdn.contentful.com'
		}
	};

	var writeToFile = function() {
		var deferred = q.defer();
		var filename = options.dest;
		var filepath = process.cwd() + '/' + filename;
		var directory = path.dirname(filepath);
		var contents = JSON.stringify(db, null, 2);

		mkdirp(directory, function(err) {
			if(err) {
				deferred.reject(err);
				return;
			}

			try {
				fs.writeFileSync(filepath, contents, 'utf8');
			} catch (err) {
				deferred.reject(err);
				return;
			}
			deferred.resolve();
		});
		return deferred.promise;
	};

	var contentfulStatic = {

		config: function( optionsObject ) {
			options.templates = optionsObject.templates || options.templates;
			options.engine = optionsObject.engine || options.engine;
			options.apiconfig.space = optionsObject.space || options.apiconfig.space;
			options.apiconfig.accessToken = optionsObject.accessToken || options.apiconfig.accessToken;
			options.apiconfig.secure = optionsObject.secure || options.apiconfig.secure;
			options.apiconfig.host = optionsObject.host || options.apiconfig.host;
		},

		/**
		 * Sync content from contentful. You can choose to supply a callback or just use the promise
		 * that is returned.
		 *
		 * @param {Function} callback (optional) a callback function(err, content)
		 * @return {Promise} a promise that resolves to the content.
		 */
		sync: function(callback) {
			var client = contentful.createClient(options.apiconfig);

			var promise = client.contentTypes().then( function(response) {
				db._sys.contentTypes = response;
				for (var i = 0; i < response.length; i++) {
					var type = response[i];
					contentTypes.byId[type.sys.id] = type.name;
					db._sys.contentTypes[type.sys.id] = type;
					db[type.name] = [];
				}
				return client.entries().then( function(response) {
					db._sys.entries = response;
					for (var i = 0; i < db._sys.entries.length; i++) {
						var entry = db._sys.entries[i];
						var typeName = contentTypes.byId[entry.sys.contentType.sys.id];
						db[typeName].push(entry);
					}

					// if (options.dest) {
					// 	return writeToFile().then(function() { return db; });
					// }
					return db;
				});
			});

			if (callback) {
				promise.then(function(db) {
					callback(undefined, db);
				}, callback);
			}
			return promise;
		},

		/**
		 * Renders HTML snippets for all entries.
		 *
		 * @param {Object} content The content.
		 * @param {Function} callback (optional) a callback function(err, html)
		 * @return {Promise} that resolves to an object with id of entry as key and HTML as value.
		 */
		render: function(content, callback) {
			// Massage the data for some easy lookup
			var entries = {};
			Object.keys(content).filter(function(k) {return k !== '_sys';}).reduce(function(entries, type) {
			  content[type].forEach(function(entry) {
			    entries[entry.sys.id] = entry;
			  });
			  return entries;
			}, entries);

			var contentTypes = {};
			content._sys.contentTypes.reduce(function(types, ct) {
			  types[ct.sys.id] = ct;
			  return types;
			}, contentTypes);

			// Find out order to render in.
			var recurse = function(obj, list, contentTypes) {
				// Render children first
				try {
					if (Array.isArray(obj)) {
						obj.forEach(function(item) {
							recurse(item, list, contentTypes);
						});
					} else if (typeof obj === 'object' && obj != null) {
						Object.keys(obj).forEach(function(k) {
							if (k !== '_sys' && k !== 'sys') {
								recurse(obj[k], list, contentTypes);
							}
						});
					}
				}
				catch (err) {
					console.log(err);
				}

			  // Then render current entry, if its an entry
			  // It's an entry to us if it has a sys.contentType
			  if (obj && obj.sys && obj.sys.contentType) {
			    list.push({
			      id: obj.sys.id,
			      filename: obj.fields && obj.fields.id || obj.sys.id,
			      name: obj.fields && obj.fields.name || obj.sys.id,
			      contentType: contentTypes[obj.sys.contentType.sys.id].name,
			      entry: obj
			    });
			  }
			};
			var toRender = [];
			recurse(content, toRender, contentTypes);
			// console.log(toRender.map(function(e) {
			//   return e.name + ' ' + e.contentType;
			// }));
			var debugTemplate = function(e) {
				return '<h4>No template found</h4><pre>' + JSON.stringify(e, undefined, 2) + '</pre>';
			};


			// Awesome! Let's render them, one at a time and include the rendered html in the context
			// of each so that they can in turn include it themselves.
			var render = function(entryObj, includes) {
			  var deferred = q.defer();
			  var nunjucks = require('nunjucks');
			  consolidate.requires.nunjucks = nunjucks.configure(options.templates, {
			  	noCache: true
			  });
			  consolidate[options.engine](
			    path.join(options.templates, entryObj.contentType + '.html'),
			    {
			      entry: entryObj.entry,
			      content: content,
			      entries: entries,
			      includes: includes,
			      contentTypes: contentTypes,
			      debug: function(obj) { return JSON.stringify(obj, undefined, 2); },
						include: function(obj) {
							if (Array.isArray(obj)) {
								return obj.map(function(e) {
									if (e && e.sys) {
										return includes[e.sys.id] || debugTemplate(e);
									}
									return debugTemplate(e);
								}).join('\n');
							} else if (obj.sys) {
								return includes[obj.sys.id] || debugTemplate(obj);
							}
						}
			    },
			    function(err, html) {
			      if (err) {
			        deferred.reject(err);
			      } else {
			        deferred.resolve(html);
			      }
			    }
			  );

			  return deferred.promise;
			};

			var includes = {};
			var promise = toRender.reduce(function(soFar, e) {
			  return soFar.then(function(includes) {
			    return render(e, includes).then(function(html) {
			      includes[e.id] = html;
			      return includes;
			    });
			  });
			}, q(includes));

			if (callback) {
				promise.then(function(includes) {
					callback(undefined, includes);
				}, callback);
			}
			return promise;
		}
	};


	return contentfulStatic;

})();
