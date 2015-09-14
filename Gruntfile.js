var test = require('./test/index.js');

module.exports = function(grunt) {


	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
	});

	grunt.registerTask('contentful', 'Get contentful content', function() {
		var done = this.async();
		grunt.log.writeln('running test...');
		test.setup();
		test.run(function(success) {
			if (success) {
				grunt.log.writeln('test completed');
				done();
			} else {
				grunt.log.writeln('contentful: data could not be synced');
			}
		});
	});

	grunt.registerTask('default', ['contentful']);

}