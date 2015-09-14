var
	grunt = require('grunt'),
	contentfulStatic = require('../index.js');

module.exports = {
	setup: function() {
		var conf = grunt.file.readJSON('./test/.conf');

		contentfulStatic.config({
			dest: 'test/.tmp/contentful.json',
			space: conf.space,
			accessToken: conf.accessToken,
			// secure: 'true',
  		// host: 'cdn.contentful.com'
		});
	},
	run: function(callback) {
		grunt.log.writeln('running contentfulStatic.sync');
		contentfulStatic.sync(callback);
	}
}