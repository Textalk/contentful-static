var 
	contentful = require('contentful');
	fs = require('fs'),
	mkdirp = require('mkdirp'),
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
		dest: 'data/contentful.json',
		apiconfig: {
			space: null,
			accessToken: null,
			secure: true,
			host: 'cdn.contentful.com'
		}
	};

	var writeToFile = function(callback) {
		var filename = options.dest;
		var filepath = process.cwd() + '/' + filename;
		var directory = path.dirname(filepath);
		var contents = JSON.stringify(db, null, 2);
		
		mkdirp(directory, function(err) {
			if(err) return console.log('mkdirp', err);
			
			try {
				fs.writeFileSync(filepath, contents, 'utf8');
			}
			catch (err) {
				return console.log('writeFileSync failed', err);
			}
			callback(true);
		});
	}

	var contentfulStatic = {

		config: function( optionsObject ) {
			options.dest = optionsObject.dest || options.dest;
			options.apiconfig.space = optionsObject.space || options.apiconfig.space;
			options.apiconfig.accessToken = optionsObject.accessToken || options.apiconfig.accessToken;
			options.apiconfig.secure = optionsObject.secure || options.apiconfig.secure;
			options.apiconfig.host = optionsObject.host || options.apiconfig.host;
		},

		sync: function( callback) {
			var client = contentful.createClient(options.apiconfig);
			
			client.contentTypes().then( function(response) {
				db._sys.contentTypes = response;
				for (var i = 0; i < response.length; i++) {
					var type = response[i];
					contentTypes.byId[type.sys.id] = type.name;
					db._sys.contentTypes[type.sys.id] = type;
					db[type.name] = [];
				};
				var entries = client.entries().then( function(response) {
					db._sys.entries = response;
					for (var i = 0; i < db._sys.entries.length; i++) {
						var entry = db._sys.entries[i];
						var typeName = contentTypes.byId[entry.sys.contentType.sys.id];
						db[typeName].push(entry);
					};
					
					writeToFile(callback);
				});
			});
		}
	}

	return contentfulStatic;

})();