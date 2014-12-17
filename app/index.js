'use strict';

var path = require('path');
var generators = require('yeoman-generator');
var yaml = require('js-yaml');
var _ = require('lodash');
var chalk = require('chalk');
var GitHub = require('github');

module.exports = generators.Base.extend({

    _logHeading: function (msg) {
        this.log("\n");
        this.log.writeln(chalk.bold(msg));
        this.log.writeln(chalk.bold('-------------------------------'));
    },

    _listPlugins: function () {
        var github = new GitHub({
            version: '3.0.0'
        });

        github.search.repos({
            q: 'wok-plugin+in:name'
        }, function (err, response) {
            console.log(response.items.length);
        });
    },

    // The name `constructor` is important here
    constructor: function () {
        // Calling the super constructor is important so our generator is correctly set up
        generators.Base.apply(this, arguments);

        this.answers = {};

    },

    askForProject: function () {
        var done = this.async();
        var _utils = this._;

        this._logHeading('Collecting new project infos...');


       var prompts = [{
            type: 'text',
            name: 'name',
            message: 'Project name',
            'default': 'awesome-wok-project',
           filter: function (value) {
                return _utils.slugify(value)
           }
        }, {
           type: 'text',
           name: 'description',
           message: 'Project description',
           'default': 'Awesome WOK Project'
       }, {
            type: 'text',
            name: 'author',
            message: 'Author',
            'default': this.user.git.name()
        }, {
           type: 'text',
           name: 'license',
           message: 'License',
           'default': 'MIT'
       }];

        this.prompt(prompts, function (answers) {
            this.answers.projectData = answers;
            done();
        }.bind(this));
    },

    askForFolders: function () {
        var done = this.async();
        var _utils = this._;


        this._logHeading('Filesystem setup...');

        var prompts = [ {
            type: 'text',
            name: 'www',
            message: 'Public assets folder',
            'default': 'www',
            filter: function (value) {
                return _utils.slugify(value)
            }
        }];

        this.prompt(prompts, function (answers) {
            answers.rsync = answers.www;
            this.answers.folders = answers;
            done();
        }.bind(this));
    },

    fetchRepo: function () {

        var done = this.async();

        this.remote('fevrcoding', 'wok', 'master', function (err, remote, files) {
            if (err) {
                //TODO manage error
                this.log.error('Unable to download latest version of https://github.com/fevrcoding/wok');
                return false;
            }

            this.wokRepo = remote;
            this.wokFiles = files;

            done();
        }.bind(this));

        //this._listPlugins();
    },

    copyFiles: function () {

        var remote = this.wokRepo;
        var files = this.wokFiles;

        //copy main application folder
        remote.directory('application', 'application');

        //build folder
        remote.dest.mkdir('build');

        //copy unchanged configuration files
        ['hosts.yml', 'properties.yml'].forEach(function (filename) {
            var fullpath = path.join('build', 'grunt-config', filename);
            remote.copy(fullpath, fullpath);
        });


        //copy unchanged files
        ['build/Gruntfile.js', 'build/compass.rb', 'bower.json', 'Gemfile'].forEach(function (filepath) {
            remote.copy(filepath, filepath);
        });

        //copy dot files
        files.filter(function (path) {
            return path.indexOf('.') === 0 && path !== '.bowerrc';
        }).forEach(function (el) {
            remote.copy(el, el);
        });
    },

    package: function () {

        var pkg = this.wokRepo.src.readJSON('package.json');

        pkg = _.extend(pkg || {}, {
            version: '0.0.1',
            contributors: []
        }, this.answers.projectData);

        this.wokRepo.dest.write('package.json', JSON.stringify(pkg, null, 4));

        return pkg;
    },

    config: function (remote) {
        var remote = this.wokRepo;
        var pathCfg = yaml.safeLoad(remote.src.read('build/grunt-config/paths.yml'));
        var defaultPublic = pathCfg.www;


        pathCfg = _.extend(pathCfg, this.answers.folders);

        remote.dest.write('build/grunt-config/paths.yml', yaml.safeDump(pathCfg));
        //public www data to destination public folder
        remote.directory(defaultPublic, pathCfg.www);
        //write .bowerrc
        remote.dest.write('.bowerrc', JSON.stringify({directory: pathCfg.www + '/vendor'}, null, 4));
        return pathCfg;
    },

    readme: function () {
        //generate an empty readme file
        this.wokRepo.dest.write('README.md', '#' + this.answers.projectDescription + "\n\n");

    },

    install: function () {

        if (!this.options['skip-install']) {
            this.spawnCommand('bundler', ['install']);
            this.installDependencies({
                skipMessage: true
            });
        }

        var template = _.template('\n\nI\'m all done. ' +
            '<%= skipInstall ? "Just run" : "Running" %> <%= commands %> ' +
            '<%= skipInstall ? "" : "for you " %>to install the required dependencies.' +
            '<% if (!skipInstall) { %> If this fails, try running the command yourself.<% } %>\n\n'
        );

        this.log(template({
            skipInstall: this.options['skip-install'],
            commands: chalk.yellow.bold(['bower install', 'npm install', 'bundler install'].join(' & '))
        }));
    }
});