'use strict';

var path = require('path');
var generators = require('yeoman-generator');
var yaml = require('js-yaml');
var _ = require('lodash');
var chalk = require('chalk');
var GitHub = require('github');
var async = require('async');
var common = require('../common.js');


var WokGenerator = generators.Base.extend({

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


    _getFile: function (filepath) {
        return _.find(this.files, {pathFrom: filepath});
    },

    _updateFile: function (filepath, props) {
        var fileObj = this._getFile(filepath);
        if (_.isPlainObject(fileObj)) {
            return _.extend(fileObj, props);
        }
        return false;
    },

    _deleteFile: function (filepath) {
        var fileIndex = _.findIndex(this.files, {pathFrom: filepath}),
            fileItem = this.files[fileIndex];
        if (fileIndex) {
            this.files.splice(fileIndex, 1);
            //also remove existing files...
            this.fs.delete(fileItem.pathTo);
            return true;
        }
        return false;
    },

    _addFile: function (filepath, remote) {
        if (!_.find(this.files, {pathFrom: filepath})) {
            this.files.push({
                pathFrom: filepath,
                remote: remote,
                pathTo: filepath,
                content: null
            });
        }
    },

    // The name `constructor` is important here
    constructor: function () {
        // Calling the super constructor is important so our generator is correctly set up
        generators.Base.apply(this, arguments);

        this.answers = {};
        this.files = [];
        //this._modules = [];
        //this.installProcedure = true;

    },

    askForVersion: function () {
        var done = this.async();
        var _utils = this._;

        this._logHeading('Wok branch to use...');


        this.prompt([{
            type: 'text',
            name: 'wokbranch',
            message: 'Wok branch to use',
            'default': 'master'
        }], function (answers) {
            this.answers.wokbranch = answers.wokbranch;
            done();
        }.bind(this));
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


    askForViews: function () {
        var done = this.async();

        this._logHeading('Views setup...');

        var prompts = [ {
            type: 'confirm',
            name: 'useejs',
            message: 'Use default view engine (ejs)',
            'default': true
        }];

        this.prompt(prompts, function (answers) {
            this.answers.useejs = answers.useejs;
            done();
        }.bind(this));
    },

    fetchRepo: function () {

        var done = this.async();

        this.remote('fevrcoding', 'wok', this.answers.wokbranch, function (err, remote, files) {
            if (err) {
                //TODO manage error
                this.log.error('Unable to download latest version of https://github.com/fevrcoding/wok');
                return false;
            }

            this.wokRepo = remote;

            _.each(files, function (el) {
                this._addFile(el, remote);
            }, this);

            done();
        }.bind(this));

        //this._listPlugins();
    },

    package: function () {

        var pkgFile = this._getFile('package.json');
        var pkg = this.wokRepo.src.readJSON(pkgFile.pathFrom);

        pkg = _.extend(pkg || {}, {
            version: '0.0.1',
            contributors: []
        }, this.answers.projectData);

        if (!this.answers.useejs) {
            delete pkg.devDependencies['grunt-ejs-render'];
        }

        //update package content
        pkgFile.content = JSON.stringify(pkg, null, 4);



        //this.wokRepo.dest.write('package.json', JSON.stringify(pkg, null, 4));

        return pkg;
    },

    config: function (remote) {
        var cfgFile = this._getFile('build/grunt-config/paths.yml');
        var remote = this.wokRepo;
        var files = this.files;
        var pathCfg = yaml.safeLoad(remote.src.read(cfgFile.pathFrom));
        var defaultPublic = pathCfg.www;


        pathCfg = _.extend(pathCfg, this.answers.folders);

        if (defaultPublic === pathCfg.www) {
            return pathCfg;
        }

        //remote.dest.write('build/grunt-config/paths.yml', yaml.safeDump(pathCfg));
        //public www data to destination public folder
        //remote.directory(defaultPublic, pathCfg.www);
        //write .bowerrc
        //remote.dest.write('.bowerrc', JSON.stringify({directory: pathCfg.www + '/vendor'}, null, 4));

        cfgFile.content = yaml.safeDump(pathCfg);

        //alter public path
        files.forEach(function (fileItem, i) {
            var regexp = new RegExp('^' + defaultPublic);
            if (regexp.test(fileItem.pathFrom)) {
                files[i].pathTo = fileItem.pathFrom.replace(regexp, pathCfg.www);
            }
        });

        this._updateFile('.bowerrc', {
            content: JSON.stringify({directory: pathCfg.www + '/vendor'}, null, 4)
        });

        return pathCfg;
    },


    ejsRender: function () {
        if (!this.answers.useejs) {
            this.files = this.files.filter(function (file) {
                return file.pathFrom.indexOf('render.js') === -1;
            }).filter(function (file) {
                return file.pathFrom.indexOf('application/views/') === -1;
            });
        }
    },

    readme: function () {
        //generate an empty readme file
        //this.wokRepo.dest.write('README.md', '#' + this.answers.projectDescription + "\n\n");
        this._updateFile('README.md', {
            content: ('#' + this.answers.projectData.description + "\n\n")
        });

    },

    copyFiles: function () {
        common.copyFiles.apply(this, arguments);
    },

    install: function () {

        if (!this.options['skip-install']) {
            //this.spawnCommand('bundler', ['install']);
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
            commands: chalk.yellow.bold(['bower install', 'npm install'].join(' & '))
        }));
    }
});

module.exports = WokGenerator;
