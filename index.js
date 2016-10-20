var
	contentful = require('contentful'),
	fs = require('fs'),
	mkdirp = require('mkdirp'),
	q = require('q'),
	chalk = require('chalk'),
	rimraf = require('rimraf'),
	consolidate = require('consolidate'),
	path = require('path'),
	merge = require('merge'),
	debuginfo = {
		renderCount: 0
	},
	DEBUGMODE = false;


function debug() {
	if(DEBUGMODE) {
		console.log(arguments);
	}
}
// check if object exists and throws an error if not
function checkExistance(testObject, reference, throwException) {
	reference = 'ref: ' + reference;

	if(typeof testObject === 'string') {
		debug('checkExistance: Object is a string', testObject, reference);
		return 'string';
	}
	var name = (testObject && testObject.fields && testObject.fields.name) ? testObject.fields.name : 'no name';
	// console.log(name, reference);

	if(!testObject || typeof testObject === undefined || testObject === null) {
		var error = new Error('checkExistance failed: Object does not exist. ', testObject, reference);
		debug(error);
		return false;
	}
	return true;
}

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
		},
		context: {
			// context variables to pass into template rendering 
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
			options.context = optionsObject.context || options.context;
		},

		/**
		 * Sync content from contentful. You can choose to supply a callback or just use the promise
		 * that is returned.
		 *
		 * @param {Function} callback (optional) a callback function(err, content)
		 * @return {Promise} a promise that resolves to the content.
		 */
		sync: function(callback){ 

			var client = contentful.createClient(options.apiconfig);

			var db = { 
				contentTypes: [], 
				entries: {}, 
				space: {}
			};

			var skips = {};

			var getEntries = function(locale, skip){ 
				console.log(skip);
				return client.entries({ locale:locale.code, limit:1000, skip:skip, order:'sys.createdAt' });
			};

			var fetchAll = function(locale, acc){ 
				return function(result){ 
					if (result.length == 1000){ 
						skips[locale.code] += 1000;
						return getEntries(locale, skips[locale.code]).then(fetchAll(locale, acc.concat(result)));
					} else { 
						db.entries[locale.code] = acc.concat(result);
						return acc.concat(result);
					}
				}
			};

			var promise = q.all([
				client.contentTypes(),
				client.space()
			]).then( function(response) {
				var contentTypes = response[0];
				var space = response[1];

				db.contentTypes = contentTypes;
				db.space = space;

				return q.all(db.space.locales.map(function(locale) { 
					skips[locale.code] = 0;
					return getEntries(locale, skips[locale.code]).then( fetchAll( locale, [] ) );
				})).then(function(result) {
					return db;
				});
			}).catch(function(error){
				console.log(error);
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
		render: function(content, before, callback) {
			// manually setup nunjucks to not cache templates since consolidate doesn't support this option

			// expose consolidate to allow for a custom setup
			console.log('[contentfulStatic.render] Calling "before" callback...');
			if (before != undefined) before(consolidate, content);

			// Massage the data for some easy lookup
			var contentTypes = {};
			content.contentTypes.reduce(function(types, ct) {
				checkExistance(ct, 'index.js:164');
				types[ct.sys.id] = ct;
				return types;
			}, contentTypes);

			// FIXME: Only specified locale.
			var renderPromise = q.all(content.space.locales.map(function(locale) {
				console.log('[contentfulStatic.render] Traversing entries in locale ' + locale.code + ' ...');

				// Massage the data for some easy lookup
				var entries = {};
				content.entries[locale.code].reduce(function(entries, entry) {
					checkExistance(entry, 'index.js:177');
					entries[entry.sys.id] = entry;
					return entries;
				}, entries);

				// Find out order to render in.
				var recurse = function(obj, list, contentTypes, dupCheck) {
					dupCheck = dupCheck || {};

					// Render children first
					if (Array.isArray(obj)) {
						obj.forEach(function(item) {
							recurse(item, list, contentTypes, dupCheck);
						});
					} else if (obj && typeof obj === 'object') {
						Object.keys(obj).forEach(function(k) {
							if (k !== '_sys' && k !== 'sys') {
								recurse(obj[k], list, contentTypes, dupCheck);
							}
						});
					}

					// Then render current entry, if its an entry
					// It's an entry to us if it has a sys.contentType
					if (obj && obj.sys && obj.sys.contentType && obj.sys.id) {
						if (!dupCheck[obj.sys.id]) {
							list.push({
								id: obj.sys.id,
								filename: obj.fields && obj.fields.id || obj.sys.id,
								name: obj.fields && obj.fields.name || obj.sys.id,
								contentType: contentTypes[obj.sys.contentType.sys.id].name,
								entry: obj
							});
							dupCheck[obj.sys.id] = true;
						}
					}
				};
				var toRender = [];
				recurse(entries, toRender, contentTypes);
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

					// DEBUG log
					if(entryObj === undefined || typeof entryObj === "string") throw new Error('invalid entryObj at index.js:232');
					var debugName = entryObj && entryObj.entry.fields && entryObj.entry.fields.name ? entryObj.entry.fields.name : entryObj.entry.sys.id;
					debug('rendering entry...', debugName);

					// Try a nested path
					var tmp = entryObj.contentType.split('-');
					tmp[tmp.length - 1] = tmp[tmp.length - 1] + '.html';
					var tmpl = path.join.apply(path, tmp);
					if (!exists(path.join(options.templates,tmpl))) {
						tmpl = entryObj.contentType + '.html';
					}

					// Ok let's check again (TODO: DRY)
					if (!exists(path.join(options.templates, tmpl))) {
						debug('Could not find template ', path.join(options.templates,tmpl));
						deferred.resolve('<span>(Missing template)</span>');
					} else {
						var defaultContext = {
							entry: entryObj.entry,
							content: content,
							entries: entries,
							includes: includes,
							contentTypes: contentTypes,
							globals: {
								locale: locale.code
							},
							debug: function(obj) {
								return JSON.stringify(obj, undefined, 2);
							},
							include: function(obj) {
								if(obj == undefined) {
									debug('error: undefined object');
									return false;
								}
								checkExistance(obj.sys, 'index.js:262');
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
						};

						consolidate[options.engine](
							path.join(options.templates, tmpl), merge.recursive(defaultContext, options.context),
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
				console.log('[contentfulStatic.render]', 'Rendering templates ...');
				var promise = toRender.reduce(function(soFar, e) {
					checkExistance(e, 'index.js:294');
					return soFar.then(function(includes) {
						debuginfo.renderCount++;
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
				console.log('[contentfulStatic.render] Rendered ' + debuginfo.renderCount + ' templates.');
				console.log('[contentfulStatic.render] Remap data to locales.');
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
