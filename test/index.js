var
	grunt = require('grunt'),
	contentfulStatic = require('../index.js');

module.exports = {
	setup: function() {
		var options = grunt.file.readJSON('./test/.conf');
		console.log(options);

		contentfulStatic.config(options);
	},
	run: function(callback) {
		grunt.log.writeln('running contentfulStatic.sync');
		contentfulStatic.sync(callback);
	}
}