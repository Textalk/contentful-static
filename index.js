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

			var db = {
				contentTypes: [],
				entries: {},
				space: {}
			};

			var promise = q.all([
				client.contentTypes(),
				client.space()
			]).then( function(response) {
				var contentTypes = response[0];
				var space = response[1];

				db.space = space;
				db.contentTypes = contentTypes;

				// Loop over all locales and fetch them one at a time
				// FIXME: Option for exactly which I like to fetch.
				var queries = [];
				space.locales.forEach(function(locale) {
					queries.push(client.entries({ locale: locale.code}));
				});

				return q.all(queries).then( function(response) {
					space.locales.forEach(function(locale, index) {
						var entries = response[index];
						db.entries[locale.code] = entries;
					});

					return db;
				});
			});

			if (callback) {
				promise.then(function(db) {
					process.nextTick(function() {
						callback(undefined, db);
					});
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
			var contentTypes = {};
			content.contentTypes.reduce(function(types, ct) {
			  types[ct.sys.id] = ct;
			  return types;
			}, contentTypes);


			// FIXME: Only specified locale.
			var renderPromise = q.all(content.space.locales.map(function(locale) {

				// Massage the data for some easy lookup
				var entries = {};
				content.entries[locale.code].reduce(function(entries, entry) {
				  entries[entry.sys.id] = entry;
				  return entries;
				}, entries);

				// Find out order to render in.
				var recurse = function(obj, list, contentTypes) {
				  // Render children first
				  if (Array.isArray(obj)) {
				    obj.forEach(function(item) {
				      recurse(item, list, contentTypes);
				    });
				  } else if (obj && typeof obj === 'object') {
				    Object.keys(obj).forEach(function(k) {
				      if (k !== '_sys' && k !== 'sys') {
				        recurse(obj[k], list, contentTypes);
				      }
				    });
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
				var debugTemplate = function(e) {
					return '<h4>No template found</h4><pre>' + JSON.stringify(e, undefined, 2) + '</pre>';
				};


				// Awesome! Let's render them, one at a time and include the rendered html in the context
				// of each so that they can in turn include it themselves.
				var render = function(entryObj, includes) {
				  var deferred = q.defer();

					// Try figuring out which template to use
					var exists = function(pth) {
						try {
						 	fs.accessSync(pth);
							return true;
						} catch (e) {
							return false;
						}
					};

					var tmp = entryObj.contentType.split('-');
					tmp[tmp.length - 1] = tmp[tmp.length - 1] + '.html';
					var tmpl = path.join.apply(tmp);
					if (exists(path.join(options.templates,tmpl))) {
						tmpl = entryObj.contentType + '.html';
					}

					// Ok let's check again (TODO: DRY)
					if (!exists(path.join(options.templates, tmpl))) {
						console.log('Could not find template ', path.join(options.templates,tmpl));
						deferred.resolve('<span>(Missing template)</span>');
					} else {
					  consolidate[options.engine](
					    path.join(options.templates, tmpl),
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
										return includes[e.sys.id] || debugTemplate(obj);
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
					}
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

				return promise;
			})).then(function(results) {
				// Re-map the data to each locale
				var byLocale = {};
				content.space.locales.forEach(function(l, index) {
					byLocale[l.code] = results[index];
				});
				return byLocale;
			});

			if (callback) {
				renderPromise.then(function(includes) {
					process.nextTick(function() {
						callback(undefined, includes);
					});
				}, callback);
			}
			return renderPromise;
		}
	};

	return contentfulStatic;

})();
